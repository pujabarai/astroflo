# ASTROFLO — Pricing Gaps & LP Deposit Auto-Calculation Fix

> **Scope:** This document covers two fix areas for ASTROFLO's testnet MVP:
> 1. Pricing gaps (cold start, price impact, USD display, staleness, multi-pool routing)
> 2. LP deposit amount auto-calculation bug (USDC not computing when XLM is entered)
>
> **Out of scope (deferred):** Price history chart, USDC peg assumption handling.
>
> **Target:** Any senior Soroban/React developer picking this up should be able to implement every fix end-to-end from this document alone.

---

## Table of Contents

1. [Codebase Map — Where Everything Lives](#1-codebase-map--where-everything-lives)
2. [Fix Area 1 — Pricing Gaps](#2-fix-area-1--pricing-gaps)
   - 2.1 [Gap 1: Cold Start / Stale Init Price](#21-gap-1-cold-start--stale-init-price)
   - 2.2 [Gap 2: Price Impact Calculation](#22-gap-2-price-impact-calculation)
   - 2.3 [Gap 3: USD Value Display](#23-gap-3-usd-value-display)
   - 2.4 [Gap 4: 5-Second Price Staleness](#24-gap-4-5-second-price-staleness)
   - 2.5 [Gap 5: No Multi-Pool Routing](#25-gap-5-no-multi-pool-routing)
3. [Fix Area 2 — LP Deposit Auto-Calculation Bug](#3-fix-area-2--lp-deposit-auto-calculation-bug)
   - 3.1 [Root Cause Analysis](#31-root-cause-analysis)
   - 3.2 [The Math Behind It](#32-the-math-behind-it)
   - 3.3 [The Three Price-Position Cases](#33-the-three-price-position-cases)
   - 3.4 [Complete Fix — math.ts](#34-complete-fix--mathts)
   - 3.5 [Complete Fix — AmountInputs.tsx](#35-complete-fix--amountinputstsx)
   - 3.6 [Complete Fix — usePool Hook](#36-complete-fix--usepool-hook)
   - 3.7 [Complete Fix — AddLiquidity Parent Component](#37-complete-fix--addliquidity-parent-component)
   - 3.8 [Edge Cases to Handle](#38-edge-cases-to-handle)
4. [Testing Checklist](#4-testing-checklist)
5. [What NOT to Touch](#5-what-not-to-touch)

---

## 1. Codebase Map — Where Everything Lives

Before touching any code, understand which file owns which responsibility. Every fix in this document maps to one or more of these files.

```
frontend/src/
│
├── pages/
│   ├── Swap/
│   │   ├── index.tsx              ← Swap page root. Renders quote, handles swap tx.
│   │   ├── TokenInputBox.tsx      ← Input field for XLM / USDC amount
│   │   ├── PriceInfo.tsx          ← Shows exchange rate, price impact, min received
│   │   └── SlippageSettings.tsx   ← 0.1% / 0.5% / 1% / custom
│   │
│   └── Liquidity/
│       ├── index.tsx              ← Liquidity page root. Tab: Add / My Positions
│       └── AddLiquidity/
│           ├── index.tsx          ← AddLiquidity parent: owns all state, fetches pool
│           ├── RangeSelector.tsx  ← Price range chart + tick handles
│           ├── AmountInputs.tsx   ← XLM + USDC deposit fields ← PRIMARY BUG LOCATION
│           └── ReviewDeposit.tsx  ← Confirm modal before tx
│
├── hooks/
│   ├── usePool.ts                 ← Fetches pool slot0 (sqrtPrice, tick) from Soroban RPC
│   ├── usePositions.ts            ← LP positions for connected wallet
│   ├── useSwapQuote.ts            ← Calls router.quote via Soroban simulation
│   └── useWallet.ts               ← Freighter connection state
│
├── lib/
│   ├── math.ts                    ← ALL off-chain math. Mirror of contract math. ← FIX HERE
│   ├── stellar.ts                 ← Stellar SDK helpers (build tx, submit, parse)
│   ├── contracts.ts               ← Contract addresses + invocation wrappers
│   └── constants.ts               ← Token addresses, fee tiers, tick spacing, etc.
│
└── components/
    ├── Navbar.tsx                 ← Swap | Liquidity | Portfolio nav
    ├── WalletButton.tsx           ← Freighter connect/disconnect
    └── PriceChart.tsx             ← Tick liquidity distribution (Recharts)
```

**Rule:** No math lives in components. All math lives in `lib/math.ts`. Components only call math functions and render results. If you find price logic inside a `.tsx` file, move it to `math.ts` first, then fix it.

---

## 2. Fix Area 1 — Pricing Gaps

### 2.1 Gap 1: Cold Start / Stale Init Price

#### What the Problem Is

When the ASTROFLO pool is freshly deployed on Stellar Testnet, the pool's `sqrt_price_x96` is set once during initialization (in `scripts/init-pool.ts`). Until actual trades happen and arbitrageurs push the price to reflect the real XLM/USDC market, the pool price is **whatever you set it to at deploy time** — potentially stale by hours.

On a live mainnet DEX with millions in liquidity, arbitrage bots correct this within seconds. On ASTROFLO testnet with seed liquidity only, nobody is arbitraging. So the displayed price could be wrong, and a user swapping against it gets a silent bad deal.

#### What Needs to Change

Two things: a UI warning banner when the pool price is significantly off from the real XLM market price, and a threshold check using the CoinGecko free API (same API used for USD display in Gap 3).

#### Where to Make the Change

**File: `frontend/src/hooks/usePool.ts`**

Add a derived value `isPriceStale` to the hook's return:

```typescript
// frontend/src/hooks/usePool.ts

import { useQuery } from "@tanstack/react-query";
import { getPoolSlot0, getPoolLiquidity } from "../lib/contracts";
import { sqrtPriceX96ToPrice } from "../lib/math";

interface PoolState {
  sqrtPriceX96: bigint;
  currentTick: number;
  liquidity: bigint;
  spotPrice: number;         // decoded human-readable price (USDC per XLM)
  isPriceStale: boolean;     // true if pool price diverges >5% from market
  lastUpdatedLedger: number;
}

export function usePool() {
  return useQuery<PoolState>({
    queryKey: ["pool-state"],
    queryFn: async () => {
      // 1. Fetch on-chain pool state from Soroban RPC
      const slot0 = await getPoolSlot0();
      const liquidity = await getPoolLiquidity();

      // 2. Decode sqrt_price_x96 → human price
      const spotPrice = sqrtPriceX96ToPrice(slot0.sqrtPriceX96);

      // 3. Fetch real XLM market price from CoinGecko (free tier, no key needed)
      let isPriceStale = false;
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd",
          { signal: AbortSignal.timeout(3000) }  // 3s timeout — don't block on this
        );
        const data = await res.json();
        const marketPrice: number = data?.stellar?.usd ?? 0;

        if (marketPrice > 0) {
          const divergence = Math.abs(spotPrice - marketPrice) / marketPrice;
          isPriceStale = divergence > 0.05;  // >5% off = stale
        }
      } catch {
        // CoinGecko down or rate-limited — don't mark stale, just skip
        isPriceStale = false;
      }

      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        currentTick: slot0.tick,
        liquidity,
        spotPrice,
        isPriceStale,
        lastUpdatedLedger: slot0.ledger,
      };
    },
    refetchInterval: 5000,   // re-poll every 5 seconds (one Stellar ledger)
    staleTime: 4000,
  });
}
```

**File: `frontend/src/pages/Swap/index.tsx`**

Add the warning banner at the top of the swap card:

```tsx
// frontend/src/pages/Swap/index.tsx

import { usePool } from "../../hooks/usePool";

export default function SwapPage() {
  const { data: pool } = usePool();

  return (
    <div className="swap-container">

      {/* Cold start warning — only shows when pool price diverges >5% from market */}
      {pool?.isPriceStale && (
        <div className="warning-banner">
          <span className="warning-icon">⚠</span>
          <span>
            Pool price may not reflect the current XLM market price.
            This pool has low trading activity. Check your price impact carefully
            before swapping.
          </span>
        </div>
      )}

      {/* rest of swap UI */}
    </div>
  );
}
```

**File: `frontend/src/pages/Liquidity/AddLiquidity/index.tsx`**

Same banner on the add liquidity page — an LP setting a range based on a stale pool price would center their range in the wrong place:

```tsx
{pool?.isPriceStale && (
  <div className="warning-banner">
    <span className="warning-icon">⚠</span>
    <span>
      Pool price differs from market by more than 5%. Your price range will be
      set relative to the pool price, not the market price. Consider adjusting
      your range manually.
    </span>
  </div>
)}
```

**File: `frontend/src/styles/warnings.css`** (or your global CSS):

```css
.warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(239, 159, 39, 0.12);
  border: 1px solid rgba(239, 159, 39, 0.4);
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  color: #ba7517;
  margin-bottom: 16px;
  line-height: 1.5;
}
.warning-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
```

---

### 2.2 Gap 2: Price Impact Calculation

#### What the Problem Is

Currently, price impact is computed as the percentage change between the current pool spot price and the post-swap pool spot price:

```
impact = (post_swap_price - pre_swap_price) / pre_swap_price
```

This is mathematically correct — it tells you how much your trade moves the pool. But it's misleading on a testnet pool with thin liquidity. A $20 swap might show 8% price impact, which looks terrifying, even though it's just because the pool has $250 TVL, not because the swap is inherently dangerous.

The user needs context: "high impact because this pool is thin" vs "high impact because you're trading a huge amount."

#### What Needs to Change

**File: `frontend/src/lib/math.ts`**

Add a `computePriceImpact` function that returns the raw impact AND a severity label with explanation:

```typescript
// frontend/src/lib/math.ts

export interface PriceImpactResult {
  impact: number;              // 0.0042 = 0.42%
  impactPercent: string;       // "0.42%"
  severity: "low" | "medium" | "high" | "very_high";
  label: string;               // human-readable color-coded label
  isThinPool: boolean;         // true if impact is high due to low TVL
  tvlUsd: number | null;       // pool TVL in USD (null if unknown)
}

export function computePriceImpact(
  amountIn: number,
  tokenIn: "xlm" | "usdc",
  preBswapSqrtPriceX96: bigint,
  postSwapSqrtPriceX96: bigint,
  poolTvlUsd: number | null
): PriceImpactResult {
  const prePrice  = sqrtPriceX96ToPrice(preBswapSqrtPriceX96);
  const postPrice = sqrtPriceX96ToPrice(postSwapSqrtPriceX96);

  // Price impact is always expressed as positive percentage
  const impact = Math.abs(postPrice - prePrice) / prePrice;
  const impactPercent = (impact * 100).toFixed(2) + "%";

  // Severity thresholds — standard DeFi convention
  let severity: PriceImpactResult["severity"];
  if (impact < 0.001)       severity = "low";       // < 0.1%
  else if (impact < 0.01)   severity = "medium";    // 0.1% – 1%
  else if (impact < 0.05)   severity = "high";      // 1% – 5%
  else                       severity = "very_high"; // > 5%

  // Detect if impact is driven by thin pool vs large trade size
  // Heuristic: if trade size > 10% of TVL, the pool is thin relative to this trade
  const isThinPool = poolTvlUsd !== null && amountIn > poolTvlUsd * 0.10;

  const label =
    severity === "low"       ? "Low impact"       :
    severity === "medium"    ? "Medium impact"    :
    severity === "high"      ? "High impact"      :
                               "Very high impact — swap may lose significant value";

  return { impact, impactPercent, severity, label, isThinPool, tvlUsd: poolTvlUsd };
}
```

**File: `frontend/src/pages/Swap/PriceInfo.tsx`**

Render the price impact with color coding and thin-pool context:

```tsx
// frontend/src/pages/Swap/PriceInfo.tsx

const SEVERITY_COLORS = {
  low:       "text-green-500",
  medium:    "text-yellow-400",
  high:      "text-orange-400",
  very_high: "text-red-500",
};

export function PriceInfo({ quote, poolTvlUsd }: PriceInfoProps) {
  const impact = computePriceImpact(
    quote.amountIn,
    quote.tokenIn,
    quote.preBswapSqrtPriceX96,
    quote.postSwapSqrtPriceX96,
    poolTvlUsd
  );

  return (
    <div className="price-info">
      <div className="price-info-row">
        <span className="label">Price impact</span>
        <span className={SEVERITY_COLORS[impact.severity]}>
          {impact.impactPercent}
        </span>
      </div>

      {/* Thin pool context — only show when relevant */}
      {impact.isThinPool && (
        <div className="price-info-note">
          High impact due to low pool liquidity, not trade size.
          Consider splitting into smaller swaps.
        </div>
      )}

      {/* Block swap if very high impact — require explicit override */}
      {impact.severity === "very_high" && (
        <div className="high-impact-warning">
          Price impact exceeds 5%. You will receive significantly less than
          the displayed amount. Proceed only if you understand the risk.
          <label className="checkbox-row">
            <input
              type="checkbox"
              onChange={(e) => onHighImpactAcknowledged(e.target.checked)}
            />
            I understand the price impact and want to continue
          </label>
        </div>
      )}
    </div>
  );
}
```

---

### 2.3 Gap 3: USD Value Display

#### What the Problem Is

The pool only knows "1 XLM = 0.096 USDC." It has no concept of USD. So when a user deposits or swaps, ASTROFLO currently cannot show "You are depositing $48.20 worth of XLM." This is the most significant UX gap compared to Raydium.

**Important constraint:** USD values are display-only. They must never affect contract math, slippage calculations, or any on-chain logic. The pool contract never sees these numbers.

#### Where to Add It

**File: `frontend/src/hooks/usePrices.ts`** (new file):

```typescript
// frontend/src/hooks/usePrices.ts
// Fetches USD prices for XLM and USDC from CoinGecko free tier.
// Used ONLY for display. Never passed to any contract.

import { useQuery } from "@tanstack/react-query";

interface TokenPrices {
  xlmUsd: number;    // e.g. 0.096
  usdcUsd: number;   // e.g. 1.000 (stablecoin — almost always $1)
  lastFetched: Date;
  isLoading: boolean;
  isError: boolean;
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=usd";

export function usePrices(): TokenPrices {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["token-prices-usd"],
    queryFn: async () => {
      const res = await fetch(COINGECKO_URL, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("CoinGecko fetch failed");
      const json = await res.json();
      return {
        xlmUsd:  json?.stellar?.usd  ?? 0,
        usdcUsd: json?.["usd-coin"]?.usd ?? 1,
        lastFetched: new Date(),
      };
    },
    refetchInterval: 30_000,   // re-fetch every 30 seconds — CoinGecko free tier allows this
    staleTime: 25_000,
    retry: 2,
    // If CoinGecko fails, fall back to showing no USD values rather than crashing
    throwOnError: false,
  });

  return {
    xlmUsd:      data?.xlmUsd  ?? 0,
    usdcUsd:     data?.usdcUsd ?? 1,
    lastFetched: data?.lastFetched ?? new Date(0),
    isLoading,
    isError,
  };
}
```

**File: `frontend/src/lib/math.ts`** — add USD conversion helpers:

```typescript
// frontend/src/lib/math.ts

// Convert a token amount to its USD equivalent
// tokenSymbol: "xlm" | "usdc"
// amount: human-readable token amount (not stroops/base units)
export function toUsd(
  amount: number,
  tokenSymbol: "xlm" | "usdc",
  prices: { xlmUsd: number; usdcUsd: number }
): number {
  if (amount <= 0) return 0;
  return tokenSymbol === "xlm"
    ? amount * prices.xlmUsd
    : amount * prices.usdcUsd;
}

// Format a USD value for display
export function formatUsd(usdAmount: number): string {
  if (usdAmount === 0) return "";
  if (usdAmount < 0.01) return "< $0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdAmount);
}
```

**File: `frontend/src/pages/Swap/TokenInputBox.tsx`**

Add a small USD equivalent below each token amount field:

```tsx
// frontend/src/pages/Swap/TokenInputBox.tsx

import { usePrices } from "../../hooks/usePrices";
import { toUsd, formatUsd } from "../../lib/math";

export function TokenInputBox({ token, amount, onChange, readOnly }: TokenInputBoxProps) {
  const prices = usePrices();
  const usdValue = toUsd(Number(amount), token.symbol, prices);

  return (
    <div className="token-input-box">
      <div className="token-input-row">
        <input
          type="number"
          value={amount}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder="0"
          className="amount-input"
        />
        <div className="token-selector">
          <img src={token.logoUrl} alt={token.symbol} />
          <span>{token.symbol}</span>
        </div>
      </div>

      {/* USD equivalent — only shown when prices are loaded and amount > 0 */}
      {usdValue > 0 && !prices.isError && (
        <div className="usd-equivalent">
          ≈ {formatUsd(usdValue)}
        </div>
      )}

      <div className="wallet-balance">
        Balance: {token.balance} {token.symbol}
      </div>
    </div>
  );
}
```

Same pattern applies in `AddLiquidity/AmountInputs.tsx` — show USD equivalent below each deposit field, and show the total combined USD value of the deposit.

---

### 2.4 Gap 4: 5-Second Price Staleness

#### What the Problem Is

Stellar closes a ledger every ~5 seconds. Between ledgers, the price displayed in ASTROFLO is frozen. If a large swap lands in the mempool right before the user confirms their swap, the actual execution price may differ from what was displayed — still within slippage tolerance, but confusing.

This is not a safety issue (slippage protection handles it). It's a UX issue: the user might see a "stale" price for a few seconds and wonder if the app is broken.

#### What Needs to Change

**File: `frontend/src/hooks/usePool.ts`**

Track how many seconds ago the price was last updated and expose it:

```typescript
// Already inside usePool.ts — add these fields to return value

interface PoolState {
  // ... existing fields ...
  secondsSinceUpdate: number;   // how stale is the displayed price
  isStaleDisplay: boolean;      // true if > 8 seconds since last update
}

// Inside queryFn, after fetching slot0:
const fetchedAt = Date.now();

// In the hook return, compute staleness dynamically
// (React Query's dataUpdatedAt gives us the timestamp of last successful fetch)
```

**File: `frontend/src/pages/Swap/PriceInfo.tsx`**

Add a subtle staleness indicator next to the exchange rate. Don't alarm the user — just show how fresh the price is:

```tsx
export function PriceInfo({ quote, pool }: PriceInfoProps) {
  // Compute seconds since last price update
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - pool.lastFetchedAt) / 1000);
      setSecondsAgo(secs);
    }, 1000);
    return () => clearInterval(interval);
  }, [pool.lastFetchedAt]);

  return (
    <div className="price-info">
      <div className="price-info-row">
        <span className="label">Rate</span>
        <span className="rate-value">
          1 XLM = {quote.executionPrice.toFixed(6)} USDC
          {/* Staleness dot — green if fresh, yellow if slightly stale */}
          <span
            className={`staleness-dot ${secondsAgo > 8 ? "stale" : "fresh"}`}
            title={`Price updated ${secondsAgo}s ago`}
          />
        </span>
      </div>
      {secondsAgo > 8 && (
        <div className="staleness-note">
          Price refreshing... ({secondsAgo}s ago)
        </div>
      )}
    </div>
  );
}
```

```css
/* In your global CSS */
.staleness-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 6px;
  vertical-align: middle;
}
.staleness-dot.fresh { background: #1D9E75; }
.staleness-dot.stale { background: #EF9F27; animation: pulse 1s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
```

**Also — re-quote before submitting:**

```typescript
// frontend/src/pages/Swap/index.tsx

const handleSwap = async () => {
  // Always re-fetch the quote immediately before building the transaction.
  // This catches any price movement in the last few seconds.
  const freshQuote = await refetchQuote();

  // If the fresh quote's output differs from displayed quote by more than slippage,
  // warn the user rather than proceeding silently.
  const outputDiff = Math.abs(freshQuote.amountOut - displayedQuote.amountOut);
  const outputDiffPercent = outputDiff / displayedQuote.amountOut;

  if (outputDiffPercent > slippageTolerance) {
    setShowPriceChangedWarning(true);  // "Price changed. New quote: X USDC. Confirm?"
    return;
  }

  // Price hasn't moved beyond slippage — proceed
  await buildAndSubmitSwapTx(freshQuote);
};
```

---

### 2.5 Gap 5: No Multi-Pool Routing

#### What the Problem Is

ASTROFLO has one pool (XLM/USDC, 0.3% fee). Raydium checks multiple pools (different fee tiers, different routes) and picks the best execution price. For now, this is fine — ASTROFLO testnet has one pool. But the router contract and frontend must be designed so adding more pools later doesn't require a rewrite.

#### What Needs to Change (Design Only — No Code Yet)

No code change now. But make sure the router invocation in `contracts.ts` uses `exact_input_single` with the pool address as a parameter (not hardcoded inside the router). This way, when you add a second pool, the frontend can check both pools via two parallel `quote` simulations and pick the better one.

**File: `frontend/src/lib/contracts.ts`**

```typescript
// WRONG — hardcodes the pool, can never route elsewhere
export async function quoteSwap(amountIn: bigint): Promise<QuoteResult> {
  return simulateContract(HARDCODED_POOL_ADDRESS, "quote", [amountIn]);
}

// CORRECT — pool address is a parameter, enabling future multi-pool routing
export async function quoteSwap(
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
  fee: number
): Promise<QuoteResult> {
  const poolAddress = await factory.getPool(tokenIn, tokenOut, fee);
  return simulateContract(poolAddress, "quote", [amountIn]);
}
```

When you're ready to add multi-pool routing, you run two parallel quotes and compare:

```typescript
// Future: multi-pool routing (not implemented now, just design for it)
const [quote30bps, quote5bps] = await Promise.all([
  quoteSwap(amountIn, XLM, USDC, 3000),
  quoteSwap(amountIn, XLM, USDC, 500),
]);
const bestQuote = quote30bps.amountOut > quote5bps.amountOut ? quote30bps : quote5bps;
```

---

## 3. Fix Area 2 — LP Deposit Auto-Calculation Bug

### 3.1 Root Cause Analysis

When a user types an XLM amount on the Add Liquidity page, the USDC field stays empty. There are three possible causes — check them in order:

**Cause A — Handler not wired up (most common):**
The `onChange` handler for the XLM input only calls `setXlmAmount(value)` and never triggers the USDC computation. This is the most likely cause if the component was built by filling in UI before implementing the math.

```typescript
// BROKEN — missing the computation call
const handleXlmChange = (value: string) => {
  setXlmAmount(value);
  // ← USDC computation is simply absent here
};
```

**Cause B — Pool state not loaded when user types:**
The computation requires `currentTick`, `tickLower`, and `tickUpper`. If `usePool()` hasn't resolved yet (the Soroban RPC call is still in flight), these values are `undefined`. The computation function returns `NaN` or `0`, which the component silently ignores or displays as empty.

```typescript
// BROKEN — no guard against undefined pool state
const handleXlmChange = (value: string) => {
  setXlmAmount(value);
  const L = Number(value) / (1/sqrtP - 1/sqrtPHigh);  // sqrtP is undefined → NaN
  setUsdcAmount(String(L * (sqrtP - sqrtPLow)));        // NaN → shows as ""
};
```

**Cause C — Price outside range, single-asset case not handled:**
If the current tick is outside `[tickLower, tickUpper]`, the computation for the "missing" token returns 0. If the component doesn't distinguish between "USDC is 0 because price is out of range" and "USDC is 0 because the calculation failed," the field just shows empty with no explanation.

All three causes are fixed in the implementation below.

---

### 3.2 The Math Behind It

This is the exact same math from the pool contract, replicated in TypeScript for off-chain display. It must match the contract exactly — otherwise the user sees one number, the contract charges them a different number, and the transaction either reverts or silently takes more/less than expected.

**Step 1: Convert ticks to sqrt prices**

```
sqrtPrice(tick) = √(1.0001^tick) = 1.0001^(tick/2)
```

In TypeScript:
```typescript
export function tickToSqrtPrice(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}
```

**Step 2: Decode pool's sqrtPriceX96 to human-readable sqrt price**

The pool stores `sqrt_price_x96` as a Q64.96 fixed-point number (a `u128` on-chain). To convert to a JavaScript float:

```typescript
export function sqrtPriceX96ToSqrtPrice(sqrtPriceX96: bigint): number {
  // Divide by 2^96 to get the actual √P as a float
  return Number(sqrtPriceX96) / Number(2n ** 96n);
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtP = sqrtPriceX96ToSqrtPrice(sqrtPriceX96);
  return sqrtP * sqrtP;  // P = (√P)²
}
```

**Step 3: The deposit amount formulas**

These are the core CLMM formulas. Read carefully — the input/output relationship is:

```
L = liquidity (the core unit — both tokens contribute to the same L)

Given XLM amount, derive L, then derive USDC:
  L         = amountXLM / (1/√P  -  1/√P_upper)
  amountUSDC = L × (√P  -  √P_lower)

Given USDC amount, derive L, then derive XLM:
  L         = amountUSDC / (√P  -  √P_lower)
  amountXLM  = L × (1/√P  -  1/√P_upper)
```

Where:
- `P` = current pool price (USDC per XLM), decoded from `sqrtPriceX96`
- `P_lower` = price at `tickLower`, computed via `tickToSqrtPrice(tickLower)²`
- `P_upper` = price at `tickUpper`, computed via `tickToSqrtPrice(tickUpper)²`

---

### 3.3 The Three Price-Position Cases

A CLMM position behaves differently depending on where the current price is relative to the LP's chosen range. The UI must handle all three cases explicitly. Getting this wrong causes silent wrong amounts.

```
Case 1: currentTick < tickLower  (price BELOW range)
────────────────────────────────────────────────────
Current price is below your range. Your position would be 100% XLM.
No USDC is needed. The USDC field should be: locked at 0, grayed out.

Why: When price is below the range, the position has fully converted to XLM
(it's been selling USDC and buying XLM as price fell into this state).
Depositing here means you're providing only XLM for when price rises back
into your range.

  amountXLM  = L × (1/√P_lower  -  1/√P_upper)   ← uses P_lower, not current P
  amountUSDC = 0


Case 2: currentTick >= tickUpper  (price ABOVE range)
──────────────────────────────────────────────────────
Current price is above your range. Your position would be 100% USDC.
No XLM is needed. The XLM field should be: locked at 0, grayed out.

  amountXLM  = 0
  amountUSDC = L × (√P_upper  -  √P_lower)         ← uses P_upper, not current P


Case 3: tickLower <= currentTick < tickUpper  (price INSIDE range)
────────────────────────────────────────────────────────────────────
Both tokens needed. The ratio is fixed by the math.
User enters one → the other is computed automatically. This is the main case.

  amountXLM  = L × (1/√P  -  1/√P_upper)
  amountUSDC = L × (√P  -  √P_lower)
```

---

### 3.4 Complete Fix — math.ts

Replace or add the following in `frontend/src/lib/math.ts`. This is the single source of truth for all deposit math. No deposit calculations should exist anywhere else.

```typescript
// frontend/src/lib/math.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLMM Deposit Math
// All functions here are pure (no side effects, no API calls).
// They mirror the Soroban pool contract math exactly.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tick / Price Conversions ─────────────────────────────────────────────────

/**
 * Convert a tick index to the sqrt of the price at that tick.
 * Formula: √(1.0001^tick)
 * Used to get sqrtP_lower and sqrtP_upper from tickLower and tickUpper.
 */
export function tickToSqrtPrice(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick));
}

/**
 * Convert a tick index to the actual price at that tick.
 * Formula: 1.0001^tick
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Convert a price back to the nearest tick index.
 * Formula: floor(log(price) / log(1.0001))
 */
export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

/**
 * Decode the pool's on-chain sqrtPriceX96 (Q64.96 bigint) to a float sqrt price.
 * The pool stores √P × 2^96 as a u128.
 * To recover √P: divide by 2^96.
 */
export function sqrtPriceX96ToSqrtPrice(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;
  return Number(sqrtPriceX96) / Number(2n ** 96n);
}

/**
 * Decode the pool's sqrtPriceX96 to the actual price (USDC per XLM).
 * P = (√P)²
 */
export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtP = sqrtPriceX96ToSqrtPrice(sqrtPriceX96);
  return sqrtP * sqrtP;
}

// ── Deposit Calculation Types ─────────────────────────────────────────────────

export type DepositMode = "both" | "xlm_only" | "usdc_only";
export type ChangedField = "xlm" | "usdc";

export interface DepositAmounts {
  xlm: number;           // XLM amount to deposit
  usdc: number;          // USDC amount to deposit
  liquidity: number;     // Derived L value (for display / contract call)
  mode: DepositMode;     // Which tokens are active
  xlmLocked: boolean;    // XLM field should be grayed out (price above range)
  usdcLocked: boolean;   // USDC field should be grayed out (price below range)
  outOfRange: boolean;   // True if price is outside the chosen range
  rangeDirection: "below" | "above" | "in_range";
}

// ── Core Deposit Computation ──────────────────────────────────────────────────

/**
 * Compute deposit amounts for a CLMM liquidity position.
 *
 * Given:
 *   - One token amount (whichever the user just typed)
 *   - The current pool state (sqrtPriceX96, currentTick)
 *   - The LP's chosen range (tickLower, tickUpper)
 *
 * Returns:
 *   - The corresponding amount of the other token
 *   - The derived liquidity L
 *   - UI state flags (locked fields, out-of-range, etc.)
 *
 * This function handles all three price-position cases. It should be called
 * on every keystroke in either deposit input field.
 *
 * @param inputAmount  - The amount the user just typed (for whichever field)
 * @param changedField - Which field the user typed into ("xlm" or "usdc")
 * @param sqrtPriceX96 - Current pool sqrt_price_x96 (from usePool hook)
 * @param currentTick  - Current pool tick (from usePool hook slot0.tick)
 * @param tickLower    - LP's chosen lower tick boundary
 * @param tickUpper    - LP's chosen upper tick boundary
 */
export function computeDepositAmounts(
  inputAmount: string,
  changedField: ChangedField,
  sqrtPriceX96: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): DepositAmounts {

  // ── Input validation ────────────────────────────────────────────────────────
  const amount = parseFloat(inputAmount);
  if (
    isNaN(amount) ||
    amount <= 0 ||
    sqrtPriceX96 === 0n ||
    tickLower >= tickUpper
  ) {
    return {
      xlm: 0, usdc: 0, liquidity: 0,
      mode: "both",
      xlmLocked: false, usdcLocked: false,
      outOfRange: false,
      rangeDirection: "in_range",
    };
  }

  // ── Decode prices ──────────────────────────────────────────────────────────
  const sqrtP      = sqrtPriceX96ToSqrtPrice(sqrtPriceX96); // √P (current)
  const sqrtPLow   = tickToSqrtPrice(tickLower);              // √P_lower
  const sqrtPHigh  = tickToSqrtPrice(tickUpper);              // √P_upper

  // Safety: ensure sqrtPHigh > sqrtPLow (should always be true if ticks are valid)
  if (sqrtPHigh <= sqrtPLow) {
    console.error("computeDepositAmounts: sqrtPHigh <= sqrtPLow — invalid tick range");
    return {
      xlm: 0, usdc: 0, liquidity: 0,
      mode: "both",
      xlmLocked: false, usdcLocked: false,
      outOfRange: false,
      rangeDirection: "in_range",
    };
  }

  // ── Case 1: Price BELOW range ──────────────────────────────────────────────
  // currentTick < tickLower → position is 100% XLM, no USDC needed
  if (currentTick < tickLower) {
    // L derived from XLM amount using P_lower (not current P, since P < P_lower)
    const xlmInput = changedField === "xlm" ? amount : 0;
    const L = xlmInput > 0
      ? xlmInput / (1 / sqrtPLow - 1 / sqrtPHigh)
      : 0;

    return {
      xlm: xlmInput,
      usdc: 0,
      liquidity: L,
      mode: "xlm_only",
      xlmLocked: false,   // XLM is the active field
      usdcLocked: true,   // USDC is locked at 0
      outOfRange: true,
      rangeDirection: "below",
    };
  }

  // ── Case 2: Price ABOVE range ──────────────────────────────────────────────
  // currentTick >= tickUpper → position is 100% USDC, no XLM needed
  if (currentTick >= tickUpper) {
    const usdcInput = changedField === "usdc" ? amount : 0;
    const L = usdcInput > 0
      ? usdcInput / (sqrtPHigh - sqrtPLow)
      : 0;

    return {
      xlm: 0,
      usdc: usdcInput,
      liquidity: L,
      mode: "usdc_only",
      xlmLocked: true,    // XLM is locked at 0
      usdcLocked: false,  // USDC is the active field
      outOfRange: true,
      rangeDirection: "above",
    };
  }

  // ── Case 3: Price INSIDE range ─────────────────────────────────────────────
  // tickLower <= currentTick < tickUpper → both tokens needed, ratio is fixed
  if (changedField === "xlm") {
    // User typed XLM → derive L from XLM → compute USDC from same L
    const L    = amount / (1 / sqrtP - 1 / sqrtPHigh);
    const usdc = L * (sqrtP - sqrtPLow);

    return {
      xlm: amount,
      usdc: Math.max(0, usdc),   // floor at 0 for floating point safety
      liquidity: L,
      mode: "both",
      xlmLocked: false,
      usdcLocked: false,
      outOfRange: false,
      rangeDirection: "in_range",
    };
  } else {
    // User typed USDC → derive L from USDC → compute XLM from same L
    const L   = amount / (sqrtP - sqrtPLow);
    const xlm = L * (1 / sqrtP - 1 / sqrtPHigh);

    return {
      xlm: Math.max(0, xlm),
      usdc: amount,
      liquidity: L,
      mode: "both",
      xlmLocked: false,
      usdcLocked: false,
      outOfRange: false,
      rangeDirection: "in_range",
    };
  }
}

// ── Helper: Format token amount for display ────────────────────────────────

export function formatTokenAmount(amount: number, decimals = 6): string {
  if (amount === 0) return "";
  if (amount < 0.000001) return "< 0.000001";
  return amount.toFixed(decimals).replace(/\.?0+$/, "");  // trim trailing zeros
}
```

---

### 3.5 Complete Fix — AmountInputs.tsx

This component owns the two deposit input fields. It must: call `computeDepositAmounts` on every keystroke, handle locked fields correctly, and show out-of-range messaging.

```tsx
// frontend/src/pages/Liquidity/AddLiquidity/AmountInputs.tsx

import React, { useCallback } from "react";
import {
  computeDepositAmounts,
  formatTokenAmount,
  toUsd,
  formatUsd,
  type DepositAmounts,
} from "../../../lib/math";
import { usePrices } from "../../../hooks/usePrices";

interface AmountInputsProps {
  // Pool state — passed down from AddLiquidity parent
  sqrtPriceX96: bigint;
  currentTick: number;

  // Range state — set by RangeSelector
  tickLower: number;
  tickUpper: number;

  // Controlled input state — owned by AddLiquidity parent
  xlmAmount: string;
  usdcAmount: string;
  onXlmChange: (value: string, computed: DepositAmounts) => void;
  onUsdcChange: (value: string, computed: DepositAmounts) => void;

  // Wallet balances for "Max" button
  xlmBalance: number;
  usdcBalance: number;

  // Pool not loaded yet
  isPoolLoading: boolean;
}

export function AmountInputs({
  sqrtPriceX96,
  currentTick,
  tickLower,
  tickUpper,
  xlmAmount,
  usdcAmount,
  onXlmChange,
  onUsdcChange,
  xlmBalance,
  usdcBalance,
  isPoolLoading,
}: AmountInputsProps) {
  const prices = usePrices();

  // ── Handle XLM input change ────────────────────────────────────────────────
  // This is the core fix. Every keystroke in the XLM field triggers
  // computeDepositAmounts and propagates the result upward.
  const handleXlmChange = useCallback(
    (value: string) => {
      const result = computeDepositAmounts(
        value,
        "xlm",
        sqrtPriceX96,
        currentTick,
        tickLower,
        tickUpper
      );
      onXlmChange(value, result);
    },
    [sqrtPriceX96, currentTick, tickLower, tickUpper, onXlmChange]
  );

  // ── Handle USDC input change ───────────────────────────────────────────────
  const handleUsdcChange = useCallback(
    (value: string) => {
      const result = computeDepositAmounts(
        value,
        "usdc",
        sqrtPriceX96,
        currentTick,
        tickLower,
        tickUpper
      );
      onUsdcChange(value, result);
    },
    [sqrtPriceX96, currentTick, tickLower, tickUpper, onUsdcChange]
  );

  // ── Derive current deposit state for UI rendering ─────────────────────────
  // Use whichever field has a value to compute the current state
  const currentDepositState: DepositAmounts = xlmAmount
    ? computeDepositAmounts(xlmAmount, "xlm", sqrtPriceX96, currentTick, tickLower, tickUpper)
    : usdcAmount
    ? computeDepositAmounts(usdcAmount, "usdc", sqrtPriceX96, currentTick, tickLower, tickUpper)
    : { xlm: 0, usdc: 0, liquidity: 0, mode: "both", xlmLocked: false, usdcLocked: false, outOfRange: false, rangeDirection: "in_range" };

  // ── USD values for display ─────────────────────────────────────────────────
  const xlmUsd  = toUsd(currentDepositState.xlm,  "xlm",  prices);
  const usdcUsd = toUsd(currentDepositState.usdc, "usdc", prices);
  const totalUsd = xlmUsd + usdcUsd;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="amount-inputs">

      {/* Out-of-range notice — shown when single-asset deposit */}
      {currentDepositState.outOfRange && (
        <div className="out-of-range-notice">
          {currentDepositState.rangeDirection === "below" ? (
            <>
              <strong>Current price is below your range.</strong>
              {" "}Your deposit will be 100% XLM. You will start earning fees
              when price rises into your range.
            </>
          ) : (
            <>
              <strong>Current price is above your range.</strong>
              {" "}Your deposit will be 100% USDC. You will start earning fees
              when price falls into your range.
            </>
          )}
        </div>
      )}

      {/* XLM Input */}
      <div className={`token-input-wrapper ${currentDepositState.xlmLocked ? "locked" : ""}`}>
        <div className="token-input-header">
          <span className="token-label">
            <img src="/icons/xlm.svg" alt="XLM" className="token-icon" />
            XLM
          </span>
          <span className="balance-label">
            Balance: {xlmBalance.toFixed(2)}
            <button
              className="max-button"
              disabled={currentDepositState.xlmLocked}
              onClick={() => !currentDepositState.xlmLocked && handleXlmChange(String(xlmBalance))}
            >
              MAX
            </button>
          </span>
        </div>

        <input
          type="number"
          placeholder={currentDepositState.xlmLocked ? "—" : "0.00"}
          value={currentDepositState.xlmLocked ? "0" : xlmAmount}
          onChange={(e) => handleXlmChange(e.target.value)}
          disabled={currentDepositState.xlmLocked || isPoolLoading}
          className="amount-field"
          min="0"
          step="any"
        />

        {/* USD equivalent — only when prices loaded and amount > 0 */}
        {xlmUsd > 0 && (
          <span className="usd-equivalent">≈ {formatUsd(xlmUsd)}</span>
        )}
      </div>

      {/* Plus separator */}
      <div className="plus-separator">+</div>

      {/* USDC Input */}
      <div className={`token-input-wrapper ${currentDepositState.usdcLocked ? "locked" : ""}`}>
        <div className="token-input-header">
          <span className="token-label">
            <img src="/icons/usdc.svg" alt="USDC" className="token-icon" />
            USDC
          </span>
          <span className="balance-label">
            Balance: {usdcBalance.toFixed(2)}
            <button
              className="max-button"
              disabled={currentDepositState.usdcLocked}
              onClick={() => !currentDepositState.usdcLocked && handleUsdcChange(String(usdcBalance))}
            >
              MAX
            </button>
          </span>
        </div>

        <input
          type="number"
          placeholder={currentDepositState.usdcLocked ? "—" : "0.00"}
          value={currentDepositState.usdcLocked ? "0" : usdcAmount}
          onChange={(e) => handleUsdcChange(e.target.value)}
          disabled={currentDepositState.usdcLocked || isPoolLoading}
          className="amount-field"
          min="0"
          step="any"
        />

        {usdcUsd > 0 && (
          <span className="usd-equivalent">≈ {formatUsd(usdcUsd)}</span>
        )}
      </div>

      {/* Total deposit value */}
      {totalUsd > 0 && (
        <div className="total-deposit-value">
          Total deposit: <strong>{formatUsd(totalUsd)}</strong>
        </div>
      )}

      {/* Loading state — pool state not fetched yet */}
      {isPoolLoading && (
        <div className="loading-overlay">
          Loading pool data...
        </div>
      )}
    </div>
  );
}
```

---

### 3.6 Complete Fix — usePool Hook

The pool hook must be resolved before the deposit inputs become active. If the hook is still loading, inputs must be disabled with a clear loading state.

```typescript
// frontend/src/hooks/usePool.ts
// Full version — ensures all required fields are present before the UI uses them.

import { useQuery } from "@tanstack/react-query";
import { getPoolSlot0, getPoolLiquidity } from "../lib/contracts";
import { sqrtPriceX96ToPrice } from "../lib/math";

export interface PoolState {
  sqrtPriceX96: bigint;
  currentTick: number;
  fee: number;
  liquidity: bigint;
  spotPrice: number;        // human-readable price (USDC per XLM)
  isPriceStale: boolean;
  lastFetchedAt: number;    // Date.now() at last successful fetch
}

export function usePool() {
  return useQuery<PoolState>({
    queryKey: ["pool-state"],
    queryFn: async (): Promise<PoolState> => {
      // These two calls go to Soroban RPC — parallel for speed
      const [slot0, liquidity] = await Promise.all([
        getPoolSlot0(),
        getPoolLiquidity(),
      ]);

      const spotPrice = sqrtPriceX96ToPrice(slot0.sqrtPriceX96);

      // Stale price check (CoinGecko)
      let isPriceStale = false;
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd",
          { signal: AbortSignal.timeout(3000) }
        );
        const data = await res.json();
        const marketPrice: number = data?.stellar?.usd ?? 0;
        if (marketPrice > 0) {
          const divergence = Math.abs(spotPrice - marketPrice) / marketPrice;
          isPriceStale = divergence > 0.05;
        }
      } catch {
        isPriceStale = false;
      }

      return {
        sqrtPriceX96: slot0.sqrtPriceX96,
        currentTick: slot0.tick,
        fee: slot0.fee,
        liquidity,
        spotPrice,
        isPriceStale,
        lastFetchedAt: Date.now(),
      };
    },
    refetchInterval: 5000,
    staleTime: 4000,
    // Return undefined (not throw) when pool not yet loaded
    // Components check isLoading before using data
  });
}
```

---

### 3.7 Complete Fix — AddLiquidity Parent Component

The parent component owns the shared state (xlmAmount, usdcAmount, tickLower, tickUpper) and passes everything down. This is where the data flow connects.

```tsx
// frontend/src/pages/Liquidity/AddLiquidity/index.tsx

import React, { useState, useCallback } from "react";
import { usePool }        from "../../../hooks/usePool";
import { AmountInputs }   from "./AmountInputs";
import { RangeSelector }  from "./RangeSelector";
import { ReviewDeposit }  from "./ReviewDeposit";
import { priceToTick }    from "../../../lib/math";
import { TICK_SPACING }   from "../../../lib/constants";
import type { DepositAmounts } from "../../../lib/math";

// Default range: ±10% around current price
const DEFAULT_RANGE_PCT = 0.10;

export default function AddLiquidity() {
  const { data: pool, isLoading: isPoolLoading } = usePool();

  // ── Range state ────────────────────────────────────────────────────────────
  // Default ticks are set once pool loads; user can adjust via RangeSelector
  const defaultTickLower = pool
    ? Math.floor(priceToTick(pool.spotPrice * (1 - DEFAULT_RANGE_PCT)) / TICK_SPACING) * TICK_SPACING
    : -1050;
  const defaultTickUpper = pool
    ? Math.ceil(priceToTick(pool.spotPrice * (1 + DEFAULT_RANGE_PCT)) / TICK_SPACING) * TICK_SPACING
    : 950;

  const [tickLower, setTickLower] = useState<number>(defaultTickLower);
  const [tickUpper, setTickUpper] = useState<number>(defaultTickUpper);

  // ── Amount state ───────────────────────────────────────────────────────────
  // Raw string state (what the user typed)
  const [xlmAmount,  setXlmAmount]  = useState<string>("");
  const [usdcAmount, setUsdcAmount] = useState<string>("");
  // Computed deposit state (derived from input + pool state + range)
  const [depositState, setDepositState] = useState<DepositAmounts | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // When XLM field changes: update XLM state and set computed USDC
  const handleXlmChange = useCallback(
    (value: string, computed: DepositAmounts) => {
      setXlmAmount(value);
      // Set USDC to the computed amount (empty string if locked/zero)
      setUsdcAmount(
        computed.usdcLocked || computed.usdc === 0
          ? ""
          : String(computed.usdc.toFixed(6))
      );
      setDepositState(computed);
    },
    []
  );

  // When USDC field changes: update USDC state and set computed XLM
  const handleUsdcChange = useCallback(
    (value: string, computed: DepositAmounts) => {
      setUsdcAmount(value);
      setXlmAmount(
        computed.xlmLocked || computed.xlm === 0
          ? ""
          : String(computed.xlm.toFixed(6))
      );
      setDepositState(computed);
    },
    []
  );

  // When range changes: recompute deposit amounts based on current input
  const handleRangeChange = useCallback(
    (newTickLower: number, newTickUpper: number) => {
      setTickLower(newTickLower);
      setTickUpper(newTickUpper);

      // Re-run computation with new range if there's already an input value
      if (xlmAmount && pool) {
        const { computeDepositAmounts } = require("../../../lib/math");
        const computed = computeDepositAmounts(
          xlmAmount, "xlm",
          pool.sqrtPriceX96, pool.currentTick,
          newTickLower, newTickUpper
        );
        setUsdcAmount(
          computed.usdcLocked || computed.usdc === 0 ? "" : String(computed.usdc.toFixed(6))
        );
        setDepositState(computed);
      } else if (usdcAmount && pool) {
        const { computeDepositAmounts } = require("../../../lib/math");
        const computed = computeDepositAmounts(
          usdcAmount, "usdc",
          pool.sqrtPriceX96, pool.currentTick,
          newTickLower, newTickUpper
        );
        setXlmAmount(
          computed.xlmLocked || computed.xlm === 0 ? "" : String(computed.xlm.toFixed(6))
        );
        setDepositState(computed);
      }
    },
    [xlmAmount, usdcAmount, pool]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="add-liquidity">
      <h2>Add Liquidity</h2>

      {/* 1. Range selector — set ticks, shows price chart */}
      <RangeSelector
        currentTick={pool?.currentTick ?? 0}
        spotPrice={pool?.spotPrice ?? 0}
        tickLower={tickLower}
        tickUpper={tickUpper}
        tickSpacing={TICK_SPACING}
        onRangeChange={handleRangeChange}
        isLoading={isPoolLoading}
      />

      {/* 2. Deposit amount inputs — THE FIXED COMPONENT */}
      <AmountInputs
        sqrtPriceX96={pool?.sqrtPriceX96 ?? 0n}
        currentTick={pool?.currentTick ?? 0}
        tickLower={tickLower}
        tickUpper={tickUpper}
        xlmAmount={xlmAmount}
        usdcAmount={usdcAmount}
        onXlmChange={handleXlmChange}
        onUsdcChange={handleUsdcChange}
        xlmBalance={/* from wallet */0}
        usdcBalance={/* from wallet */0}
        isPoolLoading={isPoolLoading}
      />

      {/* 3. Review + confirm button */}
      {depositState && depositState.liquidity > 0 && (
        <ReviewDeposit
          xlmAmount={depositState.xlm}
          usdcAmount={depositState.usdc}
          liquidity={depositState.liquidity}
          tickLower={tickLower}
          tickUpper={tickUpper}
          pool={pool!}
        />
      )}
    </div>
  );
}
```

---

### 3.8 Edge Cases to Handle

These are the edge cases that will cause silent failures if not handled. All are covered by the `computeDepositAmounts` implementation above, but the developer should know why each check exists.

**Edge Case 1: tickLower >= tickUpper**
This can happen if the user drags the range handles past each other in RangeSelector. `computeDepositAmounts` returns all zeros. Add a validation message: "Invalid range — lower price must be less than upper price."

**Edge Case 2: sqrtPriceX96 = 0n**
Means the pool hasn't been initialized yet (no `initialize()` call made, or Soroban RPC returned before pool was deployed). The inputs must be fully disabled with message: "Pool not yet initialized."

**Edge Case 3: Very tight ranges (tickUpper - tickLower <= tickSpacing)**
Technically valid but extremely high impermanent loss risk. The computation works correctly. Add a warning: "Very tight range — higher fees but high risk of going out of range."

**Edge Case 4: Amount exceeds wallet balance**
Show an error on the input field ("Insufficient XLM balance") and disable the Review button. Do not block the computation — let the math run, just don't allow submission.

**Edge Case 5: Computed amount rounds to 0.000000 due to float precision**
If the computed counterpart token amount is less than `0.000001` (below minimum displayable), show `"< 0.000001"` and treat it as 0 for the transaction. This can happen with very wide ranges where one token's contribution is nearly zero.

**Edge Case 6: Pool refetches while user is typing**
`usePool` refetches every 5 seconds. If the pool state updates mid-input (new `sqrtPriceX96` arrives), the USDC amount needs to recompute based on the new price. Handle this with a `useEffect`:

```typescript
// In AddLiquidity parent — recompute when pool updates mid-session
useEffect(() => {
  if (!pool || !xlmAmount) return;
  const computed = computeDepositAmounts(
    xlmAmount, "xlm",
    pool.sqrtPriceX96, pool.currentTick,
    tickLower, tickUpper
  );
  setUsdcAmount(
    computed.usdcLocked || computed.usdc === 0 ? "" : computed.usdc.toFixed(6)
  );
  setDepositState(computed);
}, [pool?.sqrtPriceX96]); // Only re-run when pool price changes, not on every render
```

---

## 4. Testing Checklist

Before marking these fixes as done, verify every item in this checklist manually on Stellar Testnet.

### Pricing Fixes

- [ ] Cold start warning banner appears when pool price diverges >5% from CoinGecko XLM price
- [ ] Warning banner does NOT appear when prices are aligned
- [ ] Banner appears on both Swap page and Add Liquidity page
- [ ] CoinGecko failing (offline / rate-limited) does NOT show the banner or crash the app
- [ ] Price impact shows correct percentage for a small swap (< 0.1% expected on seeded pool)
- [ ] Price impact shows "thin pool" note when swap size exceeds 10% of pool TVL
- [ ] Very high impact (>5%) shows checkbox confirmation before swap is enabled
- [ ] USD values show correctly next to XLM and USDC amounts in swap inputs
- [ ] USD values update when amount changes
- [ ] USD values show "< $0.01" for very small amounts, not "0.00" or NaN
- [ ] Staleness dot appears green within first 5 seconds of load
- [ ] Staleness dot turns yellow after 8+ seconds without a pool update
- [ ] "Price changed" modal appears if price moves during the signing flow

### LP Deposit Auto-Calculation

- [ ] Type 100 in XLM field → USDC field auto-fills with correct amount
- [ ] Type 50 in USDC field → XLM field auto-fills with correct amount
- [ ] Both fields recompute when the price range is changed
- [ ] Computation is correct: manually verify with the formula (use a calculator)
  - At price $0.096 XLM/USDC, range [$0.086, $0.106]:
  - Enter 100 XLM → expected USDC ≈ `L * (√0.096 - √0.086)`
- [ ] When current price is BELOW the range: USDC field shows 0 and is grayed out, XLM field active
- [ ] When current price is ABOVE the range: XLM field shows 0 and is grayed out, USDC field active
- [ ] Out-of-range notice text is correct and clear (mentions which direction)
- [ ] MAX button works for XLM field
- [ ] MAX button works for USDC field
- [ ] MAX button on locked field is disabled
- [ ] Total USD deposit value shows correctly
- [ ] When pool is loading (isPoolLoading = true): both inputs are disabled
- [ ] When pool reloads (5s interval): amounts recompute without user needing to retype
- [ ] Invalid range (tickLower >= tickUpper): validation message shown, inputs disabled
- [ ] Amount exceeding wallet balance: error shown on that field, Review button disabled
- [ ] Submitting the deposit transaction uses the correct computed liquidity L value (not raw token amounts) — verify in Stellar laboratory that the contract call parameters are correct

---

## 5. What NOT to Touch

To keep scope clean, do not modify these during this fix cycle:

| File | Why not to touch |
|---|---|
| `contracts/pool/src/lib.rs` | No contract changes needed. All fixes are frontend. |
| `contracts/router/src/lib.rs` | Router is correct. Multi-pool routing is future work. |
| `pages/Portfolio/` | Portfolio page is not in scope for this fix cycle. |
| `hooks/useSwapQuote.ts` | Quote hook is correct. Only PriceInfo.tsx display changes. |
| `lib/stellar.ts` | Transaction building is correct. No changes needed. |
| Price history chart | Explicitly deferred. Do not add any chart code. |
| USDC peg assumption | Explicitly deferred. USDC treated as $1.00 for now. |

---

*ASTROFLO — Built on Stellar Soroban. All prices derived from on-chain pool state.*
*This document covers testnet MVP fixes only. Mainnet considerations are noted inline.*
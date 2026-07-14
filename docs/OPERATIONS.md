# StellarSwap — Testing, Security & Operations

> Detailed testing strategy, security model, glossary, wallet/event integration, and the user-feedback changelog. For setup and deployment see the [main README](../readme.md).

---

## 14. Testing Strategy

### Unit Tests (Rust)

Every math function must have exhaustive unit tests:

```rust
// contracts/pool/src/math/sqrt_price_test.rs

#[test]
fn test_tick_to_sqrt_price_zero() {
    assert_eq!(tick_to_sqrt_price_x96(0), Q96); // √1.0 · 2^96
}

#[test]
fn test_tick_to_sqrt_price_positive() {
    // tick 100 → price 1.01005 → √P = 1.00501 → X96 = 79308248206460718...
    let result = tick_to_sqrt_price_x96(100);
    assert_approx_eq!(result, 79308248206460718, 100); // tolerance 100 units
}

#[test]
fn test_swap_step_exact_input_zero_for_one() {
    let result = compute_swap_step(
        encode_sqrt_price(1, 1),   // sqrt(1.0)
        encode_sqrt_price(1, 2),   // sqrt(0.5) — lower price
        1_000_000u128,             // L = 1M
        100_000i128,               // exact in: 100K token0
        3000u32,                   // 0.3% fee
    );
    assert!(result.amount_out > 0);
    assert!(result.sqrt_price_next_x96 < encode_sqrt_price(1, 1));
}

#[test]
fn test_swap_does_not_exceed_price_limit() {
    // Ensure sqrt_price_limit is respected
}

#[test]
fn test_liquidity_net_sums_to_zero() {
    // After multiple mints and burns, sum of all liquidityNet must = 0
}

#[test]
fn test_fee_growth_accrual() {
    // Swap → check fee_growth_global increased by correct amount
}
```

### Integration Tests

```rust
// tests/integration_test.rs

#[test]
fn test_full_lp_lifecycle() {
    let env = Env::default();
    let pool = deploy_pool(&env);

    // 1. LP adds liquidity [0.90, 1.10]
    let (position, amount0, amount1) = pool.mint(&env, lp, -1050, 950, 16_077);

    // 2. Trader swaps
    let (in0, out1) = pool.swap(&env, trader, true, 1_000_000, 0);

    // 3. Fees accrued
    let fees = pool.collect(&env, lp, -1050, 950);
    assert!(fees.0 > 0 || fees.1 > 0);

    // 4. LP removes liquidity
    let (back0, back1) = pool.burn_and_collect(&env, lp, -1050, 950);

    // Value withdrawn should approximately equal deposited (+ fees - IL)
}

#[test]
fn test_invariant_preservation() {
    // After any sequence of swaps and LP operations,
    // pool.balance(token0) == sum of all token0 owed to LPs + fee reserves
}
```

### Frontend Tests

```bash
# Unit tests for math.ts (critical — mirrors contract math)
npm test src/lib/math.test.ts

# E2E with actual testnet (slow, run pre-release)
npm run test:e2e
```


## 15. Security Considerations

### Reentrancy

All state-modifying pool functions use an `unlocked` flag in Slot0. Any re-entrant call will panic. This is Soroban-specific: since token transfers (`token.transfer()`) call external contracts, they could theoretically re-enter. The lock must be set before any external call and released after.

```rust
fn swap(env: Env, ...) {
    let mut slot0 = read_slot0(&env);
    assert!(slot0.unlocked, "ReentrancyLock");
    slot0.unlocked = false;
    write_slot0(&env, slot0);  // Write lock BEFORE any external call
    // ... do swap ...
    slot0.unlocked = true;
    write_slot0(&env, slot0);
}
```

### Price Manipulation

The pool is susceptible to flash-loan price manipulation within a single transaction. Mitigations:
- `sqrt_price_limit_x96` on every swap (prevents large one-sided moves)
- TWAP oracle for any protocol that uses pool price as oracle
- The pool itself is protected by `L_active` — thinner liquidity = higher slippage = higher cost to manipulate

### Integer Overflow

All math uses checked arithmetic (`checked_add`, `checked_mul`). In Soroban Rust, overflow panics by default in debug mode but wraps in release. **Always use `checked_*` variants in critical math paths.**

```rust
// BAD — could silently overflow in release mode
let result = a * b / c;

// GOOD
let result = a.checked_mul(b)
              .expect("overflow in mul")
              .checked_div(c)
              .expect("div by zero");
```

### Authorization

Every LP operation checks `require_auth()` on the position owner. The router checks `require_auth()` on the `recipient`. Nobody can move someone else's funds.

### Tick Spacing Enforcement

All tick inputs to `mint()` are validated as multiples of `tick_spacing`. Invalid ticks panic immediately.

### Initial Price Manipulation

The factory allows anyone to set the initial price when deploying a pool. The first transaction after `deploy_pool()` could set an extreme price. Mitigation: the factory owner deploys and initializes in the same transaction, and seeded liquidity is added immediately.

---

## 16. Known Limitations & Future Work

| Limitation | Impact | Future fix |
|---|---|---|
| Single pair (XLM/USDC only) | No multi-hop routing | Add more pools, router multi-hop support |
| No TWAP oracle exposed | Can't use pool price in other contracts | Add `observe()` + time-weighted observations |
| No protocol fee collection | Protocol earns 0 | Implement `collectProtocol()` function |
| No position NFT transferability UI | LPs can't trade positions | Add Portfolio transfer flow |
| TTL management UX | Positions may expire | Add TTL extension prompts in Portfolio |
| No auto-rebalance | Manual LP management | Add keeper/bot infrastructure |
| Soroban resource limits | Very large tick ranges may hit compute limits | Optimize tick bitmap, batch reads |

---

## 17. Glossary

| Term | Definition |
|---|---|
| **CLMM** | Concentrated Liquidity Market Maker — AMM where liquidity is confined to price ranges |
| **L (Liquidity)** | A scalar measure of position depth. L = √(x·y) for virtual reserves. |
| **Tick** | A discrete price point. P(i) = 1.0001^i |
| **Tick spacing** | Pool parameter enforcing that LP ranges are multiples of this value |
| **Tick bitmap** | A bitmask of which ticks are initialized. Enables O(1) next-tick lookup |
| **liquidityNet** | Per-tick: signed change in L_active when price crosses this tick |
| **L_active** | Total liquidity at the current price. Equals sum of all L for ranges covering current tick |
| **sqrtPriceX96** | √P stored as Q64.96 fixed point. Used throughout contract math |
| **feeGrowthGlobal** | Cumulative fees per unit of liquidity, per token. Monotonically increasing |
| **feeGrowthInside** | Fee growth that occurred within a specific tick range. Used to compute LP's fee share |
| **zero_for_one** | Swap direction: true = sell token0 (XLM) for token1 (USDC) |
| **Soroban** | Stellar's WebAssembly smart contract platform |
| **SEP-41** | Stellar's fungible token standard (analogous to ERC-20) |
| **SAC** | Stellar Asset Contract — Soroban-callable wrapper around native Stellar assets (XLM) |
| **Impermanent Loss (IL)** | The difference in value between holding tokens vs providing liquidity, due to price movement |
| **Price impact** | How much a specific trade moves the pool price, expressed as a percentage |
| **Slot0** | Pool's core hot state: sqrtPriceX96, currentTick, fee, unlocked flag |
| **Q64.96** | Fixed-point number format with 64 integer bits and 96 fractional bits |


## 18. Wallet Integration (Freighter)

The app integrates the [Freighter](https://freighter.app) browser wallet on
**Stellar testnet**. The integration is split into a small, explicit set of
files so the wallet flow is easy to audit:

| File | Responsibility |
|---|---|
| `frontend/src/lib/stellar-wallet.ts` | Explicit `@stellar/freighter-api` calls: `detectFreighter` (`isConnected`), `connectWallet` (`isAllowed` + `setAllowed` + `requestAccess` + `getAddress`), `getWalletAddress`, `signTx` (`signTransaction`). Exports `STELLAR_TESTNET_PASSPHRASE`, `HORIZON_TESTNET_URL`. |
| `frontend/src/lib/stellar-payments.ts` | Horizon helpers: `fetchXlmBalance` (GET `/accounts/{id}`, 404 → `0`), `buildPaymentXdr` (native payment, `setTimeout(30)`), `submitSignedTx` → `{ hash }`. |
| `frontend/src/hooks/use-stellar-wallet.ts` | `useStellarWallet()` → `{ address, balance, isConnected, isLoading, error, hasFreighter, connect, disconnect, refreshBalance, sendXlm }`. |
| `frontend/src/components/wallet/StellarWalletPanel.tsx` | UI: install prompt → connect → address + balance (+ refresh) → Send-XLM form → tx hash with stellar.expert link. |

**Flow:** detect → connect → fetch XLM balance from Horizon → send a native
payment (build → sign with Freighter → submit) → display the transaction hash
linking to `stellar.expert/explorer/testnet/tx/<hash>`. The panel is rendered on
the **Portfolio** page. The DEX swap/liquidity flows sign Soroban contract
invocations through the same Freighter `signTransaction` API (see
`frontend/src/hooks/useWallet.ts` + `frontend/src/lib/transactions.ts`).

The `contract.ts` ⇄ pool function mapping (every public pool method has a
frontend counterpart) is enumerated in `frontend/src/lib/contract.ts`
(`CONTRACT_FUNCTION_MAP`), and `frontend/src/components/ContractStatus.tsx`
reads live `slot0` / `fee` / `liquidity` through that layer.

---

## 19. Event Streaming & Real-Time Updates

### On-chain events
Each state-changing contract action publishes a Soroban event
(`contracts/pool/src/events.rs`, `contracts/factory/src/events.rs`):

| Contract | Event | Emitted on |
|---|---|---|
| pool | `swap` | every `swap` (amounts, new sqrt price, tick) |
| pool | `mint` | liquidity added to a range |
| pool | `burn` | liquidity removed |
| pool | `collect` | fees/tokens withdrawn |
| factory | `pool_created` | a new pool is deployed |

### Frontend real-time model
The UI stays in sync with on-chain state via **TanStack Query** polling +
invalidation rather than a long-lived socket (Soroban RPC has no native event
push for the browser):

- `usePool`, `usePositions`, `useBalances`, `usePoolStats` poll the RPC on an
  interval (`refetchInterval`) and expose `isLoading` / `isError` for skeletons
  and error states.
- After a user transaction succeeds, the relevant queries are invalidated
  (`queryClient.invalidateQueries`) so balances/positions refresh immediately
  instead of waiting for the next poll.
- `ContractStatus` re-reads `slot0`/`liquidity` on mount; live market price uses
  the Coinbase/CoinGecko feed in `lib/marketData.ts`.
- **Reconnection/sync:** Query retries with backoff on RPC failure; on window
  refocus/reconnect, stale queries refetch automatically (Query defaults), so a
  dropped connection self-heals without a reload.


---

## 26. User Feedback Implementation

The product went through a round of hands-on user feedback covering the marketing
site and the Swap / Liquidity / Portfolio app shell. Each row below maps the
feedback we received to the concrete change shipped for it and the commit that
contains that change.

| # | User Feedback | Implementation | Commit |
|---|---|---|---|
| 1 | Rewrite the landing page copy for AstroFlo and simplify the navbar to Swap / Liquidity / Portfolio; remove "Sign in"; turn "Start creating" into a "Launch App" button that opens `/swap`. | Rewrote every landing section (hero, features, how-it-works, developers, pricing/fee-tiers, security, integrations, testimonials, metrics, infrastructure, CTA, footer) with AstroFlo-specific (CLMM DEX on Stellar) copy; reworked the navbar links and CTA. | [`e06a8e8`](https://github.com/pujabarai/astroflo/commit/e06a8e8) |
| 2 | Make the Swap, Liquidity, and Portfolio pages use the same visual theme as the landing page. | Replaced the old dark indigo "glass" DEX theme with the landing page's light monochrome design system (shared color tokens, buttons, cards, fonts) across all three app pages. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 3 | Use the provided design exactly for the Swap page, with real XLM and USDC logos and the landing page's font. | Rebuilt the Swap card to match the mockup: stacked Sell/Buy panels, real Stellar (XLM) and Circle (USDC) token logos in place of emoji, seam-positioned flip button, floating settings button. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 4 | Match the Swap/Liquidity/Portfolio navbar font to the landing page; remove the AI-generated water-drop icon on Liquidity's empty state and the lock icon on Portfolio's empty state. | Aligned navbar typography with the landing page and deleted both emoji icons from the respective empty states. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 5 | Keep the Swap card's original font; give the navbar the same scroll animation/font style as the landing page; remove the `XLM/USDC $x.xx` price readout from the navbar. | Reverted the Swap card back to the app's sans font, matched the navbar's scroll behavior to the landing page, and dropped the on-chain price pill from the navbar. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 6 | The Slippage Tolerance popover overlaps the Swap card — move it beside the card instead. | Repositioned the popover to open to the right of the settings button, clear of the card, with a mobile fallback that opens below it. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 7 | The settings button should sit further right, matching a reference screenshot. | Adjusted the floating settings button's offset to match the reference. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 8 | Replace the remaining AI-generated star/dollar emoji icons on the Add Liquidity (`/liquidity/new`) page with the real XLM/USDC logos. | Swapped every emoji token icon on that page (pair header, deposit boxes, ratio bar) for the real logos. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 9 | An earlier fix accidentally changed the landing page's font site-wide — restore the exact font from `design.zip`. | Found the root cause (a Tailwind `@theme inline` token that only resolves inside utility classes, not in hand-written CSS) and reverted the shared `.font-display` rule to match `design.zip` exactly, without touching the already-correct app-page fonts. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 10 | Use the same font on `/liquidity`, `/portfolio`, and `/liquidity/new` as the landing page. | Fixed the shared `.gradient-text` heading class from the app pages back to the landing page's Instrument Sans. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 11 | Make the Swap, Liquidity, and Portfolio pages mobile responsive. | Fixed horizontal-overflow bugs (floating settings button offset, `grid-template-columns: 1fr` missing `minmax(0, ...)`), and stacked the pool-stats grid on narrow screens. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 12 | Tapping the navbar hamburger covers the entire page — it should stay compact. | Replaced the full-screen mobile overlay (borrowed from the landing page) with a compact dropdown that opens just below the navbar. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 13 | Use the provided AstroFlo mark as the app navbar logo (background removed), and remove the "AstroFlo TM" text — without touching the landing page's navbar. | Processed the provided logo (transparent background, cropped) and swapped it in for the app navbar only; the landing page navbar was left untouched. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 14 | The Connect/Disconnect wallet button should share one consistent design, and the raw wallet address chip (e.g. `GBEU...23TO`) should be removed. | Unified both states onto the same pill button style and removed the address chip. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 15 | Label the connected-state button "Disconnect Wallet". | Updated the button copy. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |
| 16 | Nudge the navbar logo slightly right, and make it link to the landing page. | Adjusted the logo's spacing and pointed its link at `/` instead of `/swap`. | [`cd3f51c`](https://github.com/pujabarai/astroflo/commit/cd3f51c) |

> Rows 2–16 land in the same commit (`cd3f51c`) because they were iterative
> refinements to the same app-shell files (navbar, swap card, theme tokens)
> made in direct response to feedback within a single continuous session,
> rather than independent features — each item was still verified individually
> (typecheck + live browser screenshot) before moving to the next.


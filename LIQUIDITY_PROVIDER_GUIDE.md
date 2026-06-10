# AstroFlo Liquidity Provider Guide

> Complete reference for providing liquidity on the XLM/USDC concentrated liquidity pool on Stellar Soroban.

---

## Table of Contents

1. [What is AstroFlo?](#1-what-is-astroflo)
2. [How Concentrated Liquidity Works](#2-how-concentrated-liquidity-works)
3. [Pool Details](#3-pool-details)
4. [Understanding Price Ranges and Ticks](#4-understanding-price-ranges-and-ticks)
5. [Depositing Liquidity — Step by Step](#5-depositing-liquidity--step-by-step)
6. [Token Ratio and What It Means](#6-token-ratio-and-what-it-means)
7. [In Range vs Out of Range](#7-in-range-vs-out-of-range)
8. [How Fees Are Earned](#8-how-fees-are-earned)
9. [Viewing and Collecting Fees](#9-viewing-and-collecting-fees)
10. [Impermanent Loss (Divergence Loss)](#10-impermanent-loss-divergence-loss)
11. [Range Strategy: Narrow vs Wide vs Full](#11-range-strategy-narrow-vs-wide-vs-full)
12. [When to Rebalance or Remove](#12-when-to-rebalance-or-remove)
13. [Complete Workflow Walkthroughs](#13-complete-workflow-walkthroughs)
14. [Risk Summary](#14-risk-summary)
15. [FAQ](#15-faq)

---

## 1. What is AstroFlo?

AstroFlo is a **Concentrated Liquidity Market Maker (CLMM)** built on Stellar's Soroban smart contract platform. It lets anyone deposit XLM and USDC into a shared liquidity pool, earn trading fees from every swap that happens in the pool, and withdraw at any time.

**Traditional AMMs** spread your liquidity evenly across all possible prices from zero to infinity. Most of that liquidity sits idle because trades only happen near the current price.

**AstroFlo (CLMM)** lets you focus your liquidity within a specific price range. Your capital only works when the price trades within that range — which means the same amount of capital earns far more in fees compared to a traditional AMM, as long as the price stays in your range.

### Key advantages
- Up to **100× more fee-efficient** than a traditional AMM for equivalent capital
- You choose your own price range (tight or wide)
- Fees accrue automatically with every swap; you collect whenever you want
- Add or remove liquidity at any time with no lockup

---

## 2. How Concentrated Liquidity Works

Imagine the price of XLM on a number line. Instead of spreading your $1,000 thinly across every price from $0 to infinity, you deposit it only between, say, $0.60 and $0.70.

```
Price (USDC per XLM):
  $0.00  ──────────────────── $0.60 ████████████ $0.70 ──── $∞
                              [    Your Range    ]
```

- Every swap that moves the price through your range earns you a fee (0.3% of the swap size).
- Swaps outside your range earn you nothing — your liquidity is not used.
- Your effective capital concentration means you earn as much as an LP with ~10–100× more capital in a traditional pool.

---

## 3. Pool Details

| Parameter | Value |
|---|---|
| **Trading pair** | XLM / USDC |
| **Fee rate** | 0.30% per swap |
| **Tick spacing** | 10 (minimum range granularity) |
| **Token decimals** | 7 decimal places (stroops) for both tokens |
| **Initial price** | ~0.65 USDC per XLM |
| **Network** | Stellar Testnet (Soroban) |

### Token addresses
| Token | Contract Address |
|---|---|
| XLM (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

### Fee calculation example
If $50,000 of daily swap volume passes through your liquidity range and you own 10% of the pool's liquidity in that range:

```
Your daily fee = $50,000 × 0.30% × 10% = $15/day
```

---

## 4. Understanding Price Ranges and Ticks

### What is a tick?

Internally, AstroFlo does not store prices as decimals. Instead, it uses **ticks** — integers where each tick corresponds to a price:

```
price (XLM per USDC) = 1.0001 ^ tick
```

Because the frontend inverts this for readability:

```
price (USDC per XLM) = 1 / (1.0001 ^ tick)
```

Every **10 ticks** is the minimum step (tick spacing = 10). One tick is roughly a **0.01% price move**; 10 ticks ≈ **0.1%** price move.

### Reading the range selector

When you open "Add Liquidity," the UI shows you a **Min Price** and **Max Price** in **USDC per XLM**.

| Term | Meaning |
|---|---|
| **Min Price** | Lowest XLM price (in USDC) that your liquidity covers |
| **Max Price** | Highest XLM price (in USDC) that your liquidity covers |
| **Current Price** | Where the market is right now |

Your liquidity earns fees only while the current price stays between your Min and Max.

### Range presets explained

The UI offers preset buttons for quick range selection. All are symmetric around the current price:

| Preset | Price range | Character |
|---|---|---|
| **±5%** | Current × 0.95 to Current × 1.05 | Very tight, maximum fee efficiency, exits range quickly |
| **±10%** | Current × 0.90 to Current × 1.10 | Tight, good yield, moderate management required |
| **±20%** | Current × 0.80 to Current × 1.20 | Balanced, suitable for moderately volatile assets |
| **±50%** | Current × 0.50 to Current × 1.50 | Wide, set-and-forget style |
| **Full** | All possible prices | Equivalent to a traditional AMM — lowest efficiency |

### Worked example at current price $0.65 USDC/XLM

| Preset | Min price | Max price |
|---|---|---|
| ±5% | $0.6175 | $0.6825 |
| ±10% | $0.5850 | $0.7150 |
| ±20% | $0.5200 | $0.7800 |
| ±50% | $0.3250 | $0.9750 |
| Full | $0.0000 | ∞ |

### Capital efficiency vs range width

Narrow ranges concentrate your capital — the same deposit amount acts like a much larger position in a traditional pool. This amplifies both fees earned and impermanent loss.

| Range | Approximate capital multiplier |
|---|---|
| ±5% | ~20× |
| ±10% | ~10× |
| ±20% | ~5× |
| ±50% | ~2× |
| Full | 1× (baseline) |

---

## 5. Depositing Liquidity — Step by Step

### Prerequisites
- A Stellar wallet (e.g. Freighter) connected to AstroFlo
- XLM and/or USDC in your wallet
- Enough XLM for transaction fees (~1–2 XLM extra for gas)

### Steps

**1. Navigate to Liquidity → Add Liquidity**

**2. Set your price range**
Choose a preset (±10% is a good starting point) or type custom Min/Max prices. The ticks are automatically rounded to the nearest multiple of 10.

**3. Enter your deposit amounts**
Type an amount for either XLM or USDC. The other token amount is calculated automatically based on your range and current price.

> If the current price is at the edge of or outside your range, you may only need to deposit one token — see [Token Ratio](#6-token-ratio-and-what-it-means).

**4. Approve token spending**
Two on-chain approval transactions are required (one for XLM, one for USDC). Each must be signed separately in your wallet.

**5. Confirm the mint transaction**
A third transaction mints your position NFT. Once confirmed, your position appears on the Liquidity page.

**6. Your position is live**
The position card shows your tick range, current balances, in-range status, and uncollected fees.

### Slippage protection
AstroFlo applies a 5% slippage tolerance on the minimum token amounts accepted during minting. If the pool price moves more than 5% between your quote and the on-chain execution, the transaction reverts automatically.

---

## 6. Token Ratio and What It Means

When you deposit into a CLMM, the **ratio of XLM to USDC** you must deposit depends on where the current price sits within your range.

### Three cases

**Case A — Current price is within your range (normal)**
You must deposit both XLM and USDC. The exact ratio depends on how centered the price is within your range.

```
Range:    $0.585 ─────────── $0.715
Current:             $0.650
Deposit:  Mix of XLM + USDC
```

**Case B — Current price is above your Max price**
The price has risen past your entire range. Your position is 100% USDC; XLM is not needed.

```
Range:    $0.585 ──── $0.715
Current:                          $0.800  ←  price above range
Deposit:  100% USDC only
```

This happens when XLM is trading much higher than your selected range.

**Case C — Current price is below your Min price**
The price has fallen below your entire range. Your position is 100% XLM; USDC is not needed.

```
Range:    $0.585 ──── $0.715
Current:  $0.400  ←  price below range
Deposit:  100% XLM only
```

### Why the ratio matters

As the price moves through your range, the pool automatically converts one token into the other. This is by design — it means your position acts as a limit order:

- When XLM price rises through your range, the pool gradually sells your XLM for USDC.
- When XLM price falls through your range, the pool gradually buys XLM using your USDC.

By the time the price exits your range on either side, your position has been fully converted to the token that became cheaper.

---

## 7. In Range vs Out of Range

The most important concept for a liquidity provider to understand.

### In Range ✓

```
Status badge: ✓ In Range
```

- The current XLM/USDC price is between your Min and Max price.
- Your liquidity is active: every swap through your range earns you 0.3% in fees.
- Your position holds a mix of XLM and USDC that shifts as price moves.
- You do not need to do anything — fees accrue automatically.

### Out of Range ⚠

```
Status badge: ⚠ Out of Range
```

Your liquidity is inactive — you earn **zero fees** while out of range. Your position is now 100% in one token:

| Price direction | Your position holds |
|---|---|
| XLM rose above your Max price | 100% USDC |
| XLM fell below your Min price | 100% XLM |

**Nothing bad has happened automatically** — your funds are safe. But you are no longer earning. You have three choices:

1. **Wait**: If you expect the price to return to your range, simply wait. Fees resume automatically when price re-enters.
2. **Collect and rebalance**: Remove your position, collect funds, and create a new position centered on the current price.
3. **Add a new position**: Keep the old one and add a second position at the current price (you can hold multiple positions simultaneously).

### How far out of range are you?

| XLM price (USDC) | Position state |
|---|---|
| $0.650 (in range $0.585–$0.715) | Active, earning fees |
| $0.720 (just above Max) | 100% USDC, not earning |
| $0.800 (well above Max) | 100% USDC, not earning |
| $0.570 (just below Min) | 100% XLM, not earning |

The further out of range, the more your position is exposed to price moves without earning fees to compensate.

---

## 8. How Fees Are Earned

### The mechanism

Every swap that occurs in the pool pays a **0.30% fee** on the input amount. This fee is split proportionally among all LPs whose range includes the current price at the moment of the swap.

```
Fee collected per swap = swap_amount × 0.30%

Your share = fee × (your_liquidity / total_active_liquidity_at_that_price)
```

### Fee growth accumulation

Fees are not deposited to your wallet in real time. Instead, the pool tracks a **fee growth per unit of liquidity** counter (`fee_growth_global`) that increases with every swap. Your share is computed when you interact with your position (collect, burn, or add liquidity).

Between interactions, the UI computes your live pending fees by reading:
1. Current `fee_growth_global` from the pool
2. Tick boundary data (fee growth outside each tick)
3. Your stored `fee_growth_inside_last` checkpoint
4. Formula: `uncollected = liquidity × (current_fee_growth_inside − last_checkpoint) / 2^64`

### What affects your fee earnings

| Factor | Effect on fees |
|---|---|
| Narrower range | More fees per dollar deposited (higher concentration) |
| Wider range | Fewer fees per dollar, but more time in range |
| Higher trading volume | More fees for everyone in that range |
| More competitors in range | Your share per dollar decreases |
| Price out of range | Zero fees until price returns |

### Fee example

You deposit $1,000 into a ±10% range around $0.65 when total active liquidity is $20,000:

```
Your share of active liquidity = $1,000 / $20,000 = 5%

If daily volume through this range = $100,000:
  Daily fees generated = $100,000 × 0.30% = $300
  Your daily fees = $300 × 5% = $15

APR (annualized) = ($15 × 365) / $1,000 = 547%
```

This is a hypothetical example. Actual earnings depend on real trading volume and competing liquidity.

---

## 9. Viewing and Collecting Fees

### Viewing uncollected fees

On the **Liquidity** page, each position card shows:

```
┌─────────────────────────────────┐
│ Uncollected Fees                │
│  0.8432 USDC        2.3156 XLM  │
└─────────────────────────────────┘
```

These figures include:
- **Stored fees**: fees that were checkpointed the last time you interacted with the position
- **Pending fees**: fees earned from swaps since your last interaction, computed live from current pool state

The total shown is what you will receive if you click "Collect Fees" right now.

### Collecting fees

1. Click **Collect Fees** on your position card.
2. Sign the transaction in your wallet.
3. Fees are transferred directly to your wallet address.
4. Your position remains open with the same range and liquidity — collecting fees does not close your position.

**How collection works internally:**
When you collect, the contract first flushes all pending swap fees into your position's `tokens_owed` balance (by checkpointing fee growth), then transfers the full owed amount to your wallet. This ensures you receive 100% of what you have earned, including fees from swaps that occurred after your last interaction.

### Collect as often as you want

There is no compounding effect from leaving fees uncollected. Fees do not earn fees — they sit idle in the contract until you collect. If you want to compound your position, collect fees and then add them as new liquidity.

### Fees are denominated in both tokens

Fees from swap pairs are split: XLM-to-USDC swaps pay fees in XLM; USDC-to-XLM swaps pay fees in USDC. Your uncollected fees will be shown in both tokens, and you receive both when you collect.

---

## 10. Impermanent Loss (Divergence Loss)

Impermanent loss (IL) — also called divergence loss — is the difference in value between:
- **Holding** XLM and USDC in your wallet (doing nothing)
- **Providing liquidity** in the pool

When prices change, the pool rebalances your position by selling whichever token became more valuable. If you had simply held, you would still own both tokens at their new prices. This difference in outcome is impermanent loss.

### Why it happens

When XLM price rises, the pool sells your XLM for USDC (because traders are buying XLM). Your position ends up with less XLM than you started with — just when XLM is at its most valuable.

When XLM price falls, the pool sells your USDC for XLM. Your position ends up with more XLM just when it is worth less.

### IL in a CLMM vs traditional AMM

In a traditional AMM, IL accumulates for all price moves no matter how large. In a CLMM:

- **While in range**: IL behaves similarly to a traditional AMM but is amplified by concentration.
- **Once out of range**: price moves further have NO additional IL. Your position is 100% in one token and is frozen — you hold that token while the price moves, just like holding.

This means a narrow range has **amplified IL within the range**, but the IL stops growing once the price exits the range.

### IL calculation reference

For XLM price change from $0.65 to a new price:

| New XLM price | Price change | Approximate IL (±10% range) |
|---|---|---|
| $0.715 | +10% (at edge) | ~1.2% |
| $0.650 | 0% | 0% |
| $0.585 | −10% (at edge) | ~1.2% |
| $0.800 | +23% (out of range) | ~2.8% then frozen |
| $0.500 | −23% (out of range) | ~2.8% then frozen |

IL is symmetric — a +10% move causes the same IL as a −10% move.

### When IL exceeds fees

IL is only "realized" if you remove your position when prices have changed. If prices return to where they were, IL disappears. The key question is:

> **Are the fees I earn greater than the divergence loss I suffer?**

Rough heuristic:
- **High-volume pools, narrow range**: fees dominate, IL is acceptable
- **Low-volume pools, narrow range**: IL may exceed fees quickly
- **Wide range**: IL is smaller, fees are lower — better for stable or slowly moving assets

---

## 11. Range Strategy: Narrow vs Wide vs Full

### Strategy 1: Narrow Range (±5% to ±10%)

**Best for**: Active managers, assets with predictable price ranges, high-volume pools.

```
Min: $0.617   Max: $0.683   (±5% around $0.65)
```

**Pros**:
- Maximum fee yield per dollar of capital (up to 20× efficiency vs full range)
- Ideal for stable pairs or assets trading sideways

**Cons**:
- Price exits range frequently — requires monitoring and rebalancing
- Higher IL within the range
- If price leaves and you don't rebalance, you earn nothing

**Recommended when**: You expect XLM to trade within a tight band and you can check in every few days.

---

### Strategy 2: Moderate Range (±20% to ±30%)

**Best for**: Most liquidity providers who want a balance of yield and low maintenance.

```
Min: $0.520   Max: $0.780   (±20% around $0.65)
```

**Pros**:
- Good fee efficiency (still ~5× better than full range)
- Survives moderate price swings without going out of range
- Rebalancing required only on large moves

**Cons**:
- Lower fee APR than tight ranges
- More IL than a wide range if price makes a big move

**Recommended when**: You check your position weekly and accept moderate IL risk.

---

### Strategy 3: Wide Range (±50%)

**Best for**: Passive LPs, volatile assets, long-term holders.

```
Min: $0.325   Max: $0.975   (±50% around $0.65)
```

**Pros**:
- Stays in range through most market conditions
- Minimal rebalancing needed
- Lower IL than concentrated positions

**Cons**:
- Much lower fee yield per dollar (only ~2× vs traditional AMM)

**Recommended when**: You want passive income and don't want to manage the position actively.

---

### Strategy 4: Full Range

Covers all prices from the minimum to maximum tick. Behaves like a traditional AMM with the lowest possible IL but also the lowest fee efficiency.

**Recommended when**: You are unfamiliar with CLMM mechanics and want the safest, lowest-maintenance option.

---

### Choosing your strategy: decision guide

```
                           High volume pool?
                          /                 \
                        YES                  NO
                        /                     \
             Active manager?           Use Wide / Full Range
            /               \
          YES                NO
          /                   \
    ±5% to ±10%          ±20% to ±30%
    Rebalance often       Check weekly
```

---

## 12. When to Rebalance or Remove

### When to rebalance your position

**Trigger: Your position has been out of range for more than 24–48 hours**

If the price has moved significantly and shows no sign of returning, your capital is sitting idle. Rebalancing means:
1. Remove your current position (Collect + Remove)
2. Add a new position centered on the current price

**Trigger: Trading volume has shifted to a different price range**

If most trading is happening far from your range, your fees drop to zero even if your position appears "in range" at the edges.

**Trigger: Price has moved more than 30% from your range center**

At this point, even if you are technically in range (wide range), the fee-earning efficiency of your position has dropped substantially.

### When to remove your position entirely

| Situation | Action |
|---|---|
| You need your capital back | Remove and collect |
| Price is out of range and you expect it to stay there | Remove, rebalance to new range |
| You want to take profit on fees | Collect fees (do not need to remove) |
| Pool trading volume has dropped to near zero | Remove and exit |
| You want to add more liquidity to your range | You can keep the old position and add a new one |

### Step-by-step: Removing your position

1. Go to **Liquidity** → find your position card
2. Click **Remove** — this burns your liquidity, converting it back to tokens and adding them to your `tokens_owed` balance inside the contract
3. The liquidity is removed but fees + principal stay inside the contract until collected
4. Click **Collect Fees** — this sends all owed XLM and USDC to your wallet

> **Important**: Remove and Collect are two separate transactions. After clicking Remove, you must still click Collect Fees to receive your tokens.

### What happens after "Remove"

After removing liquidity:
- Your position shows 0 liquidity
- `tokens_owed` now includes both your original deposit amounts AND all accrued fees
- The Collect Fees button is enabled and shows the total payout
- Click Collect to receive everything in one transaction

---

## 13. Complete Workflow Walkthroughs

### Workflow A: Adding liquidity for the first time

```
1. Connect wallet (Freighter or compatible)
2. Go to: Liquidity → Add Liquidity
3. Select preset: ±10%
   → Min price auto-set to $0.585
   → Max price auto-set to $0.715
4. Enter XLM amount: e.g. 1000 XLM
   → USDC amount auto-calculated: e.g. ~650 USDC
5. Click "Add Liquidity"
6. Sign Approval 1 (XLM) in wallet
7. Sign Approval 2 (USDC) in wallet
8. Sign Mint transaction in wallet
9. ✓ Position appears on Liquidity page
```

### Workflow B: Monitoring your position

```
1. Go to: Liquidity page
2. Check "In Range" / "Out of Range" badge on your position card
3. See live uncollected fees (updates every 12 seconds)
4. If out of range: decide to wait, collect + rebalance, or add a new position
```

### Workflow C: Collecting fees

```
1. Go to: Liquidity page
2. On your position card, see "Uncollected Fees"
   e.g.  1.2345 USDC    3.6789 XLM
3. Click "Collect Fees"
4. Sign transaction in wallet
5. ✓ Fees arrive in your wallet immediately
   Your position remains open and continues earning
```

### Workflow D: Full exit (remove + collect)

```
1. Go to: Liquidity page
2. Click "Remove" on your position card
3. Sign transaction in wallet
4. Position now shows 0 liquidity
5. Click "Collect Fees"
6. Sign transaction in wallet
7. ✓ All XLM and USDC (original deposit + fees) arrive in your wallet
```

### Workflow E: Rebalancing (out of range → new range)

```
1. Notice position is "⚠ Out of Range"
2. Click "Remove" → sign
3. Click "Collect Fees" → sign
   ✓ All funds back in your wallet
4. Go to: Liquidity → Add Liquidity
5. Select new range centered on current price (e.g. ±10%)
6. Deposit your XLM and USDC
7. Sign approvals + mint
8. ✓ New position is active and earning
```

---

## 14. Risk Summary

### Risk 1: Impermanent loss
**Severity**: Medium | **Mitigation**: Choose wider ranges; collect fees regularly; accept IL as the cost of earning fees

When XLM price moves significantly away from your entry price, your position value may be less than simply holding the tokens. This is inherent to all AMM-style liquidity provision. Fees partially or fully offset this loss depending on volume.

### Risk 2: Out-of-range risk
**Severity**: Low (no loss of capital, but zero income) | **Mitigation**: Monitor regularly; use wider ranges for passive management

If the price exits your range, you stop earning. Your capital is safe but idle. The longer you remain out of range without rebalancing, the more opportunity cost you incur.

### Risk 3: Smart contract risk
**Severity**: Low-Medium | **Mitigation**: Start with small amounts; use the testnet to practice

AstroFlo contracts are deployed on Stellar Soroban. As with any DeFi protocol, there is always a small risk of contract bugs. Start with amounts you can afford to test with, especially on testnet.

### Risk 4: Gas (transaction fee) cost
**Severity**: Low | **Mitigation**: Batch operations; don't micro-manage tiny positions

Adding liquidity requires 3 transactions (2 approvals + 1 mint). Removing and collecting requires 2 transactions. Keep this in mind for small positions where gas costs could eat into fee earnings.

### Risk 5: Slippage on entry/exit
**Severity**: Low | **Mitigation**: 5% slippage tolerance is applied automatically; avoid adding/removing during high volatility

If the pool price moves more than 5% between your transaction submission and execution, the transaction reverts to protect you.

---

## 15. FAQ

**Q: Can I lose my deposited tokens?**
A: Your tokens cannot disappear due to the pool mechanics. You may end up with a different ratio of XLM to USDC than you deposited (due to price movement), but the total value can only diverge from holding due to impermanent loss — not go to zero unless XLM or USDC themselves go to zero.

---

**Q: What happens if I do nothing and price goes way out of range?**
A: Your position safely holds 100% of the cheaper token. You simply stop earning fees. Your capital is not at additional risk beyond having more of the token that fell in price. You can remove and collect whenever you want.

---

**Q: Do I need to do anything for fees to accumulate?**
A: No. Fees accrue automatically on every swap that touches your range. You only need to interact with the contract when you want to collect them.

---

**Q: Can I hold multiple positions at the same price range?**
A: Yes. Each time you click "Add Liquidity," a new position NFT is created. You can have multiple positions on the same or different ranges simultaneously.

---

**Q: Can I add more liquidity to an existing position?**
A: Currently, each "Add Liquidity" creates a new position. To add to an existing range, create a new position with the same tick range and it will be tracked separately.

---

**Q: When should I collect fees?**
A: Whenever you want — fees do not expire. However, they don't compound automatically. If you want compounding, collect fees and re-deposit them as new liquidity.

---

**Q: Does removing liquidity affect my fees?**
A: No. When you call "Remove," the contract first checkpoints your fees (so they are not lost), then reduces your liquidity to zero. Your fees remain in the contract until you call "Collect Fees."

---

**Q: Why does it show "Uncollected Fees: $0.00" right after a swap?**
A: The fee display updates by reading the live fee-growth state from the pool and computing your pending fees on-chain. If you just did your first swap and the amounts are very small (sub-cent), they may display as $0.00 due to rounding in the display. The actual amounts are non-zero and will be transferred when you collect.

---

**Q: What is the tick spacing of 10 and how does it affect my range?**
A: Tick spacing means your Min and Max prices are snapped to the nearest price corresponding to a multiple of 10 on the tick scale. One tick ≈ 0.01% price difference, so 10 ticks ≈ 0.1%. Your minimum range width is 10 ticks (about 0.1%). In practice, the UI handles this rounding automatically.

---

**Q: What's the difference between "Remove" and "Collect Fees"?**

| Action | What it does |
|---|---|
| **Collect Fees** | Withdraws only your earned fees. Position stays open. |
| **Remove** | Burns your liquidity, returning principal to `tokens_owed`. Does NOT send tokens to wallet yet. |
| **Collect Fees (after Remove)** | Sends all funds (principal + fees) to your wallet. |

Always follow "Remove" with "Collect Fees" to receive your tokens.

---

**Q: Why do I need to approve XLM and USDC separately?**
A: Stellar's Soroban token standard (SEP-41) requires each token to explicitly authorize the pool contract to pull funds from your account. These approvals are one-time per deposit action and expire after the transaction settles.

---

**Q: Is there a minimum deposit amount?**
A: No enforced minimum, but very small deposits (under $1) may find that gas costs exceed fee earnings. A practical minimum is $10–$50 for a position to be economically meaningful.

---

*For technical details, see the contract source code in `contracts/pool/src/`. For frontend integration, see `FRONTEND_GUIDE.md`.*

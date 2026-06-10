# StellarSwap CLMM — Math Audit Guide
## How the Math Works & How Real Prices Are Taken

---

## 1. Fixed-Point Format: Q64.64

The contracts run on Soroban (Rust, no floating point). All prices are stored as **Q64.64 fixed-point integers**:

```
sqrt_price_x64 = sqrt(P) × 2^64
```

Where `P = token_1 / token_0 = XLM / USDC` (how many XLM per 1 USDC).

| Value | Decimal | sqrt_price_x64 |
|---|---|---|
| P = 1.0 (1 XLM/USDC) | √1.0 × 2^64 | 18446744073709551616 |
| P = 3.7037 (initial) | √3.7037 × 2^64 | 35500775522094477312 |
| P = 4.0 | √4.0 × 2^64 | 36893488147419103232 |

**Why Q64.64 and not Q64.96?**
Soroban's `u128` gives 128 bits total. Using 64 bits for the integer part and 64 bits for the fractional part gives a price range of [2^-56, 2^72] with ~19 decimal digits of precision, which is enough for XLM/USDC.

> Note: The readme and some comments reference `X96` (Uniswap V3's Q64.96). This codebase uses Q64.64 (`X64`). The math is identical — just replace `2^96` with `2^64` in all formulas.

---

## 2. Tick ↔ Price Conversion

Each tick `i` represents a price:

```
P(i) = 1.0001^i      (exact)
tick = floor( log(P) / log(1.0001) )
```

**Implementation:** `tick_to_sqrt_price_x64(tick)` uses **bit-decomposition**:

```rust
// Precomputed: FACTORS[i] = floor(2^64 / sqrt(1.0001^(2^i)))
// If abs_tick has bit i set, multiply ratio by FACTORS[i] >> 64
ratio = Q64;   // = 2^64, represents 1.0
for i in 0..19 {
    if abs_tick has bit i: ratio = ratio * FACTORS[i] / 2^64
}
if tick > 0: ratio = floor(2^128 / ratio)   // invert for positive ticks
```

The inversion for positive ticks correctly computes `floor(2^128 / ratio)` as:
```rust
ratio = u128::MAX / ratio + if u128::MAX % ratio == ratio - 1 { 1 } else { 0 }
```
(This is equivalent to `floor(2^128 / ratio)` without overflow.)

---

## 3. Liquidity and Token Amounts

`L` (liquidity) is the constant that describes position depth. For a position in range `[P_lower, P_upper]` at current price `P`:

| Condition | Amount of USDC (token_0) | Amount of XLM (token_1) |
|---|---|---|
| P < P_lower (below range) | L × (√P_upper − √P_lower) | 0 |
| P_lower ≤ P < P_upper (in range) | L × (√P_upper − √P) | L × (1/√P − 1/√P_lower) |
| P ≥ P_upper (above range) | 0 | L × (1/√P_lower − 1/√P_upper) |

**In code** (`pool/src/math/liquidity.rs`):
```rust
// amount_0 = L * (√hi - √lo) / (√lo * √hi)    ← USDC (token_0)
// amount_1 = L * (√hi - √lo) / Q64             ← XLM  (token_1)
```

---

## 4. Swap Math — compute_swap_step

A swap is processed as a loop over tick segments. Each iteration calls `compute_swap_step()`.

### Exact-Input Zero-for-One (selling USDC for XLM, price moves down)

```
amount_in_after_fee = amount_remaining × (1,000,000 − fee_rate) / 1,000,000

max_amount_in = L × (√P_current − √P_target)   [USDC needed to reach tick boundary]

if amount_in_after_fee >= max_amount_in:        [full fill]
    sqrt_next  = sqrt_price_target
    amount_in  = max_amount_in
    fee        = ceil(amount_in × fee_rate / (1,000,000 − fee_rate))  ← CORRECT formula
else:                                           [partial fill]
    sqrt_next  = L × √P / (L + amount_in_after_fee × √P / Q64)
    amount_in  = amount_in_after_fee
    fee        = amount_remaining − amount_in_after_fee

amount_out = L × (1/√P_new − 1/√P_current)    [XLM received]
```

### Exact-Input One-for-Zero (selling XLM for USDC, price moves up)

```
amount_in_after_fee = amount_remaining × (1 − fee_rate)

max_amount_in = L × (1/√P_target − 1/√P_current)   [XLM needed to reach tick boundary]

if full_fill:
    sqrt_next = sqrt_price_target
    fee       = ceil(max_amount_in × fee_rate / (1 − fee_rate))
else:
    sqrt_next = √P_current + amount_in_after_fee × Q64 / L
    fee       = amount_remaining − amount_in_after_fee

amount_out = L × (√P_new − √P_current)    [USDC received]
```

### Critical Fix Applied (was CRITICAL bug before patch)

The old code computed `fee = amount_remaining - amount_in_used` for **both** full-fill and partial-fill cases. For partial fills this is correct (fee = gross − net). But for full fills, `amount_remaining` includes the entire unspent portion of the swap, so the formula charged the entire remaining swap balance as fee (e.g., 90% instead of 0.3%).

The correct full-fill fee is:
```
fee = ceil(amount_in_used × fee_rate / (1,000,000 − fee_rate))
```
This recovers the gross input: `net_in × 1_000_000 / (1_000_000 − fee_rate) = gross_in`, and `fee = gross_in − net_in`.

---

## 5. Fee Accounting — O(1) per LP

Fees are tracked globally using a monotonically-increasing counter scaled by Q64:

```
fee_growth_global += fee_per_step / L_active × Q64
```

Each tick stores `fee_growth_outside` — the fee accumulation "outside" that tick (relative to the current tick direction). When price crosses a tick, `fee_growth_outside` flips:

```rust
tick.fee_growth_outside = fee_growth_global - tick.fee_growth_outside
```

**Fee growth inside a range** `[tickLower, tickUpper]`:
```
fee_growth_inside = fee_growth_global
                  − fee_growth_below(tickLower)
                  − fee_growth_above(tickUpper)
```

where:
```
fee_growth_below(t) = fee_growth_outside(t)           if current_tick >= t
fee_growth_below(t) = fee_growth_global − fee_growth_outside(t)   otherwise
```

**LP's owed fees since last checkpoint:**
```
tokens_owed = L × (fee_growth_inside_now − fee_growth_inside_at_deposit) / Q64
```

This scales to any number of LPs with **zero iteration**.

---

## 6. How Real USDC/XLM Price Is Sourced

### On-Chain Source (primary)

Every 6 seconds, the frontend calls `pool.slot0()` via Soroban RPC simulation:

```typescript
// hooks/usePool.ts
const slot0 = await simulateContractRead(POOL_ADDRESS, "slot0", []);
// Returns: { sqrtPriceX64, tick, feeProtocol, unlocked }
```

The **real pool price** is derived from `sqrtPriceX64`:
```typescript
const sqrtPrice = Number(sqrtPriceX64) / Number(2n ** 64n);
const poolPrice = sqrtPrice * sqrtPrice;   // = XLM per USDC
const displayPrice = 1 / poolPrice;        // = USDC per XLM (user-facing)
```

### Token Convention

```
Pool internal:   price = XLM / USDC  (token_1 / token_0)
UI display:      price = USDC / XLM  (inverted, what users expect)

token_0 = USDC_SAC  (CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA)
token_1 = XLM_SAC   (CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
```

USDC sorts before XLM (CBIE... < CDLZ...) so USDC is always token_0.

### Staleness Detection & CoinGecko Override

When the on-chain pool price diverges >5% from the CoinGecko XLM market price, the frontend sets `isPriceStale = true` and synthesises effective `sqrtPriceX64`/`tick` from the live market rate. This is a **testnet workaround** — on mainnet the pool would be continuously arb'd to market price.

**Important:** Swap transactions always execute against the **real on-chain pool price**, regardless of any CoinGecko override. The displayed quote may differ slightly from execution when the pool is stale; the 6-second re-quote before transaction submission catches large divergences.

### Decimal Scaling

Both XLM and USDC use **7 decimal places** on Stellar (1 unit = 10^-7, i.e., 1 stroop = 0.0000001 XLM).

```typescript
// Raw contract amounts are integers (stroops)
// Display amounts are divided by 10^7
const displayAmount = fromStroops(rawAmount);  // rawAmount / 10^7
const rawAmount    = toStroops(displayAmount); // displayAmount × 10^7
```

Since both tokens use the same decimal scale, the price ratio `XLM_stroops / USDC_stroops` equals the human-readable `XLM / USDC`. **No decimal adjustment is needed when computing price from sqrtPriceX64.**

---

## 7. Swap Direction Logic

The UI maps swap direction to pool direction:

```
Pool convention:   zero_for_one = true  → sell token_0 (USDC) → price P moves down
Pool convention:   zero_for_one = false → sell token_1 (XLM)  → price P moves up

UI "Sell XLM for USDC":  poolZeroForOne = false  (selling token_1)
UI "Sell USDC for XLM":  poolZeroForOne = true   (selling token_0)
```

In `useSwapQuote.ts`:
```typescript
// zeroForOne in UI = true means "selling XLM" → pool zero_for_one = FALSE
const poolZeroForOne = !zeroForOne;
```

---

## 8. Liquidity Range and Out-of-Range Conditions

| Condition | USDC/XLM display says | Pool state | Deposit needed |
|---|---|---|---|
| `pool.tick < tickLower` | Price ABOVE your range | P in XLM/USDC is below lower bound | 100% USDC only |
| `pool.tick >= tickUpper` | Price BELOW your range | P in XLM/USDC is above upper bound | 100% XLM only |
| `tickLower <= tick < tickUpper` | In range | Price inside the range | Both tokens |

The "above/below" labelling in the UI refers to the **USDC/XLM display price** (not the pool's internal XLM/USDC price). Since these are inverses, "pool.tick < tickLower" (pool price too low in XLM/USDC) corresponds to "USDC/XLM too high" = **above your range** from the user's perspective.

---

## 9. Bugs Found and Fixed

| # | Severity | File | Description |
|---|---|---|---|
| 1 | **CRITICAL** | `pool/src/swap.rs:54` | Fee overcharged on full-fill exact-in: charged entire remaining swap balance instead of `ceil(amount_in × fee_rate / (1 − fee_rate))` |
| 2 | **CRITICAL** | `pool/src/lib.rs` | Reentrancy guard released **before** token transfers in `swap()` — any re-entrant call during `token.transfer()` passed the lock |
| 3 | **CRITICAL** | `factory/src/lib.rs` | Pool deploy salt only encoded `fee` bytes, ignoring token addresses — any two pools with the same fee tier would deploy to the same contract address (collision) |
| 4 | **HIGH** | `pool/src/math/fixed_point.rs:71` | `div_u256_u128` panicked with "remainder overflow" when denominator > 2^64, covering half the valid sqrt_price range (up to MAX_SQRT_RATIO ≈ 2^72) |
| 5 | **HIGH** | `factory/src/lib.rs:105` | `set_protocol_fee` had no lower bound — admin could set fee=1, taking 100% of all LP fees |
| 6 | **HIGH** | `pool/src/lib.rs` | No `set_fee_protocol()` or `collect_protocol()` functions — protocol fees accumulated but could never be enabled or withdrawn |
| 7 | **HIGH** | `pool/src/lib.rs:318` | `saturating_sub` in `burn()` silently set liquidity to 0 on underflow instead of panicking — could corrupt pool state |
| 8 | **MEDIUM** | `pool/src/lib.rs:170` | Unchecked `u128 as i128` cast in tick-crossing could silently corrupt liquidity for positions > 2^127 |
| 9 | **MEDIUM** | `pool/src/math/sqrt_price.rs:70` | Positive-tick inversion used `u128::MAX / ratio` instead of `floor(2^128 / ratio)` — systematic 1-ULP error |
| 10 | **HIGH** | `frontend/SummaryCards.tsx` | `amount0` (USDC) multiplied by `price` (XLM/USDC) as if it were XLM; `amount1` (XLM) treated as raw USDC — portfolio value wildly wrong |
| 11 | **HIGH** | `frontend/SummaryCards.tsx` | Fee token labels: `totalFees0` labelled "XLM" and `totalFees1` labelled "USDC" when both are reversed |
| 12 | **MEDIUM** | `frontend/AmountInputs.tsx` | Main banner: "Price is above your range → 100% XLM" shown for `price1Only` (which is actually price **below** range); swapped text for both conditions |
| 13 | **MEDIUM** | `frontend/RangeSelector.tsx` | Min/Max price warnings: "Below current price" on Min and "Above current price" on Max were exactly swapped |
| 14 | **CONFIG** | `frontend/.env.local` | Contract addresses pointed to an older deployment; updated to match `.env.testnet` canonical deployment |
| 15 | **LOW** | `pool/src/math/sqrt_price.rs:52` | `FACTORS[16]` was 696457651847595233 (off by 251,295 ULPs from correct value 696457651847846528) |

---

## 10. Verified Correct (No Changes Needed)

- `computeSwapQuote()` in `math.ts` correctly mirrors `compute_swap_step()` in Rust for both directions
- `getAmountsForLiquidity()` and `getLiquidityForAmounts()` in TypeScript match the contract's Q64 math
- `sqrtPriceX64ToPrice()` and `priceToSqrtPriceX64()` correctly convert between Q64 sqrt-price and human-readable price
- `tickToPrice()` = `1.0001^tick` and `priceToTick()` = `floor(log(p)/log(1.0001))` are correct
- Fee growth divisor in `usePositions.ts` uses Q64 — **correct**, matches the contract (not Q128 like Uniswap V3)
- `zeroForOne` direction inversion in `useSwapQuote.ts` is correct (`poolZeroForOne = !uiZeroForOne`)
- Both XLM and USDC use 7 decimal places; `fromStroops`/`toStroops` handle this correctly
- Token ordering: USDC_SAC (`CBIE...`) < XLM_SAC (`CDLZ...`) → token_0=USDC, token_1=XLM

---

## 11. USDC/XLM Rate — Complete Trace

**User enters "sell 100 XLM":**

1. `amountIn = 100 XLM = 1,000,000,000 stroops`
2. `poolZeroForOne = false` (selling token_1 = XLM)
3. `computeSwapQuote(sqrtPriceX64, liquidity, amountIn, false, 3000)`:
   - `amountAfterFee = 1,000,000,000 × 997,000 / 1,000,000 = 997,000,000`
   - `sqrtNext = sqrtPriceX64 + amountAfterFee × Q64 / liquidity`
   - `amountOut = L × (sqrtNext − sqrtPriceX64) / Q64` ← USDC stroops
4. `displayOut = amountOut / 10^7` ← human-readable USDC
5. `rate = "1 XLM = ${(displayOut/100).toFixed(4)} USDC"`

**For "sell 100 USDC":**

1. `amountIn = 100 USDC = 1,000,000,000 stroops`
2. `poolZeroForOne = true` (selling token_0 = USDC)
3. `computeSwapQuote(sqrtPriceX64, liquidity, amountIn, true, 3000)`:
   - `amountAfterFee = 997,000,000`
   - `lq = L × sqrtP / Q64`
   - `sqrtNext = lq × Q64 / (L + amountAfterFee × sqrtP / Q64)` ← price moves down
   - `amountOut = L × (sqrtP − sqrtNext) / Q64` ← XLM stroops (amount_1_delta)
4. `displayOut = amountOut / 10^7` ← human-readable XLM

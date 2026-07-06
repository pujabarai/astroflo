# StellarSwap — CLMM DEX on Stellar Testnet

> **A production-grade Concentrated Liquidity Market Maker (CLMM) DEX built on Stellar's Soroban smart contract platform. Initial trading pair: XLM / USDC on Stellar Testnet.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Why CLMM on Stellar](#2-why-clmm-on-stellar)
3. [Core Concepts & Math](#3-core-concepts--math)
   - 3.1 [The CLMM Invariant](#31-the-clmm-invariant)
   - 3.2 [Ticks & Price Discretization](#32-ticks--price-discretization)
   - 3.3 [Liquidity (L) — The Core Variable](#33-liquidity-l--the-core-variable)
   - 3.4 [Token Composition at Any Price](#34-token-composition-at-any-price)
   - 3.5 [Swap Math — Step-by-Step](#35-swap-math--step-by-step)
   - 3.6 [Fee Accounting](#36-fee-accounting)
   - 3.7 [Fixed-Point Arithmetic on Soroban](#37-fixed-point-arithmetic-on-soroban)
4. [Full System Architecture](#4-full-system-architecture)
   - 4.1 [High-Level Architecture](#41-high-level-architecture)
   - 4.2 [Contract Layer](#42-contract-layer)
   - 4.3 [Frontend Layer](#43-frontend-layer)
   - 4.4 [Data Flow Diagram](#44-data-flow-diagram)
5. [Smart Contracts — Deep Dive](#5-smart-contracts--deep-dive)
   - 5.1 [Factory Contract](#51-factory-contract)
   - 5.2 [Pool Contract (Core)](#52-pool-contract-core)
   - 5.3 [Position Manager Contract](#53-position-manager-contract)
   - 5.4 [Router Contract](#54-router-contract)
6. [On-Chain State Design](#6-on-chain-state-design)
7. [The Swap Mechanism — End-to-End](#7-the-swap-mechanism--end-to-end)
8. [The LP Flow — End-to-End](#8-the-lp-flow--end-to-end)
   - 8.1 [Adding Liquidity](#81-adding-liquidity)
   - 8.2 [Fee Collection](#82-fee-collection)
   - 8.3 [Removing Liquidity](#83-removing-liquidity)
   - 8.4 [Rebalancing (Position Management)](#84-rebalancing-position-management)
9. [Frontend Architecture](#9-frontend-architecture)
   - 9.1 [Swap Page](#91-swap-page)
   - 9.2 [Liquidity Page](#92-liquidity-page)
   - 9.3 [Portfolio Page](#93-portfolio-page)
10. [XLM / USDC Testnet Setup](#10-xlm--usdc-testnet-setup)
11. [Project Structure](#11-project-structure)
12. [Development Setup](#12-development-setup)
13. [Contract Deployment](#13-contract-deployment)
14. [Testing Strategy](#14-testing-strategy)
15. [Security Considerations](#15-security-considerations)
16. [Known Limitations & Future Work](#16-known-limitations--future-work)
17. [Glossary](#17-glossary)
18. [Wallet Integration (Freighter)](#18-wallet-integration-freighter)
19. [Event Streaming & Real-Time Updates](#19-event-streaming--real-time-updates)
20. [Testing — Run & Outputs](#20-testing--run--outputs)
21. [CI/CD Pipeline](#21-cicd-pipeline)
22. [Deployment & Rollback](#22-deployment--rollback)
23. [Environment Variables](#23-environment-variables)
24. [Troubleshooting](#24-troubleshooting)
25. [Deployment Evidence](#25-deployment-evidence)
26. [User Feedback Implementation](#26-user-feedback-implementation)

---

## 1. Project Overview

StellarSwap is a **Concentrated Liquidity Market Maker (CLMM)** decentralized exchange built entirely on Stellar's **Soroban** smart contract platform. It is inspired by Uniswap v3's architecture and Raydium CLMM on Solana, adapted for Stellar's execution environment.

### What It Is

A CLMM DEX allows **Liquidity Providers (LPs)** to deposit liquidity into discrete **price ranges** rather than across the entire price curve from 0 to infinity. This makes every dollar of capital dramatically more efficient — LPs earn more fees, traders get less slippage — but requires active management of positions.

### What This Project Builds

The MVP covers three core sections of the UI:

| Page | What it does |
|---|---|
| **Swap** | Trade XLM ↔ USDC. Auto-routing, slippage control, real-time price impact. |
| **Liquidity** | Create / manage / close LP positions with custom price ranges. |
| **Portfolio** | View your open positions, accumulated fees, and historical performance. |

### Target Environment

| Setting | Value |
|---|---|
| Network | Stellar Testnet |
| Smart Contract VM | Soroban (WASM) |
| Contract Language | Rust |
| Token pair | XLM (native) / USDC (SEP-41 on testnet) |
| Frontend | React + TypeScript + Stellar SDK |
| Wallet | Freighter (browser extension) |

---

## 2. Why CLMM on Stellar

### Stellar's Native DEX Is Not Enough

Stellar already has a native order book (SDEX) and AMM (constant product). But neither supports concentrated liquidity. The SDEX is an orderbook requiring active management; the AMM spreads liquidity from 0 to ∞, making it capital-inefficient.

### Why Soroban Changes Everything

Soroban (launched 2024) brings general-purpose smart contracts to Stellar. This unlocks:

- **Arbitrary on-chain logic** — tick iteration, fixed-point math, position tracking
- **Composable DeFi** — contracts calling contracts
- **Custom token standards** — SEP-41 compliant tokens callable from contracts

### The XLM/USDC Pair

XLM is Stellar's native asset. USDC is issued natively on Stellar by Circle. This pair is:
- The highest-volume pair on Stellar
- A stablecoin/volatile pair where concentrated liquidity shines most (LPs focus around the peg corridor)
- Fully available on testnet via Friendbot and Circle's testnet faucet

---

## 3. Core Concepts & Math

> This section is critical. Every developer on this project must understand the math before touching the contracts. Incorrect math in a CLMM means LPs lose money silently.

### 3.1 The CLMM Invariant

Classic AMM uses:
```
x · y = k
```

CLMM uses the same formula but restricts it to a price range `[P_lower, P_upper]`. The invariant becomes:

```
(x + L / √P_upper) · (y + L · √P_lower) = L²
```

Where:
- `x` = amount of Token A (XLM) in the virtual reserve
- `y` = amount of Token B (USDC) in the virtual reserve
- `L` = liquidity (a measure of depth, always positive)
- `P` = current price (USDC per XLM)
- `P_lower`, `P_upper` = the LP's chosen price range boundaries

The key insight: **L is constant as price moves within `[P_lower, P_upper]`**. Only the composition of x and y changes. When price exits the range, the position becomes single-asset and stops earning fees.

### 3.2 Ticks & Price Discretization

The price space is discretized into **ticks**. Each tick `i` corresponds to a price:

```
P(i) = 1.0001^i
```

This gives a price grid where each step is exactly **0.01% (1 basis point)** different from the previous. Converting between price and tick:

```
tick = floor( log(P) / log(1.0001) )
P    = 1.0001^tick
```

**Practical examples:**

| Tick | Price (USDC per XLM) |
|------|---------------------|
| 0 | 1.0000 |
| 100 | 1.01005 |
| -100 | 0.99005 |
| 10000 | 2.71828 (≈ e) |
| -10000 | 0.36788 (≈ 1/e) |

**Tick spacing** — pools are not required to use every tick. A `tick_spacing` parameter forces LP ranges to be multiples of it:

| Pool type | Tick spacing | Min range width |
|---|---|---|
| Stable (XLM/USDC) | 1 or 10 | 0.01% or 0.1% |
| Volatile | 60 | 0.6% |

We use `tick_spacing = 10` for XLM/USDC.

**Why ticks matter for contract design:** Each tick that has at least one LP range boundary is called an *initialized tick*. The swap loop must find the *next initialized tick* in the swap direction efficiently. We use a **bitmap** (a `u256` bitmask per word of 256 ticks) for O(1) next-tick lookup.

### 3.3 Liquidity (L) — The Core Variable

`L` is not a token amount — it is a measure of depth. Formally:

```
L = √(x · y)
```

For a full-range position from 0 to ∞, this is just `√k`. For a concentrated position, it is the *virtual* liquidity as if the position were full-range.

**Why L matters:**

- When an LP deposits into a range, they provide a specific `L`
- Total `L_active` at the current price = sum of all LP `L` values whose ranges include the current tick
- Higher `L_active` = less slippage for traders

**Liquidity management at tick boundaries:**
Each tick stores `liquidityNet` — the net change in active liquidity when price crosses that tick:
- At a range's `tickLower`: `liquidityNet = +L` (liquidity enters when price crosses up)
- At a range's `tickUpper`: `liquidityNet = -L` (liquidity exits when price crosses up)

When price crosses a tick during a swap:
```
L_active += ticks[tick].liquidityNet  // crossing up
L_active -= ticks[tick].liquidityNet  // crossing down
```

### 3.4 Token Composition at Any Price

Given a position with liquidity `L` and range `[P_lower, P_upper]`, the actual token amounts held are:

**Case 1: Current price P is inside the range (P_lower ≤ P ≤ P_upper)**
```
amount_XLM  = L · (1/√P  -  1/√P_upper)
amount_USDC = L · (√P  -  √P_lower)
```

**Case 2: Current price P is below range (P < P_lower)**
```
amount_XLM  = L · (1/√P_lower  -  1/√P_upper)
amount_USDC = 0
```
The position is 100% XLM, earning no fees.

**Case 3: Current price P is above range (P > P_upper)**
```
amount_XLM  = 0
amount_USDC = L · (√P_upper  -  √P_lower)
```
The position is 100% USDC, earning no fees.

> **LP Intuition:** As XLM price rises, your position sells XLM and accumulates USDC. As XLM price falls, your position sells USDC and accumulates XLM. This is the source of impermanent loss — you always end up with more of the falling asset.

### 3.5 Swap Math — Step-by-Step

A swap is processed as a **loop over tick segments**. Each iteration handles one segment of the price curve between two consecutive initialized ticks.

**For each segment:**

1. Find `sqrt_price_next` — the sqrt of the price at the next initialized tick in the swap direction
2. Compute how much of `amount_remaining` can be filled within this segment using `compute_swap_step()`
3. If the segment is fully consumed (price reaches the tick), cross the tick and update `L_active`
4. Repeat until `amount_remaining = 0`

**`compute_swap_step()` — The Core Formula**

Given:
- `sqrt_price_current` (√P)
- `sqrt_price_target` (√P at next tick boundary)
- `L_active` (current active liquidity)
- `amount_remaining` (tokens left to fill)
- `fee_rate`

**Selling XLM (zero_for_one = true), exact input:**
```
amount_in_max  = L · (√P_current - √P_target)      // max USDC we can take
sqrt_price_new = if amount_remaining fills segment:
                     sqrt_price_target
                 else:
                     L / (L/√P_current + amount_in)

amount_out = L · (1/√P_new - 1/√P_current)          // XLM received
```

**Buying XLM (zero_for_one = false), exact input:**
```
amount_in_max  = L · (1/√P_target - 1/√P_current)
sqrt_price_new = √P_current + amount_in / L

amount_out = L · (√P_new - √P_current)               // USDC received
```

**Fee deduction (applied before the swap step):**
```
amount_in_after_fee = amount_in · (1 - fee_rate)
```

### 3.6 Fee Accounting

Fees are tracked using a **global fee growth counter** per token, accumulated per unit of liquidity:

```
// Updated after every swap, for the active tick range only:
fee_growth_global_0 += (fee_amount_0 / L_active)    // fees in XLM
fee_growth_global_1 += (fee_amount_1 / L_active)    // fees in USDC
```

Each tick stores `fee_growth_outside_0/1` — the fee growth accumulated *outside* that tick's range. This allows calculating how much fee growth happened *inside* any range `[tickLower, tickUpper]` in O(1):

```
fee_growth_inside_0 = fee_growth_global_0
                    - fee_growth_below_lower_0
                    - fee_growth_above_upper_0
```

When an LP creates a position, the current `fee_growth_inside` is snapshotted. At collection time:

```
fees_owed_0 = L · (fee_growth_inside_0_now - fee_growth_inside_0_at_deposit)
fees_owed_1 = L · (fee_growth_inside_1_now - fee_growth_inside_1_at_deposit)
```

This scales to thousands of LPs with **zero loops** — each LP only reads their own position's snapshot.

### 3.7 Fixed-Point Arithmetic on Soroban

Soroban contracts use `i128` and `u128` integers. There is no native floating point. All price and liquidity math uses **Q64.96 fixed-point** representation:

```
sqrt_price_x96 = √P · 2^96
```

So if P = 1.50 (USDC per XLM), then:
```
√P = 1.2247...
sqrt_price_x96 = 1.2247 · 2^96 ≈ 96,952,927,993,655,965,672...
```

**Why Q64.96?**
- 64 bits for the integer part (supports prices up to ~1.8 × 10^19)
- 96 bits for the fractional part (precision to ~10^-29)
- Multiplication of two Q64.96 values requires intermediate `u256` arithmetic — implement via u128 with careful overflow handling

**Critical math helpers to implement in Rust:**

```rust
// Integer square root (Babylonian / Newton's method)
pub fn sqrt_u128(n: u128) -> u128 {
    if n == 0 { return 0; }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// Multiply two Q64.96 values safely
pub fn mul_div(a: u128, b: u128, denominator: u128) -> u128 {
    // Use u256 intermediate: (a * b) / denominator
    // Since Soroban has no native u256, implement via u128 split
    let (hi, lo) = mul_u128(a, b);  // 256-bit product
    div_u256_by_u128(hi, lo, denominator)
}

// Get sqrt price from tick
pub fn tick_to_sqrt_price_x96(tick: i32) -> u128 {
    // Precomputed table or iterative: 1.0001^(tick/2) · 2^96
    // Implementation: use bit-shift decomposition of tick
}
```

---

## 4. Full System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                      │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────────────┐  │
│  │  /swap   │   │ /liquidity  │   │     /portfolio       │  │
│  └──────────┘   └─────────────┘   └──────────────────────┘  │
│       │                │                      │              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Stellar SDK + Freighter Wallet            │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │ XDR transactions
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   STELLAR TESTNET (Horizon + Soroban RPC)   │
│                                                             │
│  ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │   Router     │   │         Factory Contract           │  │
│  │  Contract    │──▶│  deploy_pool · get_pool · pools[]  │  │
│  └──────┬───────┘   └────────────────┬───────────────────┘  │
│         │                            │ deploys               │
│         ▼                            ▼                       │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                   Pool Contract                      │    │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐    │    │
│  │  │  Slot0   │ │ Tick Map  │ │  Position Map     │    │    │
│  │  │ sqrtP    │ │ liqNet    │ │  (owner,tL,tH)    │    │    │
│  │  │ curTick  │ │ feeGrowth │ │  → {L, feeSnap}   │    │    │
│  │  └──────────┘ └───────────┘ └──────────────────┘    │    │
│  │  swap() · mint() · burn() · collect() · observe()   │    │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │ token transfers                │
│         ┌───────────────────┴────────────────────┐          │
│         ▼                                        ▼          │
│  ┌─────────────┐                        ┌──────────────┐    │
│  │ XLM Native  │                        │  USDC SEP-41 │    │
│  │   Token     │                        │   Contract   │    │
│  └─────────────┘                        └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Contract Layer

| Contract | Purpose | Key Functions |
|---|---|---|
| `factory` | Deploys and tracks all pools | `deploy_pool`, `get_pool`, `set_fee_protocol` |
| `pool` | Core AMM logic | `swap`, `mint`, `burn`, `collect`, `observe` |
| `position_nft` | Wraps positions as transferable SEP-41 tokens | `mint_position`, `transfer`, `get_position` |
| `router` | User-facing entry; slippage checks | `exact_input`, `exact_output`, `quote` |

### 4.3 Frontend Layer

| Module | Tech | Purpose |
|---|---|---|
| `pages/Swap` | React + Stellar SDK | Swap UI, price quotes, transaction building |
| `pages/Liquidity` | React + Recharts | Range selector, deposit calculator, position list |
| `pages/Portfolio` | React + Recharts | Open positions, fee claims, P&L |
| `hooks/usePool` | React Query | Real-time pool state from Soroban RPC |
| `hooks/usePositions` | React Query | LP positions for connected wallet |
| `lib/math.ts` | TypeScript | Off-chain quote math (mirrors contract math) |
| `lib/stellar.ts` | Stellar SDK | Transaction building, signing, submission |

### 4.4 Data Flow Diagram

**Swap flow:**
```
User inputs "sell 100 XLM"
        │
        ▼
Frontend calls quote() on Router (Soroban simulation, no fee)
        │  returns: expected USDC out, price impact, route
        ▼
User confirms → Frontend builds Transaction:
  - invoke Router::exact_input(xlm_amount, min_usdc_out, deadline)
        │
        ▼
Freighter signs → Stellar SDK submits to testnet
        │
        ▼
Router validates slippage, calls Pool::swap()
        │
        ▼
Pool::swap() runs tick-crossing loop:
  1. Finds next initialized tick (bitmap lookup)
  2. compute_swap_step() for this segment
  3. Updates sqrt_price_x96, current_tick
  4. Crosses tick if boundary reached (updates L_active)
  5. Repeats until amount_in exhausted
        │
        ▼
Pool transfers USDC to user via SEP-41 token::transfer()
Pool accepts XLM via native transfer
        │
        ▼
Frontend polls Horizon for tx confirmation
Portfolio / Swap UI updates
```

---

## 5. Smart Contracts — Deep Dive

### 5.1 Factory Contract

The factory is the root of the protocol. It deploys new pool contracts and maintains an index of all existing pools.

**Storage:**
```rust
// Persistent storage
DataKey::Pool(token_a: Address, token_b: Address, fee: u32) → Address  // pool contract address
DataKey::ProtocolFeeRecipient → Address
DataKey::DefaultProtocolFee → u32  // e.g. 10 = 10% of LP fees go to protocol
```

**Interface:**
```rust
pub trait FactoryTrait {
    // Deploy a new pool for a token pair + fee tier
    // Panics if pool already exists for this triple
    fn deploy_pool(
        env: Env,
        token_a: Address,    // must be < token_b lexicographically (canonical ordering)
        token_b: Address,
        fee: u32,            // e.g. 3000 = 0.3%
        tick_spacing: i32,   // e.g. 10 for stable pairs
        initial_sqrt_price_x96: u128,  // set the initial price
    ) -> Address;

    // Read-only: get pool address for a pair
    fn get_pool(env: Env, token_a: Address, token_b: Address, fee: u32) -> Option<Address>;

    // Admin: update protocol fee recipient
    fn set_fee_recipient(env: Env, recipient: Address);
}
```

**Key design decision — token ordering:** Tokens are always sorted by `Address` string comparison so that (XLM, USDC) and (USDC, XLM) resolve to the same pool. `token_0` is always the lexicographically smaller address. The `zero_for_one` boolean in swap refers to selling `token_0` for `token_1`.

### 5.2 Pool Contract (Core)

This is the most complex contract. Every line of math in Section 3 lives here.

**Storage schema:**

```rust
// Instance storage (cheap reads, always in memory during tx)
pub struct Slot0 {
    pub sqrt_price_x96: u128,   // Current √P in Q64.96 format
    pub tick: i32,               // Current tick index
    pub fee_protocol: u8,        // Protocol fee fraction (0–10 = 0%–10% of fees)
    pub unlocked: bool,          // Reentrancy guard
}

// Persistent storage keys
DataKey::Slot0                          → Slot0
DataKey::Liquidity                      → u128           // total active liquidity at current tick
DataKey::FeeGrowthGlobal0               → u128           // cumulative fee growth, token0
DataKey::FeeGrowthGlobal1               → u128           // cumulative fee growth, token1
DataKey::TickBitmap(word_pos: i16)      → u256           // initialized tick bitmap
DataKey::Tick(tick: i32)               → TickInfo
DataKey::Position(key: PositionKey)    → PositionInfo
DataKey::Token0                         → Address
DataKey::Token1                         → Address
DataKey::Fee                            → u32
DataKey::TickSpacing                    → i32
```

**Tick and Position structs:**
```rust
pub struct TickInfo {
    pub liquidity_gross: u128,       // total L referencing this tick (for cleanup)
    pub liquidity_net: i128,         // signed: +L at lower, -L at upper
    pub fee_growth_outside_0: u128,  // fee growth outside this tick, token0
    pub fee_growth_outside_1: u128,  // fee growth outside this tick, token1
    pub initialized: bool,
}

pub struct PositionKey {
    pub owner: Address,
    pub tick_lower: i32,
    pub tick_upper: i32,
}

pub struct PositionInfo {
    pub liquidity: u128,
    pub fee_growth_inside_0_last: u128,  // snapshot at last update
    pub fee_growth_inside_1_last: u128,
    pub tokens_owed_0: u128,  // uncollected fees in token0
    pub tokens_owed_1: u128,  // uncollected fees in token1
}
```

**Core function signatures:**
```rust
pub trait PoolTrait {
    // Initialize pool (called once by factory after deploy)
    fn initialize(env: Env, sqrt_price_x96: u128);

    // Swap tokens through the pool
    // Returns (amount0, amount1) — negative means tokens going OUT of pool
    fn swap(
        env: Env,
        recipient: Address,
        zero_for_one: bool,       // true = sell token0 for token1
        amount_specified: i128,   // positive = exact in, negative = exact out
        sqrt_price_limit_x96: u128,  // price cannot cross this (slippage guard)
    ) -> (i128, i128);

    // Add liquidity to a range — caller must have approved tokens
    fn mint(
        env: Env,
        recipient: Address,
        tick_lower: i32,
        tick_upper: i32,
        amount: u128,         // desired liquidity L to add
    ) -> (u128, u128);        // actual token0, token1 required

    // Remove liquidity — does NOT transfer tokens (call collect() after)
    fn burn(
        env: Env,
        tick_lower: i32,
        tick_upper: i32,
        amount: u128,         // L to remove
    ) -> (u128, u128);        // token amounts moved to owed

    // Collect tokens owed (fees + burned liquidity)
    fn collect(
        env: Env,
        recipient: Address,
        tick_lower: i32,
        tick_upper: i32,
        amount0_requested: u128,
        amount1_requested: u128,
    ) -> (u128, u128);

    // Read current pool state
    fn slot0(env: Env) -> Slot0;
    fn liquidity(env: Env) -> u128;
    fn fee_growth_global_0(env: Env) -> u128;
    fn fee_growth_global_1(env: Env) -> u128;
    fn get_tick(env: Env, tick: i32) -> TickInfo;
    fn get_position(env: Env, owner: Address, tick_lower: i32, tick_upper: i32) -> PositionInfo;
}
```

**The swap() function — Internal Logic:**

```rust
fn swap_inner(env: &Env, zero_for_one: bool, amount: i128, sqrt_price_limit: u128) -> (i128, i128) {
    let mut slot0 = read_slot0(env);
    assert!(!slot0.unlocked == false, "locked");
    slot0.unlocked = false;  // reentrancy guard

    let mut state = SwapState {
        amount_specified_remaining: amount,
        amount_calculated: 0,
        sqrt_price_x96: slot0.sqrt_price_x96,
        tick: slot0.tick,
        fee_growth_global: if zero_for_one { read_fee_growth_global_0(env) } else { read_fee_growth_global_1(env) },
        liquidity: read_liquidity(env),
    };

    // === MAIN SWAP LOOP ===
    while state.amount_specified_remaining != 0 && state.sqrt_price_x96 != sqrt_price_limit {
        // 1. Find next initialized tick in the swap direction
        let (tick_next, initialized) = bitmap_next_initialized_tick(
            env, state.tick, tick_spacing, zero_for_one
        );

        // 2. Get sqrt price at that tick boundary
        let sqrt_price_next_x96 = tick_to_sqrt_price_x96(tick_next);

        // 3. Compute swap step (how much can we fill in this segment?)
        let step = compute_swap_step(
            state.sqrt_price_x96,
            // Clamp to sqrt_price_limit if it's tighter
            if zero_for_one {
                sqrt_price_next_x96.max(sqrt_price_limit)
            } else {
                sqrt_price_next_x96.min(sqrt_price_limit)
            },
            state.liquidity,
            state.amount_specified_remaining,
            fee,
        );

        // 4. Update state
        state.sqrt_price_x96 = step.sqrt_price_next_x96;
        state.amount_specified_remaining -= step.amount_in + step.fee_amount;
        state.amount_calculated += step.amount_out;
        state.fee_growth_global += mul_div(step.fee_amount, Q96, state.liquidity);

        // 5. Cross tick if we reached the boundary
        if state.sqrt_price_x96 == sqrt_price_next_x96 {
            if initialized {
                let tick_info = read_tick(env, tick_next);
                // Update fee_growth_outside for this tick (flip)
                let liquidity_net = tick_info.liquidity_net;
                state.liquidity = if zero_for_one {
                    (state.liquidity as i128 - liquidity_net) as u128
                } else {
                    (state.liquidity as i128 + liquidity_net) as u128
                };
            }
            state.tick = if zero_for_one { tick_next - 1 } else { tick_next };
        } else {
            // Price didn't reach tick boundary — recalculate tick from price
            state.tick = sqrt_price_to_tick(state.sqrt_price_x96);
        }
    }

    // Persist updated state
    write_slot0(env, Slot0 { sqrt_price_x96: state.sqrt_price_x96, tick: state.tick, unlocked: true, .. });
    write_liquidity(env, state.liquidity);
    // ... update fee growth globals, transfer tokens
}
```

### 5.3 Position Manager Contract

Wraps each LP position as a **SEP-41 compatible token** (non-fungible). This allows LP positions to be transferred, sold, or used as collateral in other protocols.

```rust
pub struct PositionMetadata {
    pub pool: Address,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity: u128,
    pub fee_growth_inside_0_last: u128,
    pub fee_growth_inside_1_last: u128,
    pub tokens_owed_0: u128,
    pub tokens_owed_1: u128,
}

pub trait PositionManagerTrait {
    // Create a new position (calls pool.mint internally)
    fn mint(
        env: Env,
        params: MintParams,  // pool, tickLower, tickUpper, amount0Desired, amount1Desired, etc.
    ) -> (u128, u128, u128, u128);  // (position_id, liquidity, amount0, amount1)

    // Increase liquidity of existing position
    fn increase_liquidity(env: Env, position_id: u128, amount0: u128, amount1: u128) -> (u128, u128, u128);

    // Remove liquidity
    fn decrease_liquidity(env: Env, position_id: u128, liquidity: u128) -> (u128, u128);

    // Collect fees (and optionally withdraw burned tokens)
    fn collect(env: Env, position_id: u128, recipient: Address) -> (u128, u128);

    // Burn the NFT (position must have 0 liquidity)
    fn burn(env: Env, position_id: u128);

    // Read
    fn get_position(env: Env, position_id: u128) -> PositionMetadata;
    fn positions_of(env: Env, owner: Address) -> Vec<u128>;
}
```

### 5.4 Router Contract

The user-facing entry point. It handles slippage protection, deadlines, and multi-hop routing.

```rust
pub trait RouterTrait {
    // Swap exact amount in for as much out as possible
    fn exact_input_single(
        env: Env,
        token_in: Address,
        token_out: Address,
        fee: u32,
        recipient: Address,
        deadline: u64,
        amount_in: u128,
        amount_out_minimum: u128,    // revert if we get less than this
        sqrt_price_limit_x96: u128,
    ) -> u128;  // returns amount_out

    // Swap exact amount out, spending as little in as possible
    fn exact_output_single(
        env: Env,
        token_in: Address,
        token_out: Address,
        fee: u32,
        recipient: Address,
        deadline: u64,
        amount_out: u128,
        amount_in_maximum: u128,    // revert if we spend more than this
        sqrt_price_limit_x96: u128,
    ) -> u128;  // returns amount_in spent

    // Read-only: simulate a swap and return quote (used by frontend)
    fn quote_exact_input_single(
        env: Env,
        token_in: Address,
        token_out: Address,
        fee: u32,
        amount_in: u128,
        sqrt_price_limit_x96: u128,
    ) -> (u128, u128, i32);  // (amount_out, sqrt_price_after, tick_after)
}
```

---

## 6. On-Chain State Design

### Storage Tiers (Soroban-Specific)

Soroban has three storage tiers with different costs and TTLs:

| Tier | Use for | TTL (approx) | Cost |
|---|---|---|---|
| **Instance** | Pool config, slot0, liquidity | Lives as long as contract | Cheapest |
| **Persistent** | Tick map, position map, fee growth | Long-lived, must be extended | Medium |
| **Temporary** | Swap intermediaries (if needed) | 1 ledger | Cheapest, auto-expires |

> **Important:** Soroban persistent storage entries have a TTL. If a position is not interacted with for a long time, its storage entry may expire. The frontend must prompt LPs to extend TTLs on dormant positions. Use `extend_ttl()` in relevant functions.

### State Invariants (Must Always Hold)

The contract must enforce these at all times:

1. `pool.balance(token0) == sum of all active position token0 + fees0 owed`
2. `L_active == sum of all L for positions whose range contains current_tick`
3. For all initialized ticks: `sum(liquidityNet) == 0` (liquidity added always removed)
4. `fee_growth_global >= fee_growth_outside[tick]` for all ticks below current
5. `sqrt_price_x96` always within `[MIN_SQRT_RATIO, MAX_SQRT_RATIO]`

---

## 7. The Swap Mechanism — End-to-End

Here is the complete trace of a user swapping **100 XLM for USDC**:

```
1. USER ACTION
   User enters "100 XLM" in swap UI
   Frontend calls Router::quote_exact_input_single() via Soroban simulation
   → Returns: "95.23 USDC, price impact 0.12%, new price $0.9523"
   User sets 0.5% slippage → min_usdc_out = 94.75
   User clicks "Swap"

2. TRANSACTION BUILDING
   Frontend builds Stellar transaction:
   - Operation: InvokeContractFunction
   - Contract: router_address
   - Function: exact_input_single
   - Args: [xlm_address, usdc_address, 3000, user_address, deadline, 100_xlm, 94_75_usdc, 0]
   - Pre-auth: XLM transfer authorization

3. SIGNING
   Freighter wallet prompts user for signature
   User approves → signed XDR returned to frontend

4. SUBMISSION
   Frontend submits to Soroban RPC
   Stellar testnet includes transaction in next ledger (~5 seconds)

5. CONTRACT EXECUTION (inside Router::exact_input_single)
   a. Check deadline not passed
   b. Resolve pool address from factory: factory.get_pool(xlm, usdc, 3000)
   c. Call pool.swap(user, zero_for_one=true, 100_xlm, sqrt_price_limit)

6. POOL::SWAP() EXECUTION
   Initial state:
     sqrt_price_x96 = encode(√0.9600) = X
     current_tick = -408   (= floor(log(0.96)/log(1.0001)))
     L_active = 8,500,000

   === Tick iteration ===
   Iteration 1:
     next_tick = -400 (next initialized tick going left, i.e. price falling)
     sqrt_price_at_tick_400 = encode(√0.9608)
     compute_swap_step(sqrt_p_current, sqrt_p_target, L=8.5M, amount=100 XLM)
       → amount_in_this_step = 40.2 XLM fills to tick -400
       → amount_out_this_step = 38.6 USDC
       → fee = 40.2 × 0.003 = 0.1206 XLM
     Cross tick -400: L_active changes by liquidityNet[-400]
     Remaining: 59.8 XLM + fees

   Iteration 2:
     next_tick = -450 (next tick below -400)
     compute_swap_step(...)
       → remaining 59.8 XLM fills entirely within this segment
       → amount_out = 56.6 USDC
     sqrt_price_x96 updated to new price (not at tick boundary)
     current_tick recomputed from new sqrt_price_x96

   Total: 95.23 USDC out, price moved from -408 to ~-431 ticks
   Checks: 95.23 >= 94.75 (min_out) ✓

7. TOKEN TRANSFERS
   pool.token0.transfer(from=pool, to=user, amount=0)       // no XLM out
   pool.token1.transfer(from=pool, to=user, amount=95.23)   // USDC to user
   pool accepts 100.3... XLM from user (100 + fees)

8. FEE ACCOUNTING
   fee_growth_global_0 += total_fees / L_active (per segment)
   (No fee_growth_global_1 because we sold token0)

9. RESULT
   User receives 95.23 USDC in their wallet
   Pool's sqrt_price_x96 updated (XLM is now slightly cheaper in USDC terms)
   current_tick updated
   Event emitted: Swap(user, -100_xlm, +95.23_usdc, new_sqrt_price, new_tick, new_liquidity)
```

---

## 8. The LP Flow — End-to-End

### 8.1 Adding Liquidity

**Scenario:** LP wants to provide liquidity between $0.90 and $1.10 USDC per XLM (current price $0.96).

```
1. LP opens /liquidity page
   Frontend fetches current price from pool.slot0()
   Current price: $0.9600, current_tick: -408

2. LP sets range
   tick_lower = -1054  (≈ price $0.90 = 1.0001^-1054)
   tick_upper = +953   (≈ price $1.10 = 1.0001^953)
   tick_spacing = 10 → round to: tick_lower = -1050, tick_upper = +950

3. LP enters 500 USDC
   Frontend computes required XLM:
     L = amount_usdc / (√P - √P_lower)
       = 500 / (√0.96 - √0.90)
       = 500 / (0.9798 - 0.9487)
       = 500 / 0.0311
       = 16,077

     amount_xlm = L × (1/√P - 1/√P_upper)
                = 16,077 × (1/√0.96 - 1/√1.10)
                = 16,077 × (1.0206 - 0.9535)
                = 16,077 × 0.0671
                = 1,078.8 XLM

   Frontend shows: "Deposit 1,078.8 XLM + 500 USDC for L = 16,077"

4. LP approves and signs transaction
   Router::mint() called → PositionManager::mint() → Pool::mint()

5. Pool::mint() execution
   a. Validate tick_lower < tick_upper, both divisible by tick_spacing
   b. If tick_lower not initialized: create TickInfo, set bitmap bit
   c. If tick_upper not initialized: create TickInfo, set bitmap bit
   d. Snapshot fee_growth_inside at this range (for future fee tracking)
   e. Write position: positions[(LP, -1050, +950)] = {L=16077, feeGrowth0snap, feeGrowth1snap}
   f. Add L to L_active (since current tick is inside range)
   g. Transfer 1,078.8 XLM + 500 USDC from LP to pool

6. Position NFT minted
   PositionManager mints NFT #42 to LP's address
   Stores metadata: {pool, tick_lower=-1050, tick_upper=+950, L=16077}

7. LP sees in /portfolio:
   Position #42 | XLM/USDC | [$0.90 — $1.10] | In Range ✓
   Value: 1,078.8 XLM + 500 USDC | Uncollected fees: 0
```

### 8.2 Fee Collection

Fees accumulate automatically. LPs can collect at any time without removing liquidity.

```
// frontend/src/lib/fees.ts

async function collectFees(positionId: number, walletAddress: string) {
  const position = await positionManager.getPosition(positionId);
  const pool = await factory.getPool(XLM_ADDRESS, USDC_ADDRESS, FEE_TIER);

  // Compute accrued fees off-chain first (for display)
  const poolState = await pool.slot0();
  const feeGrowthInside = computeFeeGrowthInside(
    pool,
    position.tickLower,
    position.tickUpper,
    poolState.tick
  );
  const fees0 = position.liquidity * (feeGrowthInside.fee0 - position.feeGrowthInside0Last) / Q128;
  const fees1 = position.liquidity * (feeGrowthInside.fee1 - position.feeGrowthInside1Last) / Q128;

  // Build collect() transaction
  const tx = buildTransaction(
    router.collect({ positionId, recipient: walletAddress })
  );
  await signAndSubmit(tx);
}
```

### 8.3 Removing Liquidity

Two-step process: `burn()` then `collect()`.

```
// Step 1: burn() — move tokens from virtual reserve to owed
pool.burn(tick_lower, tick_upper, liquidity_to_remove)
→ Updates position.tokens_owed_0, position.tokens_owed_1
→ Decrements L_active if current tick in range
→ Does NOT transfer tokens yet

// Step 2: collect() — actually transfer tokens to LP
pool.collect(recipient, tick_lower, tick_upper, max_u128, max_u128)
→ Transfers tokens_owed_0 + tokens_owed_1 to recipient
→ Resets tokens_owed to 0
→ Also transfers any accumulated fees

// If fully removed, burn the NFT
positionManager.burn(position_id)
```

### 8.4 Rebalancing (Position Management)

When price drifts out of range, the LP's position earns zero fees and becomes single-asset. The LP must rebalance:

```
Detect out-of-range:
  slot0 = pool.slot0()
  if slot0.tick < position.tick_lower OR slot0.tick >= position.tick_upper:
    → position is out of range

Rebalance flow:
  1. Remove all liquidity: burn(position.liquidity) + collect()
  2. Receive single asset (e.g., 100% USDC if price went above range)
  3. Swap ~50% back to XLM at current price (or any desired ratio)
  4. Re-mint at new range centered around current price
  5. New Position NFT minted

Frontend shows:
  "⚠️ Out of range — your position is earning 0 fees. Rebalance now."
```

---

## 9. Frontend Architecture

### 9.1 Swap Page

Mirrors Raydium's swap interface: two token input boxes, real-time price, slippage settings.

**Component tree:**
```
SwapPage
├── TokenInputBox (XLM)
│   ├── TokenSelector (locked to XLM on testnet)
│   └── AmountInput (triggers quote on change)
├── SwapDirectionButton (flips XLM/USDC)
├── TokenInputBox (USDC) [output, read-only]
├── PriceInfo
│   ├── ExchangeRate ("1 XLM = 0.9523 USDC")
│   ├── PriceImpact (color: green < 0.1%, yellow < 1%, red > 1%)
│   └── MinimumReceived
├── SlippageSettings (0.1% / 0.5% / 1% / custom)
└── SwapButton
    └── Calls router.exactInputSingle() or exactOutputSingle()
```

**Real-time quoting (debounced, no fee):**
```typescript
// hooks/useSwapQuote.ts
export function useSwapQuote(amountIn: BigInt, tokenIn: string, tokenOut: string) {
  return useQuery({
    queryKey: ['swap-quote', amountIn.toString(), tokenIn, tokenOut],
    queryFn: async () => {
      // Soroban simulation (dry run — no ledger write, no fee)
      const result = await sorobanRpc.simulateTransaction(
        buildQuoteTransaction(amountIn, tokenIn, tokenOut)
      );
      return parseQuoteResult(result);
    },
    enabled: amountIn > 0n,
    staleTime: 3000,  // re-quote every 3 seconds
  });
}
```

### 9.2 Liquidity Page

Two sub-views: **Add Liquidity** and **My Positions**.

**Add Liquidity flow:**
```
1. Range selection:
   - Price chart showing current price + LP range handles
   - Input: min price / max price (converted to ticks on-chain)
   - Presets: ±5%, ±10%, ±20%, ±50%, Full range
   - Warning if range is very tight (high IL risk)

2. Amount input:
   - Input one side → auto-compute the other
   - If price is in range: both tokens needed
   - If price outside range: only one token needed
   - Shows estimated APR based on 24h volume / TVL

3. Review:
   - Expected position value
   - Price range in human-readable form
   - Gas estimate
   - "Add Liquidity" → calls PositionManager::mint()
```

**My Positions view:**
```typescript
// hooks/usePositions.ts
export function usePositions(owner: string) {
  return useQuery({
    queryKey: ['positions', owner],
    queryFn: async () => {
      const positionIds = await positionManager.positionsOf(owner);
      return Promise.all(positionIds.map(async (id) => {
        const meta = await positionManager.getPosition(id);
        const slot0 = await pool.slot0();
        const inRange = slot0.tick >= meta.tickLower && slot0.tick < meta.tickUpper;
        const fees = await computeUnclaimedFees(meta, slot0);
        const tokenAmounts = computeTokenAmounts(meta.liquidity, meta.tickLower, meta.tickUpper, slot0.sqrtPriceX96);
        return { id, meta, inRange, fees, tokenAmounts };
      }));
    }
  });
}
```

### 9.3 Portfolio Page

Overview of all positions, fees, and historical activity.

**Sections:**
1. **Summary cards:** Total deposited value, Total uncollected fees, Number of positions
2. **Position table:** Each position with status (In Range / Out of Range), current value, fees, actions (Collect / Rebalance / Close)
3. **Activity feed:** Transaction history from Horizon API (swap events, mint events, burn events)
4. **PnL section:** Value at deposit vs. current value (shows impermanent loss)

---

## 10. XLM / USDC Testnet Setup

### Token Addresses (Stellar Testnet)

| Token | Type | Address |
|---|---|---|
| XLM | Native Stellar asset | Native (use `stellar_strkey::Contract` for Soroban) |
| USDC | SEP-41 / Circle testnet | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (testnet) |

> **Note:** XLM in Soroban is accessed via the Stellar Asset Contract (SAC). The SAC for native XLM on testnet is deployed at a deterministic address. Use `stellar_sdk::StellarAssetContract::native()` to resolve it.

### Testnet USDC Faucet

Circle provides testnet USDC on Stellar. Use the Stellar testnet faucet at `https://friendbot.stellar.org` for XLM, and the Circle testnet faucet for USDC.

### Pool Initialization

On first deployment, initialize the XLM/USDC pool with an initial price:

```typescript
// scripts/init-pool.ts
const INITIAL_XLM_USDC_PRICE = 0.10;  // 0.10 USDC per XLM (testnet price)

// sqrt(0.10) = 0.31623
// sqrt_price_x96 = 0.31623 * 2^96
const INITIAL_SQRT_PRICE_X96 = BigInt("25054144837504793613437505");

await factory.deployPool({
  tokenA: XLM_SAC_ADDRESS,
  tokenB: USDC_ADDRESS,
  fee: 3000,          // 0.3%
  tickSpacing: 10,
  initialSqrtPriceX96: INITIAL_SQRT_PRICE_X96,
});
```

---

## 11. Project Structure

```
stellarswap/
│
├── contracts/                    # Soroban smart contracts (Rust)
│   ├── factory/
│   │   ├── src/
│   │   │   ├── lib.rs            # Contract entry point + trait implementation
│   │   │   ├── storage.rs        # Storage read/write helpers
│   │   │   └── events.rs         # Event definitions
│   │   └── Cargo.toml
│   │
│   ├── pool/
│   │   ├── src/
│   │   │   ├── lib.rs            # swap, mint, burn, collect, observe
│   │   │   ├── swap.rs           # compute_swap_step, tick iteration loop
│   │   │   ├── tick.rs           # Tick CRUD, fee_growth_outside updates
│   │   │   ├── tick_bitmap.rs    # Bit-level next-tick lookup
│   │   │   ├── position.rs       # Position CRUD, fee growth inside
│   │   │   ├── math/
│   │   │   │   ├── sqrt_price.rs # tick_to_sqrt_price, sqrt_price_to_tick
│   │   │   │   ├── liquidity.rs  # get_liquidity_for_amounts, get_amounts_for_liquidity
│   │   │   │   ├── full_math.rs  # mul_div with u256 simulation
│   │   │   │   └── fixed_point.rs # Q64.96 operations
│   │   │   ├── storage.rs
│   │   │   └── events.rs
│   │   └── Cargo.toml
│   │
│   ├── position_manager/
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── nft.rs            # Position NFT (SEP-41 non-fungible)
│   │   │   └── liquidity_management.rs
│   │   └── Cargo.toml
│   │
│   ├── router/
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── exact_input.rs
│   │   │   ├── exact_output.rs
│   │   │   └── quoter.rs         # Read-only simulation functions
│   │   └── Cargo.toml
│   │
│   └── Cargo.toml                # Workspace
│
├── frontend/                     # React + TypeScript
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Swap/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── TokenInputBox.tsx
│   │   │   │   ├── PriceInfo.tsx
│   │   │   │   └── SlippageSettings.tsx
│   │   │   ├── Liquidity/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── AddLiquidity/
│   │   │   │   │   ├── RangeSelector.tsx   # Price range chart + handles
│   │   │   │   │   ├── AmountInputs.tsx
│   │   │   │   │   └── ReviewDeposit.tsx
│   │   │   │   └── PositionList.tsx
│   │   │   └── Portfolio/
│   │   │       ├── index.tsx
│   │   │       ├── PositionTable.tsx
│   │   │       └── ActivityFeed.tsx
│   │   ├── hooks/
│   │   │   ├── usePool.ts        # Pool state (slot0, liquidity, ticks)
│   │   │   ├── usePositions.ts   # LP positions for connected wallet
│   │   │   ├── useSwapQuote.ts   # Real-time swap quotes
│   │   │   └── useWallet.ts      # Freighter connection
│   │   ├── lib/
│   │   │   ├── math.ts           # Off-chain mirrors of contract math
│   │   │   ├── stellar.ts        # Stellar SDK helpers
│   │   │   ├── contracts.ts      # Contract addresses + ABI wrappers
│   │   │   └── constants.ts      # Token addresses, fee tiers, etc.
│   │   ├── components/
│   │   │   ├── Navbar.tsx        # Swap | Liquidity | Portfolio + wallet connect
│   │   │   ├── WalletButton.tsx
│   │   │   └── PriceChart.tsx    # Recharts tick liquidity distribution
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── scripts/                      # Deployment + initialization scripts
│   ├── deploy.ts
│   ├── init-pool.ts
│   ├── add-seed-liquidity.ts     # Add initial liquidity for testnet demo
│   └── verify-invariants.ts      # Check on-chain state invariants
│
├── tests/                        # Contract tests
│   ├── pool_test.rs
│   ├── swap_test.rs
│   ├── liquidity_test.rs
│   └── integration_test.rs
│
├── .env.testnet                  # Testnet env variables
└── README.md                     # This file
```

---

## 12. Development Setup

### Prerequisites

```bash
# Rust + Soroban toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli

# Node.js 18+
nvm install 18

# Stellar CLI
stellar version  # should be 20.x+
```

### Environment Variables

Create `.env.testnet`:
```env
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Deployed contract addresses (fill after deployment)
FACTORY_CONTRACT_ADDRESS=
POOL_CONTRACT_ADDRESS=
POSITION_MANAGER_ADDRESS=
ROUTER_CONTRACT_ADDRESS=

# Token addresses
XLM_SAC_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
USDC_CONTRACT_ADDRESS=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Frontend
VITE_NETWORK=testnet
VITE_FACTORY_ADDRESS=${FACTORY_CONTRACT_ADDRESS}
VITE_ROUTER_ADDRESS=${ROUTER_CONTRACT_ADDRESS}
VITE_POOL_ADDRESS=${POOL_CONTRACT_ADDRESS}
```

### Build Contracts

```bash
cd contracts

# Build all contracts
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM (reduces size significantly)
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/pool.wasm

# Run contract tests
cargo test
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev  # starts on http://localhost:5173
```

---

## 13. Contract Deployment

Deploy in this order (dependencies):

```bash
# 1. Set up testnet account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet   # Friendbot funds it

# 2. Deploy factory
stellar contract deploy \
  --wasm contracts/factory/target/wasm32-unknown-unknown/release/factory.wasm \
  --source deployer \
  --network testnet \
  --alias factory

# 3. Deploy pool implementation (factory will instantiate copies)
stellar contract deploy \
  --wasm contracts/pool/target/wasm32-unknown-unknown/release/pool.wasm \
  --source deployer \
  --network testnet \
  --alias pool_impl

# 4. Deploy position manager
stellar contract deploy \
  --wasm contracts/position_manager/target/wasm32-unknown-unknown/release/position_manager.wasm \
  --source deployer \
  --network testnet \
  --alias position_manager

# 5. Deploy router
stellar contract deploy \
  --wasm contracts/router/target/wasm32-unknown-unknown/release/router.wasm \
  --source deployer \
  --network testnet \
  --alias router

# 6. Initialize factory with pool WASM hash
stellar contract invoke --id $FACTORY_ADDRESS --source deployer --network testnet \
  -- initialize \
  --pool_wasm_hash $(stellar contract info --id $POOL_IMPL_ADDRESS --network testnet | grep wasm_hash | awk '{print $2}') \
  --fee_recipient $(stellar keys address deployer)

# 7. Create XLM/USDC pool
npx ts-node scripts/init-pool.ts

# 8. Add seed liquidity for testnet demo
npx ts-node scripts/add-seed-liquidity.ts
```

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

---

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

---

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

## 20. Testing — Run & Outputs

### Smart-contract tests (Rust / `soroban_sdk::testutils`)
```bash
cd contracts
make test            # or: cargo test
```
```
running 7 tests
test test::test_mul_div_ceil_rounds_up ... ok
test test::test_liquidity_amounts_roundtrip ... ok
test test::test_mul_div_basic ... ok
test test::test_sqrt_u128 ... ok
test test::test_wide_mul_high_low ... ok
test test::test_tick_sqrt_price_roundtrip ... ok
test test::test_pool_constructor_and_reads ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
- 6 unit tests: Q64.64 fixed-point (`mul_div`, `mul_div_ceil`, `wide_mul`,
  `sqrt_u128`) and tick ↔ sqrt-price conversions.
- 1 integration test: deploys the pool in a test `Env` and asserts constructor
  wiring + `slot0` reads (`contracts/pool/src/test.rs`).

### Frontend tests (Vitest + Testing Library)
```bash
cd frontend
npm run test         # vitest run
```
```
 Test Files  2 passed (2)
      Tests  11 passed (11)
```
- `src/lib/math.test.ts` — 8 unit tests for stroop conversion, USD/amount
  formatting, and tick math.
- `src/components/wallet/StellarWalletPanel.test.tsx` — 3 component tests
  (install prompt / connect button / connected balance + send form) with the
  wallet hook mocked.

---

## 21. CI/CD Pipeline

Two GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — runs on every push & pull request to `main`
| Job | Steps |
|---|---|
| **contracts** | checkout → install Rust + `wasm32-unknown-unknown` → `cargo fmt --check` → `cargo test` → `cargo build --target wasm32-unknown-unknown --release` → upload wasm artifacts |
| **frontend** | checkout → `setup-node@v4` (npm cache) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:ci` → `npm run build` → upload `.next` artifact |

The build fails if **any** step fails (lint error, type error, failing test, or
broken build), satisfying "fails correctly when errors occur." Both jobs produce
downloadable artifacts (contract wasm + frontend build).

### `deploy.yml` — runs on push to `main` (and manual dispatch)
| Job | Steps |
|---|---|
| **deploy-contract** | install Rust + wasm target → install `libdbus-1-dev`/`libudev-dev` → install Stellar CLI via `cargo-binstall` (prebuilt binary) → build wasm → `stellar contract deploy` (factory) using `secrets.STELLAR_SECRET_KEY`, network testnet → expose `factory_id` output |
| **deploy-frontend** | `needs: [deploy-contract]` → `npm ci` → `npm run build` with `NEXT_PUBLIC_*` from secrets → `vercel deploy --prod` with `secrets.VERCEL_TOKEN` |

> **Secret-gated deploys:** the deploy steps **skip cleanly** (warn + exit 0)
> when `STELLAR_SECRET_KEY` / `VERCEL_TOKEN` aren't set, so pushes stay green
> until the secrets are configured in the `testnet` / `production` environments.
> The Stellar CLI is installed as a prebuilt binary via `cargo-binstall` to avoid
> compiling native deps (`hidapi`, `libdbus-sys`); the apt libs are a fallback.

---

## 22. Deployment & Rollback

### Contracts (testnet)
Full automated wiring (deploy factory → pool impl → router → position manager →
init factory → create pool → seed liquidity) lives in
[`scripts/redeploy.sh`](scripts/redeploy.sh). Single contract:
```bash
cd contracts
make deploy CONTRACT=pool STELLAR_SECRET_KEY=S...   # or stellar contract deploy ...
```

### Frontend (Vercel)
Set the `NEXT_PUBLIC_*` variables (see §23) in **Vercel → Settings →
Environment Variables**, then `vercel --prod` (or the `deploy-frontend` job).
`NEXT_PUBLIC_*` values are **inlined at build time** — change them ⇒ rebuild.

### Rollback
- **Frontend:** Vercel keeps every deployment immutable — use *Instant Rollback*
  (or `vercel rollback <url>`) to repoint the alias to a previous build.
- **Contracts:** Soroban deploys are immutable per contract id. To roll back,
  re-point the frontend `NEXT_PUBLIC_*_ADDRESS` at the previous known-good
  contract ids and redeploy the frontend. Contract upgrades (where enabled) go
  through `stellar contract invoke ... upgrade` with the prior wasm hash.

### Verification
After deploy: open `/portfolio` → the **On-chain Pool State** card reads live
`slot0`/`fee`/`liquidity` (proves contract reads work), connect Freighter, and
run a swap — the tx hash links to stellar.expert.

---

## 23. Environment Variables

Frontend (`frontend/.env.local` locally, Vercel env in prod):

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | testnet |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `C…` | factory contract id |
| `NEXT_PUBLIC_POOL_ADDRESS` | `C…` | XLM/USDC pool id |
| `NEXT_PUBLIC_ROUTER_ADDRESS` | `C…` | router id |
| `NEXT_PUBLIC_POSITION_MANAGER_ADDRESS` | `C…` | position manager id |
| `NEXT_PUBLIC_XLM_ADDRESS` | `C…` | XLM SAC |
| `NEXT_PUBLIC_USDC_ADDRESS` | `C…` | USDC SAC |

Contracts / CI secrets: `STELLAR_SECRET_KEY` (funded testnet secret),
`VERCEL_TOKEN`, plus the `NEXT_PUBLIC_*` values as GitHub Actions secrets for the
deploy job. Template: `frontend/.env.example`, `.env.testnet`.

---

## 24. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deployed site shows **no tick / liquidity / positions** | `NEXT_PUBLIC_*` not set in Vercel (they inline at build time). | Add them in Vercel → Settings → Environment Variables, then **redeploy with build cache off**. |
| "Freighter not detected" | Extension missing/locked. | Install from freighter.app; unlock; set network to Testnet. |
| Swap/mint fails with auth error | Pool spend not approved. | The UI builds an `approve` before the swap/mint; ensure it's signed first. |
| Balance shows `0 XLM (account not funded)` | Testnet account not created. | Fund via [friendbot](https://friendbot.stellar.org). |
| `cargo test` can't find `wasm32` target | Target not installed. | `rustup target add wasm32-unknown-unknown`. |
| CI `npm ci` fails | `package-lock.json` out of sync. | Commit the updated lockfile. |

---

## 25. Deployment Evidence

**Network:** Stellar Testnet · `Test SDF Network ; September 2015`

| Contract | Address (testnet) |
|---|---|
| Factory | `CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE` |
| Pool (XLM/USDC 0.3%) | `CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32` |
| Router | `CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62` |
| Position Manager | `CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI` |
| XLM (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Explore the pool's deploy + interaction transaction hashes on
[stellar.expert](https://stellar.expert/explorer/testnet/contract/CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32)
(Contract → History tab lists every invocation hash). Live frontend:
[astroflo.vercel.app](https://astroflo.vercel.app).

**Test evidence:** 7 passing contract tests + 11 passing frontend tests (§20).
**Build evidence:** `npm run build` prerenders all 6 routes; `cargo build
--target wasm32-unknown-unknown --release` produces 4 contract wasms.

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

---

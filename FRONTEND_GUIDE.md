# StellarSwap — Frontend Developer Guide

> **All smart contracts are deployed and live on Stellar Testnet. This guide tells you exactly how to build the frontend end-to-end.**

---

## 0. Quick Reference — Deployed Contracts

| Contract | Testnet Address |
|---|---|
| **Factory** | `CDLEVZ6KNBLS2JBU2V43GXONI723V35NXQXSNFTLJJBIGRHGRKG5LAJK` |
| **Pool (XLM/USDC)** | `CBTKDRSNGMPYFD2NPJ6C5H6JD5MC3Y4Y6QCBDKBJE6KRNLNTSP3O5BNK` |
| **Router** | `CDNGROJOJ4XO25MBE5X22STN6A2UW6FE6PITF4LXJDMX5A3N6WS74HIP` |
| **Position Manager** | `CCWQKNUQM7PLAJEUM5OEDQKPEF25IWZYFPAXFAVW7JLOBXQ53Y4YJPQU` |
| **XLM SAC** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **USDC** | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

Pool fee: **0.3%** (fee = 3000). Tick spacing: **10**. Initial price: **0.1 USDC / XLM**.

---

## 1. Project Setup

### 1.1 Create the frontend

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### 1.2 Install dependencies

```bash
npm install @stellar/stellar-sdk @stellar/freighter-api
npm install @tanstack/react-query
npm install recharts
npm install react-router-dom
npm install bigdecimal
```

### 1.3 Environment variables

Copy `.env.testnet` from the project root to `frontend/.env.local`. All vars are prefixed with `VITE_`:

```env
VITE_NETWORK=testnet
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_FACTORY_ADDRESS=CDLEVZ6KNBLS2JBU2V43GXONI723V35NXQXSNFTLJJBIGRHGRKG5LAJK
VITE_POOL_ADDRESS=CBTKDRSNGMPYFD2NPJ6C5H6JD5MC3Y4Y6QCBDKBJE6KRNLNTSP3O5BNK
VITE_ROUTER_ADDRESS=CDNGROJOJ4XO25MBE5X22STN6A2UW6FE6PITF4LXJDMX5A3N6WS74HIP
VITE_POSITION_MANAGER_ADDRESS=CCWQKNUQM7PLAJEUM5OEDQKPEF25IWZYFPAXFAVW7JLOBXQ53Y4YJPQU
VITE_XLM_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
VITE_USDC_ADDRESS=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

---

## 2. Critical Math — Read This First

All price math mirrors what the contracts do. **The contracts use Q64.64 fixed-point arithmetic**, meaning prices are stored as `BigInt` integers where the actual value = `stored / 2^64`.

### 2.1 Constants

```typescript
// src/lib/constants.ts
export const Q64 = 2n ** 64n;                    // 18446744073709551616n
export const Q128 = 2n ** 128n;
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;
export const MIN_SQRT_RATIO = 72057594037927936n;     // sqrt(1.0001^MIN_TICK) * Q64
export const MAX_SQRT_RATIO = 4722366482869645213696n; // sqrt(1.0001^MAX_TICK) * Q64

export const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
export const POOL_ADDRESS    = import.meta.env.VITE_POOL_ADDRESS;
export const ROUTER_ADDRESS  = import.meta.env.VITE_ROUTER_ADDRESS;
export const PM_ADDRESS      = import.meta.env.VITE_POSITION_MANAGER_ADDRESS;
export const XLM_ADDRESS     = import.meta.env.VITE_XLM_ADDRESS;
export const USDC_ADDRESS    = import.meta.env.VITE_USDC_ADDRESS;
export const FEE_TIER        = 3000;
export const TICK_SPACING    = 10;

export const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE;
export const SOROBAN_RPC_URL    = import.meta.env.VITE_SOROBAN_RPC_URL;
export const HORIZON_URL        = import.meta.env.VITE_HORIZON_URL;
```

### 2.2 Tick ↔ Price conversions

```typescript
// src/lib/math.ts

/** Price at tick i = 1.0001^i  */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/** tick = floor(log(price) / log(1.0001)) */
export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

/** Round tick to nearest valid multiple of tick_spacing */
export function roundTick(tick: number, spacing: number): number {
  return Math.round(tick / spacing) * spacing;
}

/** Convert human price (USDC per XLM) to sqrt_price_x64 BigInt */
export function priceToSqrtPriceX64(price: number): bigint {
  const sqrtPrice = Math.sqrt(price);
  // Multiply by 2^64, carefully handling floating point
  return BigInt(Math.floor(sqrtPrice * Number(Q64)));
}

/** Convert sqrt_price_x64 BigInt to human price */
export function sqrtPriceX64ToPrice(sqrtPriceX64: bigint): number {
  const sqrtPrice = Number(sqrtPriceX64) / Number(Q64);
  return sqrtPrice * sqrtPrice;
}
```

### 2.3 Token amounts from liquidity (for display)

```typescript
/** Compute token amounts held in a position at a given price. */
export function getAmountsForLiquidity(
  sqrtPriceX64: bigint,  // current pool sqrt price
  sqrtLowerX64: bigint,  // sqrt price at tick_lower
  sqrtUpperX64: bigint,  // sqrt price at tick_upper
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  if (sqrtPriceX64 <= sqrtLowerX64) {
    return {
      amount0: mulDiv(liquidity << 64n, sqrtUpperX64 - sqrtLowerX64, sqrtUpperX64) / sqrtLowerX64,
      amount1: 0n,
    };
  } else if (sqrtPriceX64 < sqrtUpperX64) {
    return {
      amount0: mulDiv(liquidity << 64n, sqrtUpperX64 - sqrtPriceX64, sqrtUpperX64) / sqrtPriceX64,
      amount1: mulDiv(liquidity, sqrtPriceX64 - sqrtLowerX64, Q64),
    };
  } else {
    return {
      amount0: 0n,
      amount1: mulDiv(liquidity, sqrtUpperX64 - sqrtLowerX64, Q64),
    };
  }
}

/** bigint multiply with 256-bit intermediate: (a * b) / c */
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new Error('division by zero');
  return (a * b) / c;
}

/** Compute liquidity from desired token amounts */
export function getLiquidityForAmounts(
  sqrtPriceX64: bigint,
  sqrtLowerX64: bigint,
  sqrtUpperX64: bigint,
  amount0: bigint,
  amount1: bigint,
): bigint {
  if (sqrtPriceX64 <= sqrtLowerX64) {
    return getLiquidityForAmount0(sqrtLowerX64, sqrtUpperX64, amount0);
  } else if (sqrtPriceX64 < sqrtUpperX64) {
    const l0 = getLiquidityForAmount0(sqrtPriceX64, sqrtUpperX64, amount0);
    const l1 = getLiquidityForAmount1(sqrtLowerX64, sqrtPriceX64, amount1);
    return l0 < l1 ? l0 : l1;
  } else {
    return getLiquidityForAmount1(sqrtLowerX64, sqrtUpperX64, amount1);
  }
}

function getLiquidityForAmount0(sqrtLo: bigint, sqrtHi: bigint, amount0: bigint): bigint {
  const numerator = mulDiv(amount0, mulDiv(sqrtLo, sqrtHi, Q64), Q64);
  return numerator / (sqrtHi - sqrtLo);
}

function getLiquidityForAmount1(sqrtLo: bigint, sqrtHi: bigint, amount1: bigint): bigint {
  return mulDiv(amount1, Q64, sqrtHi - sqrtLo);
}
```

### 2.4 Fee calculation (for display only, read off-chain)

```typescript
/** Compute uncollected fees for a position. */
export function computeUnclaimedFees(
  liquidity: bigint,
  feeGrowthInside0Now: bigint,
  feeGrowthInside1Now: bigint,
  feeGrowthInside0Last: bigint,
  feeGrowthInside1Last: bigint,
): { fees0: bigint; fees1: bigint } {
  const fees0 = mulDiv(
    liquidity,
    (feeGrowthInside0Now - feeGrowthInside0Last + Q128) % Q128,
    Q128,
  );
  const fees1 = mulDiv(
    liquidity,
    (feeGrowthInside1Now - feeGrowthInside1Last + Q128) % Q128,
    Q128,
  );
  return { fees0, fees1 };
}

/** fee_growth_inside from pool tick state — needed for fee display. */
export function getFeeGrowthInside(
  tickLower: TickInfo,
  tickUpper: TickInfo,
  currentTick: number,
  feeGrowthGlobal0: bigint,
  feeGrowthGlobal1: bigint,
): { fg0: bigint; fg1: bigint } {
  const Q = Q128;
  const below0 = currentTick >= tickLower.tick ? tickLower.feeGrowthOutside0 : (feeGrowthGlobal0 - tickLower.feeGrowthOutside0 + Q) % Q;
  const below1 = currentTick >= tickLower.tick ? tickLower.feeGrowthOutside1 : (feeGrowthGlobal1 - tickLower.feeGrowthOutside1 + Q) % Q;
  const above0 = currentTick < tickUpper.tick ? tickUpper.feeGrowthOutside0 : (feeGrowthGlobal0 - tickUpper.feeGrowthOutside0 + Q) % Q;
  const above1 = currentTick < tickUpper.tick ? tickUpper.feeGrowthOutside1 : (feeGrowthGlobal1 - tickUpper.feeGrowthOutside1 + Q) % Q;
  return {
    fg0: (feeGrowthGlobal0 - below0 - above0 + 2n * Q) % Q,
    fg1: (feeGrowthGlobal1 - below1 - above1 + 2n * Q) % Q,
  };
}
```

---

## 3. Stellar SDK Setup

### 3.1 Soroban RPC and Horizon clients

```typescript
// src/lib/stellar.ts
import {
  SorobanRpc,
  Networks,
  Keypair,
  TransactionBuilder,
  Contract,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URL, HORIZON_URL, NETWORK_PASSPHRASE } from './constants';

export const rpc = new SorobanRpc.Server(SOROBAN_RPC_URL);

/** Simulate a transaction (read-only, no fee). */
export async function simulateTransaction(tx: any) {
  return await rpc.simulateTransaction(tx);
}

/** Build a Soroban transaction for contract invocation. */
export async function buildContractTx(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string,
): Promise<any> {
  const contract = new Contract(contractId);
  const account = await rpc.getAccount(signerAddress);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation error: ${sim.error}`);
  }

  return SorobanRpc.assembleTransaction(tx, sim).build();
}

/** Submit a signed transaction and wait for confirmation. */
export async function submitTransaction(signedXdr: string): Promise<any> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await rpc.sendTransaction(tx);
  if (result.status === 'ERROR') {
    throw new Error(`Submit error: ${result.errorResult}`);
  }

  // Poll for confirmation
  let response;
  do {
    await new Promise(r => setTimeout(r, 2000));
    response = await rpc.getTransaction(result.hash);
  } while (response.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND);

  if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error('Transaction failed');
  }

  return response;
}

/** Convert bigint to ScVal (u128). */
export function bigintToU128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'u128' });
}

/** Convert bigint to ScVal (i128). */
export function bigintToI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

export function addressToScVal(address: string): xdr.ScVal {
  return nativeToScVal(address, { type: 'address' });
}

export function boolToScVal(value: boolean): xdr.ScVal {
  return xdr.ScVal.scvBool(value);
}

export function i32ToScVal(value: number): xdr.ScVal {
  return xdr.ScVal.scvI32(value);
}

export function u32ToScVal(value: number): xdr.ScVal {
  return xdr.ScVal.scvU32(value);
}
```

### 3.2 Freighter wallet hook

```typescript
// src/hooks/useWallet.ts
import { useState, useCallback } from 'react';
import { getAddress, signTransaction, isConnected } from '@stellar/freighter-api';
import { NETWORK_PASSPHRASE } from '../lib/constants';

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    const connected = await isConnected();
    if (!connected) {
      throw new Error('Install Freighter wallet extension');
    }
    const { address } = await getAddress();
    setAddress(address);
    return address;
  }, []);

  const sign = useCallback(async (txXdr: string): Promise<string> => {
    if (!address) throw new Error('Wallet not connected');
    const { signedTxXdr } = await signTransaction(txXdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      address,
    });
    return signedTxXdr;
  }, [address]);

  const disconnect = useCallback(() => setAddress(null), []);

  return { address, connect, sign, disconnect };
}
```

---

## 4. Contract Read Hooks

### 4.1 Pool state hook

```typescript
// src/hooks/usePool.ts
import { useQuery } from '@tanstack/react-query';
import { rpc } from '../lib/stellar';
import { Contract, scValToNative } from '@stellar/stellar-sdk';
import { POOL_ADDRESS } from '../lib/constants';
import { sqrtPriceX64ToPrice } from '../lib/math';

export interface PoolState {
  sqrtPriceX64: bigint;
  tick: number;
  feeProtocol: number;
  unlocked: boolean;
  liquidity: bigint;
  feeGrowthGlobal0: bigint;
  feeGrowthGlobal1: bigint;
  currentPrice: number;  // human-readable USDC/XLM
}

async function fetchPoolState(): Promise<PoolState> {
  const contract = new Contract(POOL_ADDRESS);

  // Simulate slot0()
  const slot0Result = await rpc.simulateTransaction(
    await buildReadTx(POOL_ADDRESS, 'slot0', [])
  );
  const slot0 = scValToNative(getReturnValue(slot0Result)) as any;

  // Simulate liquidity()
  const liqResult = await rpc.simulateTransaction(
    await buildReadTx(POOL_ADDRESS, 'liquidity', [])
  );
  const liquidity = BigInt(scValToNative(getReturnValue(liqResult)) as string);

  const sqrtPriceX64 = BigInt(slot0.sqrt_price_x64);

  return {
    sqrtPriceX64,
    tick: Number(slot0.tick),
    feeProtocol: Number(slot0.fee_protocol),
    unlocked: Boolean(slot0.unlocked),
    liquidity,
    feeGrowthGlobal0: 0n, // fetch separately if needed
    feeGrowthGlobal1: 0n,
    currentPrice: sqrtPriceX64ToPrice(sqrtPriceX64),
  };
}

export function usePool() {
  return useQuery({
    queryKey: ['pool-state'],
    queryFn: fetchPoolState,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

// Helper: build a simulation-only transaction
async function buildReadTx(contractId: string, method: string, args: any[]) {
  // ... use buildContractTx from stellar.ts
}

function getReturnValue(simResult: any) {
  return simResult.result?.retval;
}
```

### 4.2 Positions hook

```typescript
// src/hooks/usePositions.ts
import { useQuery } from '@tanstack/react-query';
import { PM_ADDRESS, POOL_ADDRESS } from '../lib/constants';
import { scValToNative } from '@stellar/stellar-sdk';
import { getAmountsForLiquidity, tickToPrice } from '../lib/math';
import { priceToSqrtPriceX64 } from '../lib/math';

export interface Position {
  id: bigint;
  pool: string;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  owner: string;
  inRange: boolean;
  priceLower: number;
  priceUpper: number;
  amount0: bigint;
  amount1: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

export function usePositions(owner: string | null) {
  return useQuery({
    queryKey: ['positions', owner],
    queryFn: async () => {
      if (!owner) return [];

      // 1. Fetch position IDs for owner from PositionManager
      const ids: bigint[] = await fetchPositionIds(owner);

      // 2. Fetch pool state for in-range check
      const poolState = await fetchPoolStateRaw();

      // 3. Fetch each position's metadata
      return Promise.all(ids.map(async (id) => {
        const meta = await fetchPositionMeta(id);
        const poolPos = await fetchPoolPosition(owner, meta.tick_lower, meta.tick_upper);

        const sqrtLower = priceToSqrtPriceX64(tickToPrice(meta.tick_lower));
        const sqrtUpper = priceToSqrtPriceX64(tickToPrice(meta.tick_upper));
        const sqrtCurrent = BigInt(poolState.sqrt_price_x64);

        const { amount0, amount1 } = getAmountsForLiquidity(
          sqrtCurrent, sqrtLower, sqrtUpper, BigInt(meta.liquidity)
        );

        const inRange = poolState.tick >= meta.tick_lower && poolState.tick < meta.tick_upper;

        return {
          id,
          pool: meta.pool,
          tickLower: meta.tick_lower,
          tickUpper: meta.tick_upper,
          liquidity: BigInt(meta.liquidity),
          owner,
          inRange,
          priceLower: tickToPrice(meta.tick_lower),
          priceUpper: tickToPrice(meta.tick_upper),
          amount0,
          amount1,
          tokensOwed0: BigInt(poolPos.tokens_owed_0 ?? '0'),
          tokensOwed1: BigInt(poolPos.tokens_owed_1 ?? '0'),
        } as Position;
      }));
    },
    enabled: Boolean(owner),
    refetchInterval: 10000,
  });
}

// These helpers wrap the simulation calls from stellar.ts
async function fetchPositionIds(owner: string): Promise<bigint[]> { /* ... */ return []; }
async function fetchPoolStateRaw(): Promise<any> { /* ... */ return {}; }
async function fetchPositionMeta(id: bigint): Promise<any> { /* ... */ return {}; }
async function fetchPoolPosition(owner: string, tl: number, tu: number): Promise<any> { /* ... */ return {}; }
```

### 4.3 Swap quote hook

```typescript
// src/hooks/useSwapQuote.ts
import { useQuery } from '@tanstack/react-query';
import { rpc } from '../lib/stellar';

export interface SwapQuote {
  amountOut: bigint;
  priceImpact: number;    // 0.001 = 0.1%
  newPrice: number;
  newTick: number;
}

export function useSwapQuote(
  amountIn: bigint,
  zeroForOne: boolean,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['swap-quote', amountIn.toString(), zeroForOne],
    queryFn: async (): Promise<SwapQuote> => {
      // Simulate pool.swap() (dry run — no fee charged)
      // Use the pool directly since router.exact_input_single also validates
      const args = buildSwapArgs(amountIn, zeroForOne);
      const sim = await rpc.simulateTransaction(
        await buildReadTx(POOL_ADDRESS, 'swap', args)
      );
      // Parse (amount0, amount1) from result
      const result = scValToNative(getReturnValue(sim)) as [string, string];
      const amountOut = zeroForOne ? -BigInt(result[1]) : -BigInt(result[0]);
      // Price impact = (oldPrice - newPrice) / oldPrice
      // Fetch from slot0 after simulation
      return { amountOut, priceImpact: 0, newPrice: 0, newTick: 0 };
    },
    enabled: enabled && amountIn > 0n,
    staleTime: 3000,
    refetchInterval: 5000,
  });
}
```

---

## 5. Transaction Builders — The Key Functions

These are the functions that create transactions for submission via Freighter.

### 5.1 Swap transaction

```typescript
// src/lib/transactions.ts
import { buildContractTx, submitTransaction, addressToScVal, bigintToU128, bigintToI128, boolToScVal } from './stellar';
import { ROUTER_ADDRESS } from './constants';

export async function buildSwapTx(
  walletAddress: string,
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  amountOutMinimum: bigint,
  deadline: bigint,
  sqrtPriceLimitX64: bigint,
): Promise<string> {  // returns XDR string for Freighter
  const tx = await buildContractTx(
    ROUTER_ADDRESS,
    'exact_input_single',
    [
      addressToScVal(tokenIn),
      addressToScVal(tokenOut),
      u32ToScVal(fee),
      addressToScVal(walletAddress),
      // deadline as u64
      xdr.ScVal.scvU64(xdr.Uint64.fromString(deadline.toString())),
      bigintToU128(amountIn),
      bigintToU128(amountOutMinimum),
      bigintToU128(sqrtPriceLimitX64),
    ],
    walletAddress,
  );
  return tx.toXDR();
}
```

### 5.2 Add liquidity transaction

```typescript
export async function buildMintTx(
  walletAddress: string,
  pool: string,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  amount0Min: bigint,
  amount1Min: bigint,
  deadline: bigint,
): Promise<string> {
  // Build MintParams struct as ScVal map
  const mintParams = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('pool'), val: addressToScVal(pool) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('tick_lower'), val: i32ToScVal(tickLower) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('tick_upper'), val: i32ToScVal(tickUpper) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('liquidity'), val: bigintToU128(liquidity) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount_0_min'), val: bigintToU128(amount0Min) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('amount_1_min'), val: bigintToU128(amount1Min) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('recipient'), val: addressToScVal(walletAddress) }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('deadline'),
      val: xdr.ScVal.scvU64(xdr.Uint64.fromString(deadline.toString())),
    }),
  ]);

  const tx = await buildContractTx(
    PM_ADDRESS,
    'mint',
    [mintParams],
    walletAddress,
  );
  return tx.toXDR();
}
```

### 5.3 Remove liquidity transaction (burn + collect)

```typescript
// Step 1: decrease_liquidity
export async function buildDecreaseLiquidityTx(
  walletAddress: string,
  positionId: bigint,
  liquidity: bigint,
  amount0Min: bigint,
  amount1Min: bigint,
  deadline: bigint,
): Promise<string> {
  const tx = await buildContractTx(
    PM_ADDRESS,
    'decrease_liquidity',
    [
      bigintToU128(positionId),
      bigintToU128(liquidity),
      bigintToU128(amount0Min),
      bigintToU128(amount1Min),
      xdr.ScVal.scvU64(xdr.Uint64.fromString(deadline.toString())),
    ],
    walletAddress,
  );
  return tx.toXDR();
}

// Step 2: collect fees + burned tokens
export async function buildCollectTx(
  walletAddress: string,
  positionId: bigint,
  recipient: string,
): Promise<string> {
  const tx = await buildContractTx(
    PM_ADDRESS,
    'collect',
    [bigintToU128(positionId), addressToScVal(recipient)],
    walletAddress,
  );
  return tx.toXDR();
}
```

---

## 6. Page Components

### 6.1 Swap Page — `/swap`

**Component tree:**
```
SwapPage
├── TokenInputBox (XLM amount in)
│   └── onChange → triggers useSwapQuote hook
├── SwapArrowButton (flips direction)
├── TokenInputBox (USDC amount out, read-only, shows quote)
├── PriceInfo
│   ├── rate: "1 XLM = X USDC"
│   ├── priceImpact: colored badge
│   └── minimumReceived: amountOut * (1 - slippage)
├── SlippageSettings (0.1% / 0.5% / 1.0% / custom)
└── SwapButton
    ├── if not connected: "Connect Wallet"
    ├── if quoting: "Fetching quote..."
    └── if ready: "Swap" → sign + submit
```

**Full swap flow:**
```typescript
// In SwapPage component
const { address, connect, sign } = useWallet();
const { data: quote } = useSwapQuote(amountIn, zeroForOne, Boolean(amountIn));

async function handleSwap() {
  if (!address) { await connect(); return; }

  const slippageBps = 50n; // 0.5% = 50 basis points
  const amountOutMin = quote.amountOut * (10000n - slippageBps) / 10000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min

  const txXdr = await buildSwapTx(
    address,
    zeroForOne ? XLM_ADDRESS : USDC_ADDRESS,
    zeroForOne ? USDC_ADDRESS : XLM_ADDRESS,
    FEE_TIER,
    amountIn,
    amountOutMin,
    deadline,
    0n,  // no price limit
  );

  const signedXdr = await sign(txXdr);
  const result = await submitTransaction(signedXdr);
  // Show success toast, refresh balances
}
```

**Decimal handling:**
```typescript
// XLM has 7 decimal places on Stellar
// USDC has 7 decimal places on Stellar  
// Contract amounts are in stroops (1 XLM = 10,000,000 stroops)

export const XLM_DECIMALS = 7;
export const USDC_DECIMALS = 7;

export function toStroops(amount: string, decimals = 7): bigint {
  const parts = amount.split('.');
  const whole = BigInt(parts[0] || '0');
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return whole * 10n ** BigInt(decimals) + BigInt(frac);
}

export function fromStroops(amount: bigint, decimals = 7): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = (amount % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
```

### 6.2 Liquidity Page — `/liquidity`

**Sub-pages:**
- `/liquidity` — list of your positions + "Add" button
- `/liquidity/new` — add liquidity form

**Add liquidity form state:**
```typescript
interface AddLiquidityState {
  tickLower: number;       // e.g. -1000 (rounded to tick_spacing)
  tickUpper: number;       // e.g. +1000
  amount0: string;         // USDC input (human)
  amount1: string;         // XLM input (human) — auto-computed
  liquidity: bigint;       // computed from amounts
  amount0Min: bigint;
  amount1Min: bigint;
}
```

**Computing the paired amount:**
When user inputs amount0 (XLM), compute required amount1 (USDC):
```typescript
function computePairedAmount(
  amount0Stroops: bigint,
  sqrtPriceX64: bigint,
  sqrtLowerX64: bigint,
  sqrtUpperX64: bigint,
): bigint {
  const liquidity = getLiquidityForAmount0(sqrtLowerX64, sqrtUpperX64, amount0Stroops);
  const { amount1 } = getAmountsForLiquidity(sqrtPriceX64, sqrtLowerX64, sqrtUpperX64, liquidity);
  return amount1;
}
```

**Range preset buttons:**
```typescript
const RANGE_PRESETS = [
  { label: '±5%',   pct: 0.05 },
  { label: '±10%',  pct: 0.10 },
  { label: '±20%',  pct: 0.20 },
  { label: '±50%',  pct: 0.50 },
  { label: 'Full',  pct: null  }, // full range
];

function applyPreset(currentPrice: number, pct: number | null, spacing: number) {
  if (pct === null) return { tickLower: MIN_TICK, tickUpper: MAX_TICK };
  const lower = roundTick(priceToTick(currentPrice * (1 - pct)), spacing);
  const upper = roundTick(priceToTick(currentPrice * (1 + pct)), spacing);
  return { tickLower: lower, tickUpper: upper };
}
```

**Position list item component:**
```tsx
function PositionCard({ position }: { position: Position }) {
  const statusColor = position.inRange ? 'green' : 'orange';
  const status = position.inRange ? 'In Range ✓' : '⚠ Out of Range';
  
  return (
    <div className="position-card">
      <div className="position-header">
        <span>XLM / USDC</span>
        <span style={{ color: statusColor }}>{status}</span>
      </div>
      <div className="price-range">
        ${position.priceLower.toFixed(4)} — ${position.priceUpper.toFixed(4)}
      </div>
      <div className="amounts">
        <span>{fromStroops(position.amount0)} XLM</span>
        <span>{fromStroops(position.amount1)} USDC</span>
      </div>
      <div className="fees">
        Uncollected fees: {fromStroops(position.tokensOwed0)} XLM + {fromStroops(position.tokensOwed1)} USDC
      </div>
      <div className="actions">
        <button onClick={() => handleCollect(position.id)}>Collect Fees</button>
        <button onClick={() => handleRemove(position.id)}>Remove</button>
      </div>
    </div>
  );
}
```

### 6.3 Portfolio Page — `/portfolio`

**Summary cards:**
- Total position value in USD (sum of amount0 * price + amount1)
- Total uncollected fees
- Number of active positions

**Activity feed from Horizon:**
```typescript
async function fetchActivity(walletAddress: string) {
  const url = `${HORIZON_URL}/accounts/${walletAddress}/effects?limit=20&order=desc`;
  const res = await fetch(url);
  const data = await res.json();
  return data._embedded.records.filter((e: any) =>
    e.type === 'contract_event'
  );
}
```

**Rebalance flow:**
When a position is out of range, show a "Rebalance" button that:
1. Calls `decrease_liquidity` (burn all)
2. Calls `collect`
3. Optionally calls swap (~50% of single asset back to balanced)
4. Calls `mint` at new range centered around current price

---

## 7. Token Approvals

Before the pool can pull tokens from a user, the user must approve the pool contract. This is a separate transaction.

```typescript
import { Contract, xdr, nativeToScVal } from '@stellar/stellar-sdk';

// Approve USDC spend by pool contract
export async function buildApprovalTx(
  walletAddress: string,
  tokenAddress: string,
  spender: string,
  amount: bigint,
  expirationLedger: number,
): Promise<string> {
  const tx = await buildContractTx(
    tokenAddress,
    'approve',
    [
      addressToScVal(walletAddress),   // from
      addressToScVal(spender),         // spender
      bigintToI128(amount),            // amount
      u32ToScVal(expirationLedger),    // expiration_ledger
    ],
    walletAddress,
  );
  return tx.toXDR();
}

// Usage in swap flow:
// 1. Build approval tx for token_in
// 2. Build swap tx
// 3. Combine or submit sequentially
```

---

## 8. App Structure

```
frontend/src/
├── pages/
│   ├── Swap/
│   │   ├── index.tsx          ← main swap UI
│   │   ├── TokenInputBox.tsx
│   │   ├── PriceInfo.tsx
│   │   └── SlippageSettings.tsx
│   ├── Liquidity/
│   │   ├── index.tsx          ← position list
│   │   ├── AddLiquidity/
│   │   │   ├── index.tsx
│   │   │   ├── RangeSelector.tsx  ← tick range picker
│   │   │   └── AmountInputs.tsx
│   │   └── PositionCard.tsx
│   └── Portfolio/
│       ├── index.tsx
│       ├── SummaryCards.tsx
│       └── ActivityFeed.tsx
├── hooks/
│   ├── useWallet.ts
│   ├── usePool.ts
│   ├── usePositions.ts
│   └── useSwapQuote.ts
├── lib/
│   ├── constants.ts           ← all contract addresses + constants
│   ├── math.ts                ← tick/price/liquidity math
│   ├── stellar.ts             ← RPC client + tx builder
│   └── transactions.ts        ← specific transaction builders
├── components/
│   ├── Navbar.tsx
│   ├── WalletButton.tsx
│   └── PriceChart.tsx
└── App.tsx
```

**App.tsx — Router setup:**
```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Navigate to="/swap" />} />
          <Route path="/swap" element={<SwapPage />} />
          <Route path="/liquidity" element={<LiquidityPage />} />
          <Route path="/liquidity/new" element={<AddLiquidityPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

---

## 9. ScVal Parsing Reference

When reading contract return values, map ScVal types:

| Contract type | ScVal type | Parse with |
|---|---|---|
| `u128` | `ScvU128` | `BigInt(scVal.u128().hi) * 2n**64n + BigInt(scVal.u128().lo)` |
| `i128` | `ScvI128` | Similar, handle sign |
| `i32` | `ScvI32` | `scVal.i32()` |
| `u32` | `ScvU32` | `scVal.u32()` |
| `bool` | `ScvBool` | `scVal.b()` |
| `Address` | `ScvAddress` | `Address.fromScVal(scVal).toString()` |
| `struct` (tuple/map) | `ScvMap` | `scValToNative(scVal)` — gives a plain object |
| `Option<T>` | `ScvVoid` or `ScvMap` | check for void = None |

Use `scValToNative` from `@stellar/stellar-sdk` for most cases — it handles the common types automatically. For `u128` specifically:

```typescript
import { scValToNative, xdr } from '@stellar/stellar-sdk';

function parseU128(scVal: xdr.ScVal): bigint {
  const native = scValToNative(scVal);
  // scValToNative returns a bigint for u128 in recent SDK versions
  return BigInt(native.toString());
}
```

---

## 10. Slot0 Response Parsing

The `pool.slot0()` function returns a struct. Map fields:

```typescript
// Contract Slot0Public struct:
// { sqrt_price_x64: u128, tick: i32, fee_protocol: u32, unlocked: bool }

function parseSlot0(scVal: xdr.ScVal) {
  const obj = scValToNative(scVal) as Record<string, any>;
  return {
    sqrtPriceX64: BigInt(obj.sqrt_price_x64.toString()),
    tick: Number(obj.tick),
    feeProtocol: Number(obj.fee_protocol),
    unlocked: Boolean(obj.unlocked),
  };
}
```

---

## 11. Testing Checklist

Before calling a page complete, test all of these on Stellar Testnet:

### Swap page
- [ ] Connect Freighter → address shown in navbar
- [ ] Enter XLM amount → USDC quote updates in ~3s
- [ ] Flip direction → XLM/USDC swapped in inputs
- [ ] Slippage 0.1% / 0.5% / 1% / custom all update minReceived
- [ ] Click Swap → Freighter popup appears with correct amounts
- [ ] Approve and submit → success toast shown
- [ ] Balance updates after swap

### Liquidity page
- [ ] Position list shows empty state for new wallet
- [ ] Add liquidity: enter XLM amount → USDC auto-computes
- [ ] ±10% range preset fills in correct tick bounds
- [ ] "Add Liquidity" → Freighter popup with two tokens
- [ ] After adding: position appears in list with "In Range ✓"
- [ ] Price range displayed in human-readable form ($X — $Y)

### Portfolio page
- [ ] Positions list shows created position
- [ ] Uncollected fees show as 0 initially
- [ ] Collect fees button → transaction submitted → fees reset
- [ ] After price moves out of range: "⚠ Out of Range" badge

### Edge cases
- [ ] Swap 0 amount → button disabled
- [ ] Swap exceeds balance → error shown before submitting
- [ ] Tight range (±1%) → warning displayed about impermanent loss

---

## 12. Common Pitfalls

1. **Amount units** — Always use stroops (1 XLM = 10^7 stroops) in contract calls. Display in XLM.

2. **Price direction** — Token ordering in the pool: `token_0 < token_1` lexicographically. Since `CDLZFC... (XLM) < GBBD... (USDC)` is false, USDC (`GBBD...`) is `token_0` and XLM SAC (`CDLZFC...`) is `token_1`. Verify by calling `pool.token_0()` and `pool.token_1()`. The `price` in the pool is `token_1 / token_0`. Adjust display accordingly.

3. **Tick spacing** — User-entered prices must be rounded to the nearest multiple of `TICK_SPACING = 10` before submitting. Ticks that aren't multiples of 10 will cause the contract to panic.

4. **Deadline** — Always pass `Math.floor(Date.now() / 1000) + 300` (5 minutes from now) as the deadline. Stale deadlines will cause the contract to panic.

5. **Approval before mint/swap** — The pool uses `transfer_from`, so users must call `token.approve(pool_address, amount, ledger)` first. Check existing allowance to avoid redundant approval transactions.

6. **u128 BigInt serialization** — When building ScVal for u128, use:
   ```typescript
   xdr.ScVal.scvU128(new xdr.UInt128Parts({
     hi: xdr.Uint64.fromString((value >> 64n).toString()),
     lo: xdr.Uint64.fromString((value & 0xFFFFFFFFFFFFFFFFn).toString()),
   }))
   ```

7. **Soroban RPC rate limits** — The public testnet RPC has rate limits. Debounce quote requests to at most one per 2 seconds. Use `staleTime: 3000` in React Query.

8. **Storage TTL** — Soroban persistent storage entries expire after ~200,000 ledgers (~2 weeks). Long-dormant positions may have expired entries. If `get_position_info` returns 0 liquidity on a position you know exists, the storage may have expired. Add a UI prompt to extend TTL.

---

## 13. Run the Dev Server

```bash
cd frontend
npm install
cp ../.env.testnet .env.local
npm run dev
# → http://localhost:5173
```

Install Freighter browser extension, set it to **Stellar Testnet**, and get test XLM from `https://friendbot.stellar.org?addr=<YOUR_ADDRESS>`.

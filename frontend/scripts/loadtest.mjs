// Testnet load / integration test for StellarSwap.
//
// Creates N fresh wallets, funds them via Friendbot, establishes a USDC
// trustline, pre-approves the pool, then drives a mix of swaps and
// add-liquidity (mint) operations against the deployed contracts.
//
// It mirrors the frontend flow exactly: it bypasses the broken router
// (whose internal approve() expires at ledger 200) and calls pool.swap /
// position_manager.mint directly after pre-approving the pool.
//
// Run from the frontend dir so @stellar/stellar-sdk resolves:
//   node scripts/loadtest.mjs
//
// Env knobs: WALLETS (default 10), SWAPS_PER (3), MINTS_PER (2), CONCURRENCY (4)

import {
  rpc,
  TransactionBuilder,
  Contract,
  Address,
  Asset,
  Operation,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = loadEnv(join(__dirname, "..", ".env.local"));

const RPC_URL = env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const PASSPHRASE = env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
const FRIENDBOT = "https://friendbot.stellar.org/?addr=";
const POOL = env.NEXT_PUBLIC_POOL_ADDRESS;
const PM = env.NEXT_PUBLIC_POSITION_MANAGER_ADDRESS;
const XLM = env.NEXT_PUBLIC_XLM_ADDRESS;
const USDC = env.NEXT_PUBLIC_USDC_ADDRESS;
const USDC_ISSUER = env.NEXT_PUBLIC_USDC_ISSUER;
const USDC_CODE = env.NEXT_PUBLIC_USDC_ASSET_CODE || "USDC";

// Pool: token_0 = USDC, token_1 = XLM. zero_for_one = selling token_0 (USDC).
const MIN_SQRT_PLUS1 = 72057594037927937n; // sell USDC: price moves down
const MAX_SQRT_MINUS1 = 4722366482869645213695n; // sell XLM: price moves up

// Liquidity range around the live tick (~16966), aligned to spacing 10.
const TICK_LOWER = 16900;
const TICK_UPPER = 17040;
const MINT_L = 1_000_000_000n; // ≈ 0.77 XLM + 0.16 USDC pulled per mint
const STROOP = 10_000_000n; // 1 unit = 1e7 stroops (classic 7-decimals)

const WALLETS = Number(process.env.WALLETS || 10);
const SWAPS_PER = Number(process.env.SWAPS_PER || 3);
const MINTS_PER = Number(process.env.MINTS_PER || 2);
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Tx helpers ────────────────────────────────────────────────────────
const addr = (pk) => new Address(pk).toScVal();
const i128 = (v) => nativeToScVal(v, { type: "i128" });
const u128 = (v) => nativeToScVal(v, { type: "u128" });
const u32 = (v) => nativeToScVal(v, { type: "u32" });
const u64 = (v) => nativeToScVal(v, { type: "u64" });
const i32 = (v) => nativeToScVal(v, { type: "i32" });

async function submitOnce(kp, op, soroban) {
  // Build + (re)simulate against the freshest pool state, then submit.
  const account = await server.getAccount(kp.publicKey());
  let tx = new TransactionBuilder(account, { fee: "2000000", networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();
  if (soroban) tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  const res = await server.sendTransaction(tx);
  if (res.status === "ERROR")
    throw new Error("send ERROR: " + JSON.stringify(res.errorResult?.result?.() ?? res.errorResult));
  let g = await server.getTransaction(res.hash);
  const deadline = Date.now() + 90_000;
  while (g.status === "NOT_FOUND") {
    if (Date.now() > deadline) throw new Error("timeout waiting for " + res.hash);
    await sleep(2000);
    g = await server.getTransaction(res.hash);
  }
  if (g.status !== "SUCCESS") throw new Error("tx FAILED " + res.hash + " status=" + g.status);
  return { hash: res.hash, returnValue: g.returnValue ?? null };
}

// Soroban ops against the shared pool can trap when a concurrent swap/mint
// moves the price/ticks between our simulation and execution (stale footprint).
// Re-simulating fresh on each attempt clears that, so retry a few times.
async function submit(kp, op, { soroban = true, retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await submitOnce(kp, op, soroban);
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await sleep(1500 + Math.floor(Math.random() * 1500));
    }
  }
  throw lastErr;
}

async function friendbot(pk) {
  const r = await fetch(FRIENDBOT + encodeURIComponent(pk));
  if (!r.ok && r.status !== 400) throw new Error("friendbot failed: " + r.status);
}

// Swap via pool.swap directly (router bypass). sellXlm=true → zero_for_one=false.
function swapOp(pk, sellXlm, amountUnits) {
  const zeroForOne = !sellXlm; // selling USDC(token_0) => true
  const limit = zeroForOne ? MIN_SQRT_PLUS1 : MAX_SQRT_MINUS1;
  const amt = BigInt(amountUnits) * STROOP;
  return new Contract(POOL).call(
    "swap",
    addr(pk),
    nativeToScVal(zeroForOne, { type: "bool" }),
    i128(amt),
    u128(limit)
  );
}

function approveOp(pk, token, amountUnits, expiry) {
  return new Contract(token).call(
    "approve",
    addr(pk),
    addr(POOL),
    i128(BigInt(amountUnits) * STROOP),
    u32(expiry)
  );
}

function mintOp(pk, deadline) {
  // ScMap keys must be in ascending lexicographic order.
  const params = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount_0_min"), val: u128(0n) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount_1_min"), val: u128(0n) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("deadline"), val: u64(deadline) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("liquidity"), val: u128(MINT_L) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pool"), val: addr(POOL) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("recipient"), val: addr(pk) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("tick_lower"), val: i32(TICK_LOWER) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("tick_upper"), val: i32(TICK_UPPER) }),
  ]);
  return new Contract(PM).call("mint", params);
}

// Build a swap-heavy op plan. First op seeds USDC inventory, then we mint once
// early, then alternate small balanced swaps (sell 6 XLM / sell 1 USDC) so net
// flow stays near zero and price barely drifts. Remaining mints are spread out.
function buildPlan() {
  const plan = [{ kind: "swap", sellXlm: true, units: 40 }]; // seed ~7 USDC
  let swapsLeft = SWAPS_PER - 1;
  let mintsLeft = MINTS_PER;
  if (mintsLeft > 0) {
    plan.push({ kind: "mint" }); // first liquidity add, while USDC is fresh
    mintsLeft--;
  }
  const mintEvery = mintsLeft > 0 ? Math.max(1, Math.floor(swapsLeft / (mintsLeft + 1))) : Infinity;
  let sellUsdcNext = true;
  let sinceMint = 0;
  while (swapsLeft > 0) {
    plan.push({ kind: "swap", sellXlm: !sellUsdcNext, units: sellUsdcNext ? 1 : 6 });
    sellUsdcNext = !sellUsdcNext;
    swapsLeft--;
    sinceMint++;
    if (mintsLeft > 0 && sinceMint >= mintEvery) {
      plan.push({ kind: "mint" });
      mintsLeft--;
      sinceMint = 0;
    }
  }
  while (mintsLeft > 0) {
    plan.push({ kind: "mint" });
    mintsLeft--;
  }
  return plan;
}

// Shared, chronological transaction feed for the dashboard (written live).
const txLog = [];
const FEED_FILE = join(__dirname, "..", "public", "loadtest-feed.json");
const startedAt = new Date().toISOString();
let feedTimer = null;
function scheduleFeedWrite() {
  if (feedTimer) return;
  feedTimer = setTimeout(() => {
    feedTimer = null;
    const swaps = txLog.filter((t) => t.kind === "swap");
    const mints = txLog.filter((t) => t.kind === "mint");
    const feed = {
      startedAt,
      updatedAt: new Date().toISOString(),
      network: "testnet",
      pool: POOL,
      targetSwaps: WALLETS * SWAPS_PER,
      counts: { swaps: swaps.length, mints: mints.length, total: txLog.length },
      volumeXlm: swaps.reduce((a, t) => a + (t.xlmAmount || 0), 0),
      transactions: [...txLog].sort((a, b) => a.ts - b.ts),
    };
    writeFileSync(FEED_FILE, JSON.stringify(feed, null, 2));
  }, 400);
}

// Decode pool.swap return (amount_0 USDC, amount_1 XLM) — signed deltas from the
// caller's view: positive = token paid in, negative = token received out.
function decodeSwap(returnValue, sellXlm) {
  try {
    const [a0, a1] = scValToNative(returnValue).map((v) => BigInt(v));
    const usdc = a0 < 0n ? -a0 : a0;
    const xlm = a1 < 0n ? -a1 : a1;
    const toNum = (v) => Number(v) / 1e7;
    const usdcAmt = toNum(usdc);
    const xlmAmt = toNum(xlm);
    return {
      direction: sellXlm ? "XLM→USDC" : "USDC→XLM",
      xlmAmount: xlmAmt,
      usdcAmount: usdcAmt,
      priceUsdcPerXlm: xlmAmt > 0 ? usdcAmt / xlmAmt : null,
    };
  } catch {
    return { direction: sellXlm ? "XLM→USDC" : "USDC→XLM", xlmAmount: null, usdcAmount: null, priceUsdcPerXlm: null };
  }
}

async function runWallet(idx, log) {
  const kp = Keypair.random();
  const pk = kp.publicKey();
  const short = pk.slice(0, 4) + "…" + pk.slice(-4);
  const rec = { index: idx, address: pk, secret: kp.secret(), ops: [], swaps: 0, mints: 0 };
  log(`[w${idx}] ${pk} — funding`);
  await friendbot(pk);

  // USDC trustline (classic) so the account can receive USDC via the SAC.
  await submit(
    kp,
    Operation.changeTrust({ asset: new Asset(USDC_CODE, USDC_ISSUER) }),
    { soroban: false }
  );

  const latest = await server.getLatestLedger();
  const expiry = latest.sequence + 3000; // ~4h TTL, covers the whole run
  await submit(kp, approveOp(pk, XLM, 100000, expiry));
  await submit(kp, approveOp(pk, USDC, 100000, expiry));

  const plan = buildPlan();
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    try {
      if (step.kind === "swap") {
        const { hash, returnValue } = await submit(kp, swapOp(pk, step.sellXlm, step.units));
        rec.swaps++;
        const d = decodeSwap(returnValue, step.sellXlm);
        rec.ops.push({ kind: "swap", hash, ...d });
        txLog.push({ ts: Date.now(), kind: "swap", wallet: pk, walletShort: short, hash, ...d });
        log(`[w${idx}] ${i + 1}/${plan.length} swap ${d.direction} ${d.xlmAmount?.toFixed(2)} XLM ✓`);
      } else {
        const { hash } = await submit(kp, mintOp(pk, deadline));
        rec.mints++;
        rec.ops.push({ kind: "mint", hash });
        txLog.push({ ts: Date.now(), kind: "mint", wallet: pk, walletShort: short, hash, liquidity: MINT_L.toString() });
        log(`[w${idx}] ${i + 1}/${plan.length} add-liquidity L=${MINT_L} ✓`);
      }
      scheduleFeedWrite();
    } catch (e) {
      log(`[w${idx}] ${i + 1}/${plan.length} ${step.kind} ✗ ${e.message}`);
      rec.ops.push({ kind: step.kind, error: e.message });
    }
  }
  return rec;
}

// Simple concurrency pool.
async function main() {
  console.log(`StellarSwap testnet load test`);
  console.log(`  pool=${POOL}`);
  console.log(`  wallets=${WALLETS} swaps/wallet=${SWAPS_PER} mints/wallet=${MINTS_PER} concurrency=${CONCURRENCY}`);
  console.log("");
  const results = new Array(WALLETS);
  let next = 0;
  const log = (m) => console.log(m);
  async function worker() {
    while (next < WALLETS) {
      const i = next++;
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try {
          results[i] = await runWallet(i, log); // fresh keypair each attempt
          done = true;
        } catch (e) {
          log(`[w${i}] setup error (attempt ${attempt + 1}/3): ${e.message}`);
          results[i] = { index: i, error: e.message };
          await sleep(2000);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, WALLETS) }, worker));

  const okSwaps = results.reduce((a, r) => a + (r?.swaps || 0), 0);
  const okMints = results.reduce((a, r) => a + (r?.mints || 0), 0);
  console.log("\n──────── Summary ────────");
  console.log(`swaps ok: ${okSwaps}   mints ok: ${okMints}   total DEX ops: ${okSwaps + okMints}`);
  console.log("\nWallet addresses:");
  results.forEach((r) => {
    if (r) console.log(`  ${String(r.index).padStart(2)}  ${r.address || "(failed)"}  swaps=${r.swaps || 0} mints=${r.mints || 0}`);
  });

  const outFile = join(__dirname, "loadtest-wallets.json");
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), pool: POOL, results }, null, 2));

  // Final synchronous feed flush.
  const swaps = txLog.filter((t) => t.kind === "swap");
  const mints = txLog.filter((t) => t.kind === "mint");
  writeFileSync(
    FEED_FILE,
    JSON.stringify(
      {
        startedAt,
        updatedAt: new Date().toISOString(),
        finished: true,
        network: "testnet",
        pool: POOL,
        targetSwaps: WALLETS * SWAPS_PER,
        counts: { swaps: swaps.length, mints: mints.length, total: txLog.length },
        volumeXlm: swaps.reduce((a, t) => a + (t.xlmAmount || 0), 0),
        transactions: [...txLog].sort((a, b) => a.ts - b.ts),
      },
      null,
      2
    )
  );
  console.log(`\nFull details (incl. secrets + tx hashes) written to:\n  ${outFile}`);
  console.log(`Dashboard feed:\n  ${FEED_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

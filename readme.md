# StellarSwap — CLMM DEX on Stellar Testnet

<img width="2880" height="1565" alt="StellarSwap" src="https://github.com/user-attachments/assets/bba36b9f-3ec3-4fe8-ac8e-60cfebeb0554" />

<div align="center">
<img src="https://img.shields.io/badge/Stellar-Soroban-7B2FBE?style=for-the-badge" />
<img src="https://img.shields.io/badge/Rust-1.70%2B-red?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge" />
<img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge" />
<img src="https://img.shields.io/badge/Status-Live%20on%20Testnet-brightgreen?style=for-the-badge" />

 **A Concentrated Liquidity Market Maker (CLMM) DEX built on Stellar's Soroban smart contract platform. Trading pair: XLM / USDC on Stellar Testnet.**

</div>

## Quick Links

| Resource | Link |
|----|-----|
| Live Demo | https://astroflo.vercel.app |
| Demo Video | https://youtu.be/foDUtKHLPnk |
| Architecture & math | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Testing, security & ops | [docs/OPERATIONS.md](docs/OPERATIONS.md) |

---

## 🚀 Deployed Contracts (Stellar Testnet)

**Network:** Stellar Testnet · Passphrase `Test SDF Network ; September 2015`

**Deployer:** `GAL6ZVVRE2RPFS2X23I65QANHHIBGHKTGGVIT5AJURRKTIMEVUMJJUZZ`

| Contract | Deployed Address (testnet) | Explorer |
|---|---|---|
| **Factory** | `CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE` | [view](https://stellar.expert/explorer/testnet/contract/CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE) |
| **Pool** (XLM/USDC 0.3%) | `CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32` | [view](https://stellar.expert/explorer/testnet/contract/CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32) |
| **Router** | `CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62` | [view](https://stellar.expert/explorer/testnet/contract/CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62) |
| **Position Manager** | `CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI` | [view](https://stellar.expert/explorer/testnet/contract/CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI) |
| XLM (Stellar Asset Contract) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | [view](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |
| USDC (Stellar Asset Contract) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | [view](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

> USDC is a SAC wrapping the classic asset `USDC` issued by `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (issuer G-address — used only to build `change_trust` trustline txs, **not** for Soroban token calls).

Full deploy + interaction tx hashes: pool [History on stellar.expert](https://stellar.expert/explorer/testnet/contract/CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32).

---

## What It Is

A CLMM DEX lets liquidity providers concentrate capital into chosen price ranges (à la Uniswap v3 / Raydium CLMM), making each dollar far more capital-efficient than a full-range AMM. The MVP ships three pages:

| Page | What it does |
|---|---|
| **Swap** | Trade XLM ↔ USDC with slippage control and real-time price impact. |
| **Liquidity** | Create / manage / close LP positions with custom price ranges. |
| **Portfolio** | View open positions, accrued fees, and on-chain pool state. |

**Stack:** Rust + Soroban (WASM) contracts · Next.js 14 + TypeScript + Stellar SDK frontend · Freighter wallet. The math, contract internals, and end-to-end swap/LP flows are documented in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Repository Layout

```
contracts/          # Soroban smart contracts (Rust workspace)
├── factory/src/lib.rs            # deploy_pool, get_pool, registry
├── pool/src/
│   ├── lib.rs                    # core CLMM: swap, mint, burn, collect, slot0
│   ├── swap.rs tick.rs tick_bitmap.rs position.rs storage.rs events.rs test.rs
│   └── math/                     # sqrt_price.rs, liquidity.rs, fixed_point.rs, mod.rs
├── position_manager/src/lib.rs   # NFT-style LP position wrapper
├── router/src/lib.rs             # exact-in / exact-out swap routing
├── Cargo.toml  Makefile
frontend/           # Next.js 14 + TypeScript app
├── src/app/(app)/{swap,liquidity,portfolio}/…   # pages
├── src/hooks/       # usePool, usePositions, useSwapQuote, wallet hooks
├── src/lib/         # transactions.ts, contract.ts, constants.ts, math.ts, stellar-*
scripts/            # redeploy.sh, sync-price.sh
.github/workflows/  # ci.yml, deploy.yml
docs/               # ARCHITECTURE.md, OPERATIONS.md
```

### Contract ↔ frontend function mapping

| Contract fn (Rust) | Frontend caller (TypeScript) |
|---|---|
| `pool.swap` | `frontend/src/lib/transactions.ts` ← `app/(app)/swap/page.tsx`, `hooks/useSwapQuote.ts` |
| `pool.mint` / `position_manager.mint` | `frontend/src/lib/transactions.ts` ← `app/(app)/liquidity/new/page.tsx` |
| `pool.burn` / `pool.collect` | `frontend/src/lib/transactions.ts` ← `components/liquidity/PositionCard.tsx` |
| `pool.slot0` / `pool.liquidity` | `frontend/src/hooks/usePool.ts` (portfolio on-chain reads) |
| `router.exact_input_single` / `exact_output_single` | on-chain router (single-pool UI calls `pool.swap` directly) |

Contract IDs are wired through `frontend/src/lib/constants.ts` from `NEXT_PUBLIC_*` env vars.

---

## Quickstart

**Prerequisites:** Rust + `wasm32-unknown-unknown` target, [Stellar CLI](https://developers.stellar.org/docs/tools/cli) 20.x+, Node.js 18+.

```bash
# Contracts — build & test
cd contracts
cargo build --target wasm32-unknown-unknown --release
cargo test

# Frontend — run locally
cd ../frontend
cp .env.example .env.local     # public testnet addresses
npm install
npm run dev                    # http://localhost:3000
```

### Deploy contracts

Full automated wiring (deploy factory → pool impl → router → position manager → init factory → create pool → seed liquidity) lives in [`scripts/redeploy.sh`](scripts/redeploy.sh). Single contract:

```bash
cd contracts
make deploy CONTRACT=pool STELLAR_SECRET_KEY=S...   # or: stellar contract deploy ...
```

Contracts are immutable per contract id; to roll back, repoint the frontend `NEXT_PUBLIC_*_ADDRESS` at a previous known-good id and redeploy.

---

## Environment Variables

Frontend (`frontend/.env.local` locally, Vercel env in prod). Template: [`frontend/.env.example`](frontend/.env.example).

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | testnet |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `C…` | factory contract id |
| `NEXT_PUBLIC_POOL_ADDRESS` | `C…` | XLM/USDC pool id |
| `NEXT_PUBLIC_ROUTER_ADDRESS` | `C…` | router id |
| `NEXT_PUBLIC_POSITION_MANAGER_ADDRESS` | `C…` | position manager id |
| `NEXT_PUBLIC_XLM_ADDRESS` / `NEXT_PUBLIC_USDC_ADDRESS` | `C…` | token SACs |

CI/deploy secrets: `STELLAR_SECRET_KEY` (funded testnet secret), `VERCEL_TOKEN`, plus the `NEXT_PUBLIC_*` values as GitHub Actions secrets. `NEXT_PUBLIC_*` values are **inlined at build time** — change them ⇒ rebuild.

---

## CI/CD (GitHub Actions — `.github/workflows/`)

- **`ci.yml`** (push/PR to `main`) — **contracts job:** `cargo fmt --check` → `cargo test` → `cargo build --target wasm32-unknown-unknown --release` → upload wasm. **frontend job:** `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:ci` → `npm run build`. Fails on any lint/type/test/build error; both jobs upload artifacts.
- **`deploy.yml`** (push to `main` + manual dispatch) — **deploy-contract:** build wasm → `stellar contract deploy` (factory) on testnet. **deploy-frontend:** `needs: deploy-contract` → `npm run build` with `NEXT_PUBLIC_*` → `vercel deploy --prod`. Deploy steps skip cleanly (warn + exit 0) when secrets are absent, so pushes stay green until secrets are configured.

---

## Testing

```bash
cd contracts && cargo test     # 7 passing (fixed-point math, tick↔sqrt-price, pool constructor/reads)
cd frontend  && npm run test   # 11 passing (math utils + wallet panel component tests)
```

Detailed test breakdown, security model, glossary, and the wallet/event integration are in **[docs/OPERATIONS.md](docs/OPERATIONS.md)**.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Site shows no tick / liquidity / positions | `NEXT_PUBLIC_*` not set in Vercel (inline at build time). | Add them in Vercel → Settings → Environment Variables, then redeploy with build cache off. |
| "Freighter not detected" | Extension missing/locked. | Install from freighter.app; unlock; set network to Testnet. |
| Swap/mint fails with auth error | Pool spend not approved. | The UI builds an `approve` before the swap/mint; ensure it's signed first. |
| Balance shows `0 XLM (account not funded)` | Testnet account not created. | Fund via [friendbot](https://friendbot.stellar.org). |
| `cargo test` can't find `wasm32` target | Target not installed. | `rustup target add wasm32-unknown-unknown`. |
| CI `npm ci` fails | `package-lock.json` out of sync. | Commit the updated lockfile. |

---

## Deployment Evidence

- **Contracts:** all four addresses above are live on Stellar Testnet (verify via the stellar.expert links).
- **Tests:** 7 passing contract tests + 11 passing frontend tests.
- **Build:** `npm run build` prerenders all app routes; `cargo build --target wasm32-unknown-unknown --release` produces the 4 contract wasms.
- **Live frontend:** [astroflo.vercel.app](https://astroflo.vercel.app).

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — CLMM math, tick/liquidity model, fixed-point arithmetic, system architecture, per-contract deep dive, and end-to-end swap/LP flows.
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — testing strategy, security considerations, known limitations, glossary, Freighter wallet integration, event streaming, and the user-feedback changelog.

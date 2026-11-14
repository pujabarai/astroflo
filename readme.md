# StellarSwap — CLMM DEX on Stellar Testnet

<img width="2880" height="1565" alt="StellarSwap screenshot" src="https://github.com/user-attachments/assets/bba36b9f-3ec3-4fe8-ac8e-60cfebeb0554" />

<div align="center">
<img src="https://img.shields.io/badge/Stellar-Soroban-7B2FBE?style=for-the-badge" />
<img src="https://img.shields.io/badge/Rust-1.70%2B-red?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge" />
<img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge" />
<img src="https://img.shields.io/badge/Status-Live%20on%20Testnet-brightgreen?style=for-the-badge" />

**A Concentrated Liquidity Market Maker (CLMM) DEX on Stellar Soroban, inspired by Uniswap v3. Trading pair: XLM / USDC.**

</div>

---

## Features

| Page | What it does |
|---|---|
| **Swap** | Trade XLM ↔ USDC with slippage control and price impact. |
| **Liquidity** | Create, manage, and close LP positions in custom price ranges. |
| **Portfolio** | View open positions, uncollected fees, and wallet balance. |

Wallet: [Freighter](https://freighter.app) (set to Testnet).

<div align="center">
  <img width="300" alt="Mobile UI" src="https://github.com/user-attachments/assets/447b6651-4822-475d-9f5b-3cbcbc91de0e" />
</div>

---

## Deployed Contracts (Stellar Testnet)

| Contract | Address |
|---|---|
| Factory | [`CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE`](https://stellar.expert/explorer/testnet/contract/CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE) |
| Pool (XLM/USDC 0.3%) | [`CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32`](https://stellar.expert/explorer/testnet/contract/CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32) |
| Router | [`CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62`](https://stellar.expert/explorer/testnet/contract/CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62) |
| Position Manager | [`CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI`](https://stellar.expert/explorer/testnet/contract/CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI) |
| XLM (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

---

## Project Structure

```
contracts/            # Soroban smart contracts (Rust workspace)
├── factory/          # deploy_pool, get_pool
├── pool/             # core CLMM: swap, mint, burn, collect, slot0
├── position_manager/ # LP position wrapper
└── router/           # exact-in / exact-out swap routing
frontend/             # Next.js + TypeScript app
scripts/              # redeploy.sh, sync-price.sh
.github/workflows/    # ci.yml, deploy.yml
```

---

## Getting Started

**Prerequisites:** Rust + `wasm32-unknown-unknown` target, [Stellar CLI](https://developers.stellar.org/docs/tools/cli), Node.js 18+.

```bash
# Contracts
cd contracts
cargo test
cargo build --target wasm32-unknown-unknown --release

# Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Full testnet redeploy (contracts + pool init + seed liquidity): `scripts/redeploy.sh`.

### Environment Variables

Create `frontend/.env.local` (template: `frontend/.env.example`):

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_FACTORY_ADDRESS=CDFY5UX77PQDP2QGNY4YGZVKK6FE6J2LSSVZFXTQSHRO2JIES7LSZGPE
NEXT_PUBLIC_POOL_ADDRESS=CCYBX2FOT5RWL6T2CQROAA3ZECYNNE3PSJ7WQXULU6AJOCCK6YHSTH32
NEXT_PUBLIC_ROUTER_ADDRESS=CDLCGPUP7NW4B4SSFG5H4I75PKDGPUZDHOX5C6YICJY7RDJ7VP7BAT62
NEXT_PUBLIC_POSITION_MANAGER_ADDRESS=CC6IBQ7VNVK7CQYIZX47NJPDH5DL5ISQSA26BLBZXVMVEQ3QGUAZDREI
NEXT_PUBLIC_XLM_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
NEXT_PUBLIC_USDC_ADDRESS=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after you change them.

Get testnet XLM from [Friendbot](https://friendbot.stellar.org).

---

## Testing

```bash
cd contracts && cargo test     # 7 tests
cd frontend && npm run test    # 11 tests
```

---

## CI/CD

- **`ci.yml`** (push/PR to `main`): contracts run `cargo fmt --check`, `cargo test` and the wasm build. Frontend runs lint, typecheck, tests and build.
- **`deploy.yml`** (push to `main`): deploys contracts to testnet, then deploys the frontend to Vercel. It needs the `STELLAR_SECRET_KEY` and `VERCEL_TOKEN` secrets and skips the deploy steps when they are missing.

<img width="2854" height="1104" alt="CI/CD pipeline" src="https://github.com/user-attachments/assets/f1b08e25-252e-4f0a-a1e3-7216a256c03b" />


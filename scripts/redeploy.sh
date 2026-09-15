#!/usr/bin/env bash
# Redeploys all AstroFlo contracts with the LIVE XLM market price from CoinGecko/Binance.
# Run from the repo root: bash scripts/redeploy.sh
set -euo pipefail

STELLAR="${HOME}/.cargo/bin/stellar"
NETWORK="testnet"
SOURCE="deployer"
# stellar CLI 26 builds to wasm32v1-none by default (not wasm32-unknown-unknown).
WASM_DIR="contracts/target/wasm32v1-none/release"
ENV_FILE="frontend/.env"

XLM_ADDRESS="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
USDC_ADDRESS="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"

# ── Fetch live XLM price from CoinGecko → Binance ─────────────────────────────
echo "Fetching live XLM price..."
XLM_USD=$(curl -sf --max-time 6 \
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['stellar']['usd'])" 2>/dev/null) || true

if [ -z "$XLM_USD" ] || [ "$XLM_USD" = "0" ]; then
  echo "CoinGecko failed, trying Binance..."
  XLM_USD=$(curl -sf --max-time 6 \
    "https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['price'])" 2>/dev/null) || true
fi

if [ -z "$XLM_USD" ] || [ "$XLM_USD" = "0" ]; then
  echo "ERROR: Could not fetch XLM price from CoinGecko or Binance. Aborting." >&2
  exit 1
fi

# ── Compute sqrtPriceX64 from live price ──────────────────────────────────────
# Pool convention: price = XLM/USDC = token_1/token_0 = 1/XLM_USD
# sqrtPriceX64 = floor(sqrt(XLM_per_USDC) * 2^64)
PRICE_CALC=$(python3 -c "
import math
xlm_usd = float('$XLM_USD')
xlm_per_usdc = 1.0 / xlm_usd
sqrt_price = math.sqrt(xlm_per_usdc)
q64 = 2**64
sqrt_price_x64 = int(sqrt_price * q64)
initial_tick = int(math.log(xlm_per_usdc) / math.log(1.0001))
# Round tick to nearest multiple of 10 (tick_spacing)
initial_tick = round(initial_tick / 10) * 10
print(f'{sqrt_price_x64} {initial_tick}')
")
SQRT_PRICE_X64=$(echo "$PRICE_CALC" | awk '{print $1}')
INITIAL_TICK=$(echo "$PRICE_CALC"   | awk '{print $2}')

echo "=============================================="
echo " AstroFlo fresh deployment — live price      "
echo " XLM price   = \$$XLM_USD USD               "
echo " sqrtPriceX64= $SQRT_PRICE_X64              "
echo " initial tick = $INITIAL_TICK               "
echo "=============================================="
echo ""

# ── 1. Deploy factory ──────────────────────────────────────────────────────────
echo "[1/8] Deploying factory..."
FACTORY_ADDR=$("$STELLAR" contract deploy \
  --wasm "$WASM_DIR/factory.optimized.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" 2>/dev/null | tail -1)
echo "      Factory : $FACTORY_ADDR"

# ── 2. Upload pool WASM ────────────────────────────────────────────────────────
echo "[2/8] Uploading pool WASM..."
POOL_WASM_HASH=$("$STELLAR" contract upload \
  --wasm "$WASM_DIR/pool.optimized.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" 2>/dev/null | tail -1)
echo "      Pool hash: $POOL_WASM_HASH"

# ── 3. Deploy position manager ─────────────────────────────────────────────────
echo "[3/8] Deploying position manager..."
PM_ADDR=$("$STELLAR" contract deploy \
  --wasm "$WASM_DIR/position_manager.optimized.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" 2>/dev/null | tail -1)
echo "      PM       : $PM_ADDR"

# ── 4. Deploy router ───────────────────────────────────────────────────────────
echo "[4/8] Deploying router..."
ROUTER_ADDR=$("$STELLAR" contract deploy \
  --wasm "$WASM_DIR/router.optimized.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" 2>/dev/null | tail -1)
echo "      Router   : $ROUTER_ADDR"

# ── 5. Get deployer address ────────────────────────────────────────────────────
DEPLOYER_ADDR=$("$STELLAR" keys address "$SOURCE" 2>/dev/null)
echo "[5/8] Deployer : $DEPLOYER_ADDR"

# ── 6. Initialize factory ──────────────────────────────────────────────────────
echo "[6/8] Initializing factory..."
"$STELLAR" contract invoke \
  --id "$FACTORY_ADDR" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --pool_wasm_hash "$POOL_WASM_HASH" \
  --fee_recipient "$DEPLOYER_ADDR" \
  --protocol_fee 0 2>/dev/null
echo "      Done."

# ── 7. Deploy XLM/USDC pool with live price ───────────────────────────────────
echo "[7/8] Deploying XLM/USDC pool (fee=3000, price=\$$XLM_USD, sqrtPrice=$SQRT_PRICE_X64)..."
POOL_ADDR=$("$STELLAR" contract invoke \
  --id "$FACTORY_ADDR" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- deploy_pool \
  --token_a "$XLM_ADDRESS" \
  --token_b "$USDC_ADDRESS" \
  --fee 3000 \
  --tick_spacing 10 \
  --initial_sqrt_price_x64 "$SQRT_PRICE_X64" 2>/dev/null | tr -d '"')
echo "      Pool     : $POOL_ADDR"

# ── 8. Initialize PM & router ─────────────────────────────────────────────────
echo "[8/8] Initializing PM and Router..."
"$STELLAR" contract invoke \
  --id "$PM_ADDR" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- initialize \
  --factory "$FACTORY_ADDR" 2>/dev/null

"$STELLAR" contract invoke \
  --id "$ROUTER_ADDR" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- initialize \
  --factory "$FACTORY_ADDR" 2>/dev/null
echo "      Done."

# ── Update .env and .env.local (local overrides) ──────────────────────────────
echo ""
for TARGET_ENV in "$ENV_FILE" "$(dirname "$ENV_FILE")/.env.local"; do
  if [ -f "$TARGET_ENV" ]; then
    echo "Updating $TARGET_ENV ..."
    sed -i "s|^NEXT_PUBLIC_FACTORY_ADDRESS=.*|NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY_ADDR|"             "$TARGET_ENV"
    sed -i "s|^NEXT_PUBLIC_POOL_ADDRESS=.*|NEXT_PUBLIC_POOL_ADDRESS=$POOL_ADDR|"                       "$TARGET_ENV"
    sed -i "s|^NEXT_PUBLIC_ROUTER_ADDRESS=.*|NEXT_PUBLIC_ROUTER_ADDRESS=$ROUTER_ADDR|"                 "$TARGET_ENV"
    sed -i "s|^NEXT_PUBLIC_POSITION_MANAGER_ADDRESS=.*|NEXT_PUBLIC_POSITION_MANAGER_ADDRESS=$PM_ADDR|" "$TARGET_ENV"
  fi
done
echo "Done."

echo ""
echo "================================================"
echo " DEPLOYMENT SUMMARY"
echo "================================================"
echo " Factory : $FACTORY_ADDR"
echo " Pool    : $POOL_ADDR"
echo " Router  : $ROUTER_ADDR"
echo " PM      : $PM_ADDR"
echo ""
echo " XLM price   : \$$XLM_USD USD"
echo " sqrtPriceX64: $SQRT_PRICE_X64"
echo " initial tick: $INITIAL_TICK"
echo "================================================"

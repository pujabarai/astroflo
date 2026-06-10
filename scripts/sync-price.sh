#!/usr/bin/env bash
# Syncs the on-chain pool price to the current live XLM market price.
# Run this whenever the pool price drifts from market (no redeployment needed).
# Usage: bash scripts/sync-price.sh
set -euo pipefail

STELLAR="${HOME}/.cargo/bin/stellar"
NETWORK="testnet"
SOURCE="deployer"
ENV_FILE="frontend/.env"

# Read contract addresses from .env
FACTORY_ADDR=$(grep "^NEXT_PUBLIC_FACTORY_ADDRESS=" "$ENV_FILE" | cut -d= -f2)
POOL_ADDR=$(grep "^NEXT_PUBLIC_POOL_ADDRESS=" "$ENV_FILE" | cut -d= -f2)

if [ -z "$FACTORY_ADDR" ] || [ -z "$POOL_ADDR" ]; then
  echo "ERROR: Could not read contract addresses from $ENV_FILE" >&2
  exit 1
fi

echo "Factory : $FACTORY_ADDR"
echo "Pool    : $POOL_ADDR"
echo ""

# ── Fetch live XLM price ───────────────────────────────────────────────────────
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
  echo "ERROR: Could not fetch XLM price. Aborting." >&2
  exit 1
fi

# ── Compute sqrtPriceX64 ──────────────────────────────────────────────────────
PRICE_CALC=$(python3 -c "
import math
xlm_usd = float('$XLM_USD')
xlm_per_usdc = 1.0 / xlm_usd
sqrt_price = math.sqrt(xlm_per_usdc)
q64 = 2**64
sqrt_price_x64 = int(sqrt_price * q64)
tick = int(math.log(xlm_per_usdc) / math.log(1.0001))
print(f'{sqrt_price_x64} {tick}')
")
SQRT_PRICE_X64=$(echo "$PRICE_CALC" | awk '{print $1}')
NEW_TICK=$(echo "$PRICE_CALC"        | awk '{print $2}')

echo "XLM price    : \$$XLM_USD USD"
echo "XLM/USDC     : $(python3 -c "print(round(1/$XLM_USD, 4))")"
echo "sqrtPriceX64 : $SQRT_PRICE_X64"
echo "new tick     : $NEW_TICK"
echo ""
echo "Calling factory.set_pool_price ..."

"$STELLAR" contract invoke \
  --id "$FACTORY_ADDR" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- set_pool_price \
  --pool "$POOL_ADDR" \
  --new_sqrt_price_x64 "$SQRT_PRICE_X64" 2>/dev/null

echo ""
echo "Pool price synced to \$$XLM_USD/XLM (tick $NEW_TICK)"

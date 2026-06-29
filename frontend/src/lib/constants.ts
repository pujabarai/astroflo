export const Q64 = 2n ** 64n;
export const Q128 = 2n ** 128n;
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;
// Widest tick values that are exact multiples of TICK_SPACING (10):
// ceil(-443636 / 10) * 10 = -443630;  floor(443636 / 10) * 10 = 443630
export const MIN_TICK_USABLE = -443630;
export const MAX_TICK_USABLE = 443630;
export const MIN_SQRT_RATIO = 72057594037927936n;
export const MAX_SQRT_RATIO = 4722366482869645213696n;

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS!;
export const POOL_ADDRESS = process.env.NEXT_PUBLIC_POOL_ADDRESS!;
export const ROUTER_ADDRESS = process.env.NEXT_PUBLIC_ROUTER_ADDRESS!;
export const PM_ADDRESS = process.env.NEXT_PUBLIC_POSITION_MANAGER_ADDRESS!;
export const XLM_ADDRESS = process.env.NEXT_PUBLIC_XLM_ADDRESS!;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS!;

export const FEE_TIER = 3000;
export const TICK_SPACING = 10;

// `??` only guards null/undefined; an unset CI secret arrives as "", so treat
// empty/whitespace as "use the default" too. Keep the static process.env.*
// references so Next.js inlines them at build time.
const envOr = (value: string | undefined, fallback: string) =>
  value && value.trim() !== "" ? value : fallback;

export const NETWORK_PASSPHRASE = envOr(
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
  "Test SDF Network ; September 2015"
);
export const SOROBAN_RPC_URL = envOr(
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
  "https://soroban-testnet.stellar.org"
);
export const HORIZON_URL = envOr(
  process.env.NEXT_PUBLIC_HORIZON_URL,
  "https://horizon-testnet.stellar.org"
);

export const XLM_DECIMALS = 7;
export const USDC_DECIMALS = 7;
export const STROOP = 10_000_000n;

export const RANGE_PRESETS = [
  { label: "±5%", pct: 0.05 },
  { label: "±10%", pct: 0.10 },
  { label: "±20%", pct: 0.20 },
  { label: "±50%", pct: 0.50 },
  { label: "Full", pct: null },
] as const;

export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;

// Central Stellar SDK / Soroban RPC configuration.
// Everything network-related is read from NEXT_PUBLIC_* env vars so the same
// build can target testnet or mainnet.
import * as StellarSdk from "@stellar/stellar-sdk";

// Static refs so Next.js inlines the NEXT_PUBLIC_* values at build time.
// Note `??` only guards null/undefined — an unset CI secret comes through as
// an empty string, so fall back on empty too.
const RPC_FROM_ENV = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
const PASSPHRASE_FROM_ENV = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;

/** Soroban RPC endpoint (testnet by default). */
export const SOROBAN_RPC_URL =
  RPC_FROM_ENV && RPC_FROM_ENV.trim() !== ""
    ? RPC_FROM_ENV
    : "https://soroban-testnet.stellar.org";

/** Network passphrase (defaults to the SDK's testnet constant). */
export const networkPassphrase =
  PASSPHRASE_FROM_ENV && PASSPHRASE_FROM_ENV.trim() !== ""
    ? PASSPHRASE_FROM_ENV
    : StellarSdk.Networks.TESTNET;

/** Configured Soroban RPC server, shared across the app. */
export const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL, {
  allowHttp: !SOROBAN_RPC_URL.startsWith("https://"),
});

// Re-export the SDK itself so callers have a single import surface.
export { StellarSdk };
export default StellarSdk;

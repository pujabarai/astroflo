// Central Stellar SDK / Soroban RPC configuration.
// Everything network-related is read from NEXT_PUBLIC_* env vars so the same
// build can target testnet or mainnet.
import * as StellarSdk from "@stellar/stellar-sdk";

/** Soroban RPC endpoint (testnet by default). */
export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  "https://soroban-testnet.stellar.org";

/** Network passphrase (defaults to the SDK's testnet constant). */
export const networkPassphrase =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;

/** Configured Soroban RPC server, shared across the app. */
export const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL, {
  allowHttp: SOROBAN_RPC_URL.startsWith("http://"),
});

// Re-export the SDK itself so callers have a single import surface.
export { StellarSdk };
export default StellarSdk;

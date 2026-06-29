// Freighter wallet integration (Stellar TESTNET).
// All @stellar/freighter-api imports are explicit and at the top of the file.
import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";

/** Detect whether the Freighter extension is installed/available. */
export async function detectFreighter(): Promise<boolean> {
  try {
    const res = await isConnected();
    if (res.error) return false;
    return res.isConnected;
  } catch {
    return false;
  }
}

/**
 * Request permission (if not already granted) and return the wallet address.
 * Uses isAllowed() + requestAccess() + getAddress().
 */
export async function connectWallet(): Promise<string> {
  const allowed = await isAllowed();
  if (allowed.error) throw new Error(allowed.error.message);

  if (!allowed.isAllowed) {
    const granted = await setAllowed();
    if (granted.error) throw new Error(granted.error.message);
    if (!granted.isAllowed) throw new Error("Access to Freighter was rejected");
  }

  const access = await requestAccess();
  if (access.error) throw new Error(access.error.message);
  if (access.address) return access.address;

  // Fallback: pull the address explicitly if requestAccess didn't return one.
  const addr = await getAddress();
  if (addr.error) throw new Error(addr.error.message);
  if (!addr.address) throw new Error("Freighter returned no address");
  return addr.address;
}

/** Return the connected address if the app is already allowed, else null. */
export async function getWalletAddress(): Promise<string | null> {
  try {
    const allowed = await isAllowed();
    if (allowed.error || !allowed.isAllowed) return null;
    const addr = await getAddress();
    if (addr.error || !addr.address) return null;
    return addr.address;
  } catch {
    return null;
  }
}

/** Sign a transaction XDR with Freighter on the Stellar testnet. */
export async function signTx(xdr: string): Promise<string> {
  const result = await signTransaction(xdr, {
    networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
  });
  if (result.error) throw new Error(result.error.message);
  return result.signedTxXdr;
}

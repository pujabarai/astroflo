"use client";

import { useState, useCallback, useEffect } from "react";
import { NETWORK_PASSPHRASE } from "@/lib/constants";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      const { isConnected } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (connected) {
        const { getAddress } = await import("@stellar/freighter-api");
        const result = await getAddress();
        if (result.address) setAddress(result.address);
      }
    } catch {
      // Freighter not installed
    }
  }

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { isConnected, requestAccess, getAddress } = await import(
        "@stellar/freighter-api"
      );
      const connected = await isConnected();
      if (!connected) {
        throw new Error("Install Freighter wallet extension from freighter.app");
      }
      await requestAccess();
      const result = await getAddress();
      setAddress(result.address);
      return result.address;
    } finally {
      setConnecting(false);
    }
  }, []);

  const sign = useCallback(
    async (txXdr: string): Promise<string> => {
      if (!address) throw new Error("Wallet not connected");
      const { signTransaction } = await import("@stellar/freighter-api");
      const result = await signTransaction(txXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
      if ("error" in result) throw new Error(result.error);
      return (result as { signedTxXdr: string }).signedTxXdr;
    },
    [address]
  );

  const disconnect = useCallback(() => setAddress(null), []);

  return { address, connect, sign, disconnect, connecting };
}

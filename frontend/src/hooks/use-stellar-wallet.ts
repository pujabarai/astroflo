"use client";

import { useState, useEffect, useCallback } from "react";
import {
  detectFreighter,
  connectWallet,
  getWalletAddress,
  signTx,
} from "@/lib/stellar-wallet";
import {
  fetchXlmBalance,
  buildPaymentXdr,
  submitSignedTx,
} from "@/lib/stellar-payments";

/** Pull a readable message out of any error, including Horizon's result_codes. */
function errMessage(err: unknown): string {
  const e = err as {
    message?: string;
    response?: { data?: { extras?: { result_codes?: unknown } } };
  };
  const codes = e?.response?.data?.extras?.result_codes;
  if (codes) return `Transaction failed: ${JSON.stringify(codes)}`;
  if (e?.message) return e.message;
  return String(err);
}

export interface UseStellarWallet {
  address: string | null;
  balance: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  /** null = detection pending, false = not installed, true = available */
  hasFreighter: boolean | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  sendXlm: (to: string, amount: string) => Promise<{ hash: string }>;
}

export function useStellarWallet(): UseStellarWallet {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);

  const loadBalance = useCallback(async (addr: string) => {
    const bal = await fetchXlmBalance(addr);
    setBalance(bal);
  }, []);

  // Detect Freighter on mount and restore an already-authorized session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detected = await detectFreighter();
      if (cancelled) return;
      setHasFreighter(detected);
      if (!detected) return;
      const addr = await getWalletAddress();
      if (cancelled || !addr) return;
      setAddress(addr);
      try {
        await loadBalance(addr);
      } catch (e) {
        if (!cancelled) setError(errMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBalance]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detected = await detectFreighter();
      setHasFreighter(detected);
      if (!detected) {
        throw new Error(
          "Freighter not detected. Install it from https://freighter.app"
        );
      }
      const addr = await connectWallet();
      setAddress(addr);
      await loadBalance(addr);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [loadBalance]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setError(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);
    try {
      await loadBalance(address);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [address, loadBalance]);

  const sendXlm = useCallback(
    async (to: string, amount: string): Promise<{ hash: string }> => {
      if (!address) throw new Error("Connect your wallet first");
      setIsLoading(true);
      setError(null);
      try {
        const xdr = await buildPaymentXdr(address, to, amount);
        const signed = await signTx(xdr);
        const result = await submitSignedTx(signed);
        await loadBalance(address);
        return result;
      } catch (e) {
        const message = errMessage(e);
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [address, loadBalance]
  );

  return {
    address,
    balance,
    isConnected: !!address,
    isLoading,
    error,
    hasFreighter,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  };
}

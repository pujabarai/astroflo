"use client";

import { useWallet } from "@/hooks/useWallet";

export default function WalletButton() {
  const { address, connect, disconnect, connecting } = useWallet();

  if (address) {
    return (
      <button
        className="btn-primary"
        onClick={disconnect}
        style={{ padding: "10px 20px", fontSize: "14px" }}
      >
        Disconnect Wallet
      </button>
    );
  }

  return (
    <button
      className="btn-primary"
      onClick={connect}
      disabled={connecting}
      style={{ padding: "10px 20px", fontSize: "14px" }}
    >
      {connecting ? (
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="spinner" style={{ width: "14px", height: "14px" }} />
          Connecting...
        </span>
      ) : (
        "Connect Wallet"
      )}
    </button>
  );
}

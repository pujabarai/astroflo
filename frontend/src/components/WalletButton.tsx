"use client";

import { useWallet } from "@/hooks/useWallet";

export default function WalletButton() {
  const { address, connect, disconnect, connecting } = useWallet();

  const shortAddr = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : null;

  if (address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "10px",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div className="live-dot" />
          <span
            style={{
              color: "#a5b4fc",
              fontFamily: "monospace",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {shortAddr}
          </span>
        </div>
        <button
          onClick={disconnect}
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "10px",
            color: "#f87171",
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          Disconnect
        </button>
      </div>
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

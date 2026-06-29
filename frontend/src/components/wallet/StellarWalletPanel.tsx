"use client";

// Self-contained Freighter wallet panel (Stellar TESTNET):
// detect -> connect -> balance -> send XLM -> tx hash.
// The Freighter integration (detectFreighter / connectWallet / signTx from
// @/lib/stellar-wallet) is composed by the useStellarWallet hook below.
import { useState } from "react";
import { useStellarWallet } from "@/hooks/use-stellar-wallet";

const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx";

export default function StellarWalletPanel() {
  const {
    address,
    balance,
    isConnected,
    isLoading,
    error,
    hasFreighter,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  } = useStellarWallet();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setTxHash(null);
    setSendError(null);
    setSending(true);
    try {
      const { hash } = await sendXlm(to.trim(), amount.trim());
      setTxHash(hash);
      setTo("");
      setAmount("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const canSend =
    isConnected &&
    !sending &&
    to.trim().length > 0 &&
    Number(amount) > 0;

  return (
    <div className="glass-card" style={{ padding: 24, marginBottom: 32 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#e8eaf6" }}>
          Stellar Wallet — Freighter Integration
        </h2>
        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
          Detect · Connect · Balance · Send XLM on Stellar Testnet
        </p>
      </div>

      {/* Not installed */}
      {hasFreighter === false && (
        <div style={banner("#eab308")}>
          Freighter extension not detected.{" "}
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#a5b4fc", fontWeight: 600 }}
          >
            Install Freighter →
          </a>
        </div>
      )}

      {/* Not connected */}
      {!isConnected ? (
        <button
          className="btn-primary"
          onClick={connect}
          disabled={isLoading || hasFreighter === false}
          style={{ padding: "12px 24px", fontSize: 15 }}
        >
          {isLoading ? "Connecting…" : "Connect Wallet"}
        </button>
      ) : (
        <>
          {/* Address + balance */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 18 }}>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <Label>Connected Address</Label>
              <p
                style={{
                  color: "#a5b4fc",
                  fontFamily: "monospace",
                  fontSize: 13,
                  wordBreak: "break-all",
                  marginTop: 4,
                }}
              >
                {address}
              </p>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <Label>XLM Balance</Label>
              <p style={{ color: "#e8eaf6", fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                {balance !== null ? `${balance}` : "—"}{" "}
                <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>
                  XLM
                </span>
              </p>
              {balance === "0" && (
                <p style={{ color: "#eab308", fontSize: 11 }}>
                  Account not funded
                </p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button onClick={refreshBalance} disabled={isLoading} style={secondaryBtn}>
              {isLoading ? "Refreshing…" : "Refresh Balance"}
            </button>
            <button onClick={disconnect} style={dangerBtn}>
              Disconnect
            </button>
          </div>

          {/* Send form */}
          <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Label>Destination Address</Label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="G…"
                spellCheck={false}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Amount (XLM)</Label>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSend}
              style={{ padding: 14, fontSize: 15 }}
            >
              {sending ? "Sending…" : "Send XLM"}
            </button>
          </form>
        </>
      )}

      {/* Success banner */}
      {txHash && (
        <div style={banner("#22c55e")}>
          ✓ Transaction sent! Hash:{" "}
          <a
            href={`${EXPLORER_TX}/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#a5b4fc", fontFamily: "monospace", wordBreak: "break-all" }}
          >
            {txHash}
          </a>
        </div>
      )}

      {/* Error banners (send-specific, then hook-level) */}
      {sendError && <div style={banner("#ef4444")}>{sendError}</div>}
      {!sendError && error && <div style={banner("#ef4444")}>{error}</div>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>{children}</span>
  );
}

function banner(color: string): React.CSSProperties {
  return {
    marginTop: 16,
    padding: "12px 16px",
    borderRadius: 10,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    color,
    fontSize: 13,
    lineHeight: 1.5,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  background: "#0f1117",
  border: "1px solid rgba(99,102,241,0.2)",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#e8eaf6",
  fontSize: 14,
  fontFamily: "monospace",
  outline: "none",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid rgba(99,102,241,0.3)",
  background: "rgba(99,102,241,0.1)",
  color: "#a5b4fc",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const dangerBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.08)",
  color: "#f87171",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

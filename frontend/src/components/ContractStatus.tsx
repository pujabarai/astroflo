"use client";

// Demonstrates the contract.ts integration layer: reads live on-chain pool
// state (slot0 / fee / liquidity) directly from the deployed Soroban contract.
import { useEffect, useState } from "react";
import {
  readPoolSlot0,
  readPoolFee,
  readPoolLiquidity,
  CONTRACT_ID,
} from "@/lib/contract";

interface PoolState {
  tick: number;
  feePct: number;
  liquidity: string;
}

export default function ContractStatus() {
  const [state, setState] = useState<PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [slot0, fee, liquidity] = await Promise.all([
          readPoolSlot0(),
          readPoolFee(),
          readPoolLiquidity(),
        ]);
        if (cancelled) return;
        setState({
          tick: slot0?.tick ?? 0,
          feePct: fee / 10000, // 3000 → 0.3%
          liquidity: liquidity.toString(),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shortId = CONTRACT_ID
    ? `${CONTRACT_ID.slice(0, 6)}…${CONTRACT_ID.slice(-6)}`
    : "not configured";

  return (
    <div className="glass-card" style={{ padding: 20, marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span className="live-dot" />
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.12 0.01 60)" }}>
          On-chain Pool State
        </h2>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: "auto", color: "oklch(0.45 0.02 60)", fontFamily: "var(--font-jetbrains)", fontSize: 12 }}
        >
          {shortId} ↗
        </a>
      </div>

      {loading ? (
        <div
          style={{
            height: 48,
            borderRadius: 10,
            background: "oklch(0.12 0.01 60 / 0.06)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ) : error ? (
        <p style={{ color: "#f87171", fontSize: 13 }}>
          Failed to read contract: {error}
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          <Stat label="Current Tick" value={state!.tick.toString()} />
          <Stat label="Fee Tier" value={`${state!.feePct.toFixed(2)}%`} />
          <Stat
            label="Active Liquidity"
            value={state!.liquidity === "0" ? "—" : state!.liquidity}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: "oklch(0.45 0.02 60)", fontSize: 11, marginBottom: 3 }}>{label}</p>
      <p style={{ color: "oklch(0.12 0.01 60)", fontSize: 16, fontWeight: 700, fontFamily: "var(--font-jetbrains)" }}>
        {value}
      </p>
    </div>
  );
}

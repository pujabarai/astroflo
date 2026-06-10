"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { usePositions } from "@/hooks/usePositions";
import { usePool } from "@/hooks/usePool";
import PositionCard from "@/components/liquidity/PositionCard";
import { useQueryClient } from "@tanstack/react-query";

export default function LiquidityPage() {
  const { address, connect } = useWallet();
  const { data: positions, isLoading, refetch } = usePositions(address);
  const { data: pool } = usePool();
  const queryClient = useQueryClient();

  function handleRefresh() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["positions"] });
  }

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "40px 24px",
        background:
          "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.05) 0%, transparent 100%)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1
            className="gradient-text"
            style={{ fontSize: "28px", fontWeight: 800, marginBottom: "6px" }}
          >
            Liquidity
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>
            Provide liquidity to earn 0.3% trading fees
          </p>
        </div>
        <Link
          href="/liquidity/new"
          style={{ textDecoration: "none" }}
        >
          <button
            className="btn-primary"
            style={{ padding: "12px 24px", fontSize: "14px" }}
          >
            + Add Liquidity
          </button>
        </Link>
      </div>

      {/* Pool stats */}
      {pool && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
            marginBottom: "32px",
          }}
        >
          {[
            { label: "Current Price", value: `$${(1 / pool.currentPrice).toFixed(4)}`, sub: "USDC per XLM" },
            { label: "Current Tick", value: pool.tick.toString(), sub: "Pool tick index" },
            { label: "Active Liquidity", value: pool.liquidity > 0n ? "Active" : "No liquidity", sub: "0.3% fee tier" },
          ].map(({ label, value, sub }) => (
            <div
              key={label}
              style={{
                background: "rgba(26,29,46,0.7)",
                border: "1px solid rgba(99,102,241,0.12)",
                borderRadius: "12px",
                padding: "16px",
                textAlign: "center",
              }}
            >
              <p style={{ color: "#6b7280", fontSize: "12px", marginBottom: "6px" }}>
                {label}
              </p>
              <p style={{ color: "#e8eaf6", fontWeight: 700, fontSize: "18px" }}>
                {value}
              </p>
              <p style={{ color: "#4b5563", fontSize: "11px", marginTop: "4px" }}>
                {sub}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Positions */}
      {!address ? (
        <EmptyState
          title="Connect your wallet"
          desc="Connect Freighter wallet to view and manage your liquidity positions"
          action={<button className="btn-primary" onClick={connect} style={{ padding: "12px 24px" }}>Connect Wallet</button>}
        />
      ) : isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: "220px",
                background: "rgba(26,29,46,0.4)",
                border: "1px solid rgba(99,102,241,0.08)",
                borderRadius: "16px",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : positions && positions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {positions.map((p) => (
            <PositionCard key={p.id.toString()} position={p} onRefresh={handleRefresh} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No positions yet"
          desc="Add liquidity to the XLM/USDC pool to start earning fees"
          action={
            <Link href="/liquidity/new" style={{ textDecoration: "none" }}>
              <button className="btn-primary" style={{ padding: "12px 24px" }}>
                Add Liquidity
              </button>
            </Link>
          }
        />
      )}
    </div>
  );
}

function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        background: "rgba(26,29,46,0.4)",
        border: "1px solid rgba(99,102,241,0.1)",
        borderRadius: "16px",
      }}
    >
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>💧</div>
      <h2 style={{ color: "#e8eaf6", fontWeight: 700, marginBottom: "8px" }}>
        {title}
      </h2>
      <p style={{ color: "#6b7280", marginBottom: "24px" }}>{desc}</p>
      {action}
    </div>
  );
}

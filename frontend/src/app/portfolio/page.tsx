"use client";

import { useWallet } from "@/hooks/useWallet";
import { usePositions } from "@/hooks/usePositions";
import { usePool } from "@/hooks/usePool";
import SummaryCards from "@/components/portfolio/SummaryCards";
import ActivityFeed from "@/components/portfolio/ActivityFeed";
import PositionCard from "@/components/liquidity/PositionCard";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

export default function PortfolioPage() {
  const { address, connect } = useWallet();
  const { data: positions, isLoading, refetch } = usePositions(address);
  const { data: pool } = usePool();
  const queryClient = useQueryClient();

  function handleRefresh() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["positions"] });
  }

  if (!address) {
    return (
      <div
        style={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "20px" }}>🔒</div>
          <h2
            style={{ color: "#e8eaf6", fontSize: "22px", fontWeight: 700, marginBottom: "10px" }}
          >
            Connect Your Wallet
          </h2>
          <p style={{ color: "#6b7280", marginBottom: "24px" }}>
            View your positions, fees, and activity
          </p>
          <button
            className="btn-primary"
            onClick={connect}
            style={{ padding: "14px 32px", fontSize: "15px" }}
          >
            Connect Freighter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "40px 24px",
        background:
          "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.05) 0%, transparent 100%)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          className="gradient-text"
          style={{ fontSize: "28px", fontWeight: 800, marginBottom: "6px" }}
        >
          Portfolio
        </h1>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>
          {address.slice(0, 8)}...{address.slice(-6)}
        </p>
      </div>

      {/* Summary cards */}
      {positions && positions.length > 0 && (
        <SummaryCards positions={positions} />
      )}

      {/* Positions */}
      <div style={{ marginBottom: "40px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ color: "#e8eaf6", fontSize: "18px", fontWeight: 700 }}>
            Positions
          </h2>
          <Link href="/liquidity/new" style={{ textDecoration: "none" }}>
            <button
              className="btn-primary"
              style={{ padding: "8px 18px", fontSize: "13px" }}
            >
              + New Position
            </button>
          </Link>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: "200px",
                  background: "rgba(26,29,46,0.4)",
                  borderRadius: "16px",
                  animation: "pulse 1.5s infinite",
                }}
              />
            ))}
          </div>
        ) : positions && positions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {positions.map((p) => (
              <PositionCard
                key={p.id.toString()}
                position={p}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              background: "rgba(26,29,46,0.4)",
              border: "1px solid rgba(99,102,241,0.1)",
              borderRadius: "16px",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "14px" }}>📭</div>
            <p style={{ color: "#e8eaf6", fontWeight: 600, marginBottom: "6px" }}>
              No positions found
            </p>
            <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "20px" }}>
              Add liquidity to start earning fees
            </p>
            <Link href="/liquidity/new" style={{ textDecoration: "none" }}>
              <button
                className="btn-primary"
                style={{ padding: "12px 24px" }}
              >
                Add Liquidity
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Activity feed */}
      <div>
        <h2
          style={{
            color: "#e8eaf6",
            fontSize: "18px",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          Recent Activity
        </h2>
        <div
          className="glass-card"
          style={{ padding: "16px" }}
        >
          <ActivityFeed walletAddress={address} />
        </div>
      </div>
    </div>
  );
}

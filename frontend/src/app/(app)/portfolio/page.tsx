"use client";

import { useWallet } from "@/hooks/useWallet";
import { usePositions } from "@/hooks/usePositions";
import SummaryCards from "@/components/portfolio/SummaryCards";
import ActivityFeed from "@/components/portfolio/ActivityFeed";
import PositionCard from "@/components/liquidity/PositionCard";
import StellarWalletPanel from "@/components/wallet/StellarWalletPanel";
import ContractStatus from "@/components/ContractStatus";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

export default function PortfolioPage() {
  const { address, connect } = useWallet();
  const { data: positions, isLoading, refetch } = usePositions(address);
  const queryClient = useQueryClient();

  function handleRefresh() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["positions"] });
  }

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "40px 24px",
        background:
          "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.12 0.01 60 / 0.05) 0%, transparent 100%)",
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
        <p style={{ color: "oklch(0.45 0.02 60)", fontSize: "14px" }}>
          {address
            ? `${address.slice(0, 8)}...${address.slice(-6)}`
            : "Connect a wallet to view your positions, fees, and activity"}
        </p>
      </div>

      {/* Live on-chain pool state via the contract.ts read layer */}
      <ContractStatus />

      {/* Freighter wallet — detect · connect · balance · send XLM (Testnet) */}
      <StellarWalletPanel />

      {!address ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "oklch(0.94 0.005 90)",
            border: "1px solid oklch(0.12 0.01 60 / 0.1)",
            borderRadius: "16px",
          }}
        >
          <h2
            style={{ color: "oklch(0.12 0.01 60)", fontSize: "20px", fontWeight: 700, marginBottom: "10px" }}
          >
            Connect to view your positions
          </h2>
          <p style={{ color: "oklch(0.45 0.02 60)", marginBottom: "24px" }}>
            Your liquidity positions, fees, and activity will appear here.
          </p>
          <button
            className="btn-primary"
            onClick={connect}
            style={{ padding: "14px 32px", fontSize: "15px" }}
          >
            Connect Freighter
          </button>
        </div>
      ) : (
      <>
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
          <h2 style={{ color: "oklch(0.12 0.01 60)", fontSize: "18px", fontWeight: 700 }}>
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
                  background: "oklch(0.94 0.005 90)",
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
              background: "oklch(0.94 0.005 90)",
              border: "1px solid oklch(0.12 0.01 60 / 0.1)",
              borderRadius: "16px",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "14px" }}>📭</div>
            <p style={{ color: "oklch(0.12 0.01 60)", fontWeight: 600, marginBottom: "6px" }}>
              No positions found
            </p>
            <p style={{ color: "oklch(0.45 0.02 60)", fontSize: "14px", marginBottom: "20px" }}>
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
            color: "oklch(0.12 0.01 60)",
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
      </>
      )}
    </div>
  );
}

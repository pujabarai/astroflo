"use client";

import { Position } from "@/hooks/usePositions";
import { formatAmount, fromStroops } from "@/lib/math";
import { usePool } from "@/hooks/usePool";
import { usePrices } from "@/hooks/usePrices";
import { useWallet } from "@/hooks/useWallet";
import { buildCollectTx, buildDecreaseLiquidityTx } from "@/lib/transactions";
import { submitTransaction } from "@/lib/stellar";
import { useToast } from "@/components/Toast";
import { useState } from "react";

interface Props {
  position: Position;
  onRefresh: () => void;
}

export default function PositionCard({ position, onRefresh }: Props) {
  const { data: pool } = usePool();
  const { xlmUsd, usdcUsd } = usePrices();
  const { address, sign } = useWallet();
  const { addToast } = useToast();
  const [loading, setLoading] = useState<"collect" | "remove" | null>(null);

  // Pool: token_0 = USDC, token_1 = XLM
  const usdcValue = formatAmount(position.amount0, 7, 4);
  const xlmValue  = formatAmount(position.amount1, 7, 4);
  const feeUsdc   = formatAmount(position.tokensOwed0, 7, 4);
  const feeXlm    = formatAmount(position.tokensOwed1, 7, 4);

  // Use real CoinGecko USD prices for valuation
  const usdTotal = xlmUsd > 0
    ? parseFloat(fromStroops(position.amount0)) * usdcUsd +
      parseFloat(fromStroops(position.amount1)) * xlmUsd
    : 0;

  async function handleCollect() {
    if (!address || !sign) return;
    setLoading("collect");
    try {
      const xdr = await buildCollectTx(address, position.id, address);
      const signed = await sign(xdr);
      await submitTransaction(signed);
      addToast("Fees collected!", "success");
      onRefresh();
    } catch (err: unknown) {
      addToast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemove() {
    if (!address || !sign) return;
    setLoading("remove");
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const xdr = await buildDecreaseLiquidityTx(
        address,
        position.id,
        position.liquidity,
        0n,
        0n,
        deadline
      );
      const signed = await sign(xdr);
      await submitTransaction(signed);
      addToast("Liquidity removed! Collect your tokens.", "success");
      onRefresh();
    } catch (err: unknown) {
      addToast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      style={{
        background: "rgba(26,29,46,0.7)",
        border: "1px solid rgba(99,102,241,0.15)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor =
          "rgba(99,102,241,0.3)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor =
          "rgba(99,102,241,0.15)")
      }
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              background: "rgba(99,102,241,0.1)",
              borderRadius: "10px",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "18px" }}>⭐</span>
            <span style={{ color: "#9ca3af", fontSize: "14px" }}>/</span>
            <span style={{ fontSize: "18px" }}>💵</span>
          </div>
          <div>
            <p style={{ color: "#e8eaf6", fontWeight: 700, fontSize: "15px" }}>
              XLM / USDC
            </p>
            <p style={{ color: "#6b7280", fontSize: "12px" }}>
              Position #{position.id.toString()}
            </p>
          </div>
        </div>
        <span
          className={position.inRange ? "badge-in-range" : "badge-out-range"}
        >
          {position.inRange ? "✓ In Range" : "⚠ Out of Range"}
        </span>
      </div>

      {/* Price range */}
      <div
        style={{
          background: "rgba(99,102,241,0.05)",
          border: "1px solid rgba(99,102,241,0.1)",
          borderRadius: "10px",
          padding: "12px 16px",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: "11px", marginBottom: "6px" }}>
          PRICE RANGE (USDC per XLM)
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <p style={{ color: "#9ca3af", fontSize: "11px" }}>Min</p>
            <p style={{ color: "#e8eaf6", fontWeight: 600 }}>
              ${(1 / position.priceUpper).toFixed(4)}
            </p>
          </div>
          <div style={{ color: "#6b7280" }}>→</div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "#9ca3af", fontSize: "11px" }}>Max</p>
            <p style={{ color: "#e8eaf6", fontWeight: 600 }}>
              ${(1 / position.priceLower).toFixed(4)}
            </p>
          </div>
        </div>
        {pool && (
          <div style={{ marginTop: "8px", textAlign: "center" }}>
            <span style={{ color: "#a5b4fc", fontSize: "12px" }}>
              Current: ${(1 / pool.currentPrice).toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* Token amounts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <TokenAmount symbol="USDC" logo="💵" amount={usdcValue} />
        <TokenAmount symbol="XLM"  logo="⭐" amount={xlmValue} />
      </div>

      {/* USD value */}
      {usdTotal > 0 && (
        <p style={{ color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
          Total Value ≈{" "}
          <span style={{ color: "#a5b4fc", fontWeight: 600 }}>
            ${usdTotal.toFixed(2)}
          </span>
        </p>
      )}

      {/* Fees */}
      {(position.tokensOwed0 > 0n || position.tokensOwed1 > 0n) && (
        <div
          style={{
            background: "rgba(34,197,94,0.05)",
            border: "1px solid rgba(34,197,94,0.15)",
            borderRadius: "10px",
            padding: "12px 16px",
          }}
        >
          <p
            style={{ color: "#22c55e", fontSize: "12px", marginBottom: "6px", fontWeight: 600 }}
          >
            Uncollected Fees
          </p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              {feeUsdc} USDC
            </span>
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>
              {feeXlm} XLM
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={handleCollect}
          disabled={
            loading !== null ||
            (position.tokensOwed0 === 0n && position.tokensOwed1 === 0n)
          }
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.1)",
            color: "#22c55e",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            opacity:
              loading !== null ||
              (position.tokensOwed0 === 0n && position.tokensOwed1 === 0n)
                ? 0.4
                : 1,
          }}
        >
          {loading === "collect" ? "Collecting..." : "Collect Fees"}
        </button>
        <button
          onClick={handleRemove}
          disabled={loading !== null}
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
            color: "#f87171",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            opacity: loading !== null ? 0.4 : 1,
          }}
        >
          {loading === "remove" ? "Removing..." : "Remove"}
        </button>
      </div>
    </div>
  );
}

function TokenAmount({
  symbol,
  logo,
  amount,
}: {
  symbol: string;
  logo: string;
  amount: string;
}) {
  return (
    <div
      style={{
        background: "rgba(99,102,241,0.05)",
        border: "1px solid rgba(99,102,241,0.1)",
        borderRadius: "10px",
        padding: "12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "4px",
        }}
      >
        <span>{logo}</span>
        <span style={{ color: "#9ca3af", fontSize: "12px" }}>{symbol}</span>
      </div>
      <p style={{ color: "#e8eaf6", fontWeight: 600, fontSize: "15px" }}>
        {amount}
      </p>
    </div>
  );
}

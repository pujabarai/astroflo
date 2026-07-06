"use client";

import { Position } from "@/hooks/usePositions";
import { fromStroops } from "@/lib/math";
import { usePrices } from "@/hooks/usePrices";

interface Props {
  positions: Position[];
}

export default function SummaryCards({ positions }: Props) {
  const { xlmUsd, usdcUsd } = usePrices();

  // Use real CoinGecko USD prices: token_0 = USDC, token_1 = XLM
  const totalValueUsd = positions.reduce((acc, p) => {
    const usdc = parseFloat(fromStroops(p.amount0)) * usdcUsd;
    const xlm  = parseFloat(fromStroops(p.amount1)) * xlmUsd;
    return acc + usdc + xlm;
  }, 0);

  const totalFees0 = positions.reduce((acc, p) => acc + p.tokensOwed0, 0n);
  const totalFees1 = positions.reduce((acc, p) => acc + p.tokensOwed1, 0n);
  const totalFeesUsd =
    parseFloat(fromStroops(totalFees0)) * usdcUsd +
    parseFloat(fromStroops(totalFees1)) * xlmUsd;

  const inRangeCount = positions.filter((p) => p.inRange).length;

  const cards = [
    {
      label: "Total Position Value",
      value: `$${totalValueUsd.toFixed(2)}`,
      sub: `${positions.length} position${positions.length !== 1 ? "s" : ""}`,
      color: "oklch(0.12 0.01 60)",
      icon: "💼",
    },
    {
      label: "Uncollected Fees",
      value: `$${totalFeesUsd.toFixed(4)}`,
      sub: `${fromStroops(totalFees0, 7)} USDC + ${fromStroops(totalFees1, 7)} XLM`,
      color: "#22c55e",
      icon: "💰",
    },
    {
      label: "Active Positions",
      value: `${inRangeCount} / ${positions.length}`,
      sub: "Currently in range",
      color: inRangeCount === positions.length ? "#22c55e" : "#eab308",
      icon: "📊",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}
    >
      {cards.map(({ label, value, sub, color, icon }) => (
        <div
          key={label}
          style={{
            background: "oklch(1 0 0)",
            border: "1px solid oklch(0.12 0.01 60 / 0.12)",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "12px",
            }}
          >
            <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "13px" }}>{label}</span>
            <span style={{ fontSize: "24px" }}>{icon}</span>
          </div>
          <p style={{ color, fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
            {value}
          </p>
          <p style={{ color: "oklch(0.6 0.02 60)", fontSize: "12px" }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}

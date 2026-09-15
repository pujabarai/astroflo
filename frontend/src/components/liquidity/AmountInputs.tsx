"use client";

import { usePrices } from "@/hooks/usePrices";
import { toUsd, formatUsd } from "@/lib/math";

interface Props {
  amount0: string;
  amount1: string;
  onAmount0Change: (v: string) => void;
  onAmount1Change: (v: string) => void;
  // price0Only: price BELOW tickLower → pool position is 100% USDC (token_0); XLM (amount0) = 0
  price0Only: boolean;
  // price1Only: price ABOVE tickUpper → pool position is 100% XLM (token_1); USDC (amount1) = 0
  price1Only: boolean;
}

export default function AmountInputs({
  amount0,
  amount1,
  onAmount0Change,
  onAmount1Change,
  price0Only,
  price1Only,
}: Props) {
  const prices = usePrices();

  const xlmUsd = toUsd(parseFloat(amount0) || 0, "xlm", prices);
  const usdcUsd = toUsd(parseFloat(amount1) || 0, "usdc", prices);
  const totalUsd = xlmUsd + usdcUsd;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ color: "oklch(0.45 0.02 60)", fontSize: "12px", fontWeight: 600 }}>
        DEPOSIT AMOUNTS
      </p>

      {/* Out-of-range notice */}
      {(price0Only || price1Only) && (
        <div
          style={{
            background: "rgba(234,179,8,0.08)",
            border: "1px solid rgba(234,179,8,0.25)",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "12px",
            color: "#ca8a04",
            lineHeight: 1.5,
          }}
        >
          {price1Only ? (
            <>
              <strong>Price is below your range.</strong> Your deposit will be
              100% XLM. You will earn fees when price rises back into your range.
            </>
          ) : (
            <>
              <strong>Price is above your range.</strong> Your deposit will be
              100% USDC. You will earn fees when price falls back into your range.
            </>
          )}
        </div>
      )}

      {/* Token 0 — XLM */}
      {/* Disabled when price0Only (below range): XLM contribution is 0 */}
      <div
        style={{
          background: "oklch(0.92 0.01 90)",
          border: `1px solid ${price0Only ? "oklch(0.12 0.01 60 / 0.05)" : "oklch(0.12 0.01 60 / 0.15)"}`,
          borderRadius: "12px",
          padding: "16px",
          opacity: price0Only ? 0.4 : 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "12px" }}>XLM Amount</span>
          {price0Only && (
            <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "11px" }}>
              Price above range — no XLM needed
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              background: "oklch(0.12 0.01 60 / 0.08)",
              border: "1px solid oklch(0.12 0.01 60 / 0.15)",
              borderRadius: "8px",
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <img src="/tokens/xlm.png" alt="XLM" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
            <span style={{ color: "oklch(0.12 0.01 60)", fontWeight: 700, fontSize: "14px" }}>
              XLM
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount0}
            onChange={(e) => onAmount0Change(e.target.value)}
            disabled={price0Only}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "oklch(0.12 0.01 60)",
              fontSize: "20px",
              fontWeight: 600,
              textAlign: "right",
              fontFamily: "var(--font-jetbrains)",
            }}
          />
        </div>
        {xlmUsd > 0 && !price0Only && (
          <p style={{ color: "oklch(0.45 0.02 60)", fontSize: "11px", textAlign: "right", marginTop: "4px" }}>
            ≈ {formatUsd(xlmUsd)}
          </p>
        )}
      </div>

      {/* Token 1 — USDC */}
      {/* Disabled when price1Only (above range): USDC contribution is 0 */}
      <div
        style={{
          background: "oklch(0.92 0.01 90)",
          border: `1px solid ${price1Only ? "oklch(0.12 0.01 60 / 0.05)" : "oklch(0.12 0.01 60 / 0.15)"}`,
          borderRadius: "12px",
          padding: "16px",
          opacity: price1Only ? 0.4 : 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "12px" }}>USDC Amount</span>
          {price1Only && (
            <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "11px" }}>
              Price below range — no USDC needed
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              background: "oklch(0.12 0.01 60 / 0.08)",
              border: "1px solid oklch(0.12 0.01 60 / 0.15)",
              borderRadius: "8px",
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              whiteSpace: "nowrap",
            }}
          >
            <img src="/tokens/usdc.png" alt="USDC" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
            <span style={{ color: "oklch(0.12 0.01 60)", fontWeight: 700, fontSize: "14px" }}>
              USDC
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount1}
            onChange={(e) => onAmount1Change(e.target.value)}
            disabled={price1Only}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "oklch(0.12 0.01 60)",
              fontSize: "20px",
              fontWeight: 600,
              textAlign: "right",
              fontFamily: "var(--font-jetbrains)",
            }}
          />
        </div>
        {usdcUsd > 0 && !price1Only && (
          <p style={{ color: "oklch(0.45 0.02 60)", fontSize: "11px", textAlign: "right", marginTop: "4px" }}>
            ≈ {formatUsd(usdcUsd)}
          </p>
        )}
      </div>

      {/* Total deposit value */}
      {totalUsd > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "oklch(0.45 0.02 60)",
            padding: "0 4px",
          }}
        >
          <span>Total deposit value</span>
          <span style={{ color: "oklch(0.12 0.01 60)", fontWeight: 600 }}>{formatUsd(totalUsd)}</span>
        </div>
      )}
    </div>
  );
}

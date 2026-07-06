"use client";

import { ChevronDown } from "lucide-react";

interface Token {
  symbol: string;
  name: string;
  logo: string; // image path
}

interface Props {
  token: Token;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  label: string;
  usdValue?: string;
  loading?: boolean;
}

export default function TokenInputBox({
  token,
  value,
  onChange,
  readOnly = false,
  label,
  usdValue,
  loading,
}: Props) {
  return (
    <div
      style={{
        background: "oklch(0.96 0.005 90)",
        borderRadius: "28px",
        padding: "24px 28px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-instrument)",
          fontSize: "22px",
          color: "oklch(0.12 0.01 60)",
          marginBottom: "18px",
        }}
      >
        {label}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        {/* Amount */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", height: "56px" }}>
              <div className="spinner" style={{ width: "22px", height: "22px" }} />
            </div>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              readOnly={readOnly}
              className="swap-amount-input"
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "oklch(0.12 0.01 60)",
                fontFamily: "var(--font-instrument)",
                fontSize: "56px",
                lineHeight: 1,
              }}
            />
          )}
          <p
            style={{
              color: "oklch(0.55 0.02 60)",
              fontSize: "15px",
              marginTop: "10px",
            }}
          >
            ${usdValue ?? "0"}
          </p>
        </div>

        {/* Token pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "oklch(1 0 0)",
            border: "1px solid oklch(0.12 0.01 60 / 0.06)",
            boxShadow: "0 1px 3px oklch(0.12 0.01 60 / 0.08)",
            borderRadius: "9999px",
            padding: "10px 18px 10px 10px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <img
            src={token.logo}
            alt={token.symbol}
            width={32}
            height={32}
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
          <span
            style={{
              color: "oklch(0.12 0.01 60)",
              fontWeight: 600,
              fontSize: "17px",
              fontFamily: "var(--font-instrument)",
            }}
          >
            {token.symbol}
          </span>
          <ChevronDown size={16} style={{ color: "oklch(0.45 0.02 60)" }} />
        </div>
      </div>
    </div>
  );
}

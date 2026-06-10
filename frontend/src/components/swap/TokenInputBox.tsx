"use client";

interface Token {
  symbol: string;
  name: string;
  logo: string;
}

interface Props {
  token: Token;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  label: string;
  balance?: string;
  usdValue?: string;
  loading?: boolean;
  onMax?: () => void;
}

export default function TokenInputBox({
  token,
  value,
  onChange,
  readOnly = false,
  label,
  balance,
  usdValue,
  loading,
  onMax,
}: Props) {
  return (
    <div className="token-input">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <span style={{ color: "#6b7280", fontSize: "12px", fontWeight: 600 }}>
          {label}
        </span>
        {balance !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#6b7280", fontSize: "12px" }}>
              Balance: {balance} {token.symbol}
            </span>
            {onMax && (
              <button
                onClick={onMax}
                style={{
                  background: "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: "4px",
                  color: "#a5b4fc",
                  fontSize: "11px",
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                MAX
              </button>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        {/* Token badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: "10px",
            padding: "8px 14px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "22px" }}>{token.logo}</span>
          <div>
            <p style={{ color: "#e8eaf6", fontWeight: 700, fontSize: "15px" }}>
              {token.symbol}
            </p>
            <p style={{ color: "#6b7280", fontSize: "11px" }}>{token.name}</p>
          </div>
        </div>

        {/* Amount input */}
        <div style={{ flex: 1, textAlign: "right" }}>
          {loading ? (
            <div
              style={{
                height: "36px",
                background: "rgba(99,102,241,0.05)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "8px",
              }}
            >
              <div className="spinner" style={{ width: "16px", height: "16px" }} />
            </div>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              readOnly={readOnly}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: readOnly ? "#9ca3af" : "#e8eaf6",
                fontSize: "24px",
                fontWeight: 600,
                textAlign: "right",
                fontFamily: "monospace",
              }}
            />
          )}
          {usdValue && (
            <p
              style={{
                color: "#6b7280",
                fontSize: "12px",
                marginTop: "4px",
                textAlign: "right",
              }}
            >
              ≈ ${usdValue}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

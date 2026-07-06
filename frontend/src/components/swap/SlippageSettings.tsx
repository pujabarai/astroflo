"use client";

import { useState } from "react";
import { SLIPPAGE_PRESETS } from "@/lib/constants";

interface Props {
  slippage: number;
  onChange: (v: number) => void;
  trigger?: React.ReactNode;
}

export default function SlippageSettings({ slippage, onChange, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <div style={{ position: "relative" }}>
      <div onClick={() => setOpen((o) => !o)}>
        {trigger ?? (
          <button
            style={{
              background: "oklch(0.12 0.01 60 / 0.08)",
              border: "1px solid oklch(0.12 0.01 60 / 0.2)",
              borderRadius: "8px",
              color: "oklch(0.45 0.02 60)",
              padding: "6px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
            }}
            title="Slippage settings"
          >
            <span>⚙</span>
            <span style={{ color: "oklch(0.12 0.01 60)" }}>{slippage}%</span>
          </button>
        )}
      </div>

      {open && (
        <div
          className="slippage-panel"
          style={{
            background: "oklch(1 0 0)",
            border: "1px solid oklch(0.12 0.01 60 / 0.1)",
            borderRadius: "12px",
            padding: "16px",
            width: "240px",
            maxWidth: "calc(100vw - 32px)",
            boxShadow: "0 8px 24px oklch(0.12 0.01 60 / 0.12)",
            zIndex: 100,
          }}
        >
          <p
            style={{
              color: "oklch(0.45 0.02 60)",
              fontSize: "12px",
              marginBottom: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Slippage Tolerance
          </p>
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
            {SLIPPAGE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  onChange(p);
                  setCustom("");
                }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor:
                    slippage === p
                      ? "oklch(0.12 0.01 60 / 0.6)"
                      : "oklch(0.12 0.01 60 / 0.15)",
                  background:
                    slippage === p
                      ? "oklch(0.12 0.01 60 / 0.2)"
                      : "transparent",
                  color: slippage === p ? "oklch(0.12 0.01 60)" : "oklch(0.45 0.02 60)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {p}%
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "oklch(0.92 0.01 90)",
              border: "1px solid oklch(0.12 0.01 60 / 0.15)",
              borderRadius: "8px",
              padding: "8px 12px",
              gap: "6px",
            }}
          >
            <input
              type="number"
              placeholder="Custom"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0 && v <= 50) onChange(v);
              }}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "oklch(0.12 0.01 60)",
                fontSize: "13px",
              }}
            />
            <span style={{ color: "oklch(0.45 0.02 60)", fontSize: "13px" }}>%</span>
          </div>
          {slippage > 1 && (
            <p style={{ color: "#eab308", fontSize: "11px", marginTop: "8px" }}>
              ⚠ High slippage — you may receive a bad rate
            </p>
          )}
        </div>
      )}
    </div>
  );
}

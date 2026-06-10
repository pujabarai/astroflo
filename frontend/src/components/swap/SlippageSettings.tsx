"use client";

import { useState } from "react";
import { SLIPPAGE_PRESETS } from "@/lib/constants";

interface Props {
  slippage: number;
  onChange: (v: number) => void;
}

export default function SlippageSettings({ slippage, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: "8px",
          color: "#9ca3af",
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
        <span style={{ color: "#a5b4fc" }}>{slippage}%</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "#1a1d2e",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "12px",
            padding: "16px",
            width: "240px",
            zIndex: 100,
          }}
        >
          <p
            style={{
              color: "#9ca3af",
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
                      ? "rgba(99,102,241,0.6)"
                      : "rgba(99,102,241,0.15)",
                  background:
                    slippage === p
                      ? "rgba(99,102,241,0.2)"
                      : "transparent",
                  color: slippage === p ? "#a5b4fc" : "#9ca3af",
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
              background: "#0f1117",
              border: "1px solid rgba(99,102,241,0.15)",
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
                color: "#e8eaf6",
                fontSize: "13px",
              }}
            />
            <span style={{ color: "#9ca3af", fontSize: "13px" }}>%</span>
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

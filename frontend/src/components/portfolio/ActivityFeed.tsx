"use client";

import { useEffect, useState } from "react";
import { HORIZON_URL } from "@/lib/constants";

interface HorizonEffect {
  id: string;
  type: string;
  created_at: string;
  [key: string]: unknown;
}

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityFeed({ walletAddress }: { walletAddress: string }) {
  const [effects, setEffects] = useState<HorizonEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;

    async function fetchEffects() {
      try {
        const url = `${HORIZON_URL}/accounts/${walletAddress}/effects?limit=20&order=desc`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { _embedded: { records: HorizonEffect[] } };
        setEffects(data._embedded?.records ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load activity");
      } finally {
        setLoading(false);
      }
    }

    fetchEffects();
  }, [walletAddress]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: "56px",
              background: "rgba(26,29,46,0.4)",
              borderRadius: "10px",
              animation: "pulse 1.5s infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          color: "#6b7280",
          fontSize: "14px",
          textAlign: "center",
          padding: "24px",
        }}
      >
        Could not load activity: {error}
      </div>
    );
  }

  if (effects.length === 0) {
    return (
      <div
        style={{
          color: "#6b7280",
          fontSize: "14px",
          textAlign: "center",
          padding: "24px",
        }}
      >
        No activity yet
      </div>
    );
  }

  const icons: Record<string, string> = {
    account_credited: "⬇",
    account_debited: "⬆",
    contract_credited: "💠",
    contract_debited: "💠",
    account_created: "✨",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {effects.map((effect) => (
        <div
          key={effect.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            background: "rgba(26,29,46,0.4)",
            border: "1px solid rgba(99,102,241,0.08)",
            borderRadius: "10px",
          }}
        >
          <span style={{ fontSize: "18px", flexShrink: 0 }}>
            {icons[effect.type] ?? "⭕"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                color: "#e8eaf6",
                fontSize: "13px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {formatType(effect.type)}
            </p>
            <p style={{ color: "#6b7280", fontSize: "11px" }}>
              {timeAgo(effect.created_at)}
            </p>
          </div>
          {"amount" in effect && effect.amount ? (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 600 }}>
                {String(effect.amount)}{" "}
                <span style={{ color: "#6b7280" }}>
                  {String(("asset_code" in effect && effect.asset_code) ? effect.asset_code : "XLM")}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

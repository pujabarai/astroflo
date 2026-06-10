"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "./WalletButton";
import { usePool } from "@/hooks/usePool";

const LINKS = [
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { data: pool } = usePool();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid rgba(99,102,241,0.12)",
        backdropFilter: "blur(20px)",
        background: "rgba(13,14,20,0.85)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 24px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link
          href="/swap"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              fontWeight: "bold",
              color: "white",
            }}
          >
            ✦
          </div>
          <span
            className="gradient-text"
            style={{ fontWeight: 700, fontSize: "18px" }}
          >
            AstroFlo
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", gap: "4px" }}>
          {LINKS.map(({ href, label }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${isActive ? "active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right: price + wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {pool && (
            <div
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: "8px",
                padding: "4px 12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                XLM/USDC
              </span>
              <span
                style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 600 }}
              >
                ${pool.currentPrice.toFixed(4)}
              </span>
            </div>
          )}
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}

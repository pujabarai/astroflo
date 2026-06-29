"use client";

import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

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
        className="nav-inner"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
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

        {/* Nav links (desktop) */}
        <div className="nav-links" style={{ display: "flex", gap: "4px" }}>
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${isActive(href) ? "active" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right: price + wallet + hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {pool && (
            <div
              className="nav-price"
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
          <button
            className="nav-hamburger"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="nav-mobile-menu">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${isActive(href) ? "active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

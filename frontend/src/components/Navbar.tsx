"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import WalletButton from "./WalletButton";

const LINKS = [
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-50">
      <nav className="mx-auto bg-background/85 backdrop-blur-xl border-b border-foreground/10 max-w-none">
        <div className="flex items-center justify-between px-6 lg:px-8 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center ml-3">
            <img src="/brand/astroflo-logo.png" alt="AstroFlo" className="h-8 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
            {LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm transition-colors duration-300 relative group ${
                    active ? "text-foreground font-medium" : "text-foreground/70 hover:text-foreground"
                  }`}
                >
                  {label}
                  <span
                    className={`absolute -bottom-1 left-0 h-px bg-foreground transition-all duration-300 ${
                      active ? "w-full" : "w-0 group-hover:w-full"
                    }`}
                  />
                </Link>
              );
            })}
          </div>

          {/* Right: wallet + hamburger */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <WalletButton />
            </div>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden p-2"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu — compact dropdown below the nav, not a full-page overlay */}
      <div
        className={`md:hidden overflow-hidden bg-background border-b border-foreground/10 transition-[max-height] duration-300 ease-in-out ${
          menuOpen ? "max-h-96" : "max-h-0 border-b-0"
        }`}
      >
        <div className="flex flex-col px-6 py-4 gap-1">
          {LINKS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`text-base py-2.5 transition-colors duration-300 ${
                  active ? "text-foreground font-medium" : "text-foreground/70"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="pt-3 mt-2 border-t border-foreground/10">
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}

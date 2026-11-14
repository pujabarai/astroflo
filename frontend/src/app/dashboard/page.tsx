"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Repeat, Droplets } from "lucide-react";
import { simulateContractRead, parseSlot0, parseU128 } from "@/lib/stellar";
import { POOL_ADDRESS } from "@/lib/constants";

// ── Types matching scripts/loadtest.mjs feed ──────────────────────────
type Tx = {
  ts: number;
  kind: "swap" | "mint";
  wallet: string;
  walletShort: string;
  hash: string;
  direction?: string;
  xlmAmount?: number | null;
  usdcAmount?: number | null;
  priceUsdcPerXlm?: number | null;
  liquidity?: string;
};
type Feed = {
  startedAt: string;
  updatedAt: string;
  finished?: boolean;
  pool: string;
  targetSwaps: number;
  counts: { swaps: number; mints: number; total: number };
  volumeXlm: number;
  transactions: Tx[];
};

const Q64 = 2n ** 64n;
const EXPLORER = "https://stellar.expert/explorer/testnet";

// Live pool sqrtPriceX64 → USDC per XLM (price token_1/token_0 = XLM/USDC, invert).
function sqrtPriceX64ToUsdcPerXlm(sqrtPriceX64: bigint): number {
  const s = Number(sqrtPriceX64) / Number(Q64);
  const xlmPerUsdc = s * s;
  return xlmPerUsdc > 0 ? 1 / xlmPerUsdc : 0;
}

function useFeed(pollMs = 4000) {
  const [feed, setFeed] = useState<Feed | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/loadtest-feed.json?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok && alive) setFeed(await r.json());
      } catch {
        /* feed not written yet */
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);
  return feed;
}

function useLivePool(pollMs = 6000) {
  const [state, setState] = useState<{ price: number; tick: number; liquidity: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s0 = await simulateContractRead(POOL_ADDRESS, "slot0", []);
        const liqSc = await simulateContractRead(POOL_ADDRESS, "liquidity", []);
        if (!s0 || !alive) return;
        const slot0 = parseSlot0(s0);
        const liq = liqSc ? parseU128(liqSc) : 0n;
        setState({
          price: sqrtPriceX64ToUsdcPerXlm(slot0.sqrtPriceX64),
          tick: slot0.tick,
          liquidity: Number(liq),
        });
      } catch {
        /* transient RPC error */
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);
  return state;
}

// ── UI atoms (landing-page visual language) ───────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
      <span className="w-8 h-px bg-foreground/30" />
      {children}
    </span>
  );
}

function Metric({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-background p-8 lg:p-10">
      <div className="text-5xl lg:text-6xl font-display tracking-tight tabular-nums">{value}</div>
      <div className="mt-3 text-base text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 font-mono text-xs text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

// Hand-rolled area/line chart — no external libs (self-contained, on-theme).
function PriceChart({ points }: { points: { ts: number; p: number }[] }) {
  const w = 1000;
  const h = 260;
  const pad = 16;
  if (points.length < 2) {
    return (
      <div className="h-[260px] flex items-center justify-center font-mono text-sm text-muted-foreground">
        waiting for price data…
      </div>
    );
  }
  const ps = points.map((d) => d.p);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const span = max - min || max || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (p: number) => pad + (1 - (p - min) / span) * (h - pad * 2);
  const line = points.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  const last = points[points.length - 1].p;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[260px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="currentColor" strokeOpacity="0.08" />
      ))}
      <path d={area} fill="url(#pfill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(last)} r="3" fill="currentColor" />
    </svg>
  );
}

function DirectionBadge({ tx }: { tx: Tx }) {
  if (tx.kind === "mint") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <Droplets className="w-3.5 h-3.5" /> add-liquidity
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <Repeat className="w-3.5 h-3.5" /> {tx.direction}
    </span>
  );
}

export default function DashboardPage() {
  const feed = useFeed();
  const pool = useLivePool();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    setNow(new Date());
    return () => clearInterval(id);
  }, []);

  const txs = feed?.transactions ?? [];
  const swaps = useMemo(() => txs.filter((t) => t.kind === "swap"), [txs]);
  const mints = useMemo(() => txs.filter((t) => t.kind === "mint"), [txs]);
  const wallets = useMemo(() => new Set(txs.map((t) => t.wallet)).size, [txs]);
  const usdcVolume = useMemo(() => swaps.reduce((a, t) => a + (t.usdcAmount || 0), 0), [swaps]);
  const pricePoints = useMemo(
    () => swaps.filter((t) => t.priceUsdcPerXlm != null).map((t) => ({ ts: t.ts, p: t.priceUsdcPerXlm as number })),
    [swaps]
  );
  const recent = useMemo(() => [...txs].sort((a, b) => b.ts - a.ts).slice(0, 25), [txs]);

  const target = feed?.targetSwaps ?? 200;
  const pct = Math.min(100, Math.round((swaps.length / target) * 100));
  const running = feed && !feed.finished;

  // Grid-line backdrop like the hero.
  const grid = (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.35]">
      {[...Array(6)].map((_, i) => (
        <div key={`h${i}`} className="absolute h-px bg-foreground/10" style={{ top: `${(100 / 7) * (i + 1)}%`, left: 0, right: 0 }} />
      ))}
    </div>
  );

  return (
    <main data-landing className="relative min-h-screen overflow-x-hidden noise-overlay">
      {grid}
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-14">
          <div>
            <div className="mb-6">
              <Eyebrow>Live testnet activity · XLM / USDC · 0.3%</Eyebrow>
            </div>
            <h1 className="text-5xl lg:text-7xl font-display tracking-tight leading-[0.95]">
              Real transactions,
              <br />
              measured live.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Every number below comes from real swaps and liquidity adds executed on the deployed AstroFlo pool on
              Stellar testnet — no mock data.
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-foreground/40"}`} />
              {running ? "Running" : "Live"}
            </span>
            <span className="text-foreground/30">|</span>
            <span>{now ? now.toLocaleTimeString() : "--:--:--"}</span>
          </div>
        </div>

        {/* Progress toward target */}
        <div className="mb-14">
          <div className="flex items-baseline justify-between font-mono text-xs text-muted-foreground mb-2">
            <span>SWAP PROGRESS</span>
            <span>
              {swaps.length} / {target} {running ? "· in progress" : "· complete"}
            </span>
          </div>
          <div className="h-1.5 w-full bg-foreground/10 overflow-hidden">
            <div className="h-full bg-foreground transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Metrics grid — hairline dividers */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 mb-16">
          <Metric value={swaps.length.toLocaleString()} label="Swaps executed" sub="pool.swap" />
          <Metric value={mints.length.toLocaleString()} label="Liquidity adds" sub="position_manager.mint" />
          <Metric value={wallets.toLocaleString()} label="Active wallets" sub="friendbot-funded" />
          <Metric value={`${feed ? Math.round(feed.volumeXlm).toLocaleString() : "0"}`} label="Volume (XLM)" sub={`${usdcVolume.toFixed(1)} USDC`} />
          <Metric value={pool ? pool.price.toFixed(5) : "—"} label="Live price (USDC/XLM)" sub={pool ? `tick ${pool.tick}` : "polling…"} />
          <Metric value={pool ? (pool.liquidity / 1e9).toFixed(1) + "B" : "—"} label="Pool liquidity (L)" sub="on-chain now" />
        </div>

        {/* Price chart */}
        <div className="border border-foreground/10 mb-16">
          <div className="flex items-center justify-between px-8 pt-6">
            <Eyebrow>Execution price · USDC per XLM</Eyebrow>
            <span className="font-mono text-xs text-muted-foreground">{pricePoints.length} prints</span>
          </div>
          <div className="px-4 pb-4 text-foreground">
            <PriceChart points={pricePoints} />
          </div>
        </div>

        {/* Live transaction feed */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <Eyebrow>Transaction feed · newest first</Eyebrow>
            <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-foreground/40"}`} />
              auto-refresh 4s
            </span>
          </div>
          <div className="border border-foreground/10 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-foreground/10 font-mono text-xs text-muted-foreground text-left">
                  <th className="font-normal px-6 py-3">Time</th>
                  <th className="font-normal px-6 py-3">Type</th>
                  <th className="font-normal px-6 py-3 text-right">Amount</th>
                  <th className="font-normal px-6 py-3 text-right">Price</th>
                  <th className="font-normal px-6 py-3">Wallet</th>
                  <th className="font-normal px-6 py-3 text-right">Tx</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center font-mono text-sm text-muted-foreground">
                      waiting for the first transaction…
                    </td>
                  </tr>
                )}
                {recent.map((t) => (
                  <tr key={t.hash} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                    <td className="px-6 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.ts).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-3">
                      <DirectionBadge tx={t} />
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums whitespace-nowrap">
                      {t.kind === "swap"
                        ? `${t.xlmAmount?.toFixed(2)} XLM → ${t.usdcAmount?.toFixed(3)} USDC`
                        : `L=${(Number(t.liquidity) / 1e9).toFixed(1)}B`}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {t.priceUsdcPerXlm != null ? t.priceUsdcPerXlm.toFixed(5) : "—"}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      <a href={`${EXPLORER}/account/${t.wallet}`} target="_blank" rel="noreferrer" className="hover:underline">
                        {t.walletShort}
                      </a>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <a
                        href={`${EXPLORER}/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t.hash.slice(0, 6)}
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 font-mono text-xs text-muted-foreground">
          <span>
            POOL {POOL_ADDRESS.slice(0, 6)}…{POOL_ADDRESS.slice(-4)} · STELLAR TESTNET
          </span>
          <Link href="/" className="hover:text-foreground inline-flex items-center gap-1">
            ← Back to AstroFlo
          </Link>
        </div>
      </div>
    </main>
  );
}

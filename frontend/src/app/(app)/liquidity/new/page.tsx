"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import LiquidityChart from "@/components/liquidity/LiquidityChart";
import AprDonut from "@/components/liquidity/AprDonut";
import { usePool } from "@/hooks/usePool";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/Toast";
import { useSpotPrices, useMarket24h } from "@/hooks/useMarketData";
import { useBalances } from "@/hooks/useBalances";
import { usePoolReserves } from "@/hooks/usePoolStats";
import {
  toStroops,
  fromStroops,
  getLiquidityForAmounts,
  getAmountsForLiquidity,
  priceToSqrtPriceX64,
  tickToPrice,
  roundTick,
  priceToTick,
  clampTick,
  applyPreset,
  formatUsd,
} from "@/lib/math";
import { buildMintTx, buildApprovalTx } from "@/lib/transactions";
import { submitTransaction, getLatestLedger } from "@/lib/stellar";
import { useQueryClient } from "@tanstack/react-query";
import {
  TICK_SPACING,
  POOL_ADDRESS,
  XLM_ADDRESS,
  USDC_ADDRESS,
  STROOP,
} from "@/lib/constants";

const PRESETS = [
  { label: "±1%", pct: 0.01 },
  { label: "±5%", pct: 0.05 },
  { label: "±10%", pct: 0.1 },
  { label: "±20%", pct: 0.2 },
  { label: "±50%", pct: 0.5 },
] as const;

const XLM_GAS_RESERVE = 2n * STROOP; // keep 2 XLM for fees when using "Max"

export default function AddLiquidityPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: pool } = usePool();
  const { address, connect, sign } = useWallet();
  const { addToast } = useToast();
  const { data: spot } = useSpotPrices();
  const { data: market } = useMarket24h();
  const { data: balances } = useBalances(address);
  const { data: reserves } = usePoolReserves();

  const xlmUsd = spot?.xlmUsd ?? 0;
  const usdcUsd = spot?.usdcUsd ?? 1;

  // ── Prices ──────────────────────────────────────────────────────────────
  // CURRENT PRICE = live Coinbase/CoinGecko price, NOT the on-chain pool price.
  // The deployed testnet pool is uninitialized (sits at floor ≈ 65536 USDC/XLM),
  // so reading price from chain is garbage. The live price drives display, the
  // chart, range presets AND the deposit-amount math, so the whole page is
  // internally consistent around the real market price. Falls back to the
  // on-chain price only if every live source is down.
  const liveUsdcPerXlm = xlmUsd > 0 ? xlmUsd / usdcUsd : 0;
  const onChainXlmPerUsdc = pool && pool.tick !== undefined ? tickToPrice(pool.tick) : 0;
  const poolUsdcPerXlm = onChainXlmPerUsdc > 0 ? 1 / onChainXlmPerUsdc : 0;

  const currentUsdcPerXlm = liveUsdcPerXlm > 0 ? liveUsdcPerXlm : poolUsdcPerXlm;
  const currentXlmPerUsdc = currentUsdcPerXlm > 0 ? 1 / currentUsdcPerXlm : 0;
  // sqrtPrice + tick derived from the live price for all range/deposit math.
  const sqrtCurrent = currentXlmPerUsdc > 0 ? priceToSqrtPriceX64(currentXlmPerUsdc) : 0n;
  const currentTick = currentXlmPerUsdc > 0 ? clampTick(priceToTick(currentXlmPerUsdc)) : 0;

  const [tickLower, setTickLower] = useState(0);
  const [tickUpper, setTickUpper] = useState(1);
  const [ticksReady, setTicksReady] = useState(false);
  const [amountXlm, setAmountXlm] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("");
  const [activePreset, setActivePreset] = useState<number | null>(0.1);
  const [aprWindow, setAprWindow] = useState<"24H" | "7D" | "30D">("24H");
  const [loading, setLoading] = useState(false);

  // Center initial range ±10% on the live price once it loads.
  useEffect(() => {
    if (currentXlmPerUsdc > 0 && !ticksReady) {
      const { tickLower: tl, tickUpper: tu } = applyPreset(currentXlmPerUsdc, 0.1, TICK_SPACING);
      // Sync live market price into editable range state on first load.
      /* eslint-disable react-hooks/set-state-in-effect */
      setTickLower(tl);
      setTickUpper(tu);
      setTicksReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [currentXlmPerUsdc, ticksReady]);

  const sqrtLower = priceToSqrtPriceX64(tickToPrice(tickLower));
  const sqrtUpper = priceToSqrtPriceX64(tickToPrice(tickUpper));

  // Display range in USDC per XLM. Lower tick → higher USDC/XLM (= max), and
  // upper tick → lower USDC/XLM (= min).
  const minUsdcPerXlm = 1 / tickToPrice(tickUpper);
  const maxUsdcPerXlm = 1 / tickToPrice(tickLower);

  // below range (price0Only): position is 100% USDC → no XLM needed
  // above range (price1Only): position is 100% XLM  → no USDC needed
  const price0Only = currentTick < tickLower;
  const price1Only = currentTick >= tickUpper;

  // ── Amount syncing (token_0 = USDC, token_1 = XLM) ──────────────────────
  function syncFromXlm(raw: string) {
    setAmountXlm(raw);
    if (!raw || isNaN(parseFloat(raw))) { setAmountUsdc(""); return; }
    if (price0Only) return;
    const a1 = toStroops(raw); // XLM = token_1
    if (a1 === 0n) { setAmountUsdc(""); return; }
    const L = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, 10n ** 18n, a1);
    const { amount0: usdc } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
    setAmountUsdc(fromStroops(usdc));
  }

  function syncFromUsdc(raw: string) {
    setAmountUsdc(raw);
    if (!raw || isNaN(parseFloat(raw))) { setAmountXlm(""); return; }
    if (price1Only) return;
    const a0 = toStroops(raw); // USDC = token_0
    if (a0 === 0n) { setAmountXlm(""); return; }
    const L = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, a0, 10n ** 18n);
    const { amount1: xlm } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
    setAmountXlm(fromStroops(xlm));
  }

  // Recompute counterpart when range changes mid-session (two-way amount binding).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (amountXlm && !price0Only) {
      const a1 = toStroops(amountXlm);
      if (a1 > 0n) {
        const L = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, 10n ** 18n, a1);
        const { amount0: usdc } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
        setAmountUsdc(fromStroops(usdc));
      }
    } else if (amountUsdc && !price1Only) {
      const a0 = toStroops(amountUsdc);
      if (a0 > 0n) {
        const L = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, a0, 10n ** 18n);
        const { amount1: xlm } = getAmountsForLiquidity(sqrtCurrent, sqrtLower, sqrtUpper, L);
        setAmountXlm(fromStroops(xlm));
      }
    }
  }, [tickLower, tickUpper, sqrtCurrent]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Range handlers ──────────────────────────────────────────────────────
  function applyPresetPct(pct: number) {
    const { tickLower: tl, tickUpper: tu } = applyPreset(currentXlmPerUsdc, pct, TICK_SPACING);
    setTickLower(tl);
    setTickUpper(tu);
    setActivePreset(pct);
  }

  // Chart emits prices in USDC per XLM. min → tickUpper, max → tickLower.
  function setMinPrice(usdcPerXlm: number) {
    if (usdcPerXlm <= 0) return;
    const t = clampTick(roundTick(priceToTick(1 / usdcPerXlm), TICK_SPACING));
    if (t > tickLower) { setTickUpper(t); setActivePreset(null); }
  }
  function setMaxPrice(usdcPerXlm: number) {
    if (usdcPerXlm <= 0) return;
    const t = clampTick(roundTick(priceToTick(1 / usdcPerXlm), TICK_SPACING));
    if (t < tickUpper) { setTickLower(t); setActivePreset(null); }
  }

  // ── Deposit math ────────────────────────────────────────────────────────
  const a0Usdc = toStroops(amountUsdc); // token_0
  const a1Xlm = toStroops(amountXlm); // token_1
  const liquidity = getLiquidityForAmounts(sqrtCurrent, sqrtLower, sqrtUpper, a0Usdc, a1Xlm);

  const xlmValue = (parseFloat(amountXlm) || 0) * xlmUsd;
  const usdcValue = (parseFloat(amountUsdc) || 0) * usdcUsd;
  const totalValue = xlmValue + usdcValue;
  const ratioXlm = totalValue > 0 ? (xlmValue / totalValue) * 100 : 0;
  const ratioUsdc = 100 - ratioXlm;

  // Estimated fee APR — illustrative (see AprDonut). Scales an assumed baseline
  // by the range concentration multiplier so it reacts to range width.
  const estApr = useMemo(() => {
    if (minUsdcPerXlm <= 0 || maxUsdcPerXlm <= 0) return 0;
    const r = minUsdcPerXlm / maxUsdcPerXlm; // < 1
    const mult = r >= 1 ? 50 : Math.min(50, 1 / (1 - Math.pow(r, 0.25)));
    const base = 0.02; // assumed full-range fee APR
    return Math.min(999, base * mult * 100);
  }, [minUsdcPerXlm, maxUsdcPerXlm]);

  // ── Live price / market stats ───────────────────────────────────────────
  const tvlUsd =
    reserves && xlmUsd > 0
      ? reserves.xlmReserve * xlmUsd + reserves.usdcReserve * usdcUsd
      : null;
  const livePrice = currentUsdcPerXlm; // USDC per XLM (live)
  const change24h = market?.change24h ?? 0;

  // ── Max / 50% ───────────────────────────────────────────────────────────
  function setXlmFraction(frac: number) {
    if (!balances) return;
    const usable = balances.xlm > XLM_GAS_RESERVE ? balances.xlm - XLM_GAS_RESERVE : 0n;
    const amt = frac === 1 ? usable : (balances.xlm * BigInt(Math.round(frac * 100))) / 100n;
    syncFromXlm(fromStroops(amt));
  }
  function setUsdcFraction(frac: number) {
    if (!balances) return;
    const amt = (balances.usdc * BigInt(Math.round(frac * 100))) / 100n;
    syncFromUsdc(fromStroops(amt));
  }

  async function handleAdd() {
    if (!address) { await connect(); return; }
    if (liquidity === 0n) return;
    setLoading(true);
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const currentLedger = await getLatestLedger();
      const approvalExpiry = currentLedger + 500;

      if (a1Xlm > 0n) {
        addToast("Approving XLM...", "info");
        const xdr = await buildApprovalTx(address, XLM_ADDRESS, POOL_ADDRESS, a1Xlm * 2n, approvalExpiry);
        await submitTransaction(await sign(xdr));
        addToast("XLM approved", "success");
      }
      if (a0Usdc > 0n) {
        addToast("Approving USDC...", "info");
        const xdr = await buildApprovalTx(address, USDC_ADDRESS, POOL_ADDRESS, a0Usdc * 2n, approvalExpiry);
        await submitTransaction(await sign(xdr));
        addToast("USDC approved", "success");
      }

      addToast("Adding liquidity...", "info");
      const mintXdr = await buildMintTx(
        address, POOL_ADDRESS, tickLower, tickUpper, liquidity,
        0n, 0n, deadline
      );
      await submitTransaction(await sign(mintXdr));
      addToast("✓ Liquidity added successfully!", "success");
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      router.push("/liquidity");
    } catch (err: unknown) {
      addToast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }

  const canAdd = address && liquidity > 0n && !loading && ticksReady;
  const fmtP = (p: number) => (p >= 1 ? p.toFixed(4) : p.toFixed(6));

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "28px 24px 60px" }}>
      <button
        onClick={() => router.push("/liquidity")}
        style={{ background: "transparent", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, marginBottom: 16 }}
      >
        ← Back to Positions
      </button>

      {/* ── Header bar ── */}
      <div className="glass-card" style={{ padding: "18px 24px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex" }}>
            <span style={tokenChip}>⭐</span>
            <span style={{ ...tokenChip, marginLeft: -10 }}>💵</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#e8eaf6" }}>XLM / USDC</span>
              <span style={{ ...pill, background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>0.3%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span className="live-dot" />
              <span style={{ fontSize: 13, color: "#9ca3af" }}>
                ${fmtP(livePrice)}{" "}
                <span style={{ color: change24h >= 0 ? "#22c55e" : "#ef4444" }}>
                  {change24h >= 0 ? "▲" : "▼"} {Math.abs(change24h * 100).toFixed(2)}%
                </span>{" "}
                <span style={{ color: "#6b7280" }}>· Coinbase live</span>
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Stat label="Liquidity (TVL)" value={tvlUsd !== null ? formatUsd(tvlUsd) : "—"} />
          <Stat label="Pool Reserves" value={reserves ? `${compact(reserves.xlmReserve)} XLM` : "—"} sub={reserves ? `${compact(reserves.usdcReserve)} USDC` : undefined} />
          <Stat label="Current Price" value={currentUsdcPerXlm > 0 ? `$${fmtP(currentUsdcPerXlm)}` : "—"} sub="USDC per XLM · live" />
        </div>
      </div>

      <div className="lp-two-col">
        {/* ── Left: Set Price Range ── */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#e8eaf6" }}>Set Price Range</h2>
            <span style={{ fontSize: 12, color: "#6b7280" }}>USDC per XLM</span>
          </div>

          {!ticksReady ? (
            <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#9ca3af", fontSize: 13 }}>
              <div className="spinner" style={{ width: 16, height: 16 }} />
              Loading live price…
            </div>
          ) : (
            <LiquidityChart
              currentPrice={currentUsdcPerXlm}
              priceLower={minUsdcPerXlm}
              priceUpper={maxUsdcPerXlm}
              low24h={market?.low24h ?? null}
              high24h={market?.high24h ?? null}
              onPriceLowerChange={setMinPrice}
              onPriceUpperChange={setMaxPrice}
              disabled={!ticksReady}
            />
          )}

          {/* Min / Max inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            <PriceField label="Min Price" sub="USDC per XLM" value={minUsdcPerXlm} onCommit={setMinPrice} />
            <PriceField label="Max Price" sub="USDC per XLM" value={maxUsdcPerXlm} onCommit={setMaxPrice} />
          </div>

          {/* Presets */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPresetPct(p.pct)}
                style={{
                  padding: "7px 13px", borderRadius: 8, border: "1px solid",
                  borderColor: activePreset === p.pct ? "rgba(34,211,238,0.5)" : "rgba(99,102,241,0.15)",
                  background: activePreset === p.pct ? "rgba(34,211,238,0.12)" : "transparent",
                  color: activePreset === p.pct ? "#67e8f9" : "#9ca3af",
                  cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}
              >
                {p.label}
              </button>
            ))}
            <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center", marginLeft: 4 }}>
              Ticks {tickLower} → {tickUpper}
            </span>
          </div>

          {/* Estimated APR */}
          <div style={{ marginTop: 20, padding: "16px 18px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e8eaf6" }}>Estimated APR</span>
              <div style={{ display: "flex", gap: 4, background: "rgba(13,14,20,0.6)", borderRadius: 8, padding: 3 }}>
                {(["24H", "7D", "30D"] as const).map((w) => (
                  <button key={w} onClick={() => setAprWindow(w)} style={{
                    padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: aprWindow === w ? "rgba(99,102,241,0.25)" : "transparent",
                    color: aprWindow === w ? "#a5b4fc" : "#6b7280",
                  }}>{w}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: "#e8eaf6" }}>{estApr.toFixed(2)}%</span>
              <AprDonut aprPct={estApr} />
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                <div><span style={{ color: "#8b5cf6" }}>●</span> Trade fees (0.3% tier)</div>
                <div style={{ marginTop: 2 }}>Estimated — narrower range earns more</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Add Deposit Amount ── */}
        <div className="glass-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#e8eaf6" }}>Add Deposit Amount</h2>

          {(price0Only || price1Only) && (
            <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ca8a04", lineHeight: 1.5 }}>
              {price0Only
                ? <><strong>Price is below your range.</strong> Deposit will be 100% USDC.</>
                : <><strong>Price is above your range.</strong> Deposit will be 100% XLM.</>}
            </div>
          )}

          <TokenBox
            symbol="XLM" icon="⭐"
            value={amountXlm}
            usd={xlmValue}
            balance={balances ? parseFloat(fromStroops(balances.xlm)) : null}
            disabled={price0Only}
            onChange={syncFromXlm}
            onMax={() => setXlmFraction(1)}
            onHalf={() => setXlmFraction(0.5)}
          />

          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc", fontSize: 18 }}>+</div>
          </div>

          <TokenBox
            symbol="USDC" icon="💵"
            value={amountUsdc}
            usd={usdcValue}
            balance={balances ? parseFloat(fromStroops(balances.usdc)) : null}
            disabled={price1Only}
            onChange={syncFromUsdc}
            onMax={() => setUsdcFraction(1)}
            onHalf={() => setUsdcFraction(0.5)}
          />

          {/* Totals */}
          <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>Total Deposit</span>
              <span style={{ color: "#e8eaf6", fontSize: 16, fontWeight: 700 }}>{totalValue > 0 ? formatUsd(totalValue) : "$0.00"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>Deposit Ratio</span>
              <span style={{ color: "#9ca3af", fontSize: 12 }}>{ratioXlm.toFixed(1)}% ⭐ / {ratioUsdc.toFixed(1)}% 💵</span>
            </div>
            <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", background: "rgba(13,14,20,0.6)" }}>
              <div style={{ width: `${ratioXlm}%`, background: "#06b6d4" }} />
              <div style={{ width: `${ratioUsdc}%`, background: "#8b5cf6" }} />
            </div>
          </div>

          <button className="btn-primary" onClick={handleAdd} disabled={!canAdd} style={{ padding: 15, fontSize: 16, width: "100%" }}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div className="spinner" style={{ width: 18, height: 18 }} /> Processing…
              </span>
            ) : !address ? "Connect Wallet" : liquidity === 0n ? "Enter Amounts" : "Add Liquidity"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

const tokenChip: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.12)",
  border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 16,
};
const pill: React.CSSProperties = { fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "2px 10px" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf6" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280" }}>{sub}</div>}
    </div>
  );
}

function PriceField({ label, sub, value, onCommit }: { label: string; sub: string; value: number; onCommit: (v: number) => void }) {
  return (
    <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <input
        type="number" step="any"
        key={value.toFixed(8)}
        defaultValue={value >= 1 ? value.toFixed(4) : value.toFixed(6)}
        onBlur={(e) => { const p = parseFloat(e.target.value); if (p > 0) onCommit(p); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#e8eaf6", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}
      />
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function TokenBox({ symbol, icon, value, usd, balance, disabled, onChange, onMax, onHalf }: {
  symbol: string; icon: string; value: string; usd: number; balance: number | null;
  disabled: boolean; onChange: (v: string) => void; onMax: () => void; onHalf: () => void;
}) {
  return (
    <div style={{ background: "#0f1117", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: 16, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8, padding: "6px 12px" }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ color: "#e8eaf6", fontWeight: 700, fontSize: 14 }}>{symbol}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Bal {balance !== null ? balance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</span>
          <button onClick={onHalf} disabled={disabled} style={miniBtn}>50%</button>
          <button onClick={onMax} disabled={disabled} style={miniBtn}>Max</button>
        </div>
      </div>
      <input
        type="text" inputMode="decimal" placeholder="0.0"
        value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#e8eaf6", fontSize: 24, fontWeight: 600, textAlign: "right", fontFamily: "monospace" }}
      />
      {usd > 0 && <div style={{ fontSize: 11, color: "#6b7280", textAlign: "right", marginTop: 4 }}>≈ {formatUsd(usd)}</div>}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(99,102,241,0.2)",
  background: "transparent", color: "#a5b4fc", cursor: "pointer", fontSize: 11, fontWeight: 600,
};

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

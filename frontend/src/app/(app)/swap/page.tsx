"use client";

import { useState, useEffect } from "react";
import TokenInputBox from "@/components/swap/TokenInputBox";
import PriceInfo from "@/components/swap/PriceInfo";
import SlippageSettings from "@/components/swap/SlippageSettings";
import { useWallet } from "@/hooks/useWallet";
import { usePool } from "@/hooks/usePool";
import { useSwapQuote } from "@/hooks/useSwapQuote";
import { usePrices } from "@/hooks/usePrices";
import { toStroops, fromStroops, computePriceImpact, toUsd, formatUsd } from "@/lib/math";
import { buildSwapTx, buildApprovalTx } from "@/lib/transactions";
import { submitTransaction, getLatestLedger } from "@/lib/stellar";
import { XLM_ADDRESS, USDC_ADDRESS, FEE_TIER, POOL_ADDRESS } from "@/lib/constants";
import { useToast } from "@/components/Toast";

const XLM = { symbol: "XLM", name: "Stellar Lumens", logo: "⭐" };
const USDC = { symbol: "USDC", name: "USD Coin", logo: "💵" };

export default function SwapPage() {
  const { address, connect, sign } = useWallet();
  const { data: pool } = usePool();
  const prices = usePrices();
  const { addToast } = useToast();

  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const [zeroForOne, setZeroForOne] = useState(true); // XLM → USDC
  const [loading, setLoading] = useState(false);
  const [highImpactAcknowledged, setHighImpactAcknowledged] = useState(false);

  const tokenIn = zeroForOne ? XLM : USDC;
  const tokenOut = zeroForOne ? USDC : XLM;

  const amountInStroops = toStroops(amountIn);
  const currentPrice = pool?.currentPrice ?? 0;

  const { data: quote, isFetching: quoteFetching, refetch: refetchQuote } = useSwapQuote(
    amountInStroops,
    zeroForOne,
    currentPrice,
    amountInStroops > 0n
  );

  const amountOut = quote ? fromStroops(quote.amountOut) : "";
  const slippageBps = BigInt(Math.round(slippage * 100));
  const amountOutMin = quote
    ? (quote.amountOut * (10000n - slippageBps)) / 10000n
    : 0n;

  // pool.currentPrice = sqrtPriceX64ToPrice = XLM/USDC (XLM per USDC).
  // Displayed rate must be in output-token / input-token units.
  const usdcPerXlm = pool ? 1 / pool.currentPrice : 0;
  const xlmPerUsdc = pool ? pool.currentPrice : 0;
  const rate = pool
    ? zeroForOne
      ? `1 XLM ≈ ${usdcPerXlm.toFixed(4)} USDC`    // XLM→USDC: output is USDC
      : `1 USDC ≈ ${xlmPerUsdc.toFixed(4)} XLM`     // USDC→XLM: output is XLM
    : "—";

  const feeAmount = amountInStroops > 0n
    ? fromStroops((amountInStroops * 3n) / 1000n)
    : "0";

  // spotPriceOutPerIn: expected output per unit of input at current pool price
  const spotPriceOutPerIn = pool
    ? zeroForOne ? usdcPerXlm : xlmPerUsdc
    : 0;
  const amountInNum = parseFloat(amountIn) || 0;
  const amountOutNum = parseFloat(amountOut) || 0;
  const amountInUsd = toUsd(amountInNum, zeroForOne ? "xlm" : "usdc", prices);
  const priceImpactResult = computePriceImpact(
    amountInNum,
    amountOutNum,
    spotPriceOutPerIn,
    null,
    amountInUsd
  );

  async function handleSwap() {
    if (!address) {
      await connect();
      return;
    }
    if (!quote || amountInStroops === 0n) return;

    setLoading(true);
    try {
      // Gap 4: re-fetch quote immediately before building tx to catch any price movement
      const freshResult = await refetchQuote();
      const freshQuote = freshResult.data;
      if (freshQuote && quote.amountOut > 0n) {
        const outputDiff = freshQuote.amountOut > quote.amountOut
          ? freshQuote.amountOut - quote.amountOut
          : quote.amountOut - freshQuote.amountOut;
        const outputDiffPct = Number(outputDiff) / Number(quote.amountOut);
        if (outputDiffPct > slippage / 100) {
          addToast(
            `Price moved ${(outputDiffPct * 100).toFixed(2)}% since your quote. Please review the new rate.`,
            "error"
          );
          setLoading(false);
          return;
        }
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      // Fetch real ledger from RPC — Unix-epoch-based estimates are wildly wrong
      // vs actual testnet ledger sequences (approval expiry must be ≤ current + max_ttl).
      const currentLedger = await getLatestLedger();

      const tokenInAddress = zeroForOne ? XLM_ADDRESS : USDC_ADDRESS;
      const tokenOutAddress = zeroForOne ? USDC_ADDRESS : XLM_ADDRESS;

      // Build approval for token_in → pool spender
      addToast("Building approval transaction...", "info");
      const approvalXdr = await buildApprovalTx(
        address,
        tokenInAddress,
        POOL_ADDRESS,
        amountInStroops * 2n,
        currentLedger + 500
      );
      const signedApproval = await sign(approvalXdr);
      await submitTransaction(signedApproval);
      addToast("Token approved!", "success");

      // Build swap
      addToast("Building swap transaction...", "info");
      const swapXdr = await buildSwapTx(
        address,
        tokenInAddress,
        tokenOutAddress,
        FEE_TIER,
        amountInStroops,
        amountOutMin,
        deadline,
        0n
      );
      const signedSwap = await sign(swapXdr);
      await submitTransaction(signedSwap);

      addToast(
        `✓ Swapped ${amountIn} ${tokenIn.symbol} for ~${amountOut} ${tokenOut.symbol}`,
        "success"
      );
      setAmountIn("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`Swap failed: ${msg}`, "error");
    } finally {
      setLoading(false);
    }
  }

  const canSwap =
    address &&
    amountInStroops > 0n &&
    quote &&
    quote.amountOut > 0n &&
    !loading &&
    (priceImpactResult.severity !== "very_high" || highImpactAcknowledged);

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
        background:
          "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          <h1
            className="gradient-text"
            style={{ fontSize: "28px", fontWeight: 800, marginBottom: "6px" }}
          >
            Swap
          </h1>
          <p style={{ color: "#6b7280", fontSize: "14px" }}>
            Trade XLM ↔ USDC on Stellar Testnet
          </p>
        </div>

        {/* Card */}
        <div
          className="glass-card"
          style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "4px" }}
        >
          {/* Top bar: slippage */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: "8px",
            }}
          >
            <SlippageSettings slippage={slippage} onChange={setSlippage} />
          </div>

          {/* Token In */}
          <TokenInputBox
            token={tokenIn}
            value={amountIn}
            onChange={setAmountIn}
            label="You Pay"
            usdValue={
              amountInUsd > 0 && !prices.isError ? formatUsd(amountInUsd).replace("$", "") : undefined
            }
            onMax={
              address
                ? () => setAmountIn("1000")
                : undefined
            }
          />

          {/* Flip button */}
          <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
            <button
              onClick={() => {
                setZeroForOne((z) => !z);
                setAmountIn("");
              }}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.3)",
                color: "#a5b4fc",
                fontSize: "18px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s",
              }}
              title="Flip tokens"
            >
              ⇅
            </button>
          </div>

          {/* Token Out */}
          <TokenInputBox
            token={tokenOut}
            value={amountOut}
            readOnly
            label="You Receive"
            loading={quoteFetching && amountInStroops > 0n}
            usdValue={(() => {
              const outUsd = toUsd(amountOutNum, zeroForOne ? "usdc" : "xlm", prices);
              return outUsd > 0 && !prices.isError ? formatUsd(outUsd).replace("$", "") : undefined;
            })()}
          />

          {/* Price info */}
          {quote && amountOut && (
            <div style={{ marginTop: "12px" }}>
              <PriceInfo
                rate={rate}
                priceImpact={priceImpactResult.impact}
                minimumReceived={`${fromStroops(amountOutMin)} ${tokenOut.symbol}`}
                fee={`${feeAmount} ${tokenIn.symbol}`}
                slippage={slippage}
                isThinPool={priceImpactResult.isThinPool}
                lastFetchedAt={pool?.lastFetchedAt}
                onHighImpactAcknowledged={setHighImpactAcknowledged}
              />
            </div>
          )}

          {/* Swap button */}
          <button
            className="btn-primary"
            onClick={handleSwap}
            disabled={!canSwap && Boolean(address)}
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "16px",
              marginTop: "16px",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <div className="spinner" style={{ width: "18px", height: "18px" }} />
                Swapping...
              </span>
            ) : !address ? (
              "Connect Wallet"
            ) : amountInStroops === 0n ? (
              "Enter Amount"
            ) : quoteFetching ? (
              "Fetching Quote..."
            ) : !quote || quote.amountOut === 0n ? (
              "Insufficient Liquidity"
            ) : (
              `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`
            )}
          </button>
        </div>

        {/* Pool info footer */}
        {pool && (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              justifyContent: "center",
              gap: "24px",
            }}
          >
            {[
              { label: "Liquidity", value: `${fromStroops(pool.liquidity)} L` },
              { label: "Tick", value: `${pool.tick}` },
              { label: "Fee", value: "0.3%" },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <p style={{ color: "#6b7280", fontSize: "11px" }}>{label}</p>
                <p style={{ color: "#9ca3af", fontSize: "13px", fontWeight: 600 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

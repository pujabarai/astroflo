import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "AstroFlo — CLMM DEX on Stellar",
  description:
    "Concentrated Liquidity Market Maker DEX on Stellar Soroban. Trade XLM/USDC, provide liquidity, and earn fees.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Providers>
          <ToastProvider>
            <Navbar />
            <main style={{ flex: 1 }}>{children}</main>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}

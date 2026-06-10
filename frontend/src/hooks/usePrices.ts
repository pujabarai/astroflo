"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSpotPrices } from "@/lib/marketData";

export interface TokenPrices {
  xlmUsd: number;
  usdcUsd: number;
  isLoading: boolean;
  isError: boolean;
}

export function usePrices(): TokenPrices {
  // Shared source: Coinbase → CoinGecko → Binance. Same query key as useSpotPrices
  // so the whole app dedupes to a single network request.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["spot-prices"],
    queryFn: fetchSpotPrices,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 2,
    throwOnError: false,
  });

  return {
    xlmUsd: data?.xlmUsd ?? 0,
    usdcUsd: data?.usdcUsd ?? 1,
    isLoading,
    isError,
  };
}

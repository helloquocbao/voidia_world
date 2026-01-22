import { useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useBalanceStore } from "../stores";

/**
 * Hook to fetch and track the user's CHUNK reward token balance
 * Uses Zustand store to cache balance and avoid repeated fetches
 */
export function useRewardBalance() {
  const account = useCurrentAccount();
  const { balance, isLoading, fetchBalance, refetch, reset } = useBalanceStore();

  useEffect(() => {
    if (account?.address) {
      fetchBalance(account.address);
    } else {
      reset();
    }
  }, [account?.address, fetchBalance, reset]);

  return { balance, isLoading, refetch, account };
}


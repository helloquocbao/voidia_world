import { create } from "zustand";
import { REWARD_COIN_TYPE } from "../chain/config";
import { suiClient } from "../chain/suiClient";

interface BalanceState {
  balance: number;
  isLoading: boolean;
  lastFetchedAt: number | null;
  walletAddress: string | null;
  
  // Actions
  fetchBalance: (walletAddress: string) => Promise<void>;
  refetch: () => Promise<void>;
  reset: () => void;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: 0,
  isLoading: false,
  lastFetchedAt: null,
  walletAddress: null,

  fetchBalance: async (walletAddress: string) => {
    const state = get();
    
    // Skip if already fetched for this wallet address
    if (state.walletAddress === walletAddress && state.lastFetchedAt !== null) {
      return;
    }

    // Skip if already loading
    if (state.isLoading) {
      return;
    }

    set({ isLoading: true, walletAddress });

    try {
      if (!REWARD_COIN_TYPE) {
        set({ balance: 0, isLoading: false, lastFetchedAt: Date.now() });
        return;
      }

      const coins = await suiClient.getCoins({
        owner: walletAddress,
        coinType: REWARD_COIN_TYPE,
      });

      const total = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        BigInt(0)
      );

      set({ 
        balance: Number(total), 
        isLoading: false, 
        lastFetchedAt: Date.now() 
      });
    } catch (err) {
      console.error("Failed to fetch reward balance:", err);
      set({ balance: 0, isLoading: false, lastFetchedAt: Date.now() });
    }
  },

  refetch: async () => {
    const state = get();
    if (!state.walletAddress) return;
    
    // Clear cache to force refetch
    set({ lastFetchedAt: null });
    
    set({ isLoading: true });

    try {
      if (!REWARD_COIN_TYPE) {
        set({ balance: 0, isLoading: false, lastFetchedAt: Date.now() });
        return;
      }

      const coins = await suiClient.getCoins({
        owner: state.walletAddress,
        coinType: REWARD_COIN_TYPE,
      });

      const total = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        BigInt(0)
      );

      set({ 
        balance: Number(total), 
        isLoading: false, 
        lastFetchedAt: Date.now() 
      });
    } catch (err) {
      console.error("Failed to refetch reward balance:", err);
      set({ isLoading: false, lastFetchedAt: Date.now() });
    }
  },

  reset: () => {
    set({ 
      balance: 0, 
      isLoading: false, 
      lastFetchedAt: null, 
      walletAddress: null 
    });
  },
}));

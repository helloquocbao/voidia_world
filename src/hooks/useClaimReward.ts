import { useState, useCallback } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_ID,
  BOSS_FIGHT_CONFIG_ID,
  REWARD_VAULT_ID,
  POWER_STONE_VAULT_ID,
} from "../chain/config";
import { bossApi, SignedClaimPayload } from "../services/bossApi";

export interface ClaimResult {
  success: boolean;
  txDigest?: string;
  error?: string;
}

/**
 * Hook for claiming boss fight rewards on-chain
 * Handles the full flow: sign request -> build tx -> execute -> confirm
 */
export function useClaimReward() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteTx } = useSignAndExecuteTransaction();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Claim a reward using a pre-signed payload
   */
  const claimWithPayload = useCallback(
    async (
      rewardId: string,
      signedPayload: SignedClaimPayload,
    ): Promise<ClaimResult> => {
      if (!account?.address) {
        return { success: false, error: "Wallet not connected" };
      }

      if (!PACKAGE_ID || !BOSS_FIGHT_CONFIG_ID) {
        return { success: false, error: "Contract not configured" };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Build transaction based on reward type
        const tx = new Transaction();

        // Convert string fields to byte arrays
        const matchIdBytes = stringToBytes(signedPayload.matchId);
        const rewardIdBytes = stringToBytes(signedPayload.rewardId);
        const nonceBytes = stringToBytes(signedPayload.rewardId); // Using rewardId as nonce
        const signatureBytes = hexToBytes(signedPayload.signature);

        if (signedPayload.rewardType === "tokens") {
          // Claim tokens
          if (!REWARD_VAULT_ID) {
            throw new Error("Reward vault not configured");
          }

          tx.moveCall({
            target: `${PACKAGE_ID}::boss_fight::claim_boss_reward_tokens`,
            arguments: [
              tx.object(BOSS_FIGHT_CONFIG_ID),
              tx.object(REWARD_VAULT_ID),
              tx.pure.vector("u8", matchIdBytes),
              tx.pure.vector("u8", rewardIdBytes),
              tx.pure.u64(signedPayload.amount),
              tx.pure.vector("u8", nonceBytes),
              tx.pure.u64(signedPayload.expiry),
              tx.pure.vector("u8", signatureBytes),
            ],
          });
        } else if (signedPayload.rewardType === "power_stone") {
          // Claim power stones
          if (!POWER_STONE_VAULT_ID) {
            throw new Error("Power stone vault not configured");
          }

          tx.moveCall({
            target: `${PACKAGE_ID}::boss_fight::claim_boss_reward_stones`,
            arguments: [
              tx.object(BOSS_FIGHT_CONFIG_ID),
              tx.object(POWER_STONE_VAULT_ID),
              tx.pure.vector("u8", matchIdBytes),
              tx.pure.vector("u8", rewardIdBytes),
              tx.pure.u64(signedPayload.amount),
              tx.pure.vector("u8", nonceBytes),
              tx.pure.u64(signedPayload.expiry),
              tx.pure.vector("u8", signatureBytes),
            ],
          });
        } else {
          throw new Error(`Unknown reward type: ${signedPayload.rewardType}`);
        }

        // Execute transaction
        const result = await signAndExecuteTx({
          transaction: tx,
        });

        if (!result.digest) {
          throw new Error("Transaction failed - no digest returned");
        }

        // Confirm claim with server
        try {
          await bossApi.confirmClaim(rewardId, result.digest);
        } catch (confirmError) {
          console.warn("Failed to confirm claim with server:", confirmError);
          // Don't fail the whole claim - tokens were already transferred on-chain
        }

        setIsLoading(false);
        return { success: true, txDigest: result.digest };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to claim reward";
        setError(errorMessage);
        setIsLoading(false);
        return { success: false, error: errorMessage };
      }
    },
    [account?.address, signAndExecuteTx],
  );

  /**
   * Claim a reward by first fetching the signed payload from server
   */
  const claimReward = useCallback(
    async (rewardId: string): Promise<ClaimResult> => {
      if (!account?.address) {
        return { success: false, error: "Wallet not connected" };
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get signed payload from server
        const { signedPayload } = await bossApi.signRewardClaim(
          account.address,
          rewardId,
        );

        // Claim with the payload
        return await claimWithPayload(rewardId, signedPayload);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to claim reward";
        setError(errorMessage);
        setIsLoading(false);
        return { success: false, error: errorMessage };
      }
    },
    [account?.address, claimWithPayload],
  );

  return {
    claimReward,
    claimWithPayload,
    isLoading,
    error,
  };
}

// ==================== Helper Functions ====================

/**
 * Convert string to byte array (UTF-8)
 */
function stringToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

/**
 * Convert hex string to byte array
 */
function hexToBytes(hex: string): number[] {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
  }
  return bytes;
}

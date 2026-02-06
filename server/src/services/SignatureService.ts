import { createHash, randomBytes } from "crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { v4 as uuidv4 } from "uuid";
import { db, RewardRecord, ClaimRecord } from "../db/database.js";

// Configure @noble/ed25519 v3.x to use sha512 from @noble/hashes
// This is required for synchronous operations like getPublicKey()
ed.hashes.sha512 = sha512;

// ============================================
// Configuration
// ============================================

const SIGNING_CONFIG = {
  // Reward expiry extension when signing (24 hours)
  SIGNATURE_VALIDITY_MS: 24 * 60 * 60 * 1000,
};

// ============================================
// Types
// ============================================

export interface ClaimPayload {
  matchId: string;
  playerAddress: string;
  rewardId: string;
  rewardAmount: number;
  rewardType: string;
  nonce: string;
  expiry: number;
  walrusBlobId?: string;
  summaryHash?: string;
}

export interface SignedClaimPayload extends ClaimPayload {
  signature: string;
  payloadHash: string;
}

// ============================================
// Signature Service
// ============================================

export class SignatureService {
  private privateKey: Uint8Array;
  private publicKey: Uint8Array;
  private publicKeyHex: string;

  constructor() {
    // Generate or load private key
    // In production, this should be loaded from secure storage/env
    this.privateKey = this.loadOrGeneratePrivateKey();
    this.publicKey = ed.getPublicKey(this.privateKey);
    this.publicKeyHex = Buffer.from(this.publicKey).toString("hex");

    console.log("[SignatureService] Initialized");
    console.log(`  Public Key: ${this.publicKeyHex.slice(0, 16)}...`);
  }

  private loadOrGeneratePrivateKey(): Uint8Array {
    // Check environment variable first
    const envKey = process.env.SERVER_PRIVATE_KEY;
    if (envKey) {
      console.log("[SignatureService] Using private key from environment");
      return Buffer.from(envKey, "hex");
    }

    // Generate new key for development
    console.log("[SignatureService] Generating new private key (dev mode)");
    const key = randomBytes(32);
    console.log(`  Private Key (save this!): ${key.toString("hex")}`);
    return key;
  }

  /**
   * Get server public key (for contract configuration)
   */
  public getPublicKey(): string {
    return this.publicKeyHex;
  }

  /**
   * Compute hash of payload (binary format - must match contract's build_payload_hash)
   * Format: match_id || player_address || reward_id || reward_amount(u64 BE) || reward_type || nonce || expiry(u64 BE)
   * Hash: keccak256
   */
  private computePayloadHash(payload: ClaimPayload): Buffer {
    const parts: Buffer[] = [];

    // match_id (as UTF-8 bytes)
    parts.push(Buffer.from(payload.matchId, "utf-8"));

    // player_address (32 bytes hex -> Buffer, Sui addresses are 32 bytes)
    // Remove 0x prefix if present
    const addrHex = payload.playerAddress.startsWith("0x")
      ? payload.playerAddress.slice(2)
      : payload.playerAddress;
    parts.push(Buffer.from(addrHex.padStart(64, "0"), "hex"));

    // reward_id (as UTF-8 bytes)
    parts.push(Buffer.from(payload.rewardId, "utf-8"));

    // reward_amount (8 bytes big-endian u64)
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64BE(BigInt(payload.rewardAmount), 0);
    parts.push(amountBuf);

    // reward_type (as UTF-8 bytes)
    parts.push(Buffer.from(payload.rewardType, "utf-8"));

    // nonce (as UTF-8 bytes)
    parts.push(Buffer.from(payload.nonce, "utf-8"));

    // expiry (8 bytes big-endian u64)
    const expiryBuf = Buffer.alloc(8);
    expiryBuf.writeBigUInt64BE(BigInt(payload.expiry), 0);
    parts.push(expiryBuf);

    // Concatenate all parts
    const combined = Buffer.concat(parts);

    // keccak256 hash (matching Move's sui::hash::keccak256)
    const hashBytes = keccak_256(combined);
    return Buffer.from(hashBytes);
  }

  /**
   * Get payload hash as hex string (for debugging/display)
   */
  private computePayloadHashHex(payload: ClaimPayload): string {
    return this.computePayloadHash(payload).toString("hex");
  }

  /**
   * Sign a payload
   */
  public async signPayload(payload: ClaimPayload): Promise<SignedClaimPayload> {
    const payloadHashBuf = this.computePayloadHash(payload);
    const payloadHash = payloadHashBuf.toString("hex");

    const signatureBytes = await ed.signAsync(payloadHashBuf, this.privateKey);
    const signature = Buffer.from(signatureBytes).toString("hex");

    return {
      ...payload,
      signature,
      payloadHash,
    };
  }

  /**
   * Verify a signature
   */
  public async verifySignature(
    signedPayload: SignedClaimPayload,
  ): Promise<boolean> {
    try {
      const expectedHash = this.computePayloadHashHex(signedPayload);

      if (expectedHash !== signedPayload.payloadHash) {
        console.error("[SignatureService] Payload hash mismatch");
        return false;
      }

      const messageBytes = Buffer.from(signedPayload.payloadHash, "hex");
      const signatureBytes = Buffer.from(signedPayload.signature, "hex");

      const isValid = await ed.verifyAsync(
        signatureBytes,
        messageBytes,
        this.publicKey,
      );
      return isValid;
    } catch (error) {
      console.error("[SignatureService] Verification error:", error);
      return false;
    }
  }

  /**
   * Create signed claim payload for a reward
   */
  public async createSignedClaim(
    rewardId: string,
  ): Promise<SignedClaimPayload | null> {
    // Get reward record
    const reward = await db.getReward(rewardId);
    if (!reward) {
      console.error(`[SignatureService] Reward ${rewardId} not found`);
      return null;
    }

    // Check if already claimed
    const existingClaim = await db.getClaimByReward(rewardId);
    if (existingClaim?.status === "claimed") {
      console.error(`[SignatureService] Reward ${rewardId} already claimed`);
      return null;
    }

    // Check if expired
    if (reward.expiry < Date.now()) {
      console.error(`[SignatureService] Reward ${rewardId} expired`);
      return null;
    }

    // Get match for additional info
    const match = await db.getMatch(reward.matchId);

    // Create payload
    const payload: ClaimPayload = {
      matchId: reward.matchId,
      playerAddress: reward.walletAddress,
      rewardId: reward.id,
      rewardAmount: reward.rewardAmount,
      rewardType: reward.rewardType,
      nonce: reward.nonce,
      expiry: reward.expiry,
      walrusBlobId: match?.walrusBlobId,
      summaryHash: match?.summaryHash,
    };

    // Sign payload
    const signedPayload = await this.signPayload(payload);

    // Update reward record with signature
    await db.updateReward(rewardId, {
      signature: signedPayload.signature,
      payload: JSON.stringify(signedPayload),
    });

    console.log(
      `[SignatureService] Created signed claim for reward ${rewardId}`,
    );

    return signedPayload;
  }

  /**
   * Process a claim submission
   */
  public async processClaim(
    rewardId: string,
    txDigest?: string,
  ): Promise<ClaimRecord | null> {
    const reward = await db.getReward(rewardId);
    if (!reward) {
      console.error(`[SignatureService] Reward ${rewardId} not found`);
      return null;
    }

    // Check if already claimed
    const existingClaim = await db.getClaimByReward(rewardId);
    if (existingClaim) {
      if (existingClaim.status === "claimed") {
        console.error(`[SignatureService] Reward ${rewardId} already claimed`);
        return null;
      }
      // Update existing pending claim
      return await db.updateClaim(existingClaim.id, {
        status: txDigest ? "claimed" : "pending",
        txDigest,
        claimedAt: txDigest ? Date.now() : undefined,
      });
    }

    // Create new claim record
    const claim: ClaimRecord = {
      id: `claim_${uuidv4()}`,
      matchId: reward.matchId,
      playerId: reward.playerId,
      walletAddress: reward.walletAddress,
      rewardId: reward.id,
      status: txDigest ? "claimed" : "pending",
      txDigest,
      claimedAt: txDigest ? Date.now() : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.createClaim(claim);
    console.log(
      `[SignatureService] Claim ${claim.id} created for reward ${rewardId}`,
    );

    return claim;
  }

  /**
   * Get all pending claims for a player
   */
  public async getPendingClaimsForPlayer(walletAddress: string): Promise<{
    rewards: RewardRecord[];
    signedPayloads: SignedClaimPayload[];
  }> {
    const rewards = await db.getRewardsByPlayer(walletAddress);
    const pendingRewards: RewardRecord[] = [];
    const signedPayloads: SignedClaimPayload[] = [];

    for (const reward of rewards) {
      // Check if not claimed and not expired
      const claim = await db.getClaimByReward(reward.id);
      const isClaimed = claim?.status === "claimed";
      const isExpired = reward.expiry < Date.now();

      if (!isClaimed && !isExpired) {
        pendingRewards.push(reward);

        // Create signed payload if not already signed
        if (!reward.signature) {
          const signed = await this.createSignedClaim(reward.id);
          if (signed) {
            signedPayloads.push(signed);
          }
        } else if (reward.payload) {
          signedPayloads.push(JSON.parse(reward.payload));
        }
      }
    }

    return { rewards: pendingRewards, signedPayloads };
  }
}

// Singleton instance
export const signatureService = new SignatureService();

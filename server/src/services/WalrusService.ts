import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { db } from '../db/database.js';
import { ContributionTracker } from './ContributionTracker.js';

// ============================================
// Walrus Configuration
// ============================================

const WALRUS_CONFIG = {
  // Walrus publisher endpoints (testnet)
  PUBLISHERS: [
    'https://publisher.walrus-testnet.walrus.space',
    'https://walrus-testnet-publisher.nodes.guru',
    'https://walrus-testnet-publisher.bartestnet.com',
  ],
  
  // Storage epochs (1 epoch ≈ 1 day on testnet)
  DEFAULT_EPOCHS: 5, // Store for ~5 days
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
};

// ============================================
// Types
// ============================================

export interface WalrusUploadResult {
  success: boolean;
  blobId?: string;
  hash?: string;
  size?: number;
  error?: string;
}

export interface MatchSummaryUpload {
  matchId: string;
  blobId: string;
  summaryHash: string;
  uploadedAt: number;
}

// ============================================
// Walrus Service
// ============================================

export class WalrusService {
  private currentPublisherIndex = 0;

  /**
   * Get next publisher URL (round-robin)
   */
  private getPublisher(): string {
    const publisher = WALRUS_CONFIG.PUBLISHERS[this.currentPublisherIndex];
    this.currentPublisherIndex = (this.currentPublisherIndex + 1) % WALRUS_CONFIG.PUBLISHERS.length;
    return publisher;
  }

  /**
   * Compute SHA256 hash of data
   */
  private computeHash(data: Buffer | string): string {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Upload blob to Walrus
   */
  public async uploadBlob(
    data: Buffer | string, 
    epochs: number = WALRUS_CONFIG.DEFAULT_EPOCHS
  ): Promise<WalrusUploadResult> {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const hash = this.computeHash(buffer);
    
    let lastError: Error | null = null;

    for (let retry = 0; retry < WALRUS_CONFIG.MAX_RETRIES; retry++) {
      const publisher = this.getPublisher();
      
      try {
        console.log(`[Walrus] Uploading ${buffer.length} bytes to ${publisher} (attempt ${retry + 1})`);
        
        const response = await fetch(`${publisher}/v1/blobs?epochs=${epochs}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: buffer,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const result = await response.json() as {
          newlyCreated?: { blobObject: { blobId: string } };
          alreadyCertified?: { blobId: string };
        };
        
        // Walrus returns different structures depending on whether blob is new or already certified
        let blobId: string;
        
        if (result.newlyCreated) {
          blobId = result.newlyCreated.blobObject.blobId;
        } else if (result.alreadyCertified) {
          blobId = result.alreadyCertified.blobId;
        } else {
          throw new Error('Unexpected Walrus response format');
        }

        console.log(`[Walrus] Upload successful: ${blobId}`);
        
        return {
          success: true,
          blobId,
          hash,
          size: buffer.length,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`[Walrus] Upload failed (attempt ${retry + 1}):`, error);
        
        if (retry < WALRUS_CONFIG.MAX_RETRIES - 1) {
          await this.delay(WALRUS_CONFIG.RETRY_DELAY);
        }
      }
    }

    return {
      success: false,
      hash,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Upload compressed data
   */
  public async uploadCompressed(data: string): Promise<WalrusUploadResult> {
    const compressed = gzipSync(Buffer.from(data, 'utf-8'));
    return this.uploadBlob(compressed);
  }

  /**
   * Upload match summary to Walrus and update database
   */
  public async uploadMatchSummary(matchId: string): Promise<MatchSummaryUpload | null> {
    // Generate summary
    const summary = await ContributionTracker.generateMatchSummary(matchId);
    if (!summary) {
      console.error(`[Walrus] Match ${matchId} not found`);
      return null;
    }

    // Convert to JSON
    const summaryJson = JSON.stringify(summary, null, 2);
    const summaryHash = this.computeHash(summaryJson);

    // Upload to Walrus
    const uploadResult = await this.uploadBlob(summaryJson);
    
    if (!uploadResult.success || !uploadResult.blobId) {
      console.error(`[Walrus] Failed to upload match ${matchId} summary:`, uploadResult.error);
      return null;
    }

    // Update match record in database
    await db.updateMatch(matchId, {
      summaryHash,
      walrusBlobId: uploadResult.blobId,
    });

    console.log(`[Walrus] Match ${matchId} summary uploaded`);
    console.log(`  - Blob ID: ${uploadResult.blobId}`);
    console.log(`  - Hash: ${summaryHash}`);
    console.log(`  - Size: ${uploadResult.size} bytes`);

    return {
      matchId,
      blobId: uploadResult.blobId,
      summaryHash,
      uploadedAt: Date.now(),
    };
  }

  /**
   * Get blob URL for reading
   */
  public getBlobUrl(blobId: string): string {
    // Walrus aggregator for reading
    return `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
  }

  /**
   * Verify blob exists and hash matches
   */
  public async verifyBlob(blobId: string, expectedHash?: string): Promise<boolean> {
    try {
      const url = this.getBlobUrl(blobId);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[Walrus] Blob ${blobId} not found`);
        return false;
      }

      if (expectedHash) {
        const data = await response.arrayBuffer();
        const actualHash = this.computeHash(Buffer.from(data));
        
        if (actualHash !== expectedHash) {
          console.error(`[Walrus] Hash mismatch for ${blobId}`);
          console.error(`  - Expected: ${expectedHash}`);
          console.error(`  - Actual: ${actualHash}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`[Walrus] Failed to verify blob ${blobId}:`, error);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const walrusService = new WalrusService();

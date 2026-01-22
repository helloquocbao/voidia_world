import { SuiClient } from "@mysten/sui/client";

export interface EnemyConfig {
  baseHp: number;
  baseDamage: number;
  baseSpeed: number;
}

export interface MaintainerConfig {
  rpcUrl: string;
  baseDifficulty: number; // 1-9 từ WorldMap
  PLOTCount: number; // Số PLOTs trên map
  onSpawnEnemy: (config: EnemyConfig) => void; // Callback spawn 1 quái
  onDifficultyUpdate?: (info: DifficultyInfo) => void;
}

export interface DifficultyInfo {
  baseDifficulty: number;
  networkScore: number; // 0-100
  validatorHealth: number; // 0-100
  effectiveDifficulty: number;
  targetEnemyCount: number; // Số quái cần duy trì
  currentEnemyCount: number;
  networkStatus: string;
  validatorStatus: string;
}

// Base stats theo difficulty (balanced for fun gameplay)

interface BaseStats {
  hp: number;
  damage: number;
  speed: number;
  enemiesPerPLOT: number;
}

export class EnemyMaintainer {
  private client: SuiClient;
  private config: MaintainerConfig;
  private currentEnemyCount: number = 0;
  private targetEnemyCount: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTxCount: bigint = BigInt(0);
  private lastTxTimestampMs: number | null = null;
  private currentDifficulty: DifficultyInfo | null = null;

  // Cache để giảm số lần call RPC
  private cachedNetworkScore: number = 50;
  private cachedValidatorHealth: number = 100;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION_MS = 30000; // Cache 30 giây
  private isFetching: boolean = false;

  constructor(config: MaintainerConfig) {
    this.config = config;
    this.client = new SuiClient({ url: config.rpcUrl });
    this.calculateTargetCount();
  }

  private calculateTargetCount() {
    const stats = this.getBaseStats();
    // Target = PLOTs × enemiesPerPLOT (cơ bản, sẽ được điều chỉnh theo network)
    this.targetEnemyCount = Math.ceil(
      this.config.PLOTCount * stats.enemiesPerPLOT,
    );
  }

  private getBaseStats(): BaseStats {
    const difficulty = Math.max(1, Math.min(9, this.config.baseDifficulty));
    const normalized = difficulty / 9;
    return {
      hp: 2 + Math.round(normalized * 12),
      damage: 5 + Math.round(normalized * 18),
      speed: 30 + Math.round(normalized * 25),
      enemiesPerPLOT: 0.5 + normalized * 3.5,
    };
  }

  // Gọi từ game mỗi khi quái chết hoặc spawn
  updateEnemyCount(count: number) {
    this.currentEnemyCount = count;
  }

  async start(checkIntervalMs: number = 10000) {
    // Fetch ngay lập tức
    await this.checkAndMaintain();

    // Check định kỳ
    this.intervalId = setInterval(() => {
      this.checkAndMaintain();
    }, checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkAndMaintain() {
    const now = Date.now();
    const shouldFetchFromSui =
      now - this.lastFetchTime > this.CACHE_DURATION_MS;

    let networkScore = this.cachedNetworkScore;
    let validatorHealth = this.cachedValidatorHealth;

    // Chỉ fetch từ Sui nếu cache hết hạn và không đang fetch
    if (shouldFetchFromSui && !this.isFetching) {
      this.isFetching = true;
      try {
        const totalTransaction = await this.client.getTotalTransactionBlocks();

        networkScore = this.calculateNetworkScore(totalTransaction);
        console.log("Total Transaction:", networkScore);
        validatorHealth = 100;

        // Update cache
        this.cachedNetworkScore = networkScore;
        this.cachedValidatorHealth = validatorHealth;
        this.lastFetchTime = now;

        console.log("[EnemyMaintainer] Fetched fresh data from Sui");
      } catch (error) {
        console.warn(
          "[EnemyMaintainer] Sui fetch failed, using cached data:",
          error,
        );
      } finally {
        this.isFetching = false;
      }
    }

    // Tính toán difficulty (dùng cached data nếu không fetch mới)
    try {
      // Tính effective difficulty và target count
      const networkFactor = 0.8 + (networkScore / 100) * 0.4; // 0.8 - 1.2
      const validatorFactor = 0.9 + (validatorHealth / 100) * 0.2; // 0.9 - 1.1
      const effectiveDifficulty = Math.min(
        9,
        this.config.baseDifficulty * networkFactor * validatorFactor,
      );

      // Fixed target count
      this.targetEnemyCount = this.config.PLOTCount * 2;

      this.targetEnemyCount = Math.max(1, this.targetEnemyCount);

      // Update difficulty info
      this.currentDifficulty = {
        baseDifficulty: this.config.baseDifficulty,
        networkScore,
        validatorHealth,
        effectiveDifficulty,
        targetEnemyCount: this.targetEnemyCount,
        currentEnemyCount: this.currentEnemyCount,
        networkStatus: this.getNetworkStatus(networkScore),
        validatorStatus: this.getValidatorStatus(validatorHealth),
      };

      if (this.config.onDifficultyUpdate) {
        this.config.onDifficultyUpdate(this.currentDifficulty);
      }

      // Spawn thêm quái nếu cần (chỉ spawn 1 con mỗi lần check)
      if (this.currentEnemyCount < this.targetEnemyCount) {
        this.spawnOneEnemy(effectiveDifficulty);
      }
    } catch (error) {
      console.error("[EnemyMaintainer] Error:", error);
      // Fallback: vẫn maintain với base difficulty
      if (this.currentEnemyCount < this.targetEnemyCount) {
        this.spawnOneEnemy(this.config.baseDifficulty);
      }
    }
  }

  private calculateNetworkScore(totalTransaction: any): number {
    const currentTxCount = BigInt(totalTransaction || "0");
    const now = Date.now();

    let txDelta = 0;
    if (this.lastTxCount > BigInt(0)) {
      txDelta = Number(currentTxCount - this.lastTxCount);
    }
    this.lastTxCount = currentTxCount;

    const prevTs = this.lastTxTimestampMs ?? now;
    const deltaMs = Math.max(1, now - prevTs);
    this.lastTxTimestampMs = now;
    const tps = txDelta / (deltaMs / 1000);

    const targetTps = 100;
    const txScore = Math.min(100, (tps / targetTps) * 100);

    return Math.max(0, Math.min(100, txScore));
  }

  private getNetworkStatus(score: number): string {
    if (score < 25) return "🟢 Quiet";
    if (score < 50) return "🟡 Normal";
    if (score < 75) return "🟠 Busy";
    return "🔴 Very Busy";
  }

  private getValidatorStatus(score: number): string {
    if (score >= 80) return "🟢 Healthy";
    if (score >= 60) return "🟡 Good";
    if (score >= 40) return "🟠 Warning";
    return "🔴 Critical";
  }

  private spawnOneEnemy(effectiveDifficulty: number) {
    const baseStats = this.getBaseStats();

    // Scale stats theo effective difficulty
    const difficultyScale = effectiveDifficulty / this.config.baseDifficulty;

    const config: EnemyConfig = {
      baseHp: Math.ceil(baseStats.hp * difficultyScale),
      baseDamage: Math.ceil(baseStats.damage * difficultyScale),
      baseSpeed: Math.ceil(baseStats.speed * difficultyScale),
    };

    this.config.onSpawnEnemy(config);
    this.currentEnemyCount++;
  }

  getCurrentDifficulty(): DifficultyInfo | null {
    return this.currentDifficulty;
  }

  getTargetCount(): number {
    return this.targetEnemyCount;
  }

  getCurrentCount(): number {
    return this.currentEnemyCount;
  }
}

// Singleton
let maintainerInstance: EnemyMaintainer | null = null;

export function initEnemyMaintainer(config: MaintainerConfig): EnemyMaintainer {
  if (maintainerInstance) {
    maintainerInstance.stop();
  }
  maintainerInstance = new EnemyMaintainer(config);
  return maintainerInstance;
}

export function getEnemyMaintainer(): EnemyMaintainer | null {
  return maintainerInstance;
}

export function stopEnemyMaintainer() {
  if (maintainerInstance) {
    maintainerInstance.stop();
    maintainerInstance = null;
  }
}



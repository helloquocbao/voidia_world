import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  PACKAGE_ID,
  RANDOM_OBJECT_ID,
  REWARD_COIN_TYPE,
  REWARD_VAULT_ID,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import { startGame, resetGame } from "../game/start";
import {
  isWalkableTile,
  normalizeTileId,
  normalizeDecoId,
} from "../game/tiles";
import { User, Gift, Info, X, Copy, RefreshCw, Play, Skull } from "lucide-react";
import { WalletHeader } from "../components";
import { useRewardBalance } from "../hooks/useRewardBalance";
import "./GamePage.css";

const TILE_SIZE = 32;
const CHUNK_SIZE = 5;
const PLAY_FEE = 5n;
const PLAY_STATE_KEY = "PLAY_STATE";
const PLAY_TARGET_KEY = "PLAY_TARGET";

export default function GamePage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const { refetch: refetchBalance } = useRewardBalance();
  const [worldId, setWorldId] = useState("");
  const [worldListError, setWorldListError] = useState("");
  const [mapLoadError, setMapLoadError] = useState("");
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState(null);
  const [rewardBalance, setRewardBalance] = useState("0");
  const [playId, setPlayId] = useState("");
  const [policyIdHex, setPolicyIdHex] = useState("");
  const [playNotice, setPlayNotice] = useState("");
  const [playError, setPlayError] = useState("");
  const [claimError, setClaimError] = useState("");
  const [isKeyFound, setIsKeyFound] = useState(false);
  const [isPlayBusy, setIsPlayBusy] = useState(false);
  const [isClaimBusy, setIsClaimBusy] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [pendingMapData, setPendingMapData] = useState(null);

  // Pre-start modal (local/off-chain entry)
  const [showStartModal, setShowStartModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [startMode, setStartMode] = useState("player"); // Default to off-chain
  const [startModalError, setStartModalError] = useState("");
  const [startChainMode, setStartChainMode] = useState("v1");

  // Play mode: 'v1' = free (2 plays/day), 'v2' = paid (3 plays/day, better rewards)
  const [playMode, setPlayMode] = useState("v1");

  // Active panel state: null | 'character' | 'rewards' | 'info'
  const [activePanel, setActivePanel] = useState(null);

  // Character stats
  const [characterId, setCharacterId] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterHealth, setCharacterHealth] = useState(0);
  const [characterPower, setCharacterPower] = useState(0);
  const [characterPotential, setCharacterPotential] = useState(0);
  const [characterDailyPlays, setCharacterDailyPlays] = useState(0);
  const [characterFreePlays, setCharacterFreePlays] = useState(0);

  // Create character modal
  const [showCreateCharacterModal, setShowCreateCharacterModal] =
    useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [createCharacterError, setCreateCharacterError] = useState("");

  // Restore session modal (for switching devices)
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restorePlayId, setRestorePlayId] = useState("");
  const [restoreWorldId, setRestoreWorldId] = useState("");
  const [unclaimedPlays, setUnclaimedPlays] = useState([]); // List of unclaimed plays from chain
  const [isFetchingUnclaimed, setIsFetchingUnclaimed] = useState(false);

  // Dynamic difficulty info from chain
  const [difficultyInfo, setDifficultyInfo] = useState({
    baseDifficulty: 1,
    effectiveDifficulty: 1,
    targetEnemyCount: 0,
    currentEnemyCount: 0,
    networkStatus: "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Âª Loading...",
    validatorStatus: "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Âª Loading...",
  });
  const [respawnCountdown, setRespawnCountdown] = useState(null);

  useEffect(() => {
    const stored = loadPlayState();
    const target = loadPlayTarget();
    if (stored) {
      setPlayId(stored.playId);
      const nextPolicyHex =
        stored.policyIdHex ||
        (stored.playId && stored.playId !== "pending"
          ? derivePolicyIdHex(stored.playId)
          : "");
      setPolicyIdHex(nextPolicyHex);
      // Notify user about restored session
      if (stored.playId === "pending") {
        setPlayNotice(
          `ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â³ Transaction pending, waiting for chain to index. Click "Retry Fetch" to recover Play ID.`
        );
      } else {
        setPlayNotice(
          `Restored pending session (Play ID: ${stored.playId}). Use the Seal policy ID to request approval.`
        );
      }
    }
    setIsKeyFound(Boolean(target?.found));
  }, []);

  useEffect(() => {
    const handler = () => setIsKeyFound(true);
    const deadHandler = () => {
      console.log("GamePage: Received game:player-dead event");
      setRespawnCountdown(3);
      const interval = setInterval(() => {
        setRespawnCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            reloadGameFromStorage();
            setPlayNotice(""); // Clear any notice
            return null; // Close modal
          }
          return prev - 1;
        });
      }, 1000);
    };
    window.addEventListener("game:key-found", handler);
    window.addEventListener("game:player-dead", deadHandler);
    return () => {
      window.removeEventListener("game:key-found", handler);
      window.removeEventListener("game:player-dead", deadHandler);
    };
  }, []);

  // Listen for difficulty updates from game
  useEffect(() => {
    const handler = (event) => {
      const info = event.detail;
      if (info) {
        setDifficultyInfo({
          baseDifficulty: info.baseDifficulty ?? 1,
          effectiveDifficulty: info.effectiveDifficulty ?? 1,
          targetEnemyCount: info.targetEnemyCount ?? 0,
          currentEnemyCount: info.currentEnemyCount ?? 0,
          networkStatus: info.networkStatus ?? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Âª Unknown",
          validatorStatus: info.validatorStatus ?? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Âª Unknown",
        });
      }
    };
    window.addEventListener("game:difficulty-update", handler);
    return () => window.removeEventListener("game:difficulty-update", handler);
  }, []);

  // Cleanup game state when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      resetGame();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      // Load world list and auto-load first world
      await loadWorldListAndMap();
    })();
  }, [WORLD_REGISTRY_ID]);

  useEffect(() => {
    void loadRewardBalance();
    void loadCharacter();
  }, [account?.address]);

  async function loadCharacter() {
    if (!account?.address || !PACKAGE_ID) {
      setCharacterId("");
      setCharacterName("");
      setCharacterHealth(0);
      setCharacterPower(0);
      setCharacterPotential(0);
      setCharacterDailyPlays(0);
      setCharacterFreePlays(0);
      return "";
    }
    try {
      const characterType = `${PACKAGE_ID}::world::CharacterNFT`;
      const result = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: characterType },
        options: { showContent: true },
      });

      if (result.data.length > 0) {
        const obj = result.data[0];
        const content = obj.data?.content;
        if (content && content.dataType === "moveObject") {
          const fields = normalizeMoveFields(content.fields);
          const nextId = obj.data?.objectId ?? "";
          setCharacterId(nextId);
          setCharacterName(String(fields.name ?? ""));
          setCharacterHealth(parseU32Value(fields.health) ?? 100);
          setCharacterPower(parseU32Value(fields.power) ?? 0);
          setCharacterPotential(parseU32Value(fields.potential) ?? 0);
          setCharacterDailyPlays(parseU32Value(fields.daily_plays) ?? 0);
          setCharacterFreePlays(parseU32Value(fields.free_daily_plays) ?? 0);
          return nextId;
        }
      }
    } catch (error) {
      console.error("Failed to load character:", error);
    }
    return "";
  }

  const isWalletBusy = isPending || isPlayBusy || isClaimBusy;
  const currentPolicyHex =
    policyIdHex || (playId && playId !== "pending" ? derivePolicyIdHex(playId) : "");
  const restorePolicyPreview = restorePlayId
    ? derivePolicyIdHex(restorePlayId)
    : "";

  async function loadWorldId() {
    setWorldListError("");
    if (!WORLD_REGISTRY_ID) {
      setWorldId("");
      return "";
    }

    try {
      const result = await suiClient.getObject({
        id: WORLD_REGISTRY_ID,
        options: { showContent: true },
      });

      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        setWorldId("");
        return "";
      }

      const fields = normalizeMoveFields(content.fields);
      const worldField =
        fields.world_id ?? fields.worldId ?? fields.world ?? undefined;
      if (!worldField) {
        setWorldId("");
        return "";
      }

      const optionFields = normalizeMoveFields(worldField);
      const vec = optionFields.vec;
      const id = Array.isArray(vec) && vec.length > 0 ? String(vec[0]) : "";
      setWorldId(id);
      return id;
    } catch (error) {
      setWorldListError(error instanceof Error ? error.message : String(error));
      setWorldId("");
      return "";
    }
  }

  async function loadWorldListAndMap() {
    setMapLoadError("");
    setWorldListError("");
    setIsMapLoading(true);

    try {
      const ids = [];

      // First try to get from registry
      const registryId = await loadWorldId();
      if (registryId) ids.push(registryId);

      // Then query WorldCreatedEvent for more worlds
      if (PACKAGE_ID) {
        const eventType = `${PACKAGE_ID}::world::WorldCreatedEvent`;
        let cursor = null;
        let hasNextPage = true;
        let rounds = 0;

        while (hasNextPage && rounds < 6) {
          const page = await suiClient.queryEvents({
            query: { MoveEventType: eventType },
            cursor: cursor ?? undefined,
            limit: 50,
            order: "descending",
          });

          for (const event of page.data) {
            const parsed = event.parsedJson;
            if (!parsed || typeof parsed !== "object") continue;
            const record = parsed;
            const id =
              typeof record.world_id === "string"
                ? record.world_id
                : typeof record.worldId === "string"
                  ? record.worldId
                  : "";
            if (id && !ids.includes(id)) ids.push(id);
          }

          cursor = page.nextCursor ?? null;
          hasNextPage = page.hasNextPage;
          rounds += 1;
        }
      }

      // Auto-load the first world in the list
      if (ids.length > 0) {
        const firstWorldId = ids[0];
        setWorldId(firstWorldId);
        setIsMapLoading(false);
        await loadWorldMap(firstWorldId);
      } else {
        setMapLoadError("No worlds found.");
        setIsMapLoading(false);
      }
    } catch (error) {
      setWorldListError(error instanceof Error ? error.message : String(error));
      setIsMapLoading(false);
    }
  }

  async function loadRewardBalance() {
    if (!account?.address || !REWARD_COIN_TYPE) {
      setRewardBalance("0");
      return;
    }

    try {
      const coins = await suiClient.getCoins({
        owner: account.address,
        coinType: REWARD_COIN_TYPE,
      });
      const total = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        0n
      );
      setRewardBalance(total.toString());
    } catch (error) {
      console.error(error);
      setRewardBalance("0");
    }
  }

  async function getPlayableCoin() {
    if (!account?.address || !REWARD_COIN_TYPE) return null;
    const coins = await suiClient.getCoins({
      owner: account.address,
      coinType: REWARD_COIN_TYPE,
    });
    return coins.data.find((coin) => BigInt(coin.balance) >= PLAY_FEE) ?? null;
  }

  function derivePolicyIdHex(nextPlayId) {
    try {
      const bytes = bcs.ser("u64", BigInt(nextPlayId)).toBytes();
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (error) {
      console.error("Failed to derive policy id", error);
      return "";
    }
  }

  function hexToBytes(hex) {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0) return [];
    const arr = [];
    for (let i = 0; i < clean.length; i += 2) {
      arr.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return arr;
  }

  function storePlayState(nextState) {
    localStorage.setItem(PLAY_STATE_KEY, JSON.stringify(nextState));
  }

  function loadPlayState() {
    const raw = localStorage.getItem(PLAY_STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function clearPlayState() {
    localStorage.removeItem(PLAY_STATE_KEY);
    localStorage.removeItem(PLAY_TARGET_KEY);
    localStorage.removeItem("PLAY_CHESTS");
  }

  function resetPlayState(nextNotice) {
    clearPlayState();
    setPlayId("");
    setPolicyIdHex("");
    setIsKeyFound(false);
    if (nextNotice) {
      setPlayNotice(nextNotice);
    }
  }

  // Retry fetching playId from pending transaction
  async function retryFetchPlayId() {
    const stored = loadPlayState();
    if (!stored || stored.playId !== "pending" || !stored.digest) {
      return;
    }

    setPlayNotice("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ Retrying to fetch play ID from chain...");

    try {
      const txBlock = await suiClient.getTransactionBlock({
        digest: stored.digest,
        options: { showEvents: true },
      });

      const eventType = `${PACKAGE_ID}::world::PlayCreatedEvent`;
      const playEvent = txBlock.events?.find((e) => e.type === eventType);
      const parsed = playEvent?.parsedJson ?? {};
      const nextPlayId =
        typeof parsed.play_id === "string"
          ? parsed.play_id
          : typeof parsed.play_id === "number"
            ? String(parsed.play_id)
            : "";

      if (nextPlayId) {
        const policyHex = derivePolicyIdHex(nextPlayId);
        storePlayState({
          ...stored,
          playId: nextPlayId,
          policyIdHex: policyHex,
        });
        setPlayId(nextPlayId);
        setPolicyIdHex(policyHex);
        setPlayNotice(
          `✅ Recovered Play ID: ${nextPlayId}. Policy ID ready for Seal.`
        );
      } else {      } else {
        setPlayError("Still couldn't fetch play_id. Try again later.");
      }
    } catch (error) {
      setPlayError(
        "Failed to fetch: " +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  // Fetch unclaimed plays cÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚Â»Ãƒâ€šÃ‚Â§a user tÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚Â»Ãƒâ€šÃ‚Â« on-chain events
  async function fetchUnclaimedPlays() {
    if (!account?.address || !PACKAGE_ID) return;

    setIsFetchingUnclaimed(true);
    try {
      // 1. Fetch tÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚ÂºÃƒâ€šÃ‚Â¥t cÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚ÂºÃƒâ€šÃ‚Â£ PlayCreatedEvent cÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚Â»Ãƒâ€šÃ‚Â§a user
      const playEventType = `${PACKAGE_ID}::world::PlayCreatedEvent`;
      const claimEventType = `${PACKAGE_ID}::world::RewardClaimedEvent`;

      // Fetch play events (created by user)
      const playEvents = [];
      let cursor = null;
      let rounds = 0;
      const maxRounds = 10;

      while (rounds < maxRounds) {
        const page = await suiClient.queryEvents({
          query: { MoveEventType: playEventType },
          cursor: cursor ?? undefined,
          limit: 50,
          order: "descending",
        });

        const events = page.data ?? [];
        for (const event of events) {
          const parsed = event.parsedJson ?? {};
          if (parsed.creator === account.address) {
            playEvents.push({
              playId: String(parsed.play_id ?? ""),
              worldId: parsed.world_id ?? "",
              minReward: parsed.min_reward ?? 0,
              maxReward: parsed.max_reward ?? 0,
              timestamp: event.timestampMs,
            });
          }
        }

        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
        rounds++;
      }

      // 2. Fetch claimed play IDs
      const claimedPlayIds = new Set();
      cursor = null;
      rounds = 0;

      while (rounds < maxRounds) {
        const page = await suiClient.queryEvents({
          query: { MoveEventType: claimEventType },
          cursor: cursor ?? undefined,
          limit: 50,
          order: "descending",
        });

        const events = page.data ?? [];
        for (const event of events) {
          const parsed = event.parsedJson ?? {};
          if (parsed.recipient === account.address) {
            claimedPlayIds.add(String(parsed.play_id ?? ""));
          }
        }

        if (!page.hasNextPage || !page.nextCursor) break;
        cursor = page.nextCursor;
        rounds++;
      }

      // 3. Filter unclaimed plays
      const unclaimed = playEvents.filter((p) => !claimedPlayIds.has(p.playId));
      setUnclaimedPlays(unclaimed);

      if (unclaimed.length === 0) {
        setPlayNotice("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ KhÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â´ng cÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³ play nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â o chÃƒÆ’Ã¢â‚¬Â Ãƒâ€šÃ‚Â°a claim!");
      } else {
        setPlayNotice(
          `ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ TÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¬m thÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚ÂºÃƒâ€šÃ‚Â¥y ${unclaimed.length} play chÃƒÆ’Ã¢â‚¬Â Ãƒâ€šÃ‚Â°a claim. ChÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚Â»Ãƒâ€šÃ‚Ân ÃƒÆ’Ã¢â‚¬Å¾ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÆ’Ã‚Â¡Ãƒâ€šÃ‚Â»Ãƒâ€ Ã¢â‚¬â„¢ restore.`
        );
      }
    } catch (error) {
      setPlayError(
        "Failed to fetch: " +
        (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setIsFetchingUnclaimed(false);
    }
  }

  function storePlayTarget(target) {
    localStorage.setItem(PLAY_TARGET_KEY, JSON.stringify(target));
  }

  function loadPlayTarget() {
    const raw = localStorage.getItem(PLAY_TARGET_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function getStoredMapData() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // Update characterHealth with current value
      parsed.characterHealth = characterHealth || 100;
      return parsed;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function reloadGameFromStorage() {
    const parsed = getStoredMapData();
    if (!parsed) return;
    startGame(parsed);
  }

  async function loadWorldMap(targetWorldId) {
    setMapLoadError("");
    setIsMapLoading(true);
    setLoadedChunks(null);

    try {
      const fieldEntries = await fetchAllDynamicFields(targetWorldId);
      if (fieldEntries.length === 0) {
        setMapLoadError("World has no chunks yet.");
        setLoadedChunks(0);
        return;
      }

      const chunkEntries = await resolveChunkEntries(
        targetWorldId,
        fieldEntries
      );
      if (chunkEntries.length === 0) {
        setMapLoadError("No chunk entries found.");
        setLoadedChunks(0);
        return;
      }

      const chunkIds = chunkEntries.map((entry) => entry.chunkId);
      const chunkObjects = await suiClient.multiGetObjects({
        ids: chunkIds,
        options: { showContent: true },
      });

      const maxCx = Math.max(...chunkEntries.map((entry) => entry.cx));
      const maxCy = Math.max(...chunkEntries.map((entry) => entry.cy));
      const width = (maxCx + 1) * CHUNK_SIZE;
      const height = (maxCy + 1) * CHUNK_SIZE;

      const newGrid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));
      const newDecoGrid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));

      for (let index = 0; index < chunkEntries.length; index++) {
        const entry = chunkEntries[index];
        const response = chunkObjects[index];
        let content = response.data?.content;
        if (!content || content.dataType !== "moveObject") {
          content = await fetchListedChunk(targetWorldId, entry.chunkId);
          console.log("Fetched listed chunk:", content);
        }
        if (!content || content.dataType !== "moveObject") continue;
        const fields = normalizeMoveFields(content.fields);
        const tiles = normalizeMoveVector(fields.tiles).map((tile) =>
          normalizeTileId(clampU8(parseU32Value(tile) ?? 0, 255))
        );
        const decorations = normalizeMoveVector(fields.decorations ?? []).map(
          (deco) => normalizeDecoId(clampU8(parseU32Value(deco) ?? 0, 255))
        );

        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const idx = y * CHUNK_SIZE + x;
            newGrid[entry.cy * CHUNK_SIZE + y][entry.cx * CHUNK_SIZE + x] =
              tiles[idx] ?? 0;
            newDecoGrid[entry.cy * CHUNK_SIZE + y][entry.cx * CHUNK_SIZE + x] =
              decorations[idx] ?? 0;
          }
        }
      }

      const mapData = {
        tileSize: TILE_SIZE,
        width,
        height,
        grid: newGrid,
        decoGrid: newDecoGrid,
        worldId: targetWorldId,
        characterHealth: characterHealth || 100,
        difficulty: 1, // default, will fetch from WorldMap
        chunkCount: chunkEntries.length,
      };

      // Fetch difficulty from WorldMap object
      try {
        const worldObj = await suiClient.getObject({
          id: targetWorldId,
          options: { showContent: true },
        });
        if (worldObj.data?.content?.dataType === "moveObject") {
          const worldFields = normalizeMoveFields(worldObj.data.content.fields);
          const difficulty = parseInt(worldFields.difficulty) || 1;
          mapData.difficulty = Math.max(1, Math.min(9, difficulty));
        }
      } catch (e) {
        console.warn("Could not fetch world difficulty:", e);
      }

      localStorage.setItem("CUSTOM_MAP", JSON.stringify(mapData));
      setPendingMapData(mapData);
      setLoadedChunks(chunkEntries.length);

      // Auto-start logic: check for pending on-chain task
      if (!isGameStarted) {
        const storedPlay = loadPlayState();
        const storedTarget = loadPlayTarget();
        const hasPendingTask = storedPlay?.playId && !storedTarget?.found;

        if (hasPendingTask) {
          // Show resume modal for pending task
          setShowResumeModal(true);
        } else {
          // Auto-start in offchain mode
          setIsGameStarted(true);
          startGame(mapData);
        }
      } else {
        // Game already started, just reload
        startGame(mapData);
      }
    } catch (error) {
      setMapLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMapLoading(false);
    }
  }

  function pickKeyTarget() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const grid = Array.isArray(parsed.grid) ? parsed.grid : [];
      const floors = [];
      for (let y = 0; y < grid.length; y += 1) {
        const row = grid[y] ?? [];
        for (let x = 0; x < row.length; x += 1) {
          if (isWalkableTile(Number(row[x]))) {
            floors.push({ x, y });
          }
        }
      }
      if (!floors.length) return null;
      return floors[Math.floor(Math.random() * floors.length)];
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function generateChests(keyTarget) {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      const grid = Array.isArray(parsed.grid) ? parsed.grid : [];
      const floors = [];
      for (let y = 0; y < grid.length; y += 1) {
        const row = grid[y] ?? [];
        for (let x = 0; x < row.length; x += 1) {
          if (isWalkableTile(Number(row[x]))) {
            floors.push({ x, y });
          }
        }
      }
      if (!floors.length) return [];

      const chests = [{ x: keyTarget.x, y: keyTarget.y, hasKey: true, id: "chest_key" }];

      // Pick 4 more unique locations
      let attempts = 0;
      while (chests.length < 5 && attempts < 100) {
        attempts++;
        const candidate = floors[Math.floor(Math.random() * floors.length)];
        const exists = chests.some(c => c.x === candidate.x && c.y === candidate.y);
        if (!exists) {
          chests.push({ x: candidate.x, y: candidate.y, hasKey: false, id: `chest_${chests.length}` });
        }
      }
      return chests;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function handlePlayOnChain(nextMode) {
    setPlayError("");
    setPlayNotice("");
    setClaimError("");
    const resolvedMode = typeof nextMode === "string" ? nextMode : null;
    if (resolvedMode) {
      setPlayMode(resolvedMode);
    }
    const effectiveMode = resolvedMode ?? playMode;

    if (!account?.address) {
      setPlayError("Connect wallet first.");
      return;
    }
    if (!PACKAGE_ID || !REWARD_VAULT_ID) {
      setPlayError("Missing package or reward vault id.");
      return;
    }
    if (!worldId) {
      setPlayError("World not loaded.");
      return;
    }

    // Check if character exists
    if (!characterId) {
      setShowCreateCharacterModal(true);
      return;
    }

    // Check play limits
    if (effectiveMode === "v1" && characterFreePlays >= 2) {
      setPlayError(
        "Free play limit reached (2/day). Use Play V2 or wait for next epoch."
      );
      return;
    }
    if (effectiveMode === "v2" && characterDailyPlays >= 3) {
      setPlayError("Daily play limit reached (3/day). Wait for next epoch.");
      return;
    }

    // V2 requires coin, V1 is free
    let playableCoin = null;
    if (effectiveMode === "v2") {
      playableCoin = await getPlayableCoin();
      if (!playableCoin) {
        setPlayError("Need at least 5 CHUNK coin to play V2.");
        return;
      }
    }

    setIsPlayBusy(true);
    try {
      const tx = new Transaction();

      if (effectiveMode === "v1") {
        // Play V1: Free play (no coin required)
        tx.moveCall({
          target: `${PACKAGE_ID}::world::play_v1`,
          arguments: [
            tx.object(worldId),
            tx.object(REWARD_VAULT_ID),
            tx.object(characterId),
          ],
        });
      } else {
        // Play V2: Paid play (requires 5 CHUNK)
        tx.moveCall({
          target: `${PACKAGE_ID}::world::play_v2`,
          arguments: [
            tx.object(worldId),
            tx.object(REWARD_VAULT_ID),
            tx.object(characterId),
            tx.object(playableCoin.coinObjectId),
          ],
        });
      }

      const result = await signAndExecute({ transaction: tx });
      console.log("result", result);

      // Retry logic: Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â£i transaction Ãƒâ€žÃ¢â‚¬ËœÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£c index trÃƒÆ’Ã‚Âªn chain
      let txBlock = null;
      let retryCount = 0;
      const maxRetries = 5;
      const retryDelay = 1500; // 1.5 giÃƒÆ’Ã‚Â¢y

      while (retryCount < maxRetries) {
        try {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          txBlock = await suiClient.getTransactionBlock({
            digest: result.digest,
            options: { showEvents: true },
          });
          if (txBlock && txBlock.events) {
            break; // Success
          }
        } catch (fetchError) {
          console.warn(
            `Retry ${retryCount + 1}/${maxRetries}: waiting for transaction...`,
            fetchError
          );
        }
        retryCount++;
      }

      if (!txBlock) {
        // Fallback: keep digest so we can recover play_id later
        storePlayState({
          playId: "pending",
          policyIdHex: "",
          worldId: worldId,
          found: false,
          digest: result.digest,
        });
        setPolicyIdHex("");
        setPlayError(
          "Transaction submitted but couldn't fetch details. Please verify claim status later."
        );
        return;
      }
      console.log("txBlock", txBlock);
      const eventType = `${PACKAGE_ID}::world::PlayCreatedEvent`;
      console.log("eventType", eventType);
      const playEvent = txBlock.events?.find(
        (event) => event.type === eventType
      );
      console.log("playEvent", playEvent);
      const parsed = playEvent?.parsedJson ?? {};
      const nextPlayId =
        typeof parsed.play_id === "string"
          ? parsed.play_id
          : typeof parsed.play_id === "number"
            ? String(parsed.play_id)
            : "";
      console.log("nextPlayId", nextPlayId);
      if (!nextPlayId) {
        setPlayError("Play created but play_id not found.");
        return;
      }

      const policyHex = derivePolicyIdHex(nextPlayId);
      const target = pickKeyTarget();
      if (target) {
        storePlayTarget({ ...target, worldId: worldId, found: false });
        // Generate chests
        const chests = generateChests(target);
        localStorage.setItem("PLAY_CHESTS", JSON.stringify(chests));
      }

      storePlayState({
        playId: nextPlayId,
        policyIdHex: policyHex,
        worldId: worldId,
        found: false,
      });
      setPlayId(nextPlayId);
      setPolicyIdHex(policyHex);
      setIsKeyFound(false);
      setIsGameStarted(true);
      reloadGameFromStorage();
      setPlayNotice(
        target
          ? `Seal policy ready. Policy ID (BCS play_id): ${policyHex}. Key hidden at tile (${target.x}, ${target.y}).`
          : `Seal policy ready. Policy ID (BCS play_id): ${policyHex}. Load a map to hide the key.`
      );
      await loadRewardBalance();
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPlayBusy(false);
    }
  }async function handleStartModalAction() {
    setStartModalError("");

    // Default to player mode - auto start off-chain
    if (startMode === "player") {
      if (isMapLoading) {
        setStartModalError("World is still loading.");
        return;
      }
      const nextMapData = pendingMapData ?? getStoredMapData();
      if (!nextMapData) {
        setStartModalError("World not ready yet.");
        return;
      }
      setIsGameStarted(true);
      setShowStartModal(false);
      startGame(nextMapData);
      return;
    }

    if (startMode === "resume") {
      const nextMapData = pendingMapData ?? getStoredMapData();
      if (!nextMapData) {
        setStartModalError("World not ready yet.");
        return;
      }
      setIsGameStarted(true);
      setShowStartModal(false);
      startGame(nextMapData);
      return;
    }

    if (!account?.address) {
      setStartModalError("Connect wallet for on-chain play.");
      return;
    }
    const resolvedCharacterId = characterId || (await loadCharacter());
    if (!resolvedCharacterId) {
      setStartModalError("Create a character first.");
      setShowCreateCharacterModal(true);
      return;
    }
    if (startChainMode === "v1" && characterFreePlays >= 2) {
      setStartModalError("Free play limit reached (2/day).");
      return;
    }
    if (startChainMode === "v2" && characterDailyPlays >= 3) {
      setStartModalError("Daily play limit reached (3/day).");
      return;
    }
    setShowStartModal(false);
    void handlePlayOnChain(startChainMode);
  }

  function handleResumeTask() {
    setShowResumeModal(false);
    setIsGameStarted(true);
    reloadGameFromStorage();
  }

  function handleStartFresh() {
    clearPlayState();
    setPlayId("");
    setPolicyIdHex("");
    setIsKeyFound(false);
    setShowResumeModal(false);
    setIsGameStarted(true);
    reloadGameFromStorage();
  }

  async function handleClaimOnChain() {
    setClaimError("");
    setPlayNotice("");

    if (!account?.address) {
      setClaimError("Connect wallet first.");
      return;
    }
    if (!PACKAGE_ID || !REWARD_VAULT_ID || !RANDOM_OBJECT_ID) {
      setClaimError("Missing chain config for claim.");
      return;
    }
    if (!playId) {
      setClaimError("No active play found.");
      return;
    }
    // Optional gating: still require key found in-game
    if (!isKeyFound) {
      setClaimError("Find the hidden key in game first.");
      return;
    }

    if (!policyIdHex) {
      setClaimError("Missing policy ID for seal approve.");
      return;
    }

    if (!worldId) {
      setClaimError("World not loaded.");
      return;
    }

    setIsClaimBusy(true);
    try {
      const tx = new Transaction();
      // Step 1: seal_approve to mark PlayTicket.approved = true
      const policyBytes = hexToBytes(policyIdHex);
      tx.moveCall({
        target: `${PACKAGE_ID}::world::seal_approve`,
        arguments: [
          tx.pure.vector("u8", policyBytes),
          tx.pure.u64(BigInt(playId)),
          tx.object(worldId),
        ],
      });
      // Step 2: claim_reward
      tx.moveCall({
        target: `${PACKAGE_ID}::world::claim_reward`,
        arguments: [
          tx.object(worldId),
          tx.object(REWARD_VAULT_ID),
          tx.object(characterId),
          tx.object(RANDOM_OBJECT_ID),
          tx.pure.u64(BigInt(playId)),
        ],
      });

      const result = await signAndExecute({ transaction: tx });

      // Transaction was submitted successfully - reset play state immediately
      // This ensures the UI updates even if we can't fetch transaction details yet
      let rewardValue = "";

      // Retry logic: wait for transaction to be indexed on chain
      let txBlock = null;
      let retryCount = 0;
      const maxRetries = 5;
      const retryDelay = 1500; // 1.5 seconds

      while (retryCount < maxRetries) {
        try {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          txBlock = await suiClient.getTransactionBlock({
            digest: result.digest,
            options: { showEvents: true },
          });
          if (txBlock && txBlock.events) {
            const eventType = `${PACKAGE_ID}::world::RewardClaimedEvent`;
            const rewardEvent = txBlock.events?.find(
              (event) => event.type === eventType
            );
            const parsed = rewardEvent?.parsedJson ?? {};
            rewardValue =
              typeof parsed.reward === "string"
                ? parsed.reward
                : typeof parsed.reward === "number"
                  ? String(parsed.reward)
                  : "";
            break; // Success
          }
        } catch (fetchError) {
          console.warn(
            `Retry ${retryCount + 1}/${maxRetries}: waiting for claim transaction...`,
            fetchError
          );
        }
        retryCount++;
      }

      // Reset play state regardless of whether we could fetch details
      resetPlayState(
        rewardValue ?
          <div className="flex items-center gap-2">
            Claimed
            <img
              alt="icon"
              className="w-4 h-4"
              src="https://ik.imagekit.io/huubao/chunk_coin.png?updatedAt=1768641987539"
            /> {rewardValue} CHUNK
          </div>
          : "Claimed reward successfully!"
      );
      await loadRewardBalance();
      // Delay to allow indexer to sync before refetching global balance
      setTimeout(() => void refetchBalance(), 1500);
      await loadCharacter(); // Refresh character stats (daily plays, free plays)
      reloadGameFromStorage(); // Refresh map to clear chests
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClaimBusy(false);
    }
  }



  async function handleCreateCharacter() {
    setCreateCharacterError("");

    if (!newCharacterName.trim()) {
      setCreateCharacterError("Character name is required.");
      return;
    }
    if (newCharacterName.trim().length > 32) {
      setCreateCharacterError("Name must be 32 characters or less.");
      return;
    }
    if (!WORLD_REGISTRY_ID) {
      setCreateCharacterError("Missing world registry id.");
      return;
    }

    setIsCreatingCharacter(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::create_character`,
        arguments: [
          tx.object(WORLD_REGISTRY_ID),
          tx.pure.string(newCharacterName.trim()),
        ],
      });

      await signAndExecute({ transaction: tx });

      setPlayNotice("Character created! Syncing with chain...");

      // Delay to allow indexer to catch up
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Reload character after creation with retry
      let nextId = await loadCharacter();
      if (!nextId) {
        // Retry once if not found immediately
        await new Promise((resolve) => setTimeout(resolve, 1500));
        nextId = await loadCharacter();
      }

      setShowCreateCharacterModal(false);
      setNewCharacterName("");
      setPlayNotice("Character created! You can now start playing.");
    } catch (error) {
      setCreateCharacterError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsCreatingCharacter(false);
    }
  }

  const mapReady =
    !isMapLoading && Boolean(pendingMapData ?? getStoredMapData());
  const hasPendingPlay = Boolean(playId);

  return (
    <div className="game-page">
      <div className="game-bg">
        <span className="game-cloud game-cloud--a" />
        <span className="game-cloud game-cloud--b" />
        <span className="game-cloud game-cloud--c" />
        <span className="game-haze" />
      </div>

      {/* Floating Panel Buttons */}
      <div className="game-panel-buttons">
        <button
          className={`game-panel-btn ${activePanel === 'character' ? 'active' : ''}`}
          onClick={() => setActivePanel(activePanel === 'character' ? null : 'character')}
          title="Character"
        >
          <User size={18} />
        </button>
        <button
          className={`game-panel-btn ${activePanel === 'rewards' ? 'active' : ''} ${playId && isKeyFound ? 'notification' : ''}`}
          onClick={() => setActivePanel(activePanel === 'rewards' ? null : 'rewards')}
          title="Rewards"
        >
          <Gift size={18} />
        </button>
        <button
          className={`game-panel-btn ${activePanel === 'info' ? 'active' : ''}`}
          onClick={() => setActivePanel(activePanel === 'info' ? null : 'info')}
          title="Info"
        >
          <Info size={18} />
        </button>
      </div>

      <div className="game-shell">
        {/* Minimal Header */}
        <header className="game-header">
          <nav className="game-nav">
            <Link className="game-link" to="/">
              Home
            </Link>
            <Link className="game-link" to="/editor">
              Editor
            </Link>
            <Link className="game-link" to="/marketplace">
              Marketplace
            </Link>
          </nav>
          <WalletHeader />
        </header>

        <div className="game-stage">
          <div className="game-frame">
            <canvas id="game" />
            {isMapLoading && (
              <div className="game-loading-overlay">
                <div className="game-loading-spinner" />
                <div className="game-loading-text">Loading world...</div>
              </div>
            )}
          </div>

          {/* Character Panel */}
          {activePanel === 'character' && (
            <aside className="game-panel">
              <div className="game-panel__header">
                <span>Character</span>
                <button onClick={() => setActivePanel(null)}><X size={16} /></button>
              </div>
              <div className="game-panel__body">
                {characterId ? (
                  <>
                    <div className="game-info__card">
                      <span>Name</span>
                      <span>{characterName || "-"}</span>
                    </div>
                    <div className="game-info__card">
                      <span>Health</span>
                      <span>{characterHealth}</span>
                    </div>
                    <div className="game-info__card">
                      <span>Power</span>
                      <span>{characterPower}</span>
                    </div>
                    <div className="game-info__card">
                      <span>Potential</span>
                      <span>{characterPotential}</span>
                    </div>
                    <div className="game-info__card">
                      <span>Daily Plays</span>
                      <span>{characterDailyPlays}/3</span>
                    </div>
                    <div className="game-info__card">
                      <span>Free Plays</span>
                      <span>{characterFreePlays}/2</span>
                    </div>
                  </>
                ) : account?.address ? (
                  <div className="game-info__note">
                    No character found.
                    <button
                      className="game-btn game-btn--primary"
                      style={{ marginTop: '8px', width: '100%' }}
                      onClick={() => setShowCreateCharacterModal(true)}
                    >
                      Create Character
                    </button>
                  </div>
                ) : (
                  <div className="game-info__note">Connect wallet to see character.</div>
                )}
              </div>
            </aside>
          )}

          {/* Quest Board Panel */}
          {activePanel === 'rewards' && (
            <aside className="game-panel">
              <div className="game-panel__header">
                <span>Quest Board</span>
                <button onClick={() => setActivePanel(null)}><X size={16} /></button>
              </div>
              <div className="game-panel__body">
                {/* Active Quest Status */}
                {playId && !isKeyFound && (
                  <div className="quest-active">
                                        <div className="quest-active__header">
                      <span className="quest-active__badge">ACTIVE</span>
                      <span className="quest-active__id">Quest #{playId}</span>
                    </div>
                    <div className="quest-active__objective">
                      Ã°Å¸â€Â Find the hidden key to unlock claim on this run.
                    </div>
                    <div className="quest-active__info">
                      <div className="quest-info-row">
                        <span>World:</span>
                        <span>{loadPlayState()?.worldId?.slice(0, 10) || "-"}...</span>
                      </div>
                      <div className="quest-info-row">
                        <span>Status:</span>
                        <span className="text-yellow">In Progress</span>
                      </div>
                    </div>
                    <div className="quest-backup-key">
                      <div className="quest-backup-key__label">Seal Policy ID (BCS play_id):</div>
                      <div className="quest-backup-key__value">
                        <code>{currentPolicyHex}</code>
                        <button
                          className="copy-btn"
                          onClick={() => {
                            if (currentPolicyHex) {
                              navigator.clipboard.writeText(currentPolicyHex);
                              setPlayNotice("Policy ID copied!");
                            }
                          }}
                          title="Copy policy id"
                          disabled={!currentPolicyHex}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                      <div className="quest-backup-key__hint">
                        Share this policy ID with Seal key server for seal_approve.
                      </div>
                    </div><div className="quest-actions">
                      {playId === "pending" && (
                        <button
                          className="game-btn game-btn--retry"
                          onClick={retryFetchPlayId}
                          disabled={isWalletBusy}
                        >
                          <RefreshCw size={12} /> Retry Fetch
                        </button>
                      )}
                      <button
                        className="game-btn game-btn--cancel"
                        onClick={() => {
                          if (confirm("Abandon quest? You will lose progress.")) {
                            resetPlayState("Quest abandoned.");
                          }
                        }}
                      >
                        Abandon Quest
                      </button>
                    </div>
                  </div>
                )}

                {/* Quest Complete - Ready to Claim */}
                {playId && isKeyFound && (
                  <div className="quest-complete">
                    <div className="quest-complete__header">
                      ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Quest Complete!
                    </div>
                    <div className="quest-complete__message">
                      You found the key! Claim your reward now.
                    </div>
                    <button
                      className="game-btn game-btn--primary game-btn--large"
                      onClick={handleClaimOnChain}
                      disabled={isWalletBusy}
                    >
                      {isClaimBusy ? "Claiming..." : "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚Â Claim Reward"}
                    </button>
                  </div>
                )}

                {/* Available Quests */}
                {!playId && (
                  <>

                    {/* Free Quest */}
                    <div className="quest-card quest-card--free">
                      <div className="quest-card__header">
                        <div className="quest-card__title">
                          <span>Free Quest</span>
                        </div>
                        <div className="quest-card__badge quest-card__badge--free">
                          FREE
                        </div>
                      </div>
                      <div className="quest-card__description">
                        Practice run with basic rewards. Perfect for beginners!
                      </div>
                      <div className="quest-card__stats">
                        <div className="quest-stat">
                          <span className="quest-stat__label">Plays Today:</span>
                          <span className="quest-stat__value">{characterFreePlays}/2</span>
                        </div>
                        <div className="quest-stat">
                          <span className="quest-stat__label">Reward:</span>
                          <span className="quest-stat__value flex items-center gap-1">
                            <img
                              alt="chunk"
                              className="w-3 h-3"
                              src="https://ik.imagekit.io/huubao/chunk_coin.png"
                            />
                            2 CHUNK
                          </span>
                        </div>
                      </div>
                      <button
                        className="game-btn game-btn--quest game-btn--quest-free"
                        onClick={() => handlePlayOnChain("v1")}
                        disabled={isWalletBusy || !account?.address || characterFreePlays >= 2}
                      >
                        {isPlayBusy && playMode === "v1" ? (
                          "Starting..."
                        ) : characterFreePlays >= 2 ? (
                          "Daily Limit Reached"
                        ) : (
                          <>
                            <Play size={14} /> Free Quest
                          </>
                        )}
                      </button>
                      {characterFreePlays >= 2 && (
                        <div className="quest-card__note">
                          Reset at next epoch (~24h)
                        </div>
                      )}
                    </div>

                    {/* Premium Quest */}
                    <div className="quest-card quest-card--premium">
                      <div className="quest-card__header">
                        <div className="quest-card__title">
                          <span>Premium Quest</span>
                        </div>
                        <div className="quest-card__badge quest-card__badge--premium">
                          PREMIUM
                        </div>
                      </div>
                      <div className="quest-card__description">
                        Enhanced rewards for experienced adventurers. Higher stakes, bigger rewards!
                      </div>
                      <div className="quest-card__stats">
                        <div className="quest-stat">
                          <span className="quest-stat__label">Plays Today:</span>
                          <span className="quest-stat__value">{characterDailyPlays}/3</span>
                        </div>
                        <div className="quest-stat">
                          <span className="quest-stat__label">Reward:</span>
                          <span className="quest-stat__value flex items-center gap-1">
                            <img
                              alt="chunk"
                              className="w-3 h-3"
                              src="https://ik.imagekit.io/huubao/chunk_coin.png"
                            />
                            2-15 CHUNK
                          </span>
                        </div>
                        <div className="quest-stat">
                          <span className="quest-stat__label">Cost:</span>
                          <span className="quest-stat__value quest-stat__value--cost flex items-center gap-1">
                            <img
                              alt="chunk"
                              className="w-3 h-3"
                              src="https://ik.imagekit.io/huubao/chunk_coin.png"
                            />
                            5 CHUNK
                          </span>
                        </div>
                      </div>
                      <button
                        className="game-btn game-btn--quest game-btn--quest-premium text-nowrap flex flex-col"
                        onClick={() => handlePlayOnChain("v2")}
                        disabled={isWalletBusy || !account?.address || characterDailyPlays >= 3}
                      >
                        {isPlayBusy && playMode === "v2" ? (
                          "Starting..."
                        ) : characterDailyPlays >= 3 ? (
                          "Daily Limit Reached"
                        ) : (
                          <>
                            <div className="flex items-center gap-1"><Play size={14} /> Premium Quest</div>

                            <div className="flex items-center gap-1"> (
                              <img
                                alt="chunk"
                                className="w-3 h-3 inline-block"
                                src="https://ik.imagekit.io/huubao/chunk_coin.png"
                              />
                              5 CHUNK)</div>
                          </>
                        )}
                      </button>
                      {characterDailyPlays >= 3 && (
                        <div className="quest-card__note">
                          Reset at next epoch (~24h)
                        </div>
                      )}
                    </div>

                    {/* Restore Session */}
                    <div className="quest-restore flex justify-center items-center">
                      <button
                        className="game-btn game-btn--restore flex justify-center items-center gap-2"
                        onClick={() => setShowRestoreModal(true)}
                      >
                        <RefreshCw size={12} /> Restore Previous Quest
                      </button>
                    </div>
                  </>
                )}

                {/* Messages */}
                {playNotice && <div className="game-info__note">{playNotice}</div>}
                {playError && <div className="game-info__error">{playError}</div>}
                {claimError && <div className="game-info__error">{claimError}</div>}
              </div>
            </aside>
          )}

          {/* Info Panel */}
          {activePanel === 'info' && (
            <aside className="game-panel">
              <div className="game-panel__header">
                <span>Info</span>
                <button onClick={() => setActivePanel(null)}><X size={16} /></button>
              </div>
              <div className="game-panel__body">
                {/* Map Status */}
                {isMapLoading && (
                  <div className="game-info__note">Loading world...</div>
                )}
                {loadedChunks !== null && (
                  <div className="game-info__note">
                    Loaded {loadedChunks} chunks.
                  </div>
                )}
                {worldListError && (
                  <div className="game-info__error">{worldListError}</div>
                )}
                {mapLoadError && (
                  <div className="game-info__error">{mapLoadError}</div>
                )}

                {/* Controls */}
                <div className="game-info__title">Controls</div>
                <div className="game-info__card">
                  <span>Move</span>
                  <span>W A S D</span>
                </div>
                <div className="game-info__card">
                  <span>Attack</span>
                  <span>Space</span>
                </div>

                {/* Network Status */}
                <div className="game-info__title">Network</div>
                <div className="game-info__card">
                  <span>Status</span>
                  <span>{difficultyInfo.networkStatus}</span>
                </div>
                <div className="game-info__card">
                  <span>Validators</span>
                  <span>{difficultyInfo.validatorStatus}</span>
                </div>
                <div className="game-info__card">
                  <span>Difficulty</span>
                  <span>{difficultyInfo.effectiveDifficulty.toFixed(1)}/9</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Death Screen Overlay - Pixel Art Style */
        respawnCountdown !== null && (
          <div className="game-modal-overlay" style={{ zIndex: 9999, backgroundColor: 'rgba(20, 10, 10, 0.85)' }}>
            <div className="game-modal" style={{
              border: '4px solid #fff',
              borderRadius: '0',
              backgroundColor: '#000',
              boxShadow: '8px 8px 0px rgba(0,0,0,0.5)',
              imageRendering: 'pixelated',
              fontFamily: '"Courier New", monospace',
              textAlign: 'center',
              padding: '2rem',
              minWidth: '300px'
            }}>
              <div style={{ color: '#ff3333', marginBottom: '1rem' }}>
                <Skull size={64} style={{ display: 'block', margin: '0 auto 1rem auto' }} strokeWidth={1.5} />
                <h2 style={{ fontSize: '32px', textTransform: 'uppercase', letterSpacing: '2px', textShadow: '2px 2px 0px #550000' }}>YOU HAVE FALLEN</h2>
              </div>
              <div style={{ fontSize: '20px', color: '#fff' }}>
                RESPAWN IN <span style={{ color: '#ffff00', fontSize: '24px' }}>{respawnCountdown}</span>
              </div>
            </div>
          </div>
        )}

      {/* Resume Task Modal */}
      {showResumeModal && (
        <div className="game-modal-overlay" style={{ zIndex: 9998 }}>
          <div className="game-modal" style={{
            border: '4px solid #59b7ff',
            borderRadius: '12px',
            backgroundColor: 'rgba(13, 33, 55, 0.98)',
            maxWidth: '400px',
            textAlign: 'center',
            padding: '24px'
          }}>
            <div style={{ color: '#59b7ff', marginBottom: '16px' }}>
              <RefreshCw size={48} style={{ display: 'block', margin: '0 auto 12px auto' }} />
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Pending On-Chain Task</h2>
            </div>
            <div style={{ color: '#b8daff', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
              You have an incomplete on-chain game session.<br />
              Would you like to continue or start fresh in offline mode?
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="game-btn game-btn--primary"
                onClick={handleResumeTask}
                style={{ padding: '12px 24px' }}
              >
                Continue Task
              </button>
              <button
                className="game-btn"
                onClick={handleStartFresh}
                style={{ padding: '12px 24px' }}
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Character Modal */}
      {showCreateCharacterModal && (
        <div className="game-modal-overlay">
          <div className="game-modal">
            <div className="game-modal__header">
              <h2>Create Character</h2>
              <button
                className="game-modal__close"
                onClick={() => setShowCreateCharacterModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="game-modal__body">
              <p>You need a character to play. Create one now!</p>
              <div className="game-field">
                <label>Character Name</label>
                <input
                  type="text"
                  value={newCharacterName}
                  onChange={(e) => setNewCharacterName(e.target.value)}
                  placeholder="Enter name (1-32 chars)"
                  maxLength={32}
                  disabled={isCreatingCharacter}
                />
              </div>
              {createCharacterError && (
                <div className="game-info__error">{createCharacterError}</div>
              )}
            </div>
            <div className="game-modal__footer">
              <button
                className="game-btn"
                onClick={() => setShowCreateCharacterModal(false)}
                disabled={isCreatingCharacter}
              >
                Cancel
              </button>
              <button
                className="game-btn game-btn--primary"
                onClick={handleCreateCharacter}
                disabled={isCreatingCharacter || !newCharacterName.trim()}
              >
                {isCreatingCharacter ? "Creating..." : "Create Character"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Session Modal */}
      {showRestoreModal && (
        <div className="game-modal-overlay">
          <div className="game-modal">
            <div className="game-modal__header">
              <span>Restore Session</span>
              <button onClick={() => setShowRestoreModal(false)}><X size={16} /></button>
            </div>
            <div className="game-modal__body">
              {/* Fetch Unclaimed Plays */}
              <div className="unclaimed-section">
                <button
                  className="game-btn game-btn--primary"
                  onClick={fetchUnclaimedPlays}
                  disabled={isFetchingUnclaimed}
                  style={{ width: "100%", marginBottom: "12px" }}
                >
                  {isFetchingUnclaimed
                    ? "Searching..."
                    : "Find Unclaimed Plays"}
                </button>

                {unclaimedPlays.length > 0 && (
                  <div className="unclaimed-list">
                    <div className="unclaimed-list-header">
                      Unclaimed Plays ({unclaimedPlays.length}):
                    </div>
                    {unclaimedPlays.map((play) => (
                      <div
                        key={play.playId}
                        className={`unclaimed-item ${restorePlayId === play.playId ? "selected" : ""}`}
                        onClick={() => {
                          setRestorePlayId(play.playId);
                          setRestoreWorldId(play.worldId);
                        }}
                      >
                        <span>Play #{play.playId}</span>
                        <span className="unclaimed-reward">
                          {play.minReward}-{play.maxReward}
                        </span>
                      </div>
                    ))}
                    <div className="unclaimed-note">
                      Policy ID = BCS(play_id). We auto-derive it below.
                    </div>
                  </div>
                )}
              </div>

              <div className="restore-divider">hoáº·c nháº­p thá»§ cÃ´ng</div>

              <div className="game-field">
                <label>Play ID</label>
                <input
                  type="text"
                  value={restorePlayId}
                  onChange={(e) => setRestorePlayId(e.target.value)}
                  placeholder="VD: 2"
                />
              </div>
              <div className="game-field">
                <label>Policy ID (auto from Play ID)</label>
                <div className="quest-backup-key__value" style={{ justifyContent: "space-between" }}>
                  <code>{restorePolicyPreview || "Enter Play ID to compute"}</code>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      if (restorePolicyPreview) {
                        navigator.clipboard.writeText(restorePolicyPreview);
                        setPlayNotice("Policy ID copied!");
                      }
                    }}
                    title="Copy policy id"
                    disabled={!restorePolicyPreview}
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
              <div className="game-field">
                <label>World ID (optional)</label>
                <input
                  type="text"
                  value={restoreWorldId}
                  onChange={(e) => setRestoreWorldId(e.target.value)}
                  placeholder="0x..."
                />
              </div>
            </div>
            <div className="game-modal__footer">
              <button
                className="game-btn"
                onClick={() => setShowRestoreModal(false)}
              >
                Cancel
              </button>
              <button
                className="game-btn game-btn--primary"
                onClick={() => {
                  if (!restorePlayId) {
                    setPlayError("Play ID is required!");
                    return;
                  }
                  const policyHex = derivePolicyIdHex(restorePlayId);
                  storePlayState({
                    playId: restorePlayId,
                    policyIdHex: policyHex,
                    worldId: restoreWorldId || worldId,
                    found: false,
                  });
                  setPlayId(restorePlayId);
                  setPolicyIdHex(policyHex);
                  setIsKeyFound(false);
                  setShowRestoreModal(false);
                  setPlayNotice(
                    `Session restored! Play ID: ${restorePlayId}. Share policy with Seal key server.`
                  );
                }}
                disabled={!restorePlayId}
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}      {/* Pre-start Modal */}
      {showStartModal && (
        <div className="game-modal-overlay game-modal-overlay--start">
          <div className="game-modal">
            <div className="game-modal__header">
              <h2>Start Run</h2>
              <button
                className="game-modal__close"
                onClick={() => setShowStartModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="game-modal__body">
              <p>Choose your entry mode before the game begins.</p>
              {!mapReady && (
                <div className="game-start-loading">
                  <div className="game-loading-spinner" />
                  <div className="game-loading-text">Loading world...</div>
                </div>
              )}
              <div className="game-start-options">
                <label
                  className={`game-start-option ${startMode === "player" ? "active" : ""
                    }`}
                >
                  <input
                    type="radio"
                    name="startMode"
                    value="player"
                    checked={startMode === "player"}
                    onChange={(e) => setStartMode(e.target.value)}
                    disabled={!mapReady}
                  />
                  <div>
                    <div className="game-start-option__title">Player</div>
                    <div className="game-start-option__note">
                      Off-chain practice run.
                    </div>
                  </div>
                </label>
                {hasPendingPlay && (
                  <label
                    className={`game-start-option ${startMode === "resume" ? "active" : ""
                      }`}
                  >
                    <input
                      type="radio"
                      name="startMode"
                      value="resume"
                      checked={startMode === "resume"}
                      onChange={(e) => setStartMode(e.target.value)}
                      disabled={!mapReady}
                    />
                    <div>
                      <div className="game-start-option__title">
                        Resume Quest
                      </div>
                      <div className="game-start-option__note">
                        Continue your unclaimed play (#{playId}).
                      </div>
                    </div>
                  </label>
                )}
                <label
                  className={`game-start-option ${startMode === "chain" ? "active" : ""
                    }`}
                >
                  <input
                    type="radio"
                    name="startMode"
                    value="chain"
                    checked={startMode === "chain"}
                    onChange={(e) => setStartMode(e.target.value)}
                    disabled={!mapReady}
                  />
                  <div>
                    <div className="game-start-option__title">On-chain</div>
                    <div className="game-start-option__note">
                      Choose V1 or V2 to start.
                    </div>
                  </div>
                </label>
                {startMode === "chain" && (
                  <div className="game-start-chain">
                    <label
                      className={`game-start-option ${startChainMode === "v1" ? "active" : ""
                        }`}
                    >
                      <input
                        type="radio"
                        name="startChainMode"
                        value="v1"
                        checked={startChainMode === "v1"}
                        onChange={(e) => setStartChainMode(e.target.value)}
                        disabled={!mapReady}
                      />
                      <div>
                        <div className="game-start-option__title">V1</div>
                        <div className="game-start-option__note">
                          Free play ({characterFreePlays}/2).
                        </div>
                      </div>
                    </label>
                    <label
                      className={`game-start-option ${startChainMode === "v2" ? "active" : ""
                        }`}
                    >
                      <input
                        type="radio"
                        name="startChainMode"
                        value="v2"
                        checked={startChainMode === "v2"}
                        onChange={(e) => setStartChainMode(e.target.value)}
                        disabled={!mapReady}
                      />
                      <div>
                        <div className="game-start-option__title">V2</div>
                        <div className="game-start-option__note">
                          Paid play ({characterDailyPlays}/3).
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>
              {startModalError && (
                <div className="game-info__error">{startModalError}</div>
              )}
            </div>
            <div className="game-modal__footer">
              <button
                className="game-btn"
                onClick={() => setShowStartModal(false)}
              >
                Close
              </button>
              <button
                className="game-btn game-btn--primary"
                onClick={handleStartModalAction}
                disabled={
                  !mapReady || (startMode === "chain" && isWalletBusy)
                }
              >
                {startMode === "player"
                  ? "Play"
                  : startMode === "resume"
                    ? "Resume"
                    : "Play On-chain"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeMoveFields(value) {
  if (!value || typeof value !== "object") return {};
  const record = value;
  if (record.fields && typeof record.fields === "object") {
    return record.fields;
  }
  return record;
}

function normalizeMoveVector(value) {
  if (Array.isArray(value)) return value;
  const fields = normalizeMoveFields(value);
  if (Array.isArray(fields.vec)) return fields.vec;
  return [];
}

function parseU32Value(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
}

function clampU8(value, max) {
  const clamped = Math.max(0, Math.min(max, value));
  return Number.isFinite(clamped) ? clamped : 0;
}

function extractObjectId(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value;
  if (typeof record.bytes === "string") return record.bytes;
  if (typeof record.id === "string") return record.id;
  if (record.id && typeof record.id === "object") {
    const nested = record.id;
    if (typeof nested.bytes === "string") return nested.bytes;
    if (typeof nested.id === "string") return nested.id;
  }
  if (record.fields && typeof record.fields === "object") {
    const fields = record.fields;
    if (typeof fields.bytes === "string") return fields.bytes;
    if (typeof fields.id === "string") return fields.id;
    if (fields.id && typeof fields.id === "object") {
      const nested = fields.id;
      if (typeof nested.bytes === "string") return nested.bytes;
      if (typeof nested.id === "string") return nested.id;
    }
  }

  return "";
}

function extractChunkCoords(value) {
  const fields = normalizeMoveFields(value);
  const cx = parseU32Value(fields.cx);
  const cy = parseU32Value(fields.cy);
  if (cx === null || cy === null) return null;
  return { cx, cy };
}

async function fetchAllDynamicFields(parentId) {
  const all = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await suiClient.getDynamicFields({
      parentId,
      cursor: cursor ?? undefined,
      limit: 50,
    });
    all.push(...page.data);
    cursor = page.nextCursor ?? null;
    hasNextPage = page.hasNextPage;
  }

  return all;
}

async function resolveChunkEntries(worldId, fields) {
  const results = await Promise.allSettled(
    fields.map(async (field) => {
      if (field.name?.type && !field.name.type.includes("ChunkKey")) {
        return null;
      }
      const coords = extractChunkCoords(field.name?.value);
      if (!coords) return null;

      const fieldObject = await suiClient.getDynamicFieldObject({
        parentId: worldId,
        name: field.name,
      });
      const content = fieldObject.data?.content;
      if (!content || content.dataType !== "moveObject") return null;
      const fieldFields = normalizeMoveFields(content.fields);
      const chunkId = extractObjectId(fieldFields.value);
      if (!chunkId) return null;
      return { ...coords, chunkId };
    })
  );

  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((entry) => Boolean(entry));
}



async function fetchListedChunk(worldId, chunkId) {
  if (!PACKAGE_ID || !worldId || !chunkId) return null;
  const directName = {
    type: `${PACKAGE_ID}::world::ListingKey`,
    value: { chunk_id: chunkId },
  };
  const directContent = await loadListingContent(worldId, directName);
  if (directContent) return directContent;

  const wrappedName = {
    type: `${PACKAGE_ID}::world::ListingKey`,
    value: { chunk_id: { id: chunkId } },
  };
  const wrappedContent = await loadListingContent(worldId, wrappedName);
  if (wrappedContent) return wrappedContent;

  const bytesName = {
    type: `${PACKAGE_ID}::world::ListingKey`,
    value: { chunk_id: { bytes: chunkId } },
  };
  const bytesContent = await loadListingContent(worldId, bytesName);
  if (bytesContent) return bytesContent;

  const wrappedBytesName = {
    type: `${PACKAGE_ID}::world::ListingKey`,
    value: { chunk_id: { id: { bytes: chunkId } } },
  };
  const wrappedBytesContent = await loadListingContent(
    worldId,
    wrappedBytesName
  );
  if (wrappedBytesContent) return wrappedBytesContent;

  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await suiClient.getDynamicFields({
      parentId: worldId,
      cursor: cursor ?? undefined,
      limit: 200,
    });

    for (const field of page.data ?? []) {
      if (!field?.name?.type || !field.name.type.includes("ListingKey"))
        continue;
      const candidateId = extractListingChunkId(field.name.value);
      if (candidateId && candidateId === chunkId) {
        return await loadListingContent(worldId, field.name);
      }
    }

    cursor = page.nextCursor ?? null;
    hasNextPage = page.hasNextPage;
  }

  return null;
}

async function loadListingContent(worldId, fieldName) {
  try {
    const fieldObject = await suiClient.getDynamicFieldObject({
      parentId: worldId,
      name: fieldName,
    });
    const content = fieldObject.data?.content;
    if (!content || content.dataType !== "moveObject") return null;
    const listingFields = normalizeMoveFields(content.fields);
    const chunk = listingFields.chunk;
    if (!chunk) return null;
    return {
      dataType: "moveObject",
      fields: normalizeMoveFields(chunk),
    };
  } catch (error) {
    return null;
  }
}

function extractListingChunkId(value) {
  const fields = normalizeMoveFields(value);
  const raw = fields.chunk_id ?? fields.chunkId;
  const extracted = extractObjectId(raw);
  if (extracted) return extracted;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const rawFields = normalizeMoveFields(raw);
    if (typeof rawFields.bytes === "string") return rawFields.bytes;
  }
  const fallback = extractObjectId(fields);
  return fallback || "";
}

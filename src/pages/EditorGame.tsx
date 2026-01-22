import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  ADMIN_CAP_ID,
  PACKAGE_ID,
  SUI_RPC_URL,
  WORLD_REGISTRY_ID,
  REWARD_VAULT_ID,
  REWARD_COIN_TYPE,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import {
  DEFAULT_GROUND_TILE_ID,
  TILE_DEFS,
  DECO_DEFS,
  NO_DECO_ID,
  getTileDef,
  getDecoDef,
  normalizeTileId,
  normalizeDecoId,
  PaintLayer,
} from "../game/tiles";

import { WalletHeader } from "../components";
import "./EditorGame.css";
import { useWalrusUpload } from "../hooks/useWalrusUpload";
import { useRewardBalance } from "../hooks/useRewardBalance";
import { getWalrusImageUrl } from "../lib/helper";

/**
 * TILE CODE
 * 0 = void (fall)
 * 1.. = tilemap-slices ids (see game/tiles.ts)
 */

const TILE_SIZE = 32;
const CHUNK_SIZE = 5;
const DEFAULT_FLOOR = DEFAULT_GROUND_TILE_ID;
const VOID_TILE_COLOR = "#0b0b0b";
const USER_ID_KEY = "EDITOR_USER_ID";
const RANDOM_OBJECT_ID = "0x8";

type ChunkOwners = Record<string, string>;

export default function EditorGame() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();

  const { uploadImage, isUploading } = useWalrusUpload();
  const { refetch: refetchBalance } = useRewardBalance();

  const [userId] = useState(() => getOrCreateUserId());
  const [notice, setNotice] = useState<string>("");
  const [paintLayer, setPaintLayer] = useState<PaintLayer>("base");
  const [selectedTile, setSelectedTile] = useState<number>(DEFAULT_FLOOR);
  const [selectedDeco, setSelectedDeco] = useState<number>(NO_DECO_ID);
  const [grid, setGrid] = useState<number[][]>(() => createDefaultGrid());
  const [decoGrid, setDecoGrid] = useState<number[][]>(() =>
    createDefaultDecoGrid(),
  );
  const [chunkOwners, setChunkOwners] = useState<ChunkOwners>(() =>
    createOwnersForGrid(createDefaultGrid(), userId),
  );
  const [activeChunkKey, setActiveChunkKey] = useState<string>("");
  const [worldId, setWorldId] = useState<string>("");
  const [chainError, setChainError] = useState<string>("");
  const [txDigest, setTxDigest] = useState<string>("");
  const [txError, setTxError] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");
  const [isDraggingGrid, setIsDraggingGrid] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapLoadError, setMapLoadError] = useState("");
  const [loadedChunks, setLoadedChunks] = useState<number | null>(null);

  // Default image URL for claimed chunks
  const DEFAULT_CHUNK_IMAGE_URL =
    "https://ik.imagekit.io/huubao/image_chunk.png";
  const [isChunkModalOpen, setIsChunkModalOpen] = useState(false);
  const [hoveredChunkKey, setHoveredChunkKey] = useState("");
  const [hoveredChunkId, setHoveredChunkId] = useState("");
  const [isHoverIdLoading, setIsHoverIdLoading] = useState(false);
  const [isClaimHelpOpen, setIsClaimHelpOpen] = useState(false);

  // Compute current chunk price for UI display
  const claimChunkPrice =
    (loadedChunks ?? 0) < 20 ? (loadedChunks ?? 0) * 5 : 100;

  // World creation params
  const [worldName, setWorldName] = useState<string>("");
  const [worldDifficulty, setWorldDifficulty] = useState<number>(1);
  const [worldRequiredPower, setWorldRequiredPower] = useState<number>(0);

  // Character params
  const [characterName, setCharacterName] = useState<string>("");
  const [characterId, setCharacterId] = useState<string>("");
  const [characterPower, setCharacterPower] = useState<number>(0);
  const [characterPotential, setCharacterPotential] = useState<number>(0);

  // Play params
  const [playId, setPlayId] = useState<string>("");
  const [playSeal, setPlaySeal] = useState<string>("");
  const [playKey, setPlayKey] = useState<string>("");
  const [rewardCoinId, setRewardCoinId] = useState<string>("");

  // Admin check
  const [adminCapOwner, setAdminCapOwner] = useState<string>("");

  const chunkIdCacheRef = useRef<Record<string, string>>({});
  const hoverRequestRef = useRef(0);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const chunkGridRef = useRef<HTMLDivElement | null>(null);

  const clickTileRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const blockClickRef = useRef(false);

  useEffect(() => {
    void (async () => {
      // Load world list and auto-load first world
      await loadWorldListAndMap();
    })();
  }, [WORLD_REGISTRY_ID]);

  // Fetch AdminCap owner to check if connected wallet is admin
  useEffect(() => {
    async function fetchAdminCapOwner() {
      if (!ADMIN_CAP_ID) {
        setAdminCapOwner("");
        return;
      }
      try {
        const resp = await suiClient.getObject({
          id: ADMIN_CAP_ID,
          options: { showOwner: true },
        });
        const owner = resp.data?.owner;
        if (owner && typeof owner === "object" && "AddressOwner" in owner) {
          setAdminCapOwner(owner.AddressOwner as string);
        } else {
          setAdminCapOwner("");
        }
      } catch (e) {
        console.error("Failed to fetch AdminCap owner:", e);
        setAdminCapOwner("");
      }
    }
    void fetchAdminCapOwner();
  }, []);

  const gridWidth = grid[0]?.length ?? 0;
  const gridHeight = grid.length;
  const worldIdValue = worldId;
  const isConnected = Boolean(account?.address);
  const isBusy = isPending || Boolean(busyAction);
  const walletAddress = account?.address ?? "";
  const isAdmin = Boolean(
    walletAddress && adminCapOwner && walletAddress === adminCapOwner,
  );
  const isOwnerMatch = (owner?: string) =>
    Boolean(
      owner && (owner === userId || (walletAddress && owner === walletAddress)),
    );

  const myChunks = useMemo(() => {
    return Object.entries(chunkOwners)
      .filter(
        ([key, owner]) =>
          owner &&
          (owner === userId || (walletAddress && owner === walletAddress)),
      )
      .map(([key]) => key);
  }, [chunkOwners, userId, walletAddress]);

  function flyToChunk(chunkKey: string) {
    const [cx, cy] = chunkKey.split(",").map(Number);
    const wrap = gridWrapRef.current;
    if (!wrap) return;

    const chunkSizePx = CHUNK_SIZE * TILE_SIZE;
    const x = cx * chunkSizePx;
    const y = cy * chunkSizePx;

    const viewportWidth = wrap.clientWidth;
    const viewportHeight = wrap.clientHeight;

    wrap.scrollTo({
      left: x - viewportWidth / 2 + chunkSizePx / 2,
      top: y - viewportHeight / 2 + chunkSizePx / 2,
      behavior: "smooth",
    });

    setHoveredChunkKey(chunkKey);
  }

  useEffect(() => {
    chunkIdCacheRef.current = {};
    hoverRequestRef.current = 0;
    setHoveredChunkKey("");
    setHoveredChunkId("");
    setIsHoverIdLoading(false);
  }, [worldIdValue]);

  useEffect(() => {
    if (!hoveredChunkKey) {
      setHoveredChunkId("");
      setIsHoverIdLoading(false);
      return;
    }
    if (!worldIdValue || !PACKAGE_ID) {
      setHoveredChunkId("");
      setIsHoverIdLoading(false);
      return;
    }

    const cached = chunkIdCacheRef.current[hoveredChunkKey];
    if (cached !== undefined) {
      setHoveredChunkId(cached);
      setIsHoverIdLoading(false);
      return;
    }

    const [cxRaw, cyRaw] = hoveredChunkKey.split(",");
    const cx = parseCoord(cxRaw ?? "0");
    const cy = parseCoord(cyRaw ?? "0");
    const requestId = (hoverRequestRef.current += 1);
    setIsHoverIdLoading(true);

    void (async () => {
      const resolved = await fetchChunkObjectId(cx, cy, { silent: true });
      if (requestId !== hoverRequestRef.current) return;
      chunkIdCacheRef.current[hoveredChunkKey] = resolved;
      setHoveredChunkId(resolved);
      setIsHoverIdLoading(false);
    })();
  }, [hoveredChunkKey, worldIdValue]);

  const activeChunkLabel = activeChunkKey
    ? activeChunkKey.replace(",", ", ")
    : "none";
  const activeChunkOwner = activeChunkKey
    ? chunkOwners[activeChunkKey]
    : undefined;
  const canSaveActiveChunk =
    Boolean(activeChunkKey) && isOwnerMatch(activeChunkOwner);

  const activeChunkCoords = useMemo(() => {
    if (!activeChunkKey) return null;
    const [cxRaw, cyRaw] = activeChunkKey.split(",");
    return { cx: parseCoord(cxRaw ?? "0"), cy: parseCoord(cyRaw ?? "0") };
  }, [activeChunkKey]);
  const hoveredChunkLabel = hoveredChunkKey
    ? hoveredChunkKey.replace(",", ", ")
    : "none";
  const hoveredChunkIdDisplay = !hoveredChunkKey
    ? "-"
    : !worldIdValue || !PACKAGE_ID
      ? "not available"
      : isHoverIdLoading
        ? "loading..."
        : hoveredChunkId || "not found";
  const activeChunkIdDisplay =
    activeChunkKey && activeChunkKey === hoveredChunkKey
      ? hoveredChunkIdDisplay
      : "-";

  /* ================= EDIT ================= */

  function handleTilePointerEnter(chunkKey: string, isOwned: boolean) {
    if (isDraggingGrid) return;
    if (!isOwned) {
      if (hoveredChunkKey) {
        setHoveredChunkKey("");
      }
      return;
    }
    if (hoveredChunkKey !== chunkKey) {
      setHoveredChunkKey(chunkKey);
    }
  }

  function handleTilePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    x: number,
    y: number,
  ) {
    if (event.button !== 0) return;
    clickTileRef.current = { x, y };
  }

  function paint(x: number, y: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunkKey = makeChunkKey(cx, cy);
    const owner = chunkOwners[chunkKey];
    const isOwned = isOwnerMatch(owner);
    setActiveChunkKey(chunkKey);
    if (!isOwned) {
      const ownerLabel = owner ? shortAddress(owner) : "no owner";
      setNotice(`Chunk owned by ${ownerLabel}.`);
      return;
    }
    setNotice(`Editing chunk (${cx}, ${cy}).`);
    setIsChunkModalOpen(true);
  }

  function closeChunkModal() {
    setIsChunkModalOpen(false);
  }

  async function captureAndUploadChunkImage() {
    if (!chunkGridRef.current || !activeChunkCoords) {
      setNotice("No chunk grid to capture.");
      return;
    }

    setNotice("Capturing chunk image...");

    try {
      // Create a canvas from the chunk grid
      const gridElement = chunkGridRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setNotice("Failed to create canvas context.");
        return;
      }

      // Set canvas size to match chunk grid
      const canvasSize = CHUNK_SIZE * TILE_SIZE;
      canvas.width = canvasSize;
      canvas.height = canvasSize;

      // Draw each tile onto the canvas
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const gx = activeChunkCoords.cx * CHUNK_SIZE + x;
          const gy = activeChunkCoords.cy * CHUNK_SIZE + y;
          const tileId = grid[gy]?.[gx] ?? 0;
          const decoId = decoGrid[gy]?.[gx] ?? 0;

          const tileDef = getTileDef(tileId);
          const decoDef = decoId > 0 ? getDecoDef(decoId) : null;

          // Draw base tile
          if (tileDef) {
            await drawImageToCanvas(
              ctx,
              tileDef.image,
              x * TILE_SIZE,
              y * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE,
            );
          } else {
            ctx.fillStyle = VOID_TILE_COLOR;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }

          // Draw decoration on top
          if (decoDef) {
            await drawImageToCanvas(
              ctx,
              decoDef.image,
              x * TILE_SIZE,
              y * TILE_SIZE,
              TILE_SIZE,
              TILE_SIZE,
            );
          }
        }
      }

      setNotice("Uploading to Walrus...");

      // Upload canvas to Walrus
      const patchId = await uploadImage(canvas);

      console.log("=== Walrus Upload Result ===");
      console.log("Patch ID:", patchId);
      console.log("Image URL:", getWalrusImageUrl(patchId));
      console.log("Full result:", patchId);

      // Get the chunk object ID to update image URL on-chain
      const chunkObjectId = await fetchChunkObjectId(
        activeChunkCoords.cx,
        activeChunkCoords.cy,
      );

      if (!chunkObjectId) {
        setNotice(
          `Image uploaded to Walrus but chunk not found on-chain. URL: ${getWalrusImageUrl(patchId)}`,
        );
        return;
      }

      // Update image URL on-chain
      setNotice("Saving image URL on-chain...");
      await runTx(
        "Update Image",
        (tx) => {
          tx.moveCall({
            target: `${PACKAGE_ID}::world::set_image_url`,
            arguments: [
              tx.object(chunkObjectId),
              tx.pure.string(getWalrusImageUrl(patchId)),
            ],
          });
        },
        () => {
          setNotice(
            `Chunk image updated on-chain! URL: ${getWalrusImageUrl(patchId)}`,
          );
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to upload chunk image:", error);
      setNotice(`Upload failed: ${message}`);
    }
  }

  function paintModalTile(localX: number, localY: number) {
    if (!activeChunkCoords || !canSaveActiveChunk) return;
    const gx = activeChunkCoords.cx * CHUNK_SIZE + localX;
    const gy = activeChunkCoords.cy * CHUNK_SIZE + localY;

    if (paintLayer === "base") {
      setGrid((prev) => {
        if (prev[gy]?.[gx] === selectedTile) return prev;
        const copy = prev.map((row) => [...row]);
        copy[gy][gx] = selectedTile;
        return copy;
      });
    } else {
      setDecoGrid((prev) => {
        if (prev[gy]?.[gx] === selectedDeco) return prev;
        const copy = prev.map((row) => [...row]);
        if (!copy[gy]) copy[gy] = [];
        copy[gy][gx] = selectedDeco;
        return copy;
      });
    }
  }

  function handleGridPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    blockClickRef.current = false;
    dragRef.current.active = true;
    dragRef.current.moved = false;
    dragRef.current.startX = event.clientX;
    dragRef.current.startY = event.clientY;
    dragRef.current.scrollLeft = wrap.scrollLeft;
    dragRef.current.scrollTop = wrap.scrollTop;
    wrap.setPointerCapture(event.pointerId);
  }

  function handleGridPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = gridWrapRef.current;
    if (!wrap || !dragRef.current.active) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const movedEnough = Math.abs(dx) > 4 || Math.abs(dy) > 4;

    if (!dragRef.current.moved && !movedEnough) return;

    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      setIsDraggingGrid(true);
    }

    event.preventDefault();
    wrap.scrollLeft = dragRef.current.scrollLeft - dx;
    wrap.scrollTop = dragRef.current.scrollTop - dy;
    blockClickRef.current = true;
  }

  function handleGridPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = gridWrapRef.current;
    if (!dragRef.current.active) return;

    dragRef.current.active = false;
    if (wrap?.hasPointerCapture(event.pointerId)) {
      wrap.releasePointerCapture(event.pointerId);
    }

    const shouldBlock = dragRef.current.moved;
    const isCancel = event.type === "pointercancel";
    const clickedTile = clickTileRef.current;
    clickTileRef.current = null;
    dragRef.current.moved = false;
    setIsDraggingGrid(false);

    if (!shouldBlock && !isCancel && clickedTile) {
      paint(clickedTile.x, clickedTile.y);
    }

    if (shouldBlock) {
      setTimeout(() => {
        blockClickRef.current = false;
      }, 0);
    } else {
      blockClickRef.current = false;
    }
  }

  function handleGridPointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    handleGridPointerEnd(event);
    setHoveredChunkKey("");
    setHoveredChunkId("");
    setIsHoverIdLoading(false);
  }

  /* ================= CHAIN IO ================= */

  async function loadWorldId(): Promise<string> {
    setChainError("");
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
      const typeName = typeof content.type === "string" ? content.type : "";
      if (typeName && !typeName.includes("WorldRegistry")) {
        setChainError(`WORLD_REGISTRY_ID is ${typeName}, not WorldRegistry.`);
      }

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
      setChainError(error instanceof Error ? error.message : String(error));
      setWorldId("");
      return "";
    }
  }

  async function loadWorldListAndMap() {
    setMapLoadError("");
    setChainError("");
    setIsMapLoading(true);

    try {
      const ids: string[] = [];

      // First try to get from registry
      const registryId = await loadWorldId();
      if (registryId) ids.push(registryId);

      // Then query WorldCreatedEvent for more worlds
      if (PACKAGE_ID) {
        const eventType = `${PACKAGE_ID}::world::WorldCreatedEvent`;
        let cursor: { txDigest: string; eventSeq: string } | null | undefined =
          null;
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
            const record = parsed as Record<string, unknown>;
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
        setNotice("No worlds found. Create one first.");
        setIsMapLoading(false);
      }
    } catch (error) {
      setChainError(error instanceof Error ? error.message : String(error));
      setIsMapLoading(false);
    }
  }

  async function refreshWorldAndMap(options?: { flyToNewest?: boolean } | React.MouseEvent) {
    // Handle both direct calls with options and event handler calls
    const flyToNewest = options && 'flyToNewest' in options ? options.flyToNewest : false;
    
    if (worldIdValue) {
      // Add delay to ensure blockchain data is updated
      if (flyToNewest) {
        setNotice("Waiting for blockchain to update...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        setNotice("Loading updated world data...");
      }
      
      const result = await loadWorldMap(worldIdValue);
      
      // Fly to newest chunk if requested
      if (flyToNewest && result.newestChunkKey) {
        const owner = result.owners[result.newestChunkKey];
        const isMyChunk = owner && (owner === userId || (walletAddress && owner === walletAddress));
        
        if (isMyChunk) {
          console.log("Flying to newest chunk:", result.newestChunkKey);
          setNotice(`Chunk claimed successfully! Flying to ${result.newestChunkKey}...`);
          // Small delay to ensure UI is updated
          setTimeout(() => flyToChunk(result.newestChunkKey!), 300);
        }
      }
    } else {
      await loadWorldListAndMap();
    }
  }

  async function loadWorldMap(targetWorldId: string): Promise<{ owners: ChunkOwners; newestChunkKey?: string }> {
    setMapLoadError("");
    setIsMapLoading(true);
    setLoadedChunks(null);
    setActiveChunkKey("");

    try {
      console.log("Loading world map for:", targetWorldId);
      const fieldEntries = await fetchAllDynamicFields(targetWorldId);
      console.log("Dynamic field entries:", fieldEntries);

      if (fieldEntries.length === 0) {
        setNotice("World has no chunks yet.");
        setLoadedChunks(0);
        return { owners: {} };
      }

      const chunkEntries = await resolveChunkEntries(
        targetWorldId,
        fieldEntries,
      );
      console.log("Resolved chunk entries:", chunkEntries);

      if (chunkEntries.length === 0) {
        setNotice("No chunk entries found.");
        setLoadedChunks(0);
        return { owners: {} };
      }

      const chunkIds = chunkEntries.map((entry) => entry.chunkId);
      const chunkObjects = await suiClient.multiGetObjects({
        ids: chunkIds,
        options: { showContent: true, showOwner: true },
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
      const newOwners: ChunkOwners = {};
      
      // Track newest chunk by version
      let newestVersion = 0;
      let newestChunkKey: string | undefined;

      chunkEntries.forEach((entry, index) => {
        const response = chunkObjects[index];
        const content = response.data?.content;
        if (!content || content.dataType !== "moveObject") return;
        const fields = normalizeMoveFields(content.fields);

        console.log("Chunk fields:", { cx: entry.cx, cy: entry.cy, fields });

        const tiles = normalizeMoveVector(fields.tiles).map((tile) =>
          normalizeTileId(clampU8(parseU32Value(tile) ?? 0, 255)),
        );
        const rawDecorations = fields.decorations;
        console.log("Raw decorations:", rawDecorations);

        const decorations = normalizeMoveVector(rawDecorations ?? []).map(
          (deco) => normalizeDecoId(clampU8(parseU32Value(deco) ?? 0, 255)),
        );

        console.log("Parsed decorations:", decorations);

        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const idx = y * CHUNK_SIZE + x;
            newGrid[entry.cy * CHUNK_SIZE + y][entry.cx * CHUNK_SIZE + x] =
              tiles[idx] ?? 0;
            newDecoGrid[entry.cy * CHUNK_SIZE + y][entry.cx * CHUNK_SIZE + x] =
              decorations[idx] ?? 0;
          }
        }

        const owner = extractOwnerAddress(response.data?.owner);
        if (owner) {
          const chunkKey = makeChunkKey(entry.cx, entry.cy);
          newOwners[chunkKey] = owner;
          
          // Track newest chunk by version
          if (entry.version > newestVersion) {
            newestVersion = entry.version;
            newestChunkKey = chunkKey;
          }
        }
      });

      console.log("Final decoGrid:", newDecoGrid);
      console.log("Newest chunk:", newestChunkKey, "version:", newestVersion);

      setGrid(newGrid);
      setDecoGrid(newDecoGrid);
      setChunkOwners(newOwners);
      setLoadedChunks(chunkEntries.length);
      setNotice(`Loaded ${chunkEntries.length} chunks from chain.`);
      
      return { owners: newOwners, newestChunkKey };
    } catch (error) {
      setMapLoadError(error instanceof Error ? error.message : String(error));
      return { owners: {} };
    } finally {
      setIsMapLoading(false);
    }
  }

  async function fetchChunkObjectId(
    cx: number,
    cy: number,
    options?: { silent?: boolean },
  ) {
    const silent = options?.silent ?? false;
    if (!silent) setTxError("");
    if (!PACKAGE_ID) {
      if (!silent) setTxError("Missing package id.");
      return "";
    }
    if (!worldIdValue) {
      if (!silent) setTxError("World id missing.");
      return "";
    }

    console.log("fetchChunkObjectId:", { cx, cy, worldIdValue, PACKAGE_ID });

    try {
      const result = await suiClient.getDynamicFieldObject({
        parentId: worldIdValue,
        name: {
          type: `${PACKAGE_ID}::world::ChunkKey`,
          value: { cx, cy },
        },
      });

      console.log("getDynamicFieldObject result:", result);

      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        if (!silent)
          setTxError("Chunk not found on-chain. Did you claim it first?");
        return "";
      }

      const fields = content.fields as Record<string, unknown>;
      console.log("Chunk fields:", fields);
      const resolved = extractObjectId(fields.value);
      if (!resolved) {
        if (!silent) setTxError("Could not parse chunk id.");
        return "";
      }

      return resolved;
    } catch (error) {
      if (!silent) {
        setTxError(error instanceof Error ? error.message : String(error));
      }
      return "";
    }
  }

  async function runTx(
    label: string,
    build: (tx: Transaction) => void | Promise<void>,
    onSuccess?: () => void,
  ) {
    setTxError("");
    setTxDigest("");

    if (!isConnected) {
      setTxError("Connect wallet first.");
      return;
    }

    if (!PACKAGE_ID) {
      setTxError("Missing package id.");
      return;
    }

    setBusyAction(label);
    try {
      const tx = new Transaction();

      await build(tx);
      const result = await signAndExecute({ transaction: tx });

      setTxDigest(result.digest);
      onSuccess?.();
    } catch (error) {
      setTxError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction("");
    }
  }

  async function createWorldOnChain() {
    if (!WORLD_REGISTRY_ID || !ADMIN_CAP_ID) {
      setTxError("Missing registry or admin cap id.");
      return;
    }
    if (!worldName.trim() || worldName.trim().length > 64) {
      setTxError("World name is required (1-64 chars).");
      return;
    }

    await runTx(
      "Create world",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::create_world`,
          arguments: [
            tx.object(WORLD_REGISTRY_ID),
            tx.object(ADMIN_CAP_ID),
            tx.pure.string(worldName.trim()),
            tx.pure.u8(worldDifficulty),
            tx.pure.u64(worldRequiredPower),
          ],
        });
      },
      () => loadWorldId(),
    );
  }

  async function claimChunkOnChain() {
    console.log("Claim chunk on chain", worldIdValue, activeChunkKey);
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }
    if (!REWARD_VAULT_ID) {
      setTxError("Missing reward vault id.");
      return;
    }

    // Default tiles: all land tiles (DEFAULT_FLOOR)
    const tiles = Array(CHUNK_SIZE * CHUNK_SIZE).fill(DEFAULT_FLOOR);
    // Default decorations: no decorations
    const decorations = Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
    const imageUrl = DEFAULT_CHUNK_IMAGE_URL;

    // Calculate chunk price:
    // - If chunks < 20: fee = chunks * 5 (chunk 0 = free, chunk 1 = 5, ...)
    // - From chunk 21 onwards (index >= 20): fee = 100 (fixed)
    const currentChunkCount = loadedChunks ?? 0;
    const chunkPrice = currentChunkCount < 20 ? currentChunkCount * 5 : 100;

    // Check if user has enough coins before proceeding
    const coins = await suiClient.getCoins({
      owner: account!.address,
      coinType: REWARD_COIN_TYPE,
    });

    const totalBalance = coins.data.reduce(
      (sum, c) => sum + BigInt(c.balance),
      BigInt(0),
    );

    if (chunkPrice > 0 && totalBalance < BigInt(chunkPrice)) {
      setTxError(
        `Insufficient REWARD_COIN. Need ${chunkPrice} coins but you have ${totalBalance}. ` +
          `Chunk #${currentChunkCount + 1} costs ${chunkPrice} coins.`,
      );
      return;
    }

    await runTx(
      "Claim chunk",
      async (tx) => {
        let paymentCoin;

        if (coins.data.length > 0) {
          // Merge all coins into one if needed and use it
          const allCoinIds = coins.data.map((c) => c.coinObjectId);
          if (allCoinIds.length > 1) {
            const [firstCoin, ...restCoins] = allCoinIds;
            tx.mergeCoins(
              tx.object(firstCoin),
              restCoins.map((id) => tx.object(id)),
            );
            paymentCoin = tx.object(firstCoin);
          } else {
            paymentCoin = tx.object(allCoinIds[0]);
          }
        } else {
          // No coins - create a zero coin (only works for first chunk which is free)
          paymentCoin = tx.moveCall({
            target: "0x2::coin::zero",
            typeArguments: [REWARD_COIN_TYPE],
          });
        }

        tx.moveCall({
          target: `${PACKAGE_ID}::world::claim_chunk`,
          arguments: [
            tx.object(worldIdValue),
            tx.object(REWARD_VAULT_ID),
            tx.object(RANDOM_OBJECT_ID),
            tx.pure.string(imageUrl),
            tx.pure.vector("u8", tiles),
            tx.pure.vector("u8", decorations),
            paymentCoin,
          ],
        });
      },
      () => {
        refreshWorldAndMap({ flyToNewest: true });
        // Delay to allow indexer to sync before refetching balance
        setTimeout(() => void refetchBalance(), 1500);
      },
    );
  }

  async function saveActiveChunkOnChain() {
    if (!activeChunkKey) {
      setNotice("Select a chunk first.");
      return;
    }

    const owner = chunkOwners[activeChunkKey];
    console.log("Save chunk debug:", {
      activeChunkKey,
      owner,
      walletAddress,
      userId,
      isOwnerMatch: isOwnerMatch(owner),
    });

    if (!isOwnerMatch(owner)) {
      setNotice(
        owner
          ? `Chunk owned by ${owner}. Your wallet: ${walletAddress}`
          : "Chunk has no owner on-chain.",
      );
      return;
    }

    const [cxRaw, cyRaw] = activeChunkKey.split(",");
    const cx = parseCoord(cxRaw ?? "0");
    const cy = parseCoord(cyRaw ?? "0");
    const resolved = await fetchChunkObjectId(cx, cy);

    if (!resolved) {
      setNotice(
        "Chunk not found on-chain. Please claim it first using 'Claim chunk' button.",
      );
      return;
    }

    const tiles = buildChunkTiles(grid, cx, cy);
    const decorations = buildChunkDecorations(decoGrid, cx, cy);
    await runTx(
      "Save chunk",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::set_tiles_and_decorations`,
          arguments: [
            tx.object(resolved),
            tx.pure.vector("u8", tiles),
            tx.pure.vector("u8", decorations),
          ],
        });
      },
      async () => {
        setNotice("Tiles saved! Now capturing and uploading image...");
        // After tiles saved, capture and upload image
        await captureAndUploadChunkImage();
      },
    );
  }

  /* ================= CHARACTER / PLAY / REWARD ================= */

  async function loadCharacter() {
    if (!account?.address) return;
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
          setCharacterId(obj.data?.objectId ?? "");
          setCharacterPower(parseU32Value(fields.power) ?? 0);
          setCharacterPotential(parseU32Value(fields.potential) ?? 0);
          setCharacterName(String(fields.name ?? ""));
        }
      }
    } catch (error) {
      console.error("Failed to load character:", error);
    }
  }

  async function loadRewardCoins() {
    if (!account?.address || !REWARD_COIN_TYPE) return;
    try {
      const coins = await suiClient.getCoins({
        owner: account.address,
        coinType: REWARD_COIN_TYPE,
      });
      if (coins.data.length > 0) {
        setRewardCoinId(coins.data[0].coinObjectId);
      }
    } catch (error) {
      console.error("Failed to load reward coins:", error);
    }
  }

  async function playOnChain() {
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }
    if (!REWARD_VAULT_ID) {
      setTxError("Missing reward vault id.");
      return;
    }
    if (!characterId) {
      setTxError("Character not found. Create one first.");
      return;
    }

    // Generate random key and seal
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const keyHex = Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compute SHA3-256 seal (we'll use the browser's SubtleCrypto)
    const sealBytes = await crypto.subtle.digest("SHA-256", keyBytes);
    const sealArray = Array.from(new Uint8Array(sealBytes));

    setPlayKey(keyHex);

    await runTx(
      "Play (5 coins)",
      async (tx) => {
        // Get fee coin (PLAY_FEE = 5)
        const coins = await suiClient.getCoins({
          owner: account!.address,
          coinType: REWARD_COIN_TYPE,
        });

        if (coins.data.length === 0) {
          throw new Error("No reward coins found. Get some first.");
        }

        // Merge all coins if needed
        const allCoinIds = coins.data.map((c) => c.coinObjectId);
        let feeCoin;
        if (allCoinIds.length > 1) {
          const [firstCoin, ...restCoins] = allCoinIds;
          tx.mergeCoins(
            tx.object(firstCoin),
            restCoins.map((id) => tx.object(id)),
          );
          feeCoin = tx.object(firstCoin);
        } else {
          feeCoin = tx.object(allCoinIds[0]);
        }

        tx.moveCall({
          target: `${PACKAGE_ID}::world::play_v2`,
          arguments: [
            tx.object(worldIdValue),
            tx.object(REWARD_VAULT_ID),
            tx.object(characterId),
            feeCoin,
            tx.pure.vector("u8", sealArray),
          ],
        });
      },
      async () => {
        setNotice("Play started! Save your key to claim reward later.");
        // Lấy play_id từ event hoặc state (simplified - user phải nhập manual)
      },
    );
  }

  async function playFreeOnChain() {
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }
    if (!REWARD_VAULT_ID) {
      setTxError("Missing reward vault id.");
      return;
    }
    if (!characterId) {
      setTxError("Character not found. Create one first.");
      return;
    }

    // Generate random key and seal
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const keyHex = Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compute SHA3-256 seal
    const sealBytes = await crypto.subtle.digest("SHA-256", keyBytes);
    const sealArray = Array.from(new Uint8Array(sealBytes));

    setPlayKey(keyHex);

    await runTx(
      "Free Play (2/day)",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::play_v1`,
          arguments: [
            tx.object(worldIdValue),
            tx.object(REWARD_VAULT_ID),
            tx.object(characterId),
            tx.pure.vector("u8", sealArray),
          ],
        });
      },
      async () => {
        setNotice("Free play started! Save your key to claim reward later.");
      },
    );
  }

  async function claimRewardOnChain() {
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }
    if (!REWARD_VAULT_ID) {
      setTxError("Missing reward vault id.");
      return;
    }
    if (!characterId) {
      setTxError("Character not found.");
      return;
    }
    if (!playId) {
      setTxError("Play ID missing.");
      return;
    }
    if (!playKey) {
      setTxError("Play key missing.");
      return;
    }

    // Convert hex key back to bytes
    const keyBytes =
      playKey.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];

    await runTx(
      "Claim reward",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::claim_reward`,
          arguments: [
            tx.object(worldIdValue),
            tx.object(REWARD_VAULT_ID),
            tx.object(characterId),
            tx.object(RANDOM_OBJECT_ID),
            tx.pure.u64(parseInt(playId)),
            tx.pure.vector("u8", keyBytes),
          ],
        });
      },
      () => {
        setNotice("Reward claimed! Power and potential increased.");
        void loadCharacter();
        setPlayId("");
        setPlayKey("");
      },
    );
  }

  // Load character and coins when account changes
  useEffect(() => {
    if (account?.address) {
      void loadCharacter();
      void loadRewardCoins();
    }
  }, [account?.address]);

  /* ================= UI ================= */

  return (
    <div className="editor-page">
      <div className="editor-shell">
        <header className="editor-nav">
          <Link to="/" className="brand">
            <img src="https://ik.imagekit.io/huubao/chunk_coin.png" alt="logo" className="w-12 h-12" />
            <div>
              <div className="brand__name">Chunk World</div>
              <div className="brand__tag">Sky Adventures on Sui</div>
            </div>
          </Link>

          <nav className="editor-nav__links">
            <Link to="/">Home</Link>
            <Link to="/game">Play</Link>
            <Link to="/marketplace">Marketplace</Link>
          </nav>

          <WalletHeader />
        </header>

        <div className="editor-layout">
          <aside className="editor-left">
            <div className="panel">
              <div className="panel__title">Map info</div>
              <div className="panel__meta">
                <div>
                  Size: {gridWidth} x {gridHeight}
                </div>
                <div>Editing: {activeChunkLabel}</div>
              </div>

              <div className="panel__rows text-nowrap overflow-hidden">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span>My chunks</span>
                    <span className="panel__value text-white">
                      {myChunks.length}
                    </span>
                  </div>
                  {myChunks.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                      {myChunks.map((key) => (
                        <button
                          key={key}
                          onClick={() => flyToChunk(key)}
                          className={`
                            relative group flex flex-col items-center justify-center cursor-pointer
                            bg-[#131b26] border border-[#2a3b55] rounded-lg p-2 
                            hover:border-[#59b7ff] hover:bg-[#1a2636] transition-all
                            ${activeChunkKey === key ? "border-[#59b7ff] bg-[#1a2636] ring-1 ring-[#59b7ff]" : ""}
                          `}
                          title={`Fly to chunk ${key}`}
                        >
                          <div className="w-6 h-6 mb-1 text-[#59b7ff] opacity-80 group-hover:opacity-100 flex items-center justify-center">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 group-hover:text-white">
                            {key.replace(",", ", ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <span>Hover chunk</span>
                  <span>{hoveredChunkLabel}</span>
                </div>
                <div className="w-full truncate">
                  <span>Chunk id</span>
                  <span
                    className="panel__value panel__value--wrap"
                    title={hoveredChunkId || ""}
                  >
                    {hoveredChunkIdDisplay}
                  </span>
                </div>
              </div>

              <p className="panel__desc">
                Hover your chunk to preview the id, click to edit in a modal.
              </p>

              {notice && <div className="panel__notice">{notice}</div>}
            </div>

            <div className="panel">
              <div className="panel__title">Paint Layer</div>
              <div className="flex gap-2">
                <button
                  className={`btn ${
                    paintLayer === "base" ? "btn-active-chunk" : "btn--outline"
                  }`}
                  onClick={() => setPaintLayer("base")}
                >
                  Base
                </button>
                <button
                  className={`btn ${
                    paintLayer === "decor" ? "btn-active-chunk" : "btn--outline"
                  }`}
                  onClick={() => setPaintLayer("decor")}
                >
                  Decor
                </button>
              </div>
            </div>

            {paintLayer === "base" ? (
              <div className="panel">
                <div className="panel__title">Base Tiles</div>
                <div className="editor-tiles">
                  {TILE_DEFS.map((tile) => (
                    <TileButton
                      key={tile.id}
                      label={tile.name.replace("tile_", "")}
                      image={tile.image}
                      kind={tile.kind}
                      active={selectedTile === tile.id}
                      onClick={() => setSelectedTile(tile.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="panel">
                <div className="panel__title">Decorations</div>
                <div className="editor-tiles">
                  <DecoButton
                    label="None"
                    image=""
                    kind="none"
                    active={selectedDeco === NO_DECO_ID}
                    onClick={() => setSelectedDeco(NO_DECO_ID)}
                  />
                  {DECO_DEFS.map((deco) => (
                    <DecoButton
                      key={deco.id}
                      label={deco.name}
                      image={deco.image}
                      kind={deco.kind}
                      active={selectedDeco === deco.id}
                      onClick={() => setSelectedDeco(deco.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* <div className="panel">
              <div className="panel__title">Game</div>
              <div className="editor-actions">
                <button
                  className="btn btn--dark"
                  onClick={() => navigate("/game")}
               >
                  Play
                </button> 
              </div>
            </div> */}
          </aside>

          <section className="editor-main">
            <div className="panel panel--main">
              <div className="flex justify-between items-center">
                <div>
                  <div className="panel__eyebrow">Stone canvas</div>
                  <div className="panel__title">Select your chunk to edit</div>
                </div>
                <button
                  className="btn btn--dark"
                  onClick={() => navigate("/game")}
                >
                  Play
                </button>
              </div>

              {isMapLoading && (
                <div className="editor-loading-overlay">
                  <div className="editor-loading-spinner" />
                  <div className="editor-loading-text">
                    Loading world map...
                  </div>
                </div>
              )}

              <div
                ref={gridWrapRef}
                className={`editor-grid-wrap ${
                  isDraggingGrid ? "is-dragging" : ""
                } ${isMapLoading ? "is-loading" : ""}`}
                onPointerDown={handleGridPointerDown}
                onPointerMove={handleGridPointerMove}
                onPointerUp={handleGridPointerEnd}
                onPointerLeave={handleGridPointerLeave}
                onPointerCancel={handleGridPointerEnd}
              >
                <div
                  className="editor-grid"
                  style={{
                    gridTemplateColumns: `repeat(${gridWidth}, ${TILE_SIZE}px)`,
                    width: gridWidth * TILE_SIZE,
                  }}
                >
                  {grid.map((row, y) =>
                    row.map((cell, x) => {
                      const chunkKey = getChunkKeyFromTile(x, y);
                      const owner = chunkOwners[chunkKey];
                      const isOwned = isOwnerMatch(owner);
                      const isOtherOwned = Boolean(owner) && !isOwned;
                      const isSelected = isOwned && chunkKey === activeChunkKey;
                      const isLocked =
                        isChunkModalOpen &&
                        Boolean(activeChunkKey) &&
                        chunkKey !== activeChunkKey;
                      const isHovered = isOwned && chunkKey === hoveredChunkKey;
                      const decoId = decoGrid[y]?.[x] ?? 0;

                      // Chunk edge detection for border highlight
                      const localX = x % CHUNK_SIZE;
                      const localY = y % CHUNK_SIZE;
                      const isTopEdge = localY === 0;
                      const isBottomEdge = localY === CHUNK_SIZE - 1;
                      const isLeftEdge = localX === 0;
                      const isRightEdge = localX === CHUNK_SIZE - 1;

                      return (
                        <button
                          key={`${x}-${y}`}
                          className={`editor-tile ${
                            isOwned ? "is-owned" : ""
                          } ${isOtherOwned ? "is-other-owned" : ""} ${
                            isSelected ? "is-selected" : ""
                          } ${isLocked ? "is-locked" : ""} ${
                            isHovered ? "is-hovered" : ""
                          } ${isHovered && isTopEdge ? "chunk-edge-top" : ""} ${
                            isHovered && isBottomEdge ? "chunk-edge-bottom" : ""
                          } ${isHovered && isLeftEdge ? "chunk-edge-left" : ""} ${
                            isHovered && isRightEdge ? "chunk-edge-right" : ""
                          } ${isOwned && isTopEdge ? "owned-edge-top" : ""} ${
                            isOwned && isBottomEdge ? "owned-edge-bottom" : ""
                          } ${isOwned && isLeftEdge ? "owned-edge-left" : ""} ${
                            isOwned && isRightEdge ? "owned-edge-right" : ""
                          }`}
                          onPointerDown={(event) =>
                            handleTilePointerDown(event, x, y)
                          }
                          onPointerEnter={() =>
                            handleTilePointerEnter(chunkKey, isOwned)
                          }
                          title={`Owner: ${owner ?? "none"}`}
                          style={{
                            ...getTileStyle(cell, decoId),
                            cursor: "pointer",
                          }}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="editor-side">
            <div className="panel">
              <div className="panel__title">World Info</div>
              {/* <div className="panel__rows">
                <div>
                  <span>RPC</span>
                  <span>{shortAddress(SUI_RPC_URL) || "not set"}</span>
                </div>
                <div>
                  <span>Package</span>
                  <span>{shortAddress(PACKAGE_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Admin cap</span>
                  <span>{shortAddress(ADMIN_CAP_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Registry</span>
                  <span>{shortAddress(WORLD_REGISTRY_ID) || "missing"}</span>
                </div>
                <div>
                  <span>World</span>
                  <span>{shortAddress(worldId) || "not created"}</span>
                </div>
                <div>
                  <span>Chunks</span>
                  <span>{loadedChunks === null ? "-" : loadedChunks}</span>
                </div>
              </div> */}

              <div className="panel__field">
                <label>World status</label>
                <div className="panel__rows">
                  <div>
                    <span>World ID</span>
                    <span className="panel__value--wrap">
                      {shortAddress(worldId) || "not loaded"}
                    </span>
                  </div>
                  <div>
                    <span>Chunks</span>
                    <span>{loadedChunks === null ? "-" : loadedChunks}</span>
                  </div>
                </div>
              </div>

              <div className="panel__actions">
                <button
                  className="btn btn--ghost"
                  onClick={refreshWorldAndMap}
                  disabled={isMapLoading}
                >
                  {isMapLoading ? "Loading map..." : "Refresh world"}
                </button>
              </div>

              {chainError && <div className="panel__error">{chainError}</div>}
              {mapLoadError && (
                <div className="panel__error">{mapLoadError}</div>
              )}
            </div>

            <div className="panel">
              <div className="panel__header-row">
                <div className="panel__title">Claim chunk</div>
                <button
                  className="panel__help-btn"
                  onClick={() => setIsClaimHelpOpen(true)}
                  title="How pricing works"
                >
                  ?
                </button>
              </div>
              <div className="panel__rows">
                <div>
                  <span>Selected chunk</span>
                  <span>{activeChunkLabel}</span>
                </div>
                <div>
                  <span>Current chunks</span>
                  <span>{loadedChunks ?? 0}</span>
                </div>
                <div>
                  <span>Next chunk price</span>
                  <span>{claimChunkPrice} CHUNK</span>
                </div>
              </div>
              <button
                className="btn btn--dark"
                onClick={claimChunkOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Claim chunk"
                  ? "Claiming..."
                  : claimChunkPrice === 0
                    ? "Claim chunk (Free)"
                    : `Claim chunk (${claimChunkPrice} CHUNK)`}
              </button>
              {txError && <div className="panel__error">{txError}</div>}
            </div>

            {isAdmin && (
              <div className="panel">
                <div className="panel__title">World admin</div>
                <p className="panel__desc">
                  Create the shared world object using the admin cap.
                </p>
                <div className="panel__field">
                  <label>World Name (1-64 chars)</label>
                  <input
                    className="input"
                    type="text"
                    maxLength={64}
                    value={worldName}
                    onChange={(e) => setWorldName(e.target.value)}
                    placeholder="Enter world name..."
                  />
                </div>
                <div className="panel__field">
                  <label>Difficulty (1-9)</label>
                  <select
                    className="input"
                    value={worldDifficulty}
                    onChange={(e) => setWorldDifficulty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="panel__field">
                  <label>Required Power</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={worldRequiredPower}
                    onChange={(e) =>
                      setWorldRequiredPower(Number(e.target.value))
                    }
                  />
                </div>
                <button
                  className="btn btn--primary"
                  onClick={createWorldOnChain}
                  disabled={isBusy || !isConnected}
                >
                  {busyAction === "Create world"
                    ? "Creating..."
                    : "Create world"}
                </button>
              </div>
            )}
          </aside>
        </div>

        {/* Claim Chunk Help Modal */}
        {isClaimHelpOpen && (
          <div className="editor-modal">
            <div
              className="editor-modal__backdrop"
              onClick={() => setIsClaimHelpOpen(false)}
            />
            <div
              className="editor-modal__panel editor-modal__panel--sm"
              role="dialog"
              aria-modal="true"
              aria-label="Chunk pricing help"
            >
              <div className="editor-modal__header">
                <div>
                  <div className="panel__eyebrow">Help</div>
                  <div className="editor-modal__title">Chunk Pricing</div>
                </div>
                <button
                  className="btn btn--outline editor-modal__close"
                  onClick={() => setIsClaimHelpOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="help-modal__body">
                <p>
                  Claiming chunks expands the world! Each chunk gives you a{" "}
                  {CHUNK_SIZE}×{CHUNK_SIZE} tile area to customize.
                </p>
                <div className="help-modal__pricing">
                  <div className="help-modal__pricing-title">Pricing Table</div>
                  <table className="help-modal__table">
                    <thead>
                      <tr>
                        <th>Chunk #</th>
                        <th>Price (CHUNK)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>Free</td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>5</td>
                      </tr>
                      <tr>
                        <td>3</td>
                        <td>10</td>
                      </tr>
                      <tr>
                        <td>...</td>
                        <td>...</td>
                      </tr>
                      <tr>
                        <td>20</td>
                        <td>95</td>
                      </tr>
                      <tr>
                        <td>21+</td>
                        <td>95 (max)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="help-modal__note">
                  <strong>Formula:</strong> Chunks 1-19 cost (chunk# - 1) × 5.
                  From chunk 20 onward, price stays fixed at 95 CHUNK.
                </p>
              </div>
            </div>
          </div>
        )}

        {isChunkModalOpen && activeChunkCoords && (
          <div className="editor-modal">
            <div className="editor-modal__backdrop" onClick={closeChunkModal} />
            <div
              className="editor-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-label="Chunk editor"
            >
              <div className="editor-modal__header">
                <div>
                  <div className="panel__eyebrow">Chunk editor</div>
                  <div className="editor-modal__title">
                    Chunk {activeChunkLabel}
                  </div>
                </div>
                <button
                  className="btn btn--outline editor-modal__close"
                  onClick={closeChunkModal}
                >
                  Close
                </button>
              </div>

              {notice && <div className="panel__notice">{notice}</div>}

              <div className="panel__rows">
                <div>
                  <span>Chunk id</span>
                  <span
                    className="panel__value panel__value--wrap truncate"
                    title={activeChunkIdDisplay}
                  >
                    {activeChunkIdDisplay}
                  </span>
                </div>
              </div>

              <div className="editor-modal__body">
                <div className="editor-modal__canvas">
                  <div
                    ref={chunkGridRef}
                    className="editor-chunk-grid"
                    style={{
                      gridTemplateColumns: `repeat(${CHUNK_SIZE}, ${TILE_SIZE}px)`,
                    }}
                  >
                    {Array.from({ length: CHUNK_SIZE }, (_, y) =>
                      Array.from({ length: CHUNK_SIZE }, (_, x) => {
                        const gx = activeChunkCoords.cx * CHUNK_SIZE + x;
                        const gy = activeChunkCoords.cy * CHUNK_SIZE + y;
                        const cell = grid[gy]?.[gx] ?? 0;
                        const decoId = decoGrid[gy]?.[gx] ?? 0;

                        return (
                          <button
                            key={`${x}-${y}`}
                            className="editor-tile editor-tile--chunk"
                            onClick={() => paintModalTile(x, y)}
                            style={{
                              ...getTileStyle(cell, decoId),
                              cursor: "pointer",
                            }}
                          />
                        );
                      }),
                    )}
                  </div>
                </div>

                <div className="editor-modal__tiles">
                  <div className="panel__title">Paint Layer</div>
                  <div className="flex gap-2" style={{ marginBottom: "12px" }}>
                    <button
                      className={`btn ${
                        paintLayer === "base"
                          ? "btn-active-chunk"
                          : "btn--outline"
                      }`}
                      onClick={() => setPaintLayer("base")}
                    >
                      Base
                    </button>
                    <button
                      className={`btn ${
                        paintLayer === "decor"
                          ? "btn-active-chunk"
                          : "btn--outline"
                      }`}
                      onClick={() => setPaintLayer("decor")}
                    >
                      Decor
                    </button>
                  </div>

                  {paintLayer === "base" ? (
                    <>
                      <div className="panel__title">Base Tiles</div>
                      <div className="editor-tiles">
                        {TILE_DEFS.map((tile) => (
                          <TileButton
                            key={tile.id}
                            label={tile.name.replace("tile_", "")}
                            image={tile.image}
                            kind={tile.kind}
                            active={selectedTile === tile.id}
                            onClick={() => setSelectedTile(tile.id)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="panel__title">Decorations</div>
                      <div className="editor-tiles">
                        <DecoButton
                          label="None"
                          image=""
                          kind="none"
                          active={selectedDeco === NO_DECO_ID}
                          onClick={() => setSelectedDeco(NO_DECO_ID)}
                        />
                        {DECO_DEFS.map((deco) => (
                          <DecoButton
                            key={deco.id}
                            label={deco.name}
                            image={deco.image}
                            kind={deco.kind}
                            active={selectedDeco === deco.id}
                            onClick={() => setSelectedDeco(deco.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="editor-modal__actions">
                <button
                  className="btn btn-save-chunk"
                  onClick={saveActiveChunkOnChain}
                  disabled={isBusy || !isConnected || !canSaveActiveChunk}
                >
                  {busyAction === "Save chunk" || isUploading ? "Saving..." : "Save Chunk"}
                </button>
                <button className="btn btn--outline" onClick={closeChunkModal}>
                  Cancel
                </button>
              </div>
              {/* {isUploading && <div className="panel__error">{isUploading}</div>} */}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= HELPERS ================= */

function getOrCreateUserId() {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;
  const generated = `user_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

function makeChunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

function getChunkKeyFromTile(x: number, y: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return makeChunkKey(cx, cy);
}

function getChunkOwnerAt(owners: ChunkOwners, x: number, y: number) {
  return owners[getChunkKeyFromTile(x, y)];
}

function createOwnersForGrid(grid: number[][], ownerId: string): ChunkOwners {
  const owners: ChunkOwners = {};
  if (grid.length === 0 || grid[0].length === 0) return owners;

  const cols = Math.ceil(grid[0].length / CHUNK_SIZE);
  const rows = Math.ceil(grid.length / CHUNK_SIZE);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      owners[makeChunkKey(cx, cy)] = ownerId;
    }
  }

  return owners;
}

function createDefaultGrid() {
  return Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(DEFAULT_FLOOR));
}

function createDefaultDecoGrid() {
  return Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(0));
}

/**
 * Helper to draw an image onto canvas
 */
function drawImageToCanvas(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.imageSmoothingEnabled = false; // Keep pixelated look
      ctx.drawImage(img, x, y, width, height);
      resolve();
    };
    img.onerror = () => {
      // If image fails to load, fill with void color
      ctx.fillStyle = VOID_TILE_COLOR;
      ctx.fillRect(x, y, width, height);
      resolve();
    };
    img.src = src;
  });
}

function getTileStyle(tileId: number, decoId: number = 0) {
  const tileDef = getTileDef(tileId);
  const decoDef = decoId > 0 ? getDecoDef(decoId) : null;

  if (!tileDef) {
    return { background: VOID_TILE_COLOR };
  }

  // Nếu có decoration, stack 2 layers
  if (decoDef) {
    return {
      backgroundImage: `url(${decoDef.image}), url(${tileDef.image})`,
      backgroundSize: "contain, cover",
      backgroundPosition: "center, center",
      backgroundRepeat: "no-repeat, no-repeat",
      backgroundColor: VOID_TILE_COLOR,
    };
  }

  return {
    backgroundImage: `url(${tileDef.image})`,
    backgroundColor: VOID_TILE_COLOR,
  };
}

function buildChunkTiles(grid: number[][], cx: number, cy: number) {
  const tiles: number[] = [];
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const value = grid[startY + y]?.[startX + x];
      tiles.push(typeof value === "number" ? value : 0);
    }
  }

  return tiles;
}

function buildChunkDecorations(decoGrid: number[][], cx: number, cy: number) {
  const decorations: number[] = [];
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const value = decoGrid[startY + y]?.[startX + x];
      decorations.push(typeof value === "number" ? value : 0);
    }
  }

  return decorations;
}

function parseCoord(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clampU8(value: number, max: number) {
  const clamped = Math.max(0, Math.min(max, value));
  return Number.isFinite(clamped) ? clamped : 0;
}

function extractObjectId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (record.id && typeof record.id === "object") {
    const nested = record.id as Record<string, unknown>;
    if (typeof nested.id === "string") return nested.id;
  }
  if (record.fields && typeof record.fields === "object") {
    const fields = record.fields as Record<string, unknown>;
    if (typeof fields.id === "string") return fields.id;
    if (fields.id && typeof fields.id === "object") {
      const nested = fields.id as Record<string, unknown>;
      if (typeof nested.id === "string") return nested.id;
    }
  }

  return "";
}

function shortAddress(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeMoveFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object") {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function normalizeMoveVector(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const fields = normalizeMoveFields(value);
  if (Array.isArray(fields.vec)) return fields.vec;
  return [];
}

function parseU32Value(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
}

function extractChunkCoords(value: unknown): { cx: number; cy: number } | null {
  const fields = normalizeMoveFields(value);
  const cx = parseU32Value(fields.cx);
  const cy = parseU32Value(fields.cy);
  if (cx === null || cy === null) return null;
  return { cx, cy };
}

function extractOwnerAddress(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.AddressOwner === "string") return record.AddressOwner;
  if (typeof record.ObjectOwner === "string") return record.ObjectOwner;
  if (
    record.ConsensusAddressOwner &&
    typeof record.ConsensusAddressOwner === "object"
  ) {
    const inner = record.ConsensusAddressOwner as Record<string, unknown>;
    if (typeof inner.owner === "string") return inner.owner;
  }
  return "";
}

async function fetchAllDynamicFields(parentId: string) {
  const all: Array<{ name: { type?: string; value?: unknown } }> = [];
  let cursor: string | null | undefined = null;
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

async function resolveChunkEntries(
  worldId: string,
  fields: Array<{ name: { type?: string; value?: unknown } }>,
) {
  const results = await Promise.allSettled(
    fields.map(async (field) => {
      // Skip if no type or not a ChunkKey
      const fieldType = field.name?.type;
      if (!fieldType) return null;
      if (!fieldType.includes("ChunkKey")) return null;

      const coords = extractChunkCoords(field.name?.value);
      if (!coords) return null;

      const fieldObject = await suiClient.getDynamicFieldObject({
        parentId: worldId,
        name: {
          type: fieldType,
          value: field.name.value,
        },
      });
      const content = fieldObject.data?.content;
      if (!content || content.dataType !== "moveObject") return null;
      const fieldFields = normalizeMoveFields(content.fields);
      const chunkId = extractObjectId(fieldFields.value);
      if (!chunkId) return null;
      
      // Get version from object metadata
      const version = fieldObject.data?.version;
      const versionNumber = typeof version === 'string' ? parseInt(version, 10) : 0;
      
      return { ...coords, chunkId, version: versionNumber };
    }),
  );

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        cx: number;
        cy: number;
        chunkId: string;
        version: number;
      }> => result.status === "fulfilled",
    )
    .map((result) => result.value)
    .filter((entry): entry is { cx: number; cy: number; chunkId: string; version: number } =>
      Boolean(entry),
    );
}

/* ================= TILE BUTTON ================= */

function TileButton({
  label,
  image,
  kind,
  active,
  onClick,
}: {
  label: string;
  image: string;
  kind: "ground" | "barrier" | "abyss";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`tile-button ${active ? "tile-button--active" : ""} ${
        kind === "abyss" ? "tile-button--abyss" : ""
      } ${kind === "barrier" ? "tile-button--barrier" : ""}`}
      style={{ backgroundImage: `url(${image})` }}
      title={`${label} (${kind})`}
      aria-label={`${label} (${kind})`}
    />
  );
}

/* ================= DECO BUTTON ================= */

function DecoButton({
  label,
  image,
  kind,
  active,
  onClick,
}: {
  label: string;
  image: string;
  kind: "none" | "walkable" | "blocking";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`tile-button ${active ? "tile-button--active" : ""} ${
        kind === "blocking" ? "tile-button--blocking" : ""
      } ${kind === "none" ? "tile-button--none" : ""}`}
      style={
        image ? { backgroundImage: `url(${image})` } : { background: "#333" }
      }
      title={`${label} (${kind})`}
      aria-label={`${label} (${kind})`}
    >
      {kind === "none" ? "✕" : null}
    </button>
  );
}

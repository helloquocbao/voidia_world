import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Transaction } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import {
  PACKAGE_ID,
  REWARD_COIN_TYPE,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import {
  Upload,
  RefreshCw,
  X,
  Wallet,
  Mountain,
  MapPin,
  Check,
  ShoppingCart,
  RotateCcw,
  Coins,
  Package,
  Link2,
  Loader,
} from "lucide-react";
import { WalletHeader } from "../components";
import { useRewardBalance } from "../hooks/useRewardBalance";
import "./Marketplace.css";

type ListingEventFields = {
  world_id?: string;
  chunk_id?: string;
  seller?: string;
  price?: number | string;
};

type SoldEventFields = ListingEventFields & {
  buyer?: string;
};

type Listing = {
  worldId: string;
  chunkId: string;
  seller: string;
  price: number;
  timestamp: number;
};

type SoldEvent = {
  worldId: string;
  chunkId: string;
  seller: string;
  buyer: string;
  price: number;
  timestamp: number;
};

type ChunkInfo = {
  chunkId: string;
  chunkObjectId: string;
  worldId: string;
  cx?: number;
  cy?: number;
  imageUrl?: string;
};

// Helper function to truncate addresses
function truncateAddress(address: string, startLen = 6, endLen = 4): string {
  if (!address) return "";
  if (address.length <= startLen + endLen) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

// Helper function to get status class based on message content
function getStatusClass(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("✅") || lower.includes("success") || lower.includes("complete") || lower.includes("confirmed")) {
    return "marketplace-status marketplace-status--success";
  }
  if (lower.includes("failed") || lower.includes("error") || lower.includes("❌") || lower.includes("cannot") || lower.includes("no ")) {
    return "marketplace-status marketplace-status--error";
  }
  if (lower.includes("please") || lower.includes("must") || lower.includes("warning") || lower.includes("price")) {
    return "marketplace-status marketplace-status--warning";
  }
  if (lower.includes("...") || lower.includes("loading") || lower.includes("submitting") || lower.includes("syncing") || lower.includes("preparing") || lower.includes("waiting")) {
    return "marketplace-status marketplace-status--loading";
  }
  return "marketplace-status";
}

export default function Marketplace() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const { refetch: refetchBalance } = useRewardBalance();
  const [listings, setListings] = useState<Listing[]>([]);
  const [ownedChunks, setOwnedChunks] = useState<ChunkInfo[]>([]);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [listingStatus, setListingStatus] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [worldId, setWorldId] = useState("");
  const [pendingProceeds, setPendingProceeds] = useState(0);
  const [withdrawInput, setWithdrawInput] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [recentSales, setRecentSales] = useState<SoldEvent[]>([]);
  const [chunkImages, setChunkImages] = useState<Record<string, string>>({});

  const chunkType = PACKAGE_ID ? `${PACKAGE_ID}::world::ChunkNFT` : "";

  useEffect(() => {
    void refreshListings();
    void loadOwnedChunks();
  }, [account?.address]);

  useEffect(() => {
    void loadWorldId();
  }, []);

  useEffect(() => {
    void loadPendingProceeds();
  }, [account?.address, worldId]);

  useEffect(() => {
    if (worldId) return;
    const fallbackWorld = ownedChunks[0]?.worldId || listings[0]?.worldId || "";
    if (fallbackWorld) {
      setWorldId(fallbackWorld);
    }
  }, [worldId, ownedChunks, listings]);

  const listedChunkIds = useMemo(
    () => new Set(listings.map((item) => item.chunkId)),
    [listings],
  );
  const hasListings = listings.length > 0;

  async function refreshListings() {
    if (!PACKAGE_ID) return;
    setIsLoading(true);
    try {
      const dynamicListings =
        worldId && worldId.length > 0
          ? await fetchListingsFromDynamicFields(worldId)
          : [];
      const listedType = `${PACKAGE_ID}::world::ChunkListedEvent`;
      const soldType = `${PACKAGE_ID}::world::ChunkSoldEvent`;
      const delistedType = `${PACKAGE_ID}::world::ChunkDelistedEvent`;

      const [listedPage, soldPage, delistedPage] = await Promise.all([
        suiClient.queryEvents({
          query: { MoveEventType: listedType },
          order: "descending",
          limit: 100,
        }),
        suiClient.queryEvents({
          query: { MoveEventType: soldType },
          order: "descending",
          limit: 100,
        }),
        suiClient.queryEvents({
          query: { MoveEventType: delistedType },
          order: "descending",
          limit: 100,
        }),
      ]);

      const closedIds = new Set<string>();
      const soldEvents = soldPage.data
        .map((event) => {
          const detail = event.parsedJson as SoldEventFields;
          const chunkId =
            typeof detail.chunk_id === "string"
              ? detail.chunk_id
              : typeof detail.chunkId === "string"
                ? detail.chunkId
                : "";
          const worldId =
            typeof detail.world_id === "string"
              ? detail.world_id
              : typeof detail.worldId === "string"
                ? detail.worldId
                : "";
          const price = Number(detail.price ?? 0);
          if (!chunkId || !worldId || !price) return null;
          return {
            chunkId,
            worldId,
            price,
            seller: detail.seller || "",
            buyer: detail.buyer || "",
            timestamp: event.timestampMs ?? Date.now(),
          } satisfies SoldEvent;
        })
        .filter((item): item is SoldEvent => Boolean(item));

      [...soldEvents, ...delistedPage.data].forEach((event) => {
        if (typeof event === "object" && event && "chunkId" in event) {
          closedIds.add((event as SoldEvent).chunkId);
          return;
        }
        const parsed = event.parsedJson as Record<string, unknown>;
        const candidate =
          typeof parsed.chunk_id === "string"
            ? parsed.chunk_id
            : typeof parsed.chunkId === "string"
              ? parsed.chunkId
              : "";
        if (candidate) {
          closedIds.add(candidate);
        }
      });

      if (account?.address) {
        setRecentSales(
          soldEvents
            .filter((sale) => sale.seller === account.address)
            .slice(0, 6),
        );
      } else {
        setRecentSales([]);
      }

      const parsed = listedPage.data
        .map((event) => {
          const detail = event.parsedJson as ListingEventFields;
          const chunkId =
            typeof detail.chunk_id === "string"
              ? detail.chunk_id
              : typeof detail.chunkId === "string"
                ? detail.chunkId
                : "";
          const worldId =
            typeof detail.world_id === "string"
              ? detail.world_id
              : typeof detail.worldId === "string"
                ? detail.worldId
                : "";
          const price = Number(detail.price ?? 0);
          if (!chunkId || !worldId || !price) return null;
          return {
            chunkId,
            worldId,
            price,
            seller: detail.seller || "unknown",
            timestamp: event.timestampMs ?? Date.now(),
          } satisfies Listing;
        })
        .filter((item): item is Listing => Boolean(item))
        .filter((item) => !closedIds.has(item.chunkId));
      console.log(`parsed`, parsed);
      const merged = mergeListings(parsed, dynamicListings);
      setListings(merged);
      void fetchChunkImages(merged);
    } catch (error) {
      console.error("Failed to load listings:", error);
      setStatus("Failed to load listings, please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadOwnedChunks() {
    if (!account?.address || !chunkType) {
      setOwnedChunks([]);
      return;
    }

    try {
      const response = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: chunkType },
        options: { showContent: true },
      });

      const parsed = response.data
        .map((item) => {
          const content = item.data?.content;
          if (!content || content.dataType !== "moveObject") {
            return null;
          }
          const objectId = item.data?.objectId ?? "";
          if (!objectId) return null;
          const fields = content.fields as Record<string, unknown>;
          const worldId = extractObjectId(fields.world_id ?? fields.worldId);
          const cx =
            typeof fields.cx === "number" ? fields.cx : Number(fields.cx ?? 0);
          const cy =
            typeof fields.cy === "number" ? fields.cy : Number(fields.cy ?? 0);
          const imageUrl =
            typeof fields.image_url === "string" ? fields.image_url : "";
          return {
            worldId,
            chunkId: objectId,
            chunkObjectId: objectId,
            cx,
            cy,
            imageUrl,
          } satisfies ChunkInfo;
        })
        .filter((chunk): chunk is ChunkInfo => Boolean(chunk));

      setOwnedChunks(parsed);
      const defaults = parsed.reduce<Record<string, string>>((acc, chunk) => {
        if (!acc[chunk.chunkId]) acc[chunk.chunkId] = "";
        return acc;
      }, {});
      setPriceInputs((prev) => ({ ...defaults, ...prev }));
    } catch (error) {
      console.error("Failed to load chunks:", error);
    }
  }

  async function loadWorldId() {
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
      console.error("Failed to load world id:", error);
      setWorldId("");
      return "";
    }
  }

  async function loadPendingProceeds() {
    if (!account?.address || !worldId || !PACKAGE_ID) {
      setPendingProceeds(0);
      return;
    }

    try {
      const result = await suiClient.getDynamicFieldObject({
        parentId: worldId,
        name: {
          type: `${PACKAGE_ID}::world::SellerPayoutKey`,
          value: { owner: account.address },
        },
      });

      const content = result.data?.content;

      console.log(`content`, content);

      setPendingProceeds(Number(content?.fields?.value?.fields?.balance ?? 0));
    } catch (error) {
      setPendingProceeds(0);
    }
  }

  const providerLabel = useMemo(() => {
    if (!account?.address) return "Chưa kết nối";
    return truncateAddress(account.address);
  }, [account?.address]);

  async function handleBuy(listing: Listing) {
    if (!account?.address) {
      setStatus("Please connect wallet before buying.");
      return;
    }

    setStatus("Preparing transaction...");
    try {
      const coins = await suiClient.getCoins({
        owner: account.address,
        coinType: REWARD_COIN_TYPE,
      });
      if (coins.data.length === 0) {
        setStatus("No CHUNK coins available. Please get CHUNK from faucet.");
        return;
      }

      const coin =
        coins.data.find((c) => BigInt(c.balance) >= BigInt(listing.price)) ??
        coins.data[0];

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::buy_chunk`,
        arguments: [
          tx.object(listing.worldId),
          tx.object(listing.chunkId),
          tx.object(coin.coinObjectId),
        ],
      });

      await signAndExecute({ transaction: tx });
      setStatus("✅ Purchase successful! Refreshing listings...");

      // Wait a bit for the transaction to be indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await refreshListings();
      await loadOwnedChunks();
      // Delay to allow indexer to sync before refetching balance
      setTimeout(() => void refetchBalance(), 1500);
      setStatus("✅ Purchase complete! Chunk added to your collection.");
    } catch (error) {
      console.error("Buy failed:", error);
      setStatus("Failed to buy chunk. Check console for details.");
    }
  }

  async function handleListChunk(chunk: ChunkInfo) {
    if (!account?.address) {
      setListingStatus("Please connect wallet before listing.");
      return;
    }

    const priceValue = Number(priceInputs[chunk.chunkId]);
    if (!priceValue || priceValue <= 0) {
      setListingStatus("Price must be greater than 0.");
      return;
    }

    if (!chunk.worldId) {
      setListingStatus("Cannot determine world ID.");
      return;
    }

    setListingStatus("Submitting listing...");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::list_chunk`,
        arguments: [
          tx.object(chunk.worldId),
          tx.object(chunk.chunkObjectId),
          tx.pure("u64", priceValue),
        ],
      });

      await signAndExecute({ transaction: tx });
      setListingStatus("✅ Chunk listed successfully!");

      // Wait for transaction to be indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await refreshListings();
      await loadOwnedChunks();
    } catch (error) {
      console.error("List failed:", error);
      setListingStatus("Failed to list chunk. Check console.");
    }
  }

  async function handleDelist(listing: Listing) {
    if (!account?.address) {
      setStatus("Please connect wallet before delisting.");
      return;
    }

    setStatus("Delisting chunk...");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::cancel_listing`,
        arguments: [tx.object(listing.worldId), tx.object(listing.chunkId)],
      });

      await signAndExecute({ transaction: tx });
      setStatus("✅ Chunk delisted successfully! Refreshing...");

      // Wait for transaction to be indexed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await refreshListings();
      await loadOwnedChunks();
      setStatus("✅ Chunk returned to your collection.");
    } catch (error) {
      console.error("Delist failed:", error);
      setStatus("Failed to delist chunk. Check console for details.");
    }
  }

  async function handleWithdrawProceeds() {
    if (!account?.address) {
      setWithdrawStatus("Please connect wallet before withdrawing.");
      return;
    }

    if (!worldId) {
      setWithdrawStatus("World not loaded yet. Try again in a moment.");
      return;
    }

    const amount = Number(withdrawInput);
    if (!amount || amount <= 0) {
      setWithdrawStatus("Amount must be greater than 0.");
      return;
    }

    if (amount > pendingProceeds) {
      setWithdrawStatus("Amount exceeds your available proceeds.");
      return;
    }

    setWithdrawStatus("Submitting withdrawal...");
    setIsWithdrawing(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::withdraw_proceeds`,
        arguments: [tx.object(worldId), tx.pure.u64(amount)],
      });

      await signAndExecute({ transaction: tx });
      setWithdrawStatus("Withdrawal submitted! Syncing balance...");

      await new Promise((resolve) => setTimeout(resolve, 2000));
      await loadPendingProceeds();
      setWithdrawInput("");
      setWithdrawStatus("Withdrawal complete! Funds sent to your wallet.");
    } catch (error) {
      console.error("Withdraw failed:", error);
      setWithdrawStatus("Failed to withdraw proceeds. Check console.");
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function fetchChunkImages(items: Listing[]) {
    const idsToFetch = items
      .map((item) => item.chunkId)
      .filter((id) => !chunkImages[id]);
    if (idsToFetch.length === 0) return;

    const results = await Promise.allSettled(
      idsToFetch.map((id) =>
        suiClient.getObject({
          id,
          options: { showContent: true },
        }),
      ),
    );

    const nextImages: Record<string, string> = {};
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const response = result.value;
      const content = response.data?.content;
      if (!content || content.dataType !== "moveObject") return;
      const fields = normalizeMoveFields(content.fields);
      const candidate =
        typeof fields.image_url === "string"
          ? fields.image_url
          : typeof fields.imageUrl === "string"
            ? fields.imageUrl
            : "";
      if (candidate) {
        nextImages[idsToFetch[index]] = candidate;
      }
    });

    if (Object.keys(nextImages).length > 0) {
      setChunkImages((prev) => ({ ...prev, ...nextImages }));
    }
  }

  async function fetchListingsFromDynamicFields(worldObjectId: string) {
    try {
      const page = await suiClient.getDynamicFields({
        parentId: worldObjectId,
        limit: 200,
      });

      const listingIds = page.data.map((item) => item.objectId);
      if (listingIds.length === 0) return [];

      const listings = await suiClient.multiGetObjects({
        ids: listingIds,
        options: { showContent: true },
      });

      return listings
        .map((object) => {
          const content = object.data?.content;
          if (!content || content.dataType !== "moveObject") return null;
          const fields = normalizeMoveFields(content.fields);

          // Filter only listing objects
          const type = content.type || "";
          if (!type.includes("ChunkListing")) return null;

          const chunk = normalizeMoveFields(fields.chunk);
          const chunkId = extractObjectId(fields.chunk) || extractObjectId(chunk);
          const price = Number(fields.price ?? 0);
          const seller =
            typeof fields.seller === "string" ? fields.seller : undefined;
          const worldIdFromChunk =
            typeof chunk.world_id === "string"
              ? chunk.world_id
              : typeof chunk.worldId === "string"
                ? chunk.worldId
                : worldObjectId;

          if (!chunkId || !price || !seller) return null;
          return {
            chunkId,
            worldId: worldIdFromChunk,
            seller,
            price,
            timestamp: object.data?.timestampMs ?? Date.now(),
          } satisfies Listing;
        })
        .filter((item): item is Listing => Boolean(item));
    } catch (error) {
      console.error("Failed to fetch listings from dynamic fields", error);
      return [];
    }
  }

  function mergeListings(primary: Listing[], fallback: Listing[]) {
    const map = new Map<string, Listing>();
    fallback.forEach((item) => map.set(item.chunkId, item));
    primary.forEach((item) => map.set(item.chunkId, item));
    return Array.from(map.values()).sort(
      (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
    );
  }

  const cardBackground = (seed: string) => {
    const hash = seed
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    const hue2 = (hue + 70) % 360;
    return `linear-gradient(135deg, hsl(${hue}, 60%, 25%), hsl(${hue2}, 50%, 35%))`;
  };

  return (
    <div className="marketplace-page">
      {/* Animated Background */}
      <div className="marketplace-bg">
        <span className="marketplace-bg__sky" />
        <span className="marketplace-bg__glow" />
        <span className="marketplace-bg__glow marketplace-bg__glow--secondary" />
      </div>

      <div className="marketplace-content">
        {/* Navigation */}
        <header className="marketplace-nav">
          <Link to="/" className="brand">
            <img src="https://ik.imagekit.io/huubao/chunk_coin.png" alt="logo" className="w-12 h-12" />
            <div>
              <div className="brand__name">Chunk World</div>
              <div className="brand__tag">Sky Adventures on Sui</div>
            </div>
          </Link>

          <nav className="marketplace-nav__links">
            <Link to="/">Home</Link>
            <Link to="/editor">Editor</Link>
            <Link to="/game">Play</Link>
          </nav>

          <WalletHeader />
        </header>

        {/* Hero Section */}
        <section className="marketplace-hero">
          <div className="marketplace-hero__copy">
            <div className="marketplace-hero__badge">
              <span className="marketplace-hero__badge-dot" />
              <span>Live Marketplace</span>
            </div>

            <h1>
              Trade{" "}
              <span className="marketplace-hero__accent">Chunk Lands</span> on
              Sui
            </h1>

            <p className="marketplace-hero__subtitle">
              Every chunk is a unique NFT on Sui blockchain. List your lands,
              discover new territories, and earn CHUNK tokens as payment.
            </p>

            <div className="marketplace-hero__cta">
              <button
                className="btn btn--solid"
                onClick={() => {
                  setIsModalOpen(true);
                  void loadOwnedChunks();
                }}
              >
                <Upload size={14} /> List Your Chunk
              </button>
              <button
                className="btn btn--ghost"
                onClick={refreshListings}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader size={14} /> Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} /> Refresh
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="marketplace-hero__panel">
            <div className="marketplace-stats">
              <div className="marketplace-stats__header">
                <span className="marketplace-stats__title">Dashboard</span>
                <span className="marketplace-stats__tag">Sui Testnet</span>
              </div>

              <div className="marketplace-stats__grid">
                <div className="marketplace-stat">
                  <div className="marketplace-stat__label">Active Listings</div>
                  <div className="marketplace-stat__value marketplace-stat__value--accent">
                    {listings.length}
                  </div>
                </div>
                <div className="marketplace-stat">
                  <div className="marketplace-stat__label">Your Chunks</div>
                  <div className="marketplace-stat__value">
                    {ownedChunks.length}
                  </div>
                </div>
              </div>

              <div className="marketplace-wallet-info">
                <div className="marketplace-wallet-info__icon">
                  <Wallet size={18} />
                </div>
                <div className="marketplace-wallet-info__details">
                  <div className="marketplace-wallet-info__label">
                    Connected Wallet
                  </div>
                  <div className="marketplace-wallet-info__address">
                    {account?.address
                      ? truncateAddress(account.address, 10, 8)
                      : "Not connected"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Withdraw Proceeds Section */}
        <section className="marketplace-section marketplace-section--payouts">
          <div className="marketplace-section__header">
            <h2 className="marketplace-section__title">
              <span className="marketplace-section__title-icon">
                <Coins size={18} />
              </span>
              Seller Payouts
            </h2>
            <div className="marketplace-section__actions">
              <button
                className="btn--ghost"
                onClick={loadPendingProceeds}
                disabled={isWithdrawing || isPending}
              >
                {isWithdrawing || isPending ? (
                  <>
                    <Loader size={12} /> Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} /> Sync Balance
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="marketplace-payouts">
            <div className="marketplace-payout-card">
              <div className="marketplace-payout-card__header">
                <div>
                  <div className="marketplace-payout-card__eyebrow">
                    Withdraw flow
                  </div>
                  <h3 className="marketplace-payout-card__title">
                    Ready to cash out
                  </h3>
                </div>
                <div className="marketplace-payout-card__badge">
                  {pendingProceeds > 0
                    ? "Proceeds available"
                    : "No proceeds yet"}
                </div>
              </div>

              <div className="marketplace-payout-card__balance">
                <div className="marketplace-payout-card__balance-label">
                  Pending proceeds
                </div>
                <div className="marketplace-payout-card__balance-value flex items-center">
                  <img
                    alt="chunk"
                    className="inline-block w-5 h-5 mr-1"
                    src="https://ik.imagekit.io/huubao/chunk_coin.png"
                  />
                  {pendingProceeds} CHUNK
                </div>
                <div className="marketplace-payout-card__balance-meta">
                  World:{" "}
                  {worldId
                    ? truncateAddress(worldId, 8, 6)
                    : WORLD_REGISTRY_ID
                      ? "Loading..."
                      : "Missing registry id"}
                </div>
              </div>

              <div className="marketplace-payout-steps">
                <div
                  className={`marketplace-payout-step ${recentSales.length > 0 ? "is-complete" : ""}`}
                >
                  <div className="marketplace-payout-step__icon">
                    <Check size={14} />
                  </div>
                  <div>
                    <div className="marketplace-payout-step__title">
                      Sale confirmed
                    </div>
                    <div className="marketplace-payout-step__text">
                      On-chain ChunkSoldEvent recorded.
                    </div>
                  </div>
                </div>
                <div
                  className={`marketplace-payout-step ${pendingProceeds > 0 ? "is-complete" : ""}`}
                >
                  <div className="marketplace-payout-step__icon">
                    <Coins size={14} />
                  </div>
                  <div>
                    <div className="marketplace-payout-step__title">
                      Proceeds pending
                    </div>
                    <div className="marketplace-payout-step__text">
                      Funds are waiting in the seller vault.
                    </div>
                  </div>
                </div>
                <div
                  className={`marketplace-payout-step ${pendingProceeds === 0 ? "" : "is-active"}`}
                >
                  <div className="marketplace-payout-step__icon">
                    <Wallet size={14} />
                  </div>
                  <div>
                    <div className="marketplace-payout-step__title">
                      Withdraw to wallet
                    </div>
                    <div className="marketplace-payout-step__text">
                      Choose an amount and confirm the transaction.
                    </div>
                  </div>
                </div>
              </div>

              <div className="marketplace-payout-card__actions">
                <div className="marketplace-payout-inputs">
                  <input
                    className="marketplace-price-input"
                    type="number"
                    min="1"
                    value={withdrawInput}
                    onChange={(event) => setWithdrawInput(event.target.value)}
                    placeholder="Withdraw amount (CHUNK)"
                  />
                  <button
                    className="btn--ghost"
                    onClick={() => setWithdrawInput(String(pendingProceeds))}
                    disabled={pendingProceeds === 0}
                  >
                    Max
                  </button>
                </div>
                <button
                  className="btn--primary flex items-center justify-center gap-2"
                  onClick={handleWithdrawProceeds}
                  disabled={isWithdrawing || isPending || pendingProceeds === 0}
                >
                  {isWithdrawing || isPending ? (
                    <>
                      <Loader size={12} /> Processing...
                    </>
                  ) : (
                    <>
                      <Wallet size={12} /> Withdraw
                    </>
                  )}
                </button>
                {withdrawStatus && (
                  <div className={getStatusClass(withdrawStatus)}>
                    {withdrawStatus}
                  </div>
                )}
              </div>
            </div>

            <div className="marketplace-payout-feed">
              <div className="marketplace-payout-feed__header">
                <div>
                  <div className="marketplace-payout-feed__eyebrow">
                    Recent sales
                  </div>
                  <h3 className="marketplace-payout-feed__title">
                    Your latest sold chunks
                  </h3>
                </div>
                <div className="marketplace-payout-feed__count">
                  {recentSales.length} events
                </div>
              </div>
              {recentSales.length > 0 ? (
                <div className="marketplace-payout-feed__list">
                  {recentSales.map((sale) => (
                    <div
                      key={`${sale.chunkId}-${sale.timestamp}`}
                      className="marketplace-payout-feed__item"
                    >
                      <div className="marketplace-payout-feed__item-main">
                        <span className="marketplace-payout-feed__label">
                          Chunk
                        </span>
                        <span className="marketplace-payout-feed__value">
                          {truncateAddress(sale.chunkId, 8, 6)}
                        </span>
                      </div>
                      <div className="marketplace-payout-feed__item-meta flex items-center">
                        <span className="flex items-center gap-1">
                          <img
                            alt="chunk"
                            className="w-3 h-3"
                            src="https://ik.imagekit.io/huubao/chunk_coin.png"
                          />
                          {sale.price} CHUNK
                        </span>
                        <span>Buyer: {truncateAddress(sale.buyer, 6, 4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="marketplace-empty marketplace-empty--compact">
                  <div className="marketplace-empty__icon">
                    <Package size={28} />
                  </div>
                  <p className="marketplace-empty__text">
                    No sales yet. List a chunk to start earning CHUNK.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Your Chunks Modal */}
        {isModalOpen && (
          <div
            className="marketplace-modal-overlay"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="marketplace-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="marketplace-modal__header">
                <h2 className="marketplace-modal__title">
                  <span className="marketplace-section__title-icon">
                    <Mountain size={18} />
                  </span>
                  Your Chunks
                </h2>
                <button
                  className="marketplace-modal__close"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>

              {listingStatus && (
                <div className={getStatusClass(listingStatus)}>{listingStatus}</div>
              )}

              <div className="marketplace-modal__body">
                {account?.address ? (
                  ownedChunks.length > 0 ? (
                    <div className="marketplace-grid marketplace-grid--modal">
                      {ownedChunks.map((chunk) => (
                        <article
                          key={chunk.chunkId}
                          className="marketplace-owned-card"
                        >
                          <div className="marketplace-owned-card__preview">
                            {chunk.imageUrl ? (
                              <img
                                src={chunk.imageUrl}
                                alt={`Chunk ${truncateAddress(chunk.chunkId, 8, 4)}`}
                              />
                            ) : (
                              <div className="marketplace-owned-card__preview-placeholder">
                                <Mountain size={32} />
                              </div>
                            )}
                            <div className="marketplace-owned-card__coords">
                              <MapPin size={12} /> ({chunk.cx ?? "?"},{" "}
                              {chunk.cy ?? "?"})
                            </div>
                          </div>
                          <div className="marketplace-owned-card__body">
                            <div className="marketplace-owned-card__info">
                              <div className="marketplace-owned-card__row">
                                <span className="marketplace-owned-card__label">
                                  Chunk ID
                                </span>
                                <span
                                  className="marketplace-owned-card__value"
                                  title={chunk.chunkId}
                                >
                                  {truncateAddress(chunk.chunkId, 8, 6)}
                                </span>
                              </div>
                              <div className="marketplace-owned-card__row">
                                <span className="marketplace-owned-card__label">
                                  World
                                </span>
                                <span
                                  className="marketplace-owned-card__value"
                                  title={chunk.worldId}
                                >
                                  {truncateAddress(chunk.worldId, 8, 6)}
                                </span>
                              </div>
                            </div>
                            <div className="marketplace-owned-card__actions">
                              <input
                                className="marketplace-price-input"
                                type="number"
                                min="1"
                                value={priceInputs[chunk.chunkId] ?? ""}
                                onChange={(event) =>
                                  setPriceInputs((prev) => ({
                                    ...prev,
                                    [chunk.chunkId]: event.target.value,
                                  }))
                                }
                                placeholder="Price (CHUNK)"
                              />
                              <button
                                className={
                                  `${listedChunkIds.has(chunk.chunkId)
                                    ? "btn--secondary"
                                    : "btn--primary"} flex items-center justify-center gap-2`
                                }
                                onClick={() => handleListChunk(chunk)}
                                disabled={
                                  isPending || listedChunkIds.has(chunk.chunkId)
                                }
                              >
                                {listedChunkIds.has(chunk.chunkId) ? (
                                  <>
                                    <Check size={12} /> Listed
                                  </>
                                ) : (
                                  <>
                                    <Upload size={12} /> List for Sale
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="marketplace-empty">
                      <div className="marketplace-empty__icon">
                        <Package size={32} />
                      </div>
                      <p className="marketplace-empty__text">
                        You don't have any chunks yet. Explore the game to mint
                        your first chunk!
                      </p>
                    </div>
                  )
                ) : (
                  <div className="marketplace-empty">
                    <div className="marketplace-empty__icon">
                      <Link2 size={32} />
                    </div>
                    <p className="marketplace-empty__text">
                      Connect your wallet to view your chunks
                    </p>
                  </div>
                )}
              </div>

              <div className="marketplace-modal__footer">
                <button className="btn--ghost" onClick={loadOwnedChunks}>
                  <RefreshCw size={12} /> Reload Chunks
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Listings Section */}
        <section className="marketplace-section">
          <div className="marketplace-section__header">
            <h2 className="marketplace-section__title">
              <span className="marketplace-section__title-icon">
                <ShoppingCart size={18} />
              </span>
              Available Listings
            </h2>
            <div className="marketplace-section__actions">
              <button
                className="btn--ghost"
                onClick={refreshListings}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader size={12} /> Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} /> Refresh
                  </>
                )}
              </button>
            </div>
          </div>

          {status && <div className={getStatusClass(status)}>{status}</div>}

          {hasListings ? (
            <div className="marketplace-grid marketplace-grid--listings">
              {listings.map((listing) => (
                <article
                  key={`${listing.chunkId}-${listing.timestamp}`}
                  className="marketplace-listing-card"
                >
                  <div
                    className="marketplace-listing-card__preview"
                    style={{ background: cardBackground(listing.chunkId) }}
                  >
                    {chunkImages[listing.chunkId] ? (
                      <img
                        src={chunkImages[listing.chunkId]}
                        alt={`Chunk ${truncateAddress(listing.chunkId, 8, 4)}`}
                      />
                    ) : null}
                  </div>
                  <div className="marketplace-listing-card__body">
                    <div className="marketplace-listing-card__info">
                      <div className="marketplace-listing-card__row">
                        <span className="marketplace-listing-card__label">
                          Chunk
                        </span>
                        <span
                          className="marketplace-listing-card__value"
                          title={listing.chunkId}
                        >
                          {truncateAddress(listing.chunkId, 8, 6)}
                        </span>
                      </div>
                      <div className="marketplace-listing-card__row">
                        <span className="marketplace-listing-card__label">
                          World
                        </span>
                        <span
                          className="marketplace-listing-card__value"
                          title={listing.worldId}
                        >
                          {truncateAddress(listing.worldId, 8, 6)}
                        </span>
                      </div>
                      <div className="marketplace-listing-card__row">
                        <span className="marketplace-listing-card__label">
                          Seller
                        </span>
                        <span
                          className="marketplace-listing-card__value"
                          title={listing.seller}
                        >
                          {truncateAddress(listing.seller, 6, 4)}
                        </span>
                      </div>
                    </div>
                    <div className="marketplace-listing-card__price">
                      <span className="marketplace-listing-card__price-label">
                        Price
                      </span>
                      <span className="marketplace-listing-card__price-value flex items-center gap-1">
                        <img
                          alt="chunk"
                          className="w-4 h-4"
                          src="https://ik.imagekit.io/huubao/chunk_coin.png"
                        />
                        {listing.price} CHUNK
                      </span>
                    </div>
                    {listing.seller === account?.address ? (
                      <button
                        className="btn--secondary flex items-center justify-center gap-2"
                        onClick={() => handleDelist(listing)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <Loader size={12} /> Processing...
                          </>
                        ) : (
                          <>
                            <RotateCcw size={12} /> Delist
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        className="btn--primary flex items-center justify-center gap-2"
                        onClick={() => handleBuy(listing)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <Loader size={12} /> Processing...
                          </>
                        ) : (
                          <>
                            <Coins size={12} /> Buy Now
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="marketplace-empty">
              <div className="marketplace-empty__icon">
                <Mountain size={32} />
              </div>
              <p className="marketplace-empty__text">
                No chunks currently listed for sale. Be the first to list!
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function extractObjectId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
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

function normalizeMoveFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object") {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function parseBalanceAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

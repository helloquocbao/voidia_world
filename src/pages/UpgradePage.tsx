import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { WalletHeader } from "../components";
import { PACKAGE_ID, POWER_STONE_VAULT_ID } from "../chain/config";
import { suiClient } from "../chain/suiClient";
import "./UpgradePage.css";

type CharacterSnapshot = {
  id: string;
  name: string;
  health: number;
  power: number;
  potential: number;
  attack: number;
  powerTier: number;
};

type UpgradePath =
  | { id: "power"; label: string; desc: string; ratio: number; accent: string }
  | {
      id: "health";
      label: string;
      desc: string;
      ratio: number;
      accent: string;
    }
  | {
      id: "potential";
      label: string;
      desc: string;
      ratio: number;
      accent: string;
    };

const DEFAULT_CHARACTER: CharacterSnapshot = {
  id: "",
  name: "Chưa có nhân vật",
  health: 100,
  power: 0,
  potential: 0,
  attack: 0,
  powerTier: 0,
};

const UPGRADE_PATHS: UpgradePath[] = [
  {
    id: "power",
    label: "Power Surge",
    desc: "Dồn Power Stones để đẩy mạnh chỉ số power.",
    ratio: 12,
    accent: "#79d5ff",
  },
  {
    id: "health",
    label: "Vital Core",
    desc: "Tăng sức bền, giúp sống sót lâu hơn khi khám phá.",
    ratio: 3,
    accent: "#8df2c2",
  },
  {
    id: "potential",
    label: "Potential Bloom",
    desc: "Kích hoạt tiềm năng để mở khóa tier cao hơn.",
    ratio: 7,
    accent: "#e1c2ff",
  },
];

const POWER_STONE_TYPE = PACKAGE_ID
  ? `${PACKAGE_ID}::power_stone::POWER_STONE`
  : "";

function normalizeMoveFields(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object") {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function parseU64(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return fallback;
}

export default function UpgradePage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending: isSigning } =
    useSignAndExecuteTransaction();
  const [character, setCharacter] =
    useState<CharacterSnapshot>(DEFAULT_CHARACTER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [txError, setTxError] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<UpgradePath>(UPGRADE_PATHS[0]);
  const [stones, setStones] = useState(12);
  const [stoneBalance, setStoneBalance] = useState(0);
  const [stoneCoins, setStoneCoins] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadCharacter();
    void loadPowerStones();
  }, [account?.address]);

  useEffect(() => {
    const max = stoneBalance > 0 ? Math.min(80, stoneBalance) : 0;
    if (max === 0) {
      setStones(0);
      return;
    }
    if (stones === 0) {
      setStones(Math.min(12, max));
    } else if (stones > max) {
      setStones(max);
    }
  }, [stoneBalance, stones]);

  async function loadCharacter() {
    if (!account?.address || !PACKAGE_ID) {
      setCharacter(DEFAULT_CHARACTER);
      setError(
        account?.address
          ? "Thiếu PACKAGE_ID, không thể đọc dữ liệu nhân vật."
          : "Hãy kết nối ví để xem nhân vật của bạn.",
      );
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const characterType = `${PACKAGE_ID}::world::CharacterNFT`;
      const result = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: characterType },
        options: { showContent: true },
      });

      if (result.data.length === 0) {
        setCharacter(DEFAULT_CHARACTER);
        setError("Chưa tìm thấy nhân vật. Tạo nhân vật trong trang Game.");
        return;
      }

      const obj = result.data[0];
      const content = obj.data?.content;
      if (!content || content.dataType !== "moveObject") {
        setCharacter(DEFAULT_CHARACTER);
        setError("Dữ liệu nhân vật không hợp lệ.");
        return;
      }

      const fields = normalizeMoveFields(content.fields);
      setCharacter({
        id: obj.data?.objectId ?? "",
        name: String(fields.name ?? "No Name"),
        health: parseU64(fields.health, 100),
        power: parseU64(fields.power, 0),
        potential: parseU64(fields.potential, 0),
        attack: parseU64(fields.attack, 0),
        powerTier: parseU64(fields.power_tier, 0),
      });
    } catch (err) {
      console.error("UpgradePage: failed to load character", err);
      setCharacter(DEFAULT_CHARACTER);
      setError("Không thể tải nhân vật. Thử lại sau.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPowerStones() {
    if (!account?.address || !POWER_STONE_TYPE) {
      setStoneBalance(0);
      setStoneCoins([]);
      return;
    }
    try {
      const coins = await suiClient.getCoins({
        owner: account.address,
        coinType: POWER_STONE_TYPE,
      });
      const total = coins.data.reduce(
        (sum, coin) => sum + Number(coin.balance ?? 0),
        0,
      );
      setStoneBalance(total);
      setStoneCoins(coins.data.map((c) => c.coinObjectId));
    } catch (err) {
      console.error("UpgradePage: failed to load Power Stones", err);
      setStoneBalance(0);
      setStoneCoins([]);
    }
  }

  const preview = useMemo(() => {
    const bonus = stones * selectedPath.ratio;
    const next: CharacterSnapshot = { ...character };
    if (selectedPath.id === "power") {
      next.power += bonus;
      next.powerTier = Math.min(5, Math.floor(next.power / 10_000));
    } else if (selectedPath.id === "health") {
      next.health += bonus;
    } else {
      next.potential += bonus;
    }
    return next;
  }, [character, selectedPath, stones]);

  function formatNumber(value: number) {
    return value.toLocaleString();
  }

  async function handleUpgradeOnChain() {
    setTxError("");
    setToast(null);

    if (!account?.address) {
      setTxError("Hãy kết nối ví để nâng cấp.");
      return;
    }
    if (!character.id) {
      setTxError("Không tìm thấy nhân vật. Tạo trong trang Game trước.");
      return;
    }
    if (!POWER_STONE_VAULT_ID || !PACKAGE_ID) {
      setTxError("Thiếu cấu hình contract. Bổ sung PACKAGE_ID / POWER_STONE_VAULT.");
      return;
    }
    if (stones <= 0) {
      setTxError("Chọn số lượng Power Stone > 0.");
      return;
    }
    if (stoneBalance < stones) {
      setTxError("Không đủ Power Stone để nâng cấp.");
      return;
    }
    if (stoneCoins.length === 0) {
      setTxError("Không tìm thấy coin Power Stone trong ví.");
      return;
    }

    setIsUpgrading(true);
    try {
      const tx = new Transaction();
      let payment;
      if (stoneCoins.length > 1) {
        const [first, ...rest] = stoneCoins;
        tx.mergeCoins(
          tx.object(first),
          rest.map((id) => tx.object(id)),
        );
        payment = tx.object(first);
      } else {
        payment = tx.object(stoneCoins[0]);
      }

      const pathCode =
        selectedPath.id === "power" ? 0 : selectedPath.id === "health" ? 1 : 2;

      tx.moveCall({
        target: `${PACKAGE_ID}::world::upgrade_character`,
        arguments: [
          tx.object(POWER_STONE_VAULT_ID),
          tx.object(character.id),
          payment,
          tx.pure.u8(pathCode),
          tx.pure.u64(stones),
        ],
      });

      const result = await signAndExecute({ transaction: tx });

      setToast(`Nâng cấp thành công! Digest ${result.digest}`);
      await loadCharacter();
      await loadPowerStones();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("UpgradePage: upgrade failed", err);
      setTxError(message);
    } finally {
      setIsUpgrading(false);
    }
  }

  const progressPower = Math.min(100, (preview.power / 15000) * 100);
  const progressHealth = Math.min(100, (preview.health / 500) * 100);
  const progressPotential = Math.min(100, (preview.potential / 8000) * 100);
  const sliderMax = stoneBalance > 0 ? Math.min(80, stoneBalance) : 0;
  const canUpgrade =
    Boolean(account?.address) &&
    stones > 0 &&
    stoneBalance >= stones &&
    Boolean(character.id);

  return (
    <div className="upgrade-page">
      <div className="upgrade-bg">
        <span className="upgrade-bg__halo upgrade-bg__halo--a" />
        <span className="upgrade-bg__halo upgrade-bg__halo--b" />
        <span className="upgrade-bg__grid" />
      </div>

      <header className="upgrade-top">
        <div className="upgrade-top__left">
          <Link className="upgrade-back" to="/game">
            <span>←</span> Quay lại Game
          </Link>
          <div className="upgrade-heading">
            <p className="upgrade-kicker">Character Upgrade Lab</p>
            <h1>Nâng cấp nhân vật</h1>
            <p className="upgrade-sub">
              Nhân vật được đặt ngay giữa màn hình để xem rõ thay đổi khi nâng cấp.
            </p>
          </div>
        </div>
        <div className="upgrade-top__right">
          <WalletHeader />
        </div>
      </header>

      <main className="upgrade-layout">
        <section className="panel panel--stats">
          <div className="panel__title">Chỉ số hiện tại</div>
          <div className="stat">
            <div className="stat__row">
              <span>Power</span>
              <span>
                {formatNumber(character.power)}
                <small className="stat__delta">
                  +{formatNumber(preview.power - character.power)}
                </small>
              </span>
            </div>
            <div className="stat__bar">
              <span style={{ width: `${progressPower}%` }} />
            </div>
          </div>

          <div className="stat">
            <div className="stat__row">
              <span>Health</span>
              <span>
                {formatNumber(character.health)}
                <small className="stat__delta">
                  +{formatNumber(preview.health - character.health)}
                </small>
              </span>
            </div>
            <div className="stat__bar stat__bar--green">
              <span style={{ width: `${progressHealth}%` }} />
            </div>
          </div>

          <div className="stat">
            <div className="stat__row">
              <span>Potential</span>
              <span>
                {formatNumber(character.potential)}
                <small className="stat__delta">
                  +{formatNumber(preview.potential - character.potential)}
                </small>
              </span>
            </div>
            <div className="stat__bar stat__bar--purple">
              <span style={{ width: `${progressPotential}%` }} />
            </div>
          </div>

          <div className="stat stat--inline">
            <div>
              <p className="stat__label">Power Tier</p>
              <p className="stat__value">Tier {character.powerTier}</p>
            </div>
            <div>
              <p className="stat__label">Sau nâng cấp</p>
              <p className="stat__value stat__value--accent">
                Tier {preview.powerTier}
              </p>
            </div>
          </div>

          {error && <div className="panel__error">{error}</div>}
          {isLoading && <div className="panel__hint">Đang tải nhân vật...</div>}
        </section>

        <section className="panel panel--stage">
          <div className="stage">
            <div className="stage__ring">
              <div className="stage__glow" />
              <div className="stage__spark stage__spark--a" />
              <div className="stage__spark stage__spark--b" />
              <div className="stage__spark stage__spark--c" />
              <div className="stage__character">
                <div className="sprite sprite--player" />
              </div>
            </div>
            <div className="stage__label">
              <p className="stage__name">{character.name}</p>
              <p className="stage__id">
                {character.id ? `ID: ${character.id}` : "No character detected"}
              </p>
            </div>
          </div>
        </section>

        <section className="panel panel--actions">
          <div className="panel__title">Lộ trình nâng cấp</div>
          <div className="upgrade-options">
            {UPGRADE_PATHS.map((path) => (
              <button
                key={path.id}
                className={`upgrade-card ${selectedPath.id === path.id ? "is-active" : ""}`}
                onClick={() => setSelectedPath(path)}
                style={
                  selectedPath.id === path.id
                    ? { borderColor: path.accent, boxShadow: `0 12px 32px ${path.accent}33` }
                    : undefined
                }
              >
                <div className="upgrade-card__eyebrow">{path.label}</div>
                <div className="upgrade-card__desc">{path.desc}</div>
                <div className="upgrade-card__gain">
                  +{path.ratio} điểm / mỗi Power Stone
                </div>
              </button>
            ))}
          </div>

          <div className="upgrade-slider">
            <div className="upgrade-slider__row">
              <span>Power Stones</span>
              <span className="upgrade-slider__value">
                {stones} / {stoneBalance.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={1}
              value={stones}
              disabled={sliderMax === 0 || isUpgrading}
              onChange={(e) => setStones(Number(e.target.value))}
            />
            <p className="upgrade-slider__hint">
              Kéo thanh để xem trước chỉ số sau khi tiêu hao Power Stones. Bạn có{" "}
              {stoneBalance.toLocaleString()} stones.
            </p>
            {sliderMax === 0 && (
              <p className="panel__error">Chưa có Power Stone trong ví.</p>
            )}
          </div>

          <div className="upgrade-summary">
            <div>
              <p className="upgrade-summary__label">Sau nâng cấp (dự tính)</p>
              <p className="upgrade-summary__value">
                Power {formatNumber(preview.power)} · Health {formatNumber(preview.health)} ·
                Potential {formatNumber(preview.potential)}
              </p>
            </div>
            <button
              className="upgrade-cta"
              onClick={handleUpgradeOnChain}
              disabled={!canUpgrade || isUpgrading || isSigning}
            >
              {isUpgrading || isSigning ? "Đang gửi giao dịch..." : "Nâng cấp on-chain"}
            </button>
          </div>
          {txError && <div className="panel__error">{txError}</div>}
          {toast && <div className="upgrade-toast">{toast}</div>}
        </section>
      </main>
    </div>
  );
}

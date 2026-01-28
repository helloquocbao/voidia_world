import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { WalletHeader } from "../components";
import { PACKAGE_ID } from "../chain/config";
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
  const [character, setCharacter] =
    useState<CharacterSnapshot>(DEFAULT_CHARACTER);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPath, setSelectedPath] = useState<UpgradePath>(UPGRADE_PATHS[0]);
  const [stones, setStones] = useState(12);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadCharacter();
  }, [account?.address]);

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

  function handleSimulateUpgrade() {
    setToast(
      "Đây là bản mô phỏng. Kết nối hàm Move nâng cấp sẽ được thêm sau khi contract sẵn sàng.",
    );
    setTimeout(() => setToast(null), 4200);
  }

  const progressPower = Math.min(100, (preview.power / 15000) * 100);
  const progressHealth = Math.min(100, (preview.health / 500) * 100);
  const progressPotential = Math.min(100, (preview.potential / 8000) * 100);

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
              <span className="upgrade-slider__value">{stones}</span>
            </div>
            <input
              type="range"
              min={4}
              max={80}
              step={1}
              value={stones}
              onChange={(e) => setStones(Number(e.target.value))}
            />
            <p className="upgrade-slider__hint">
              Kéo thanh để xem trước chỉ số sau khi tiêu hao Power Stones.
            </p>
          </div>

          <div className="upgrade-summary">
            <div>
              <p className="upgrade-summary__label">Sau nâng cấp (dự tính)</p>
              <p className="upgrade-summary__value">
                Power {formatNumber(preview.power)} · Health {formatNumber(preview.health)} ·
                Potential {formatNumber(preview.potential)}
              </p>
            </div>
            <button className="upgrade-cta" onClick={handleSimulateUpgrade}>
              Nâng cấp (mô phỏng)
            </button>
          </div>
          {toast && <div className="upgrade-toast">{toast}</div>}
        </section>
      </main>
    </div>
  );
}

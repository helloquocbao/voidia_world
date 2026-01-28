export const SUI_RPC_URL =
  import.meta.env.VITE_SUI_RPC ?? "https://fullnode.testnet.sui.io";

export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID;
export const ADMIN_CAP_ID = import.meta.env.VITE_ADMIN_CAP;
export const WORLD_REGISTRY_ID = import.meta.env.VITE_WORLD_REGISTRY;
export const REWARD_VAULT_ID = import.meta.env.VITE_REWARD_VAULT;
export const POWER_STONE_VAULT_ID =
  import.meta.env.VITE_POWER_STONE_VAULT ?? "";
export const TREASURY_CAP_ID = import.meta.env.VITE_TREASURY_CAP;
export const REWARD_COIN_TYPE = PACKAGE_ID
  ? `${PACKAGE_ID}::voidia_coin::VOIDIA_COIN`
  : "";
export const RANDOM_OBJECT_ID = import.meta.env.VITE_RANDOM_OBJECT_ID ?? "0x8";

// Crowdfund / pre-sale config
export type PresaleTier = {
  id: string;
  label: string;
  minContribution: number;
  maxContribution?: number;
  rewards: string[];
  powerStones?: number;
  tokenBonusWeight: number; // relative weight for sharing the 15% community pool (1 < 2 < 3 < 4)
  notes?: string;
};

export const PRESALE_WALLET =
  import.meta.env.VITE_PRESALE_WALLET ?? ""; // address to receive SUI for the drive

export const PRESALE_GOAL_SUI = Number(
  import.meta.env.VITE_PRESALE_GOAL_SUI ?? 50000
);

export const PRESALE_RAISED_SUI = Number(
  import.meta.env.VITE_PRESALE_RAISED_SUI ?? 0
);

export const PRESALE_TIERS: PresaleTier[] = [
  {
    id: "tier-1",
    label: ">= 50 SUI",
    minContribution: 50,
    maxContribution: 79.99,
    rewards: ["Project token (discounted pre-listing)"],
    tokenBonusWeight: 1,
    notes: "Entry tier; token share proportional to contribution.",
  },
  {
    id: "tier-2",
    label: ">= 80 SUI",
    minContribution: 80,
    maxContribution: 139.99,
    rewards: [
      "Rare sword NFT (character equip)",
      "30 Power Stones",
      "Token bonus",
    ],
    tokenBonusWeight: 2,
  },
  {
    id: "tier-3",
    label: ">= 140 SUI",
    minContribution: 140,
    maxContribution: 349.99,
    rewards: [
      "Legendary scythe NFT (character equip)",
      "80 Power Stones",
      "Token bonus",
    ],
    tokenBonusWeight: 3,
  },
  {
    id: "tier-4",
    label: ">= 350 SUI",
    minContribution: 350,
    rewards: [
      "Land NFT",
      "Outlander cloak NFT",
      "120 Power Stones",
      "Token bonus (scales with contribution)",
    ],
    tokenBonusWeight: 4, // highest priority when splitting community bonus
    notes:
      "More SUI above 350 = larger community bonus share (pro-rata).",
  },
];

export const TOKENOMICS = {
  // 15%: distributed to community using tier weights above
  communityBonusPercent: 0.15,
  // 50%: locked for at least 12 months, then unlock 5% every 3 months
  lockedTreasury: {
    percent: 0.5,
    cliffMonths: 12,
    unlockIntervalMonths: 3,
    unlockPercentEachInterval: 0.05,
  },
  // 35%: sent to reward vault for in-game distribution
  rewardVaultPercent: 0.35,
  // contributions from 350 SUI upward: bonus token scales with contribution inside tier-4
  highTierScaleFrom: 350,
} as const;

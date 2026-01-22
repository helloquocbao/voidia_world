import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useRewardBalance } from "../hooks/useRewardBalance";
import "./WalletHeader.css";

const CHUNK_COIN_ICON =
  "https://ik.imagekit.io/huubao/chunk_coin.png?updatedAt=1768641987539";

/**
 * Shared component for displaying reward balance and connect wallet button
 * Uses Zustand store to cache balance and avoid repeated fetches
 */
export function WalletHeader() {
  const account = useCurrentAccount();
  const { balance, isLoading } = useRewardBalance();

  return (
    <div className="wallet-header">
      {account && (
        <div className="wallet-header__balance">
          <img
            alt="CHUNK"
            className="wallet-header__icon"
            src={CHUNK_COIN_ICON}
          />
          {isLoading ? (
            <span className="wallet-header__skeleton" />
          ) : (
            <span className="wallet-header__value">
              {balance.toLocaleString()}
            </span>
          )}
          <span className="wallet-header__label">CHUNK</span>
        </div>
      )}
      <ConnectButton />
    </div>
  );
}

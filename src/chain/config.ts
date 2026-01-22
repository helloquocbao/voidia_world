export const SUI_RPC_URL =
  import.meta.env.VITE_SUI_RPC ?? "https://fullnode.testnet.sui.io";

export const PACKAGE_ID =
  import.meta.env.VITE_PACKAGE_ID ??
  "0x153e0a84431e269febf163f75fee2f26526849f48d408ee20b812a9329ac5374";
export const ADMIN_CAP_ID =
  import.meta.env.VITE_ADMIN_CAP ??
  "0x1e8763112cfd5ffb50c951480da999e5153d2993b4cd12839ac607b698aeebf0";
export const WORLD_REGISTRY_ID =
  import.meta.env.VITE_WORLD_REGISTRY ??
  "0x4550843c52763748bd5cf32c9a49ba8d0e4ff73649df7855d30b3ad75b08b21c";
export const REWARD_VAULT_ID =
  import.meta.env.VITE_REWARD_VAULT ??
  "0x9b58af962b5e8e5009779f4af7bb0717c626f7e120a8e2c4b4eedbb431b84a62";
export const TREASURY_CAP_ID =
  import.meta.env.VITE_TREASURY_CAP ??
  "0x9c65fe112eab5919b889e7444736c3e018a4c6c3cee984b42cd439af2f9947d3";
export const REWARD_COIN_TYPE = PACKAGE_ID
  ? `${PACKAGE_ID}::reward_coin::REWARD_COIN`
  : "";
export const RANDOM_OBJECT_ID = import.meta.env.VITE_RANDOM_OBJECT_ID ?? "0x8";

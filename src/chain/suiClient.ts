import { SuiClient } from "@mysten/sui/client";
import { SUI_RPC_URL } from "./config";

export const suiClient = new SuiClient({ url: SUI_RPC_URL });

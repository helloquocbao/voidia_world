import { useState, useCallback } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { WalrusFile } from "@mysten/walrus";

const WALRUS_CONFIG = {
  WASM_URL:
    "https://unpkg.com/@mysten/walrus-wasm@latest/web/walrus_wasm_bg.wasm",
  NETWORK: "testnet" as const,
  EPOCHS: 10,
} as const;

const createWalrusClient = async () => {
  const { SuiJsonRpcClient } = await import("@mysten/sui/jsonRpc");
  const { walrus } = await import("@mysten/walrus");

  const client = new SuiJsonRpcClient({
    url: getFullnodeUrl(WALRUS_CONFIG.NETWORK),
    network: WALRUS_CONFIG.NETWORK,
  });

  return client.$extend(
    walrus({
      wasmUrl: WALRUS_CONFIG.WASM_URL,
    }),
  );
};

export function useWalrusUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const executeTransaction = useCallback(
    (tx: any): Promise<string> => {
      return new Promise((resolve, reject) => {
        signAndExecuteTransaction(
          { transaction: tx },
          {
            onSuccess: (result) => {
              resolve(result.digest);
            },
            onError: (error) => {
              reject(error);
            },
          },
        );
      });
    },
    [signAndExecuteTransaction],
  );

  const uploadBytes = useCallback(
    async (bytes: Uint8Array, fileMeta: { name: string; type: string }) => {
      if (!currentAccount) {
        throw new Error("No wallet connected");
      }

      const client = await createWalrusClient();

      const walrusFile = WalrusFile.from({
        contents: bytes,
        identifier: fileMeta.name,
        tags: {
          "content-type": fileMeta.type,
          "file-name": fileMeta.name,
        },
      });

      const flow = client.walrus.writeFilesFlow({
        files: [walrusFile],
      });

      await flow.encode();

      const registerTx = flow.register({
        epochs: WALRUS_CONFIG.EPOCHS,
        owner: currentAccount.address,
        deletable: true,
      });

      const registerDigest = await executeTransaction(registerTx);

      await flow.upload({ digest: registerDigest });

      const certifyTx = flow.certify();
      await executeTransaction(certifyTx);

      const uploadedFiles = await flow.listFiles();
      if (uploadedFiles.length === 0) {
        throw new Error("Upload failed: no files returned");
      }
      console.log("Uploaded files:", uploadedFiles);
      return uploadedFiles[0].id;
    },
    [currentAccount, executeTransaction],
  );

  const uploadImage = useCallback(
    async (input: File | HTMLCanvasElement): Promise<string> => {
      if (!currentAccount) {
        throw new Error("No wallet connected");
      }

      setIsUploading(true);

      try {
        if (input instanceof HTMLCanvasElement) {
          const blob = await new Promise<Blob>((resolve, reject) => {
            input.toBlob(
              (result) => {
                if (!result) {
                  reject(new Error("Failed to capture canvas"));
                  return;
                }
                resolve(result);
              },
              "image/png",
              1,
            );
          });
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          return await uploadBytes(bytes, {
            name: "canvas.png",
            type: "image/png",
          });
        }

        const buffer = await input.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return await uploadBytes(bytes, {
          name: input.name,
          type: input.type || "image/png",
        });
      } catch (error) {
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [currentAccount, uploadBytes],
  );

  return {
    uploadImage,
    isUploading,
  };
}

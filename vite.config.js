import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@noble/hashes/sha3": "@noble/hashes/sha3.js",
      "@noble/hashes/sha2": "@noble/hashes/sha2.js",
      "@noble/hashes/blake2": "@noble/hashes/blake2.js",
      "@noble/hashes/hmac": "@noble/hashes/hmac.js",
      "@noble/hashes/hkdf": "@noble/hashes/hkdf.js",
      "@noble/hashes/pbkdf2": "@noble/hashes/pbkdf2.js",
      "@noble/hashes/utils": "@noble/hashes/utils.js",
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            console.log("→ Backend:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            console.log("← Backend Response:", proxyRes.statusCode, req.url);
          });
          proxy.on("error", (err, req) => {
            console.log("Proxy Error:", err.message, req.url);
          });
        },
      },
      "/walrus-upload": {
        target: "https://publisher.walrus-testnet.walrus.space",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-upload/, ""),
      },
      "/walrus-pub-1": {
        target: "https://publisher.walrus-testnet.walrus.space",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-pub-1/, ""),
      },
      "/walrus-pub-2": {
        target: "https://walrus-testnet-publisher.nodes.guru",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-pub-2/, ""),
      },
      "/walrus-pub-3": {
        target: "https://publisher.testnet.blob.store",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-pub-3/, ""),
      },
      "/walrus-pub-4": {
        target: "https://walrus-publish-testnet.chainode.tech",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-pub-4/, ""),
      },
      "/walrus-pub-5": {
        target: "https://testnet-publisher.walrus.space",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/walrus-pub-5/, ""),
      },
    },
  },
});

# Voidia World - Hackathon Game

A blockchain-based Voidia World game built on **Sui Network** with **Kaboom.js** game engine.

## 🎮 Features

- Plot-based world editor (5x5 tiles per plot)
- 2-layer tile system (base tiles + decorations)
- On-chain world storage via Sui Move smart contracts
- Character NFT system
- Play-to-earn rewards with PLOT tokens

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TailwindCSS
- **Game Engine**: Kaboom.js
- **Blockchain**: Sui Network (Testnet)
- **Smart Contract**: Move language
- **State Management**: Zustand
- **Wallet**: @mysten/dapp-kit

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) (recommended) or npm
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (for smart contract deployment)

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd firstmove-hackathon-game
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Setup environment variables

Copy the example env file and update values:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
VITE_SUI_RPC=https://fullnode.testnet.sui.io
VITE_PACKAGE_ID=<your-deployed-package-id>
VITE_DUNGEON_CAP=<your-dungeon-cap-object-id>
VITE_WALRUS_WASM_URL=https://unpkg.com/@mysten/walrus-wasm@latest/web/walrus_wasm_bg.wasm
VITE_WALRUS_GATEWAY=https://wal-aggregator-testnet.staketab.org/v1/blobs/by-quilt-patch-id
```

### 4. Run development server

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

## 📦 Available Scripts

| Command        | Description              |
| -------------- | ------------------------ |
| `pnpm dev`     | Start development server |
| `pnpm build`   | Build for production     |
| `pnpm preview` | Preview production build |
| `pnpm lint`    | Run ESLint               |

## 🔗 Smart Contract (Move)

The Move smart contract (package name `voidia_world`) is located in the `voidia_world_contract/` directory.

### Build contract

```bash
cd voidia_world_contract
sui move build
```

### Test contract

```bash
sui move test
```

### Deploy contract

```bash
sui client publish --gas-budget 100000000
```

After deployment, update `VITE_PACKAGE_ID` in your `.env` file with the published package ID.

## 📁 Project Structure

```
├── voidia_world/          # Sui Move smart contracts
│   ├── sources/          # Move source files
│   └── tests/            # Move test files
├── public/
│   └── sprites/          # Game sprites and assets
│       ├── decorations/  # Decoration tiles
│       ├── goblin/       # Enemy sprites
│       ├── player/       # Player sprites
│       └── Tiles/        # Base tile sprites
├── src/
│   ├── chain/            # Sui client configuration
│   ├── game/             # Kaboom game logic
│   │   ├── start.ts      # Game initialization
│   │   └── tiles.ts      # Tile definitions
│   ├── pages/            # React pages
│   │   ├── EditorGame.tsx  # Map editor
│   │   ├── GamePage.jsx    # Game player
│   │   └── LandingPage.jsx # Home page
│   └── sui/              # Sui utilities
└── package.json
```

## 🎨 Game Controls

- **Arrow Keys / WASD**: Move player
- **Editor**: Click tiles to place/edit

## 📝 Configuration

### Tile Size

- `TILE_SIZE`: 32px
- `PLOT_SIZE`: 5x5 tiles (160x160 pixels per PLOT)

### Camera

- Default zoom: 2x

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is private and created for hackathon purposes.





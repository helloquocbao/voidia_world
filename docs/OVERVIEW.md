# Chunk World - Project Overview (EN/VI)

## What It Is / Tong quan
- EN: On-chain world builder on Sui where every land tile (ChunkNFT) is an NFT you can edit, trade, and earn from.
- VI: Game xây thế giới on-chain trên Sui; mỗi ô đất (ChunkNFT) là NFT có thể xây, giao dịch và kiếm tiền.
- EN: Player loop: claim chunks, build/edit, play to earn CHUNK, trade chunks, withdraw proceeds.
- VI: Vòng lặp: nhận chunk, xây/sửa, chơi nhận CHUNK, mua/bán chunk, rút tiền.
- EN: Tech stack: Move (chunk_world::world), React/Vite, @mysten/dapp-kit, CHUNK reward coin.
- VI: Công nghệ: Move (chunk_world::world), React/Vite, @mysten/dapp-kit, token CHUNK.

## Core On-Chain Logic (Move) / Logic on-chain chinh
- EN: World state: WorldMap (shared), WorldRegistry (one world), AdminCap (create world).
- VI: Trạng thái: WorldMap (shared), WorldRegistry (1 world), AdminCap (tạo world).
- EN: Assets: ChunkNFT (land), CharacterNFT (soulbound), ChunkListing, SellerPayout, RewardVault + CHUNK coin.
- VI: Tài sản: ChunkNFT (đất), CharacterNFT (soulbound), ChunkListing, SellerPayout, RewardVault + CHUNK.
- EN: Flows: claim/mint chunk (price grows with chunk_count, adjacency check); edit chunk (update_chunk tiles/decor/image); marketplace list/buy/cancel/withdraw (pay CHUNK, transfer chunk, store proceeds); gameplay play_v1/play_v2/claim_reward (random reward, boosts stats).
- VI: Luồng: claim/mint chunk (giá tăng theo số chunk, kiểm tra liền kề); sửa chunk (update_chunk tiles/decor/image); chợ list/mua/hủy/rút (trả CHUNK, chuyển chunk, lưu proceeds); gameplay play_v1/play_v2/claim_reward (thưởng ngẫu nhiên, tăng chỉ số).
- EN: Validation: tiles/decor length 25, URL cap, world match, buyer != seller, daily play caps, difficulty/name bounds.
- VI: Ràng buộc: tiles/decor độ dài 25, giới hạn URL, world khớp, buyer khác seller, giới hạn lượt/ngày, biên difficulty/name hợp lệ.

## Frontend
- EN: Pages: Landing, Game, Editor, Marketplace. WalletHeader shows CHUNK balance + connect.
- VI: Trang: Landing, Game, Editor, Marketplace. WalletHeader hiển số dư CHUNK + nút connect.
- EN: Marketplace: listings via events + dynamic fields; chunk images; buy/list/delist; withdraw proceeds.
- VI: Marketplace: lấy listing từ event + dynamic field; hiển ảnh chunk; mua/list/hủy; rút proceeds.
- EN: Enemy/difficulty maintainer: scales spawn targets using world difficulty + network TPS; caches RPC; keeps target enemy count.
- VI: Enemy maintainer: điều chỉnh spawn theo difficulty world + TPS mạng; cache RPC; duy trì số quái mục tiêu.

## Game Economy & Dynamic NFTs / Kinh te & NFT dong
- EN: ChunkNFT: mint cost grows with world size; editable on-chain; tradable for CHUNK.
- VI: ChunkNFT: giá mint tăng theo số chunk; chỉnh on-chain; giao dịch bằng CHUNK.
- EN: CharacterNFT (soulbound): power/potential increase via claim_reward.
- VI: CharacterNFT (soulbound): power/potential tăng qua claim_reward.
- EN: CHUNK token: pays land, fees, seller payouts.
- VI: CHUNK: trả đất, phí chơi, tiền seller.
- EN: Dynamic NFTs: chunk tiles/decor/image and character stats mutate on-chain; emit update events.
- VI: NFT động: tiles/decor/image của chunk và stats nhân vật thay đổi on-chain; emit event cập nhật.

## Why On-Chain Matters / Vi sao on-chain quan trong
- EN: True ownership, P2P trading, transparent rewards, composability for other dApps.
- VI: Quyền sở hữu thật, giao dịch P2P, thưởng minh bạch, tài sản dùng được cho dApp khác.
- EN: Without blockchain it is just a centralized web2 game with no economic/collectible value.
- VI: Bỏ blockchain chỉ còn game web2 tập trung, mất giá trị kinh tế/sưu tầm.
- EN: On-chain keeps open trading, interoperable assets, and verifiable reward rules.
- VI: On-chain giữ giao dịch mở, tài sản tương tác, luật thưởng có thể kiểm chứng.

## Demo Script (3 minutes) / Kich ban demo
1) EN: Edit a chunk (update tiles + image with update_chunk).  
   VI: Sửa chunk (tiles + ảnh qua update_chunk).
2) EN: List the chunk (price in CHUNK).  
   VI: List chunk (giá CHUNK).
3) EN: Buy from another wallet, see transfer.  
   VI: Mua từ ví khác, thấy chunk đổi chủ.
4) EN: Seller withdraws proceeds (CHUNK to wallet).  
   VI: Người bán rút proceeds (CHUNK về ví).
5) EN (optional): Show play_v2 + claim_reward, stats increase.  
   VI (tùy chọn): Chơi play_v2 + claim_reward, tăng chỉ số.

## Near-Term Enhancements / Huong mo rong gan
- EN: Switch marketplace to Sui Kiosk (if kiosk IDs available); add zkLogin onboarding.
- VI: Chuyển chợ sang Sui Kiosk (nếu có kiosk ID); thêm zkLogin để onboard nhanh.
- EN: Balance difficulty/spawn/reward; richer chunk metadata.
- VI: Cân bằng difficulty/spawn/reward; làm phong phú metadata chunk.

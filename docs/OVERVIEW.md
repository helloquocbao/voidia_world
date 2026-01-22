# Voidia World - Project Overview (EN/VI)

## What It Is / Tong quan
- EN: On-chain world builder on Sui where every land tile (PLOTNFT) is an NFT you can edit, trade, and earn from.
- VI: Game xây thế giới on-chain trên Sui; mỗi ô đất (PLOTNFT) là NFT có thể xây, giao dịch và kiếm tiền.
- EN: Player loop: claim PLOTs, build/edit, play to earn PLOT, trade PLOTs, withdraw proceeds.
- VI: Vòng lặp: nhận PLOT, xây/sửa, chơi nhận PLOT, mua/bán PLOT, rút tiền.
- EN: Tech stack: Move (voidia_world::world), React/Vite, @mysten/dapp-kit, PLOT reward coin.
- VI: Công nghệ: Move (voidia_world::world), React/Vite, @mysten/dapp-kit, token PLOT.

## Core On-Chain Logic (Move) / Logic on-chain chinh
- EN: World state: WorldMap (shared), WorldRegistry (one world), AdminCap (create world).
- VI: Trạng thái: WorldMap (shared), WorldRegistry (1 world), AdminCap (tạo world).
- EN: Assets: PLOTNFT (land), CharacterNFT (soulbound), PLOTListing, SellerPayout, RewardVault + PLOT coin.
- VI: Tài sản: PLOTNFT (đất), CharacterNFT (soulbound), PLOTListing, SellerPayout, RewardVault + PLOT.
- EN: Flows: claim/mint PLOT (price grows with PLOT_count, adjacency check); edit PLOT (update_PLOT tiles/decor/image); marketplace list/buy/cancel/withdraw (pay PLOT, transfer PLOT, store proceeds); gameplay play_v1/play_v2/claim_reward (random reward, boosts stats).
- VI: Luồng: claim/mint PLOT (giá tăng theo số PLOT, kiểm tra liền kề); sửa PLOT (update_PLOT tiles/decor/image); chợ list/mua/hủy/rút (trả PLOT, chuyển PLOT, lưu proceeds); gameplay play_v1/play_v2/claim_reward (thưởng ngẫu nhiên, tăng chỉ số).
- EN: Validation: tiles/decor length 25, URL cap, world match, buyer != seller, daily play caps, difficulty/name bounds.
- VI: Ràng buộc: tiles/decor độ dài 25, giới hạn URL, world khớp, buyer khác seller, giới hạn lượt/ngày, biên difficulty/name hợp lệ.

## Frontend
- EN: Pages: Landing, Game, Editor, Marketplace. WalletHeader shows PLOT balance + connect.
- VI: Trang: Landing, Game, Editor, Marketplace. WalletHeader hiển số dư PLOT + nút connect.
- EN: Marketplace: listings via events + dynamic fields; PLOT images; buy/list/delist; withdraw proceeds.
- VI: Marketplace: lấy listing từ event + dynamic field; hiển ảnh PLOT; mua/list/hủy; rút proceeds.
- EN: Enemy/difficulty maintainer: scales spawn targets using world difficulty + network TPS; caches RPC; keeps target enemy count.
- VI: Enemy maintainer: điều chỉnh spawn theo difficulty world + TPS mạng; cache RPC; duy trì số quái mục tiêu.

## Game Economy & Dynamic NFTs / Kinh te & NFT dong
- EN: PLOTNFT: mint cost grows with world size; editable on-chain; tradable for PLOT.
- VI: PLOTNFT: giá mint tăng theo số PLOT; chỉnh on-chain; giao dịch bằng PLOT.
- EN: CharacterNFT (soulbound): power/potential increase via claim_reward.
- VI: CharacterNFT (soulbound): power/potential tăng qua claim_reward.
- EN: PLOT token: pays land, fees, seller payouts.
- VI: PLOT: trả đất, phí chơi, tiền seller.
- EN: Dynamic NFTs: PLOT tiles/decor/image and character stats mutate on-chain; emit update events.
- VI: NFT động: tiles/decor/image của PLOT và stats nhân vật thay đổi on-chain; emit event cập nhật.

## Why On-Chain Matters / Vi sao on-chain quan trong
- EN: True ownership, P2P trading, transparent rewards, composability for other dApps.
- VI: Quyền sở hữu thật, giao dịch P2P, thưởng minh bạch, tài sản dùng được cho dApp khác.
- EN: Without blockchain it is just a centralized web2 game with no economic/collectible value.
- VI: Bỏ blockchain chỉ còn game web2 tập trung, mất giá trị kinh tế/sưu tầm.
- EN: On-chain keeps open trading, interoperable assets, and verifiable reward rules.
- VI: On-chain giữ giao dịch mở, tài sản tương tác, luật thưởng có thể kiểm chứng.

## Demo Script (3 minutes) / Kich ban demo
1) EN: Edit a PLOT (update tiles + image with update_PLOT).  
   VI: Sửa PLOT (tiles + ảnh qua update_PLOT).
2) EN: List the PLOT (price in PLOT).  
   VI: List PLOT (giá PLOT).
3) EN: Buy from another wallet, see transfer.  
   VI: Mua từ ví khác, thấy PLOT đổi chủ.
4) EN: Seller withdraws proceeds (PLOT to wallet).  
   VI: Người bán rút proceeds (PLOT về ví).
5) EN (optional): Show play_v2 + claim_reward, stats increase.  
   VI (tùy chọn): Chơi play_v2 + claim_reward, tăng chỉ số.

## Near-Term Enhancements / Huong mo rong gan
- EN: Switch marketplace to Sui Kiosk (if kiosk IDs available); add zkLogin onboarding.
- VI: Chuyển chợ sang Sui Kiosk (nếu có kiosk ID); thêm zkLogin để onboard nhanh.
- EN: Balance difficulty/spawn/reward; richer PLOT metadata.
- VI: Cân bằng difficulty/spawn/reward; làm phong phú metadata PLOT.


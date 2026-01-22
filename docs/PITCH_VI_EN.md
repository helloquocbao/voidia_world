# HiddenKey - 3 Minute Pitch (VI/EN)

## Opening / Mo dau
- EN: We are HiddenKey. Chunk World is an on-chain world builder on Sui: every land tile (ChunkNFT) is a real NFT you can build, trade, and earn from.
- VI: Chúng tôi là HiddenKey. Chunk World là game xây thế giới on-chain trên Sui: mỗi ô đất (ChunkNFT) là NFT thật, có thể xây, giao dịch và kiếm CHUNK.

## Problem & Idea / Van de & Y tuong
- EN: Players want real ownership, transparent trading, and assets usable across apps; web2 cannot deliver.
- VI: Người chơi cần sở hữu thật, giao dịch minh bạch, tài sản dùng được ở ứng dụng khác; web2 không đáp ứng.
- EN: We put land, edits, trading, and rewards fully on-chain. Loop: claim chunk, build/edit, play to earn CHUNK, trade, withdraw.
- VI: Đưa đất, chỉnh sửa, giao dịch, thưởng lên on-chain. Vòng lặp: nhận chunk, xây/sửa, chơi nhận CHUNK, mua/bán, rút tiền.

## Core On-Chain Logic / Logic On-Chain (Non-tech)
- EN: The chain is the source of truth for land, characters, trades, and rewards.
- VI: Blockchain là sổ cái thật giữ đất, nhân vật, giao dịch và thưởng.
- EN: You mint land (ChunkNFT), edit it, and trade it for CHUNK; the chain records ownership and payments.
- VI: Mint đất (ChunkNFT), sửa, mua/bán bằng CHUNK; chuỗi ghi nhận chủ sở hữu và thanh toán.
- EN: Characters are soulbound (non-tradable) and level up by playing and claiming rewards.
- VI: Nhân vật soulbound (không bán được) và tăng chỉ số khi chơi + claim reward.
- EN: Marketplace is on-chain: list, buy, cancel; seller money stays on-chain until they withdraw.
- VI: Chợ on-chain: đăng bán, mua, hủy; tiền người bán lưu trên chain đến khi rút.
- EN: Basic rules enforced on-chain: valid tiles, fair prices, right owner, daily play limits.
- VI: Luật trên chain: tiles hợp lệ, giá hợp lý, đúng chủ, giới hạn lượt chơi mỗi ngày.

## Gameplay Difficulty & Enemies / Do kho & quai (tu Sui)
- EN: Use world base difficulty (1-9) + chunk count to set target enemy count. Every few seconds read Sui TPS via `getTotalTransactionBlocks` to know network load.
- VI: Dùng độ khó world (1-9) + số chunk để đặt số quái mục tiêu. Mỗi vài giây đọc TPS Sui qua `getTotalTransactionBlocks` để biết mạng bận hay nhàn.
- EN: Effective difficulty = base difficulty x factor tu network load (co gioi han). Neu current enemies < target thi spawn them; enemy stats scale theo do kho thuc te.
- VI: Độ khó thực tế = độ khó gốc x hệ số tải mạng (có trần). Nếu số quái hiện tại dưới mục tiêu thì spawn thêm; chỉ số quái nhân theo độ khó.
- EN: Busier network or harder world = tougher/more enemies; quiet network = giam spawn.
- VI: Mạng bận hoặc world khó hơn -> quái mạnh/đông hơn; mạng nhẹ -> giảm spawn.

**Note**: `sui_getTotalTransactionBlocks` tra ve tong programmable transaction blocks; dung chenh lech de suy TPS/tai mang.

## Frontend & Gameplay / Giao dien & Gameplay
- EN: Pages: Landing, Game, Editor, Marketplace. WalletHeader shows CHUNK + connect.
- VI: Trang: Landing, Game, Editor, Marketplace. WalletHeader hiển CHUNK + nút connect.
- EN: Marketplace doc event + dynamic fields; show chunk image; buy/list/delist; withdraw proceeds.
- VI: Marketplace đọc event + dynamic field; hiển ảnh chunk; mua/list/hủy; rút proceeds.
- EN: Enemy/difficulty maintainer scales spawn using world difficulty + network TPS.
- VI: Enemy maintainer dùng difficulty world + TPS mạng để giữ số quái mục tiêu.

## Why On-Chain / Vi sao On-Chain
- EN: True ownership, P2P trades, transparent rewards, composable assets for other dApps.
- VI: Sở hữu thật, giao dịch P2P, thưởng minh bạch, tài sản tương tác dApp khác.
- EN: Without blockchain it is just centralized web2 entertainment; no real ownership or open trading.
- VI: Bỏ blockchain chỉ còn giải trí web2 tập trung; không sở hữu thật, không giao dịch mở.

## 3-Min Demo Script / Kich ban demo 3 phut
1) EN: Edit a chunk (`update_chunk`: tiles + image).  
   VI: Sửa chunk (`update_chunk`: tiles + ảnh).
2) EN: List the chunk with CHUNK price.  
   VI: List chunk, đặt giá CHUNK.
3) EN: Buy from another wallet, show transfer.  
   VI: Mua từ ví khác, thấy chunk đổi chủ.
4) EN: Seller withdraws proceeds (CHUNK to wallet).  
   VI: Người bán rút proceeds (CHUNK về ví).
5) EN (optional): `play_v2` + `claim_reward` to earn CHUNK and boost stats.  
   VI (tùy chọn): `play_v2` + `claim_reward` để nhận CHUNK và tăng chỉ số.

## Near-Term Enhancements / Huong mo rong
- EN: Move marketplace to Sui Kiosk (if kiosk IDs available); add zkLogin onboarding; balance difficulty/spawn/reward.
- VI: Chuyển chợ sang Sui Kiosk (nếu có kiosk ID); thêm zkLogin; cân bằng difficulty/spawn/reward.

## Closing / Ket
- EN: HiddenKey builds Chunk World for real on-chain ownership and gameplay. Thank you.
- VI: HiddenKey xây Chunk World cho quyền sở hữu on-chain và gameplay thật. Cảm ơn.

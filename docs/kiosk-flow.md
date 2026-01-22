## Flow Marketplace Chunk World

### 1) Claim chunk (mint land)
- FE: `EditorGame` gọi `claim_chunk` với tiles/decor/image URL, coin payment (chunk đầu tiên free).
- Move: xác thực fee/tiles, chọn tọa độ gần chunk hiện có, mint `ChunkNFT`, ghi entry dynamic `(cx, cy) -> chunk_id`, emit `ChunkClaimedEvent`. Chunk nằm trong ví người chơi.

### 2) List chunk (dua vao kiosk)
- FE: gọi `list_chunk`, chuyển ownership `ChunkNFT` vào dynamic field `ListingKey { chunk_id }`.
- Move: kiểm tra chunk thuộc world, giá > 0, tạo `ChunkListing`, lưu dưới dynamic field, emit `ChunkListedEvent`. Chunk thuộc kiosk (world) thay vì owner.

### 3) Buy chunk
- FE: buyer xem listing từ event/dynamic field, gọi `buy_chunk` kèm `REWARD_COIN`.
- Move: kiểm tra listing tồn tại, payment >= price, chia coin (lưu SellerPayout, refund dư), đổi chủ ChunkNFT, emit `ChunkSoldEvent`.
- Ghi chú: seller không nhận tiền ngay; số dư nằm trong `SellerPayout` cho đến khi rút.

### 4) Withdraw proceeds (rut tien)
- FE: seller xem số dư pending (event hoặc dynamic field) và gọi `withdraw_proceeds(amount)`.
- Move: kiểm tra số dư, lấy coin từ `balance`, chuyển về ví seller; error nếu không đủ.

### 5) Cancel listing
- FE: nếu muốn lấy chunk về khi chưa bán, gọi `cancel_listing`.
- Move: kiểm tra seller, chuyển `ChunkNFT` về ví, emit `ChunkDelistedEvent`.

### Su kien chinh
1. `ChunkClaimedEvent`: chunk vua mint.  
2. `ChunkListedEvent`: chunk len kiosk.  
3. `ChunkSoldEvent`: doi chu + ghi seller/buyer/price.  
4. `ChunkDelistedEvent`: listing bi huy.  

### FE can them
- Tab marketplace/kiosk hiện listing: fetch event hoặc dynamic field `ListingKey`.
- Mỗi chunk: show price, owner, buy button (`buy_chunk`); nếu là owner thì có nút `withdraw_proceeds` và `cancel_listing`.
- Hiển số dư pending cho owner để rút (có thể query `SellerPayoutKey`).

### Kiem tra & trien khai
- Chạy `sui move build` + `sui move test` sau khi chỉnh `chunk_world.move`.
- Publish package và cập nhật `VITE_PACKAGE_ID` trong env.
- Cập nhật FE gọi các entry mới trong `EditorGame.tsx` hoặc page marketplace riêng.

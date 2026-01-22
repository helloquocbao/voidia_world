## Flow Marketplace Voidia World

### 1) Claim PLOT (mint land)
- FE: `EditorGame` gọi `claim_PLOT` với tiles/decor/image URL, coin payment (PLOT đầu tiên free).
- Move: xác thực fee/tiles, chọn tọa độ gần PLOT hiện có, mint `PLOTNFT`, ghi entry dynamic `(cx, cy) -> PLOT_id`, emit `PLOTClaimedEvent`. PLOT nằm trong ví người chơi.

### 2) List PLOT (dua vao kiosk)
- FE: gọi `list_PLOT`, chuyển ownership `PLOTNFT` vào dynamic field `ListingKey { PLOT_id }`.
- Move: kiểm tra PLOT thuộc world, giá > 0, tạo `PLOTListing`, lưu dưới dynamic field, emit `PLOTListedEvent`. PLOT thuộc kiosk (world) thay vì owner.

### 3) Buy PLOT
- FE: buyer xem listing từ event/dynamic field, gọi `buy_PLOT` kèm `REWARD_COIN`.
- Move: kiểm tra listing tồn tại, payment >= price, chia coin (lưu SellerPayout, refund dư), đổi chủ PLOTNFT, emit `PLOTSoldEvent`.
- Ghi chú: seller không nhận tiền ngay; số dư nằm trong `SellerPayout` cho đến khi rút.

### 4) Withdraw proceeds (rut tien)
- FE: seller xem số dư pending (event hoặc dynamic field) và gọi `withdraw_proceeds(amount)`.
- Move: kiểm tra số dư, lấy coin từ `balance`, chuyển về ví seller; error nếu không đủ.

### 5) Cancel listing
- FE: nếu muốn lấy PLOT về khi chưa bán, gọi `cancel_listing`.
- Move: kiểm tra seller, chuyển `PLOTNFT` về ví, emit `PLOTDelistedEvent`.

### Su kien chinh
1. `PLOTClaimedEvent`: PLOT vua mint.  
2. `PLOTListedEvent`: PLOT len kiosk.  
3. `PLOTSoldEvent`: doi chu + ghi seller/buyer/price.  
4. `PLOTDelistedEvent`: listing bi huy.  

### FE can them
- Tab marketplace/kiosk hiện listing: fetch event hoặc dynamic field `ListingKey`.
- Mỗi PLOT: show price, owner, buy button (`buy_PLOT`); nếu là owner thì có nút `withdraw_proceeds` và `cancel_listing`.
- Hiển số dư pending cho owner để rút (có thể query `SellerPayoutKey`).

### Kiem tra & trien khai
- Chạy `sui move build` + `sui move test` sau khi chỉnh `voidia_world.move`.
- Publish package và cập nhật `VITE_PACKAGE_ID` trong env.
- Cập nhật FE gọi các entry mới trong `EditorGame.tsx` hoặc page marketplace riêng.


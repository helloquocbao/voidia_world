# Blueprint: Game Web Realtime (1 map ~100 người cùng đánh Boss) + Blockchain + DB + Walrus

> Mục tiêu: Realtime mượt (off-chain), chống gian lận hợp lý, lưu kết quả dài hạn trong DB, và đồng bộ (backup/audit) dữ liệu kết quả lên Walrus.

---

## 1) Nguyên tắc cốt lõi

- **Realtime (move/attack/cast/hit) chạy OFF-CHAIN** bằng **server authoritative** + WebSocket.
- **On-chain** chỉ dùng cho:
  - **Ownership** (NFT/Item/skin)
  - **Claim reward / mint**
  - (Tuỳ) **Anchor** bằng chứng kết quả (hash/merkle root) để công khai/audit.
- **Database** dùng để:
  - Lưu **kết quả và dữ liệu dài hạn** (match/boss run, contribution, claim status…)
  - Query nhanh (leaderboard, lịch sử)
  - Chống double-claim, analytics, admin tools
- **Walrus** dùng để:
  - Lưu **blob**: match summary, event log (nén), snapshot leaderboard… (bất biến, content-addressable)
  - Không thay DB (khó query), chỉ là kho lưu/đối chiếu/backup.

---

## 2) Kiến trúc đề xuất (tối thiểu đến scale)

### 2.1 Thành phần
- **Gateway** (WebSocket): Auth, ping/pong, route người chơi vào instance/room.
- **Game Server (Instance/Room)**: giữ state trong RAM, chạy tick loop, authoritative.
- **Matchmaker**: xếp người vào instance map (mỗi instance ~100 người).
- **DB** (Postgres/MySQL): persistent data.
- **Redis** (khuyến nghị): session/presence/rate limit/pubsub (khi nhiều server).
- **Walrus**: lưu blob (summary/log).
- (Tuỳ) **Indexer**: mirror inventory on-chain → DB/cache.

### 2.2 Luồng tổng quát
1. Player login bằng ví → sign message → server cấp session (JWT).
2. Player join map instance (<=100).
3. Realtime chạy off-chain (WS).
4. Kết thúc boss run → ghi DB → tạo summary/log → upload Walrus → lưu blobId + hash → (tuỳ) anchor on-chain.
5. Player claim reward on-chain dựa vào proof (signature/merkle).

---

## 3) Đồng bộ realtime cho 100 người

### 3.1 Bắt buộc có
- **Server authoritative**: client chỉ gửi **input/intent**.
- **AOI (Area of Interest)**: không gửi update của cả 100 người cho tất cả.
  - Chia map theo **grid** (cell).
  - Mỗi player subscribe các cell lân cận (ví dụ 3x3 cell).
  - **Boss zone**: ai trong boss zone mới nhận full boss updates.
- **Delta compression**: chỉ gửi phần thay đổi.
- **Binary protocol**: MessagePack/Protobuf (tránh JSON khi đông).

### 3.2 Tick rate thực dụng
- **Movement snapshots**: 10–20 Hz
- **Boss AI/skills**: 10–20 Hz
- **Events quan trọng** (cast start/end, phase change, death, reward ready): gửi ngay khi xảy ra

### 3.3 Client smoothing
- **Interpolation**: render trễ ~80–120ms để nội suy mượt.
- **Prediction**: chỉ cho **di chuyển**.
- **Reconciliation**: khi server trả state thật, client kéo mượt về đúng.
- Damage/HP: **server chốt**, client chỉ render cảm giác.

---

## 4) Thiết kế dữ liệu Boss fight (giảm băng thông)

### 4.1 Core state server gửi (bắt buộc)
- Boss: `hp`, `maxHp`, `phase`, `enrageTimer`
- Cast: `skillId`, `castStartAt`, `castEndAt`
- AOE zones: `[ {shape, pos, radius/points, startAt, endAt} ]`
- Event hit: `playerHit`, `damage`, `debuff`, `knockback`...

### 4.2 Cosmetic client tự render (khuyến nghị)
- Particle, animation phụ, projectile trang trí...
- Tránh sync từng viên đạn/particle.

---

## 5) Blockchain integration (mẫu chuẩn cho realtime)

### 5.1 Pattern: Off-chain loop + On-chain settlement (Claim)
- Realtime: server authoritative (off-chain).
- Khi boss chết:
  - Server chốt **contribution** mỗi player (damage/heal/support).
  - Tạo **Reward Receipt** (vé claim) hoặc **Merkle proof**.

### 5.2 2 cách phổ biến để claim
#### A) Server Signature (đơn giản, MVP tốt)
- Server tạo:
  - `payload = { matchId, playerAddress, reward, nonce, expiry, walrusBlobId, summaryHash }`
  - `sig = Sign(payloadHash, serverPrivateKey)`
- Player gửi tx claim kèm `payload + sig`.
- Smart contract verify bằng `serverPublicKey`.
- Ưu: dễ implement.
- Nhược: trust server ở bước tính reward (chấp nhận được cho MVP).

#### B) Merkle Proof (xịn hơn, làm sau)
- Server tạo list rewards → build Merkle tree → `merkleRoot`.
- Upload log/summary lên Walrus (có hash), lưu `merkleRoot`.
- On-chain lưu `merkleRoot` (anchor).
- Player claim bằng `proof` + `leaf`.
- Ưu: audit dễ hơn, giảm trust.
- Nhược: phức tạp hơn.

---

## 6) DB dùng để lưu gì?

> Nguyên tắc: **Không dùng DB để sync trạng thái mỗi frame**. State realtime nằm trong RAM.

### 6.1 Bảng tối thiểu
- `matches`  
  - `match_id`, `boss_id`, `instance_id`, `started_at`, `ended_at`, `status`
  - `merkle_root` (tuỳ), `summary_hash`, `walrus_blob_id`
- `contributions`  
  - `match_id`, `player_address`, `damage`, `heal`, `deaths`, `score`
- `rewards`  
  - `match_id`, `player_address`, `reward_json`, `nonce`, `expiry`, `signature` (nếu dùng signature)
- `claims`  
  - `match_id`, `player_address`, `status` (pending/claimed/failed), `tx_digest`, `claimed_at`

### 6.2 Redis (khuyến nghị)
- Session/presence
- Rate limiting input
- PubSub (nếu nhiều server)

---

## 7) Đồng bộ DB → Walrus (kết quả + audit)

### 7.1 Bạn nên upload gì?
- `match_summary.json` (canonical)
- `events.ndjson.gz` (event log theo dòng, nén)
- (tuỳ) `leaderboard_snapshot.json` theo ngày/tuần

### 7.2 Flow đề xuất
1. Boss run kết thúc → ghi DB (transaction).
2. Tạo file canonical:
   - **Summary**: info boss run + participants + contribution + reward mapping.
   - **Log**: events (nén).
3. Tính:
   - `summaryHash = sha256(summary)`
   - (tuỳ) `logHash = sha256(log)`
4. (Nếu dùng signature) server ký `summaryHash` hoặc payload.
5. Upload blob lên Walrus → nhận `walrusBlobId`.
6. Lưu vào DB: `match_id -> walrus_blob_id, summary_hash, signature/merkle_root`.
7. (Tuỳ) anchor on-chain: lưu `matchId + walrusBlobId + summaryHash/merkleRoot`.

> Nếu dữ liệu nhạy cảm: **mã hoá trước khi upload** (Walrus là blob storage, không phải DB query).

---

## 8) Message schema realtime (gợi ý)

### Client → Server
- `join_room(roomId)`
- `input_move(seq, dir, timestamp)`
- `input_cast(seq, skillId, aim?, timestamp)`

### Server → Client
- `snapshot(tick, entitiesDelta[], bossCoreState, aoeZonesDelta[])`
- `event(type, payload)`  
  - `boss_cast_started`, `boss_phase_changed`, `player_hit`, `boss_dead`, `reward_ready`

Gợi ý tối ưu:
- Position dùng **int** (fixed-point) thay vì float.
- Chỉ gửi entity trong AOI.
- Delta: gửi `changedFieldsMask`.

---

## 9) “Signature là gì?” (giải thích ngắn gọn)

- Server có **private key** (bí mật) + **public key** (công khai).
- Server ký `hash` của summary/payload → ra **signature**.
- Bất kỳ ai có public key đều verify:
  - Dữ liệu bị sửa → verify fail
  - Không phải server ký → verify fail
- Dùng để chống player tự tạo “kết quả giả” để claim.

---

## 10) Roadmap MVP (giảm rủi ro)

1) 1 instance map 20 người → movement + boss HP + 2 skill AOE  
2) Contribution + reward ready (off-chain)  
3) Claim on-chain bằng signature  
4) Nâng lên 50 → 100 người: AOI + delta + binary protocol  
5) Bổ sung Walrus sync + (tuỳ) anchor on-chain + (tuỳ) merkle proof

---

## 11) Checklist kỹ thuật cho 100 người

- [ ] AOI grid/quadtree
- [ ] Snapshot 10–20Hz + interpolation buffer
- [ ] Delta + MessagePack/Protobuf
- [ ] Server authoritative + validate speed/cooldown
- [ ] Boss core state + event-driven
- [ ] DB transaction khi kết thúc match
- [ ] Receipt/claim chống double-claim
- [ ] Upload Walrus (nén + hash) + lưu blobId vào DB

---

## 12) Next steps (bạn có thể tiếp tục trong VSCode)
- Implement instance/room tick loop (fixed timestep).
- Implement AOI grid subscribe/unsubscribe.
- Define protobuf/messages + delta encoding.
- Implement match finalize:
  - compute contributions
  - write DB
  - generate summary/log
  - upload Walrus
  - generate signature payload
- Implement on-chain claim verify signature (Move contract).

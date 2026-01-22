# Lu?ng choi v?i Seal và claim reward

Mô t? l?i flow trong `chunk_world.move` sau khi dùng Seal (luu `policy_id` thay vì hash key).

## D? li?u luu trong on-chain
- `PlayTicket`: `player`, `policy_id` (BCS encode `play_id`), `min_reward`, `max_reward`.
- `PlayCreatedEvent`: theo dõi `play_id` + reward bounds.
- `RewardClaimedEvent`: ghi nh?n reward th?t + c?p nh?t power/potential.

## play_v1 / play_v2
- Ki?m tra power và gi?i h?n lu?t/epoch.
- `play_id = world.next_play_id`, tang `next_play_id`.
- `policy_id = bcs::to_bytes(&play_id)` (dùng làm identity cho Seal SDK).
- Luu `PlayTicket { player, policy_id, min_reward, max_reward }` và emit `PlayCreatedEvent`.
- Không c?n truy?n/ki?m tra hash key.

## seal_approve(id, play_id, world, ctx)
- `id` là `policy_id` (vector<u8>), ph?i là tham s? d?u tiên (yêu c?u Seal SDK).
- Abort n?u `PlayTicket` không t?n t?i, `policy_id` không kh?p, ho?c sender khác `player`.
- Ðu?c key server g?i qua `dry_run_transaction_block` d? ch?ng minh tru?c khi c?p chia/seal.

## claim_reward(world, vault, character, randomness, play_id, ctx)
- Ch? c?n `play_id` (dã du?c ch?ng th?c qua `seal_approve`).
- Ki?m tra `PlayTicket` t?n t?i, l?y `player` và reward bounds.
- Random reward trong `[min_reward, max_reward]`, unreserve coin, chuy?n cho `player` (sender ph?i là player).
- Tang power/potential và emit `RewardClaimedEvent`, `CharacterUpdatedEvent`.

## Cách g?i v?i Seal SDK (client)
1. Sau khi nh?n `play_id` t? `PlayCreatedEvent`, t?o `policyId = bcs::to_bytes(play_id)`.
2. Seal SDK encrypt/decrypt b?ng `policyId` làm identity.
3. Khi decrypt xong, build tx `seal_approve`:
   - Target: `<package_id>::world::seal_approve`
   - Args: `policyId` (vector<u8>), `play_id` (u64), `world_id` (object)
4. Key server dry-run tx; n?u không abort thì c?p key/secret.
5. Sau dó ngu?i choi g?i `claim_reward(play_id)` dúng ví `player`.

## Luu ý
- `policy_id` ph?i kh?p BCS(play_id); client không c?n g?i hash key n?a.
- `seal_approve` ph?i du?c g?i b?i dúng `player`; key server du?c phép tin vào k?t qu? dry-run d? quy?t d?nh chia khóa.
- `claim_reward` b?t bu?c sender = `player`; b?o m?t ph? thu?c vào quy trình Seal/`seal_approve` chu?n.
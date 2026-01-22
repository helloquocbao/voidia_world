# Chunk Adventure - Play & Claim Flow (code hi?n t?i)

## T?ng quan
- Play t?o `PlayTicket { player, policy_id=BCS(play_id), min_reward, max_reward, approved=false }`.
- Claim c?n seal_approve tru?c: sender = player, id = policy_id.
- Gi?i h?n choi theo epoch: `play_v1` free 2 l?n/ngày; `play_v2` 3 l?n/ngày.
- Reward reserve tru?c; claim tr? coin và c?ng power/potential theo d? khó world.

## Flow play
1. Ch?n nhân v?t (`power >= world.required_power`).
2. G?i:
   - `play_v1(world, vault, character)`
     - Không phí, reserve `MIN_REWARD` (2). Gi?i h?n 2 l?n/epoch.
   - `play_v2(world, vault, character, fee_coin)`
     - Tr? phí `PLAY_FEE` (5), reserve `MAX_REWARD` (15). Gi?i h?n 3 l?n/epoch.
3. Contract: reset b? d?m daily khi epoch m?i; tang `next_play_id`; t?o `policy_id = bcs::to_bytes(play_id)`; luu `PlayTicket` (approved=false); emit `PlayCreatedEvent`.

## Seal approve (b?t bu?c tru?c khi claim)
- G?i `seal_approve(id: vector<u8>, play_id, world)`:
  - `id` ph?i b?ng `policy_id` (BCS(play_id)).
  - Sender ph?i là `player` trong ticket.
  - N?u ok: set `approved = true` cho `PlayTicket`.

## Claim reward
1. FE g?i `claim_reward(play_id)` sau khi dã `seal_approve`.
2. Contract:
   - Check play t?n t?i, `approved == true`, min/max h?p l?.
   - Random reward trong `[min_reward, max_reward]`.
   - `unreserve(max_reward)` r?i `withdraw(reward)` t? vault.
   - Sender ph?i là `player` c?a ticket.
   - C?ng `power += reward * difficulty`, `potential += difficulty`.
   - Emit `RewardClaimedEvent`, `CharacterUpdatedEvent`.

## State luu local g?i ý
- `playId`, `worldId`, `policyId` (BCS(play_id)) d? g?i `seal_approve` + `claim_reward`.

## Ghi chú
- N?u b? qua `seal_approve`, claim s? l?i `E_INVALID_SEAL`.
- Không còn dùng key/hash hidden; seal_approve dóng vai trò xác nh?n tru?c claim.
module chunk_world::world {

    use std::string::{Self, String};
    use sui::bcs;

    use sui::balance::{Self, Balance};
    use sui::dynamic_field as df;
    use sui::event;
    use sui::coin::{Self, Coin};
  
    use sui::random;

 

    use chunk_world::reward_coin;
    use chunk_world::reward_coin::RewardVault;

    // NFT Display
    use sui::package;
    use sui::display;

    /* ================= CONFIG ================= */

    const CHUNK_SIZE: u64 = 5;
    const TILES_LEN: u64 = 25; // 5*5
    const MAX_URL_BYTES: u64 = 2048;

    const U32_MAX: u32 = 4294967295;
    const PLAY_FEE: u64 = 5;
    const MIN_REWARD: u64 = 2;
    const MAX_REWARD: u64 = 15;
    // const MAX_CHUNKS: u64 = 20;
    const CHUNK_PRICE_INCREMENT: u64 = 5; // mỗi chunk sau mắc hơn 5 coin
    const DAILY_PLAY_LIMIT: u64 = 3;      // giới hạn 3 lần chơi mỗi epoch (~24h) cho play_v2
    const FREE_DAILY_PLAY_LIMIT: u64 = 2; // giới hạn 2 lần chơi miễn phí mỗi epoch cho play_v1

    /* ================= ERRORS ================= */

 
    const E_INVALID_TILES_LEN: u64 = 1;
    const E_INVALID_TILE_CODE: u64 = 2;
    const E_OUT_OF_BOUNDS: u64 = 3;
    const E_URL_TOO_LONG: u64 = 4;
    const E_CHUNK_ALREADY_EXISTS: u64 = 5;
    const E_FIRST_CHUNK_MUST_BE_ORIGIN: u64 = 6;
    const E_NO_ADJACENT_CHUNK: u64 = 7;
    const E_INVALID_FEE: u64 = 8;
    const E_INVALID_REWARD_RANGE: u64 = 9;
    const E_PLAY_NOT_FOUND: u64 = 10;
    const E_INVALID_SEAL: u64 = 11;
    const E_INVALID_DIFFICULTY: u64 = 12;
    const E_CHARACTER_ALREADY_EXISTS: u64 = 13;
    const E_INSUFFICIENT_POWER: u64 = 15;
    const E_INVALID_NAME: u64 = 16;
    const E_DAILY_PLAY_LIMIT_REACHED: u64 = 18;
    const E_FREE_DAILY_LIMIT_REACHED: u64 = 19;
    const E_LISTING_ALREADY_EXISTS: u64 = 20;
    const E_LISTING_NOT_FOUND: u64 = 21;
    const E_INVALID_PRICE: u64 = 22;
    const E_NOT_LISTING_OWNER: u64 = 23;
    const E_BUYER_IS_SELLER: u64 = 24;
    const E_WORLD_MISMATCH: u64 = 25;
    const E_NO_PROCEEDS: u64 = 26;
    const E_INVALID_WITHDRAW_AMOUNT: u64 = 27;

    /* ================= ADMIN / REGISTRY ================= */

    /// Admin giữ cap này. Ai không có cap thì không tạo được world.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Registry shared để enforce: chỉ có 1 world trong package này.
    public struct WorldRegistry has key, store {
        id: UID,
        world_ids: vector<ID>, // Lưu nhiều world_id
    }

    /* ================= WORLD (SHARED) ================= */

    /// Key cho dynamic field: (cx, cy) -> chunk_id
    public struct ChunkKey has copy, drop, store {
        cx: u32,
        cy: u32,
    }

    /// Key cho dynamic field: play_id -> PlayTicket
    public struct PlayKey has copy, drop, store {
        id: u64,
    }

    public struct PlayTicket has store {
        player: address,
        policy_id: vector<u8>, // Seal identity (BCS-encoded play_id)
        min_reward: u64,
        max_reward: u64,
        approved: bool,       // true sau khi seal_approve
    }

    public struct WorldMap has key, store {
        id: UID,
        name: String,          // tên thế giới
        chunk_count: u64,
        next_play_id: u64,
        admin: address,
        difficulty: u8,        // 1-9
        required_power: u64,   // sức mạnh yêu cầu để tham gia
        chunks: vector<ChunkKey>,
    }

    /* ================= CHUNK NFT (OWNED) ================= */

    /// Mỗi chunk = 1 NFT owned. Owner mới edit được.
    public struct ChunkNFT has key, store {
        id: UID,
        world_id: ID,
        cx: u32,
        cy: u32,
        image_url: String,
        tiles: vector<u8>,       // base layer: length=25, idx = y*5 + x
        decorations: vector<u8>, // decor layer: length=25, 0 = none
    }

    /// Key to store chunk listings: chunk_id -> ChunkListing
    public struct ListingKey has copy, drop, store {
        chunk_id: ID,
    }

    /// Chunk listing object stores NFT + sale price
    public struct ChunkListing has key, store {
        id: UID,
        chunk: ChunkNFT,
        seller: address,
        price: u64,
    }

    public struct SellerPayoutKey has copy, drop, store {
        owner: address,
    }

    public struct SellerPayout has key, store {
        id: UID,
        owner: address,
        balance: Balance<reward_coin::REWARD_COIN>,
    }

    /* ================= CHARACTER NFT (SOULBOUND) ================= */

    /// Key cho dynamic field: owner_address -> character_id
    public struct CharacterKey has copy, drop, store {
        owner: address,
    }

    /// Mỗi ví chỉ có 1 NFT nhân vật (soulbound - không giao dịch được)
    public struct CharacterNFT has key {
        id: UID,
        owner: address,
        name: String,
        health: u64,          // máu hiện tại
        power: u64,           // sức mạnh tích lũy
        potential: u64,       // tiềm năng tích lũy
        last_play_epoch: u64,      // epoch cuối cùng chơi (v2)
        daily_plays: u64,          // số lần chơi trong epoch hiện tại (v2)
        last_free_play_epoch: u64, // epoch cuối cùng chơi miễn phí (v1)
        free_daily_plays: u64,     // số lần chơi miễn phí trong epoch (v1)
    }

    /* ================= EVENTS ================= */

    public struct RegistryCreatedEvent has copy, drop {
        registry_id: ID,
        admin: address,
        admin_cap_id: ID,
    }

    public struct WorldCreatedEvent has copy, drop {
        world_id: ID,
        name: String,
        admin: address,
    }

    public struct ChunkClaimedEvent has copy, drop {
        world_id: ID,
        chunk_id: ID,
        cx: u32,
        cy: u32,
        owner: address,
    }

    public struct ChunkListedEvent has copy, drop {
        world_id: ID,
        chunk_id: ID,
        seller: address,
        price: u64,
    }

    public struct ChunkSoldEvent has copy, drop {
        world_id: ID,
        chunk_id: ID,
        seller: address,
        buyer: address,
        price: u64,
    }

    public struct ChunkDelistedEvent has copy, drop {
        world_id: ID,
        chunk_id: ID,
        seller: address,
    }

    public struct ChunkTileUpdatedEvent has copy, drop {
        chunk_id: ID,
        x: u8,
        y: u8,
        tile: u8,
    }

    public struct ChunkImageUpdatedEvent has copy, drop {
        chunk_id: ID,
    }

    public struct PlayCreatedEvent has copy, drop {
        world_id: ID,
        play_id: u64,
        min_reward: u64,
        max_reward: u64,
        creator: address,
    }

    public struct RewardClaimedEvent has copy, drop {
        world_id: ID,
        play_id: u64,
        reward: u64,
        power_gained: u64,
        potential_gained: u64,
        recipient: address,
    }

    public struct CharacterCreatedEvent has copy, drop {
        character_id: ID,
        owner: address,
        name: String,
    }

    public struct CharacterUpdatedEvent has copy, drop {
        character_id: ID,
        power: u64,
        potential: u64,
    }

    /* ================= DISPLAY INIT (làm đẹp NFT) ================= */

    /// One-Time Witness cho init()
    public struct WORLD has drop {}

    /// init chạy khi publish package:
    /// - set Display cho ChunkNFT
    /// - tạo WorldRegistry (shared)
    /// - tạo AdminCap cho deployer
    fun init(otw: WORLD, ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);

        // 1) Display template cho ChunkNFT (wallet/explorer sẽ đọc các field này)
        let publisher = package::claim(otw, ctx);

        let keys = vector[
            string::utf8(b"name"),
            string::utf8(b"description"),
            string::utf8(b"image_url"),
            string::utf8(b"thumbnail_url"),
            string::utf8(b"link"),
            string::utf8(b"project_url"),
            string::utf8(b"creator"),
        ];

        // Bạn đổi domain theo project của bạn
        let values = vector[
            string::utf8(b"Chunk ({cx},{cy})"),
            string::utf8(b"Chunk in World {world_id}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"https://your-game.com/chunk/{id}"),
            string::utf8(b"https://your-game.com"),
            string::utf8(b"Chunk World"),
        ];

        let mut disp = display::new_with_fields<ChunkNFT>(&publisher, keys, values, ctx);
        display::update_version(&mut disp);

        transfer::public_transfer(publisher, admin);
        transfer::public_transfer(disp, admin);

        // 2) Registry shared (hỗ trợ nhiều world)
        let registry = WorldRegistry {
            id: object::new(ctx),
            world_ids: vector[],
        };
        let registry_id = object::uid_to_inner(&registry.id);
        transfer::share_object(registry);

        // 3) AdminCap cho deployer
        let cap = AdminCap { id: object::new(ctx) };
        let cap_id = object::uid_to_inner(&cap.id);
        transfer::public_transfer(cap, admin);

        event::emit(RegistryCreatedEvent { registry_id, admin, admin_cap_id: cap_id });
    }

    /* ================= ADMIN: CREATE WORLD ================= */

    /// Admin tạo world (shared). Chỉ tạo 1 lần.
    /// difficulty: 1-9 (1 = easy, 9 = hardest)
    /// required_power: sức mạnh yêu cầu để tham gia world này
     entry fun create_world(
        registry: &mut WorldRegistry,
        _cap: &AdminCap,
        name: String,
        difficulty: u8,
        required_power: u64,
        ctx: &mut TxContext
    ) {
        assert!(difficulty >= 1 && difficulty <= 9, E_INVALID_DIFFICULTY);
        // Kiểm tra tên hợp lệ (1-64 bytes)
        let name_len = string::length(&name);
        assert!(name_len >= 1 && name_len <= 64, E_INVALID_NAME);

        let admin = tx_context::sender(ctx);
        let world = WorldMap {
            id: object::new(ctx),
            name,
            chunk_count: 0,
            next_play_id: 0,
            admin,
            difficulty,
            required_power,
            chunks: vector[],
        };

        let world_id = object::uid_to_inner(&world.id);
        vector::push_back(&mut registry.world_ids, world_id);

        transfer::share_object(world);

        event::emit(WorldCreatedEvent { world_id, name, admin });
    }
    /// Lấy danh sách world_id
    public fun get_world_ids(registry: &WorldRegistry): &vector<ID> {
        &registry.world_ids
    }

    /* ================= USER: CREATE CHARACTER ================= */

    /// Mỗi ví chỉ tạo được 1 character (soulbound NFT)
     entry fun create_character(
        registry: &mut WorldRegistry,
        name: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Kiểm tra tên hợp lệ (1-32 bytes)
        let name_len = string::length(&name);
        assert!(name_len >= 1 && name_len <= 32, E_INVALID_NAME);
        
        // Kiểm tra chưa có character (dùng dynamic field trên registry)
        assert!(!df::exists_(&registry.id, CharacterKey { owner: sender }), E_CHARACTER_ALREADY_EXISTS);

        let character = CharacterNFT {
            id: object::new(ctx),
            owner: sender,
            name,
            health: 100,
            power: 0,
            potential: 0,
            last_play_epoch: 0,
            daily_plays: 0,
            last_free_play_epoch: 0,
            free_daily_plays: 0,
        };

        let character_id = object::uid_to_inner(&character.id);

        // Lưu character_id vào registry để track
        df::add(&mut registry.id, CharacterKey { owner: sender }, character_id);

        event::emit(CharacterCreatedEvent { character_id, owner: sender, name: character.name });

        // Transfer cho owner (soulbound vì không có store ability)
        transfer::transfer(character, sender);
    }

    /// Kiểm tra xem ví có character chưa
    public fun has_character(registry: &WorldRegistry, owner: address): bool {
        df::exists_(&registry.id, CharacterKey { owner })
    }

    /// Lấy character ID của một ví (nếu có)
    public fun get_character_id(registry: &WorldRegistry, owner: address): Option<ID> {
        if (df::exists_(&registry.id, CharacterKey { owner })) {
            option::some(*df::borrow(&registry.id, CharacterKey { owner }))
        } else {
            option::none()
        }
    }

    /* ================= USER: CLAIM / MINT CHUNK NFT ================= */

    /// User claim chunk NFT. Coordinates are chosen randomly among adjacent slots.
    /// Rule:
    /// - Chunk đầu tiên của world bắt buộc (0,0) và miễn phí
    /// - Chunk sau phải kề 1 chunk đã tồn tại (4 hướng)
    /// - Giá chunk = chunk_count * 5 (chunk 1 = 0, chunk 2 = 5, chunk 3 = 10, ...)
    entry fun claim_chunk(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        randomness: &random::Random,
        image_url: String,
        tiles: vector<u8>,
        decorations: vector<u8>,
        mut payment: Coin<reward_coin::REWARD_COIN>,
        ctx: &mut TxContext
    ) {
        // assert!(world.chunk_count < MAX_CHUNKS, E_MAX_CHUNKS_REACHED);
        
        // Tính giá chunk: chunk đầu = 0, chunk sau mắc hơn 5 coin, từ chunk 20 trở đi giá giữ nguyên
        let chunk_price = if (world.chunk_count < 20) {
            world.chunk_count * CHUNK_PRICE_INCREMENT
        } else {
            20 * CHUNK_PRICE_INCREMENT
        };
        let payment_value = coin::value(&payment);
        assert!(payment_value >= chunk_price, E_INVALID_FEE);
        
        // Xử lý thanh toán
        let sender = tx_context::sender(ctx);
        if (chunk_price > 0) {
            if (payment_value > chunk_price) {
                let pay_coin = coin::split(&mut payment, chunk_price, ctx);
                reward_coin::deposit(vault, pay_coin);
                transfer::public_transfer(payment, sender);
            } else {
                reward_coin::deposit(vault, payment);
            };
        } else {
            // Chunk đầu tiên miễn phí, trả lại coin
            transfer::public_transfer(payment, sender);
        };
        
        assert!(string::length(&image_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);

        let (cx, cy) = if (world.chunk_count == 0) {
            (0, 0)
        } else {
            let mut generator = random::new_generator(randomness, ctx);
            pick_random_adjacent(world, &mut generator)
        };
        assert!(
            !df::exists_(&world.id, ChunkKey { cx, cy }),
            E_CHUNK_ALREADY_EXISTS
        );

        if (world.chunk_count == 0) {
            assert!(cx == 0 && cy == 0, E_FIRST_CHUNK_MUST_BE_ORIGIN);
        } else {
            assert!(has_adjacent(world, cx, cy), E_NO_ADJACENT_CHUNK);
        };

        let world_id = object::uid_to_inner(&world.id);

        let chunk = ChunkNFT {
            id: object::new(ctx),
            world_id,
            cx,
            cy,
            image_url,
            tiles,
            decorations,
        };

        let chunk_id = object::uid_to_inner(&chunk.id);

        // index (cx,cy) -> chunk_id
        df::add(&mut world.id, ChunkKey { cx, cy }, chunk_id);
        world.chunk_count = world.chunk_count + 1;
        vector::push_back(&mut world.chunks, ChunkKey { cx, cy });

        event::emit(ChunkClaimedEvent { world_id, chunk_id, cx, cy, owner: sender });

        transfer::public_transfer(chunk, sender);
    }

    /// List owned chunk on market
    entry fun list_chunk(
        world: &mut WorldMap,
        chunk: ChunkNFT,
        price: u64,
        ctx: &mut TxContext
    ) {
        assert!(price > 0, E_INVALID_PRICE);
        let world_id = object::uid_to_inner(&world.id);
        assert!(chunk.world_id == world_id, E_WORLD_MISMATCH);
        let chunk_id = object::uid_to_inner(&chunk.id);
        assert!(
            !df::exists_(&world.id, ListingKey { chunk_id }),
            E_LISTING_ALREADY_EXISTS
        );
        let seller = tx_context::sender(ctx);

        let listing = ChunkListing {
            id: object::new(ctx),
            chunk,
            seller,
            price,
        };

        df::add(&mut world.id, ListingKey { chunk_id }, listing);
        event::emit(ChunkListedEvent {
            world_id,
            chunk_id,
            seller,
            price,
        });
    }

    fun deposit_listing_proceeds(
        world: &mut WorldMap,
        owner: address,
        amount: Balance<reward_coin::REWARD_COIN>,
        ctx: &mut TxContext
    ) {
        let key = SellerPayoutKey { owner };
        if (df::exists_(&world.id, key)) {
            let payout: &mut SellerPayout = df::borrow_mut(&mut world.id, key);
            balance::join(&mut payout.balance, amount);
        } else {
            let payout = SellerPayout {
                id: object::new(ctx),
                owner,
                balance: amount,
            };
            df::add(&mut world.id, key, payout);
        }
    }

    /// Buy listed chunk (pays seller in reward coin)
    entry fun buy_chunk(
        world: &mut WorldMap,
        chunk_id: ID,
        mut payment: Coin<reward_coin::REWARD_COIN>,
        ctx: &mut TxContext
    ) {
        assert!(
            df::exists_(&world.id, ListingKey { chunk_id }),
            E_LISTING_NOT_FOUND
        );
        let ChunkListing {
            id: listing_id,
            chunk,
            seller,
            price,
        } = df::remove(&mut world.id, ListingKey { chunk_id });
        object::delete(listing_id);
        let buyer = tx_context::sender(ctx);
        assert!(buyer != seller, E_BUYER_IS_SELLER);
        let payment_value = coin::value(&payment);
        assert!(payment_value >= price, E_INVALID_FEE);

        let payout = coin::split(&mut payment, price, ctx);
        let payout_balance = coin::into_balance(payout);
        deposit_listing_proceeds(world, seller, payout_balance, ctx);
        transfer::public_transfer(payment, buyer);
        transfer::public_transfer(chunk, buyer);
        event::emit(ChunkSoldEvent {
            world_id: object::uid_to_inner(&world.id),
            chunk_id,
            seller,
            buyer,
            price,
        });
    }

    /// Cancel listing and return chunk to seller
    entry fun cancel_listing(
        world: &mut WorldMap,
        chunk_id: ID,
        ctx: & TxContext
    ) {
        let ChunkListing {
            id: listing_id,
            chunk,
            seller,
            ..
        } = df::remove(&mut world.id, ListingKey { chunk_id });
        assert!(seller == tx_context::sender(ctx), E_NOT_LISTING_OWNER);

        object::delete(listing_id);
        transfer::public_transfer(chunk, seller);
        event::emit(ChunkDelistedEvent {
            world_id: object::uid_to_inner(&world.id),
            chunk_id,
            seller,
        });
    }

    /// Withdraw pending proceeds accrued from chunk sales
    entry fun withdraw_proceeds(
        world: &mut WorldMap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, E_INVALID_WITHDRAW_AMOUNT);
        let owner = tx_context::sender(ctx);
        let key = SellerPayoutKey { owner };
        assert!(df::exists_(&world.id, key), E_NO_PROCEEDS);
        let payout: &mut SellerPayout = df::borrow_mut(&mut world.id, key);
        let available = balance::value(&payout.balance);
        assert!(available >= amount, E_INVALID_WITHDRAW_AMOUNT);
        let coin = coin::take(&mut payout.balance, amount, ctx);
        transfer::public_transfer(coin, owner);
    }

    public fun is_chunk_listed(world: &WorldMap, chunk_id: ID): bool {
        df::exists_(&world.id, ListingKey { chunk_id })
    }

    /* ================= GAME: PLAY / REWARD ================= */

    /// Play miễn phí - không cần trả coin
    /// Giới hạn 2 lần chơi mỗi epoch (~24h)
    /// Reward nhỏ hơn play_v2
     entry fun play_v1(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        character: &mut CharacterNFT,
        ctx: & TxContext
    ) {
        
        // Kiểm tra character có đủ power để chơi world này
        assert!(character.power >= world.required_power, E_INSUFFICIENT_POWER);
        
        // Kiểm tra giới hạn chơi miễn phí hàng ngày (theo epoch)
        let current_epoch = tx_context::epoch(ctx);
        if (character.last_free_play_epoch != current_epoch) {
            // Epoch mới, reset số lần chơi
            character.last_free_play_epoch = current_epoch;
            character.free_daily_plays = 0;
        };
        assert!(character.free_daily_plays < FREE_DAILY_PLAY_LIMIT, E_FREE_DAILY_LIMIT_REACHED);
        
        // Tăng số lần chơi miễn phí
        character.free_daily_plays = character.free_daily_plays + 1;

        // Reserve reward cho play miễn phí (dùng min reward)
        reward_coin::reserve(vault, MIN_REWARD);

        let play_id = world.next_play_id;
        world.next_play_id = play_id + 1;
        let policy_id = bcs::to_bytes(&play_id); // Seal identity = BCS(play_id)
        let sender = tx_context::sender(ctx);
        df::add(
            &mut world.id,
            PlayKey { id: play_id },
            PlayTicket {
                player: sender,
                policy_id,
                min_reward: MIN_REWARD,
                max_reward: MIN_REWARD,
                approved: false
            } // reward cố định = MIN_REWARD
        );

        let world_id = object::uid_to_inner(&world.id);
        event::emit(PlayCreatedEvent { world_id, play_id, min_reward: MIN_REWARD, max_reward: MIN_REWARD, creator: sender });
    }

    /// Yêu cầu character có đủ power để tham gia world
    /// Giới hạn 3 lần chơi mỗi epoch (~24h)
     entry fun play_v2(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        character: &mut CharacterNFT,
        mut fee_coin: Coin<reward_coin::REWARD_COIN>,
        ctx: &mut TxContext
    ) {
        assert!(MAX_REWARD >= MIN_REWARD && MIN_REWARD > 0, E_INVALID_REWARD_RANGE);
        
        // Kiểm tra character có đủ power để chơi world này
        assert!(character.power >= world.required_power, E_INSUFFICIENT_POWER);
        
        // Kiểm tra giới hạn chơi hàng ngày (theo epoch)
        let current_epoch = tx_context::epoch(ctx);
        if (character.last_play_epoch != current_epoch) {
            // Epoch mới, reset số lần chơi
            character.last_play_epoch = current_epoch;
            character.daily_plays = 0;
        };
        assert!(character.daily_plays < DAILY_PLAY_LIMIT, E_DAILY_PLAY_LIMIT_REACHED);
        
        // Tăng số lần chơi
        character.daily_plays = character.daily_plays + 1;

        let fee_value = coin::value(&fee_coin);
        assert!(fee_value >= PLAY_FEE, E_INVALID_FEE);

        let sender = tx_context::sender(ctx);
        if (fee_value > PLAY_FEE) {
            let pay_coin = coin::split(&mut fee_coin, PLAY_FEE, ctx);
            reward_coin::deposit(vault, pay_coin);
            transfer::public_transfer(fee_coin, sender);
        } else {
            reward_coin::deposit(vault, fee_coin);
        };

        reward_coin::reserve(vault, MAX_REWARD);

        let play_id = world.next_play_id;
        world.next_play_id = play_id + 1;
        let policy_id = bcs::to_bytes(&play_id); // Seal identity = BCS(play_id)
        df::add(
            &mut world.id,
            PlayKey { id: play_id },
            PlayTicket {
                player: sender,
                policy_id,
                min_reward: MIN_REWARD,
                max_reward: MAX_REWARD,
                approved: false
            }
        );

        let world_id = object::uid_to_inner(&world.id);
        event::emit(PlayCreatedEvent { world_id, play_id, min_reward: MIN_REWARD, max_reward: MAX_REWARD, creator: sender });
    }

    /// Claim reward và cộng power/potential vào character
    entry fun claim_reward(
       world: &mut WorldMap,
       vault: &mut RewardVault,
       character: &mut CharacterNFT,
       randomness: &random::Random,
        play_id: u64,
        ctx: &mut TxContext
    ) {
        assert!(df::exists_(&world.id, PlayKey { id: play_id }), E_PLAY_NOT_FOUND);

        let PlayTicket { player, policy_id: _, min_reward, max_reward, approved } =
            df::remove(&mut world.id, PlayKey { id: play_id });
        assert!(max_reward >= min_reward && min_reward > 0, E_INVALID_REWARD_RANGE);
        assert!(approved, E_INVALID_SEAL);

        let mut rng = random::new_generator(randomness, ctx);
        let reward = random::generate_u64_in_range(&mut rng, min_reward, max_reward);

        reward_coin::unreserve(vault, max_reward);
        let coin = reward_coin::withdraw(vault, reward, ctx);

        let recipient = tx_context::sender(ctx);
        assert!(recipient == player, E_INVALID_SEAL);
        transfer::public_transfer(coin, recipient);

        // Cộng power và potential vào character dựa trên difficulty
        let difficulty = world.difficulty as u64;
        let power_gained = reward * difficulty;           // reward * độ khó
        let potential_gained = difficulty;                // +1 potential mỗi độ khó
        
        character.power = character.power + power_gained;
        character.potential = character.potential + potential_gained;

        let world_id = object::uid_to_inner(&world.id);
        event::emit(RewardClaimedEvent { 
            world_id, 
            play_id, 
            reward, 
            power_gained,
            potential_gained,
            recipient 
        });

        event::emit(CharacterUpdatedEvent {
            character_id: object::uid_to_inner(&character.id),
            power: character.power,
            potential: character.potential,
        });
    }

    /// Seal approval cho key server: identity bytes phải là BCS(play_id).
    /// Gọi ở chế độ dry_run; abort nếu play_id không tồn tại hoặc sender không phải player.
    entry fun seal_approve(
        id: vector<u8>,          // first arg MUST be vector<u8> (Seal SDK)
        play_id: u64,            // explicit play id to avoid from_bytes
        world: &mut WorldMap,
        ctx: &TxContext
    ) {
        assert!(df::exists_(&world.id, PlayKey { id: play_id }), E_PLAY_NOT_FOUND);
        let ticket: &mut PlayTicket = df::borrow_mut(&mut world.id, PlayKey { id: play_id });
        assert!(ticket.policy_id == id, E_INVALID_SEAL);
        let sender = tx_context::sender(ctx);
        assert!(ticket.player == sender, E_INVALID_SEAL);
        ticket.approved = true;
    }

    /* ================= OWNER: EDIT CHUNK ================= */

     entry fun set_tile(chunk: &mut ChunkNFT, x: u8, y: u8, tile: u8) {
        assert!(x < 5u8 && y < 5u8, E_OUT_OF_BOUNDS);
        assert!(is_valid_tile(tile), E_INVALID_TILE_CODE);

        let idx = (y as u64) * CHUNK_SIZE + (x as u64);
        *vector::borrow_mut(&mut chunk.tiles, idx) = tile;

        event::emit(ChunkTileUpdatedEvent {
            chunk_id: object::uid_to_inner(&chunk.id),
            x, y, tile
        });
    }

    /// Batch save 25 tiles (khuyên dùng để giảm tx)
     entry fun set_tiles(chunk: &mut ChunkNFT, tiles: vector<u8>) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        chunk.tiles = tiles;
    }

    /// Batch save 25 decorations
     entry fun set_decorations(chunk: &mut ChunkNFT, decorations: vector<u8>) {
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_decorations_valid(&decorations);
        chunk.decorations = decorations;
    }

    /// Batch save both tiles and decorations
     entry fun set_tiles_and_decorations(chunk: &mut ChunkNFT, tiles: vector<u8>, decorations: vector<u8>) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);
        chunk.tiles = tiles;
        chunk.decorations = decorations;
    }

    /// Update tiles, decorations, and image URL together (one tx)
     entry fun update_chunk(
        chunk: &mut ChunkNFT,
        tiles: vector<u8>,
        decorations: vector<u8>,
        new_url: String,
    ) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);
        assert!(string::length(&new_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);

        chunk.tiles = tiles;
        chunk.decorations = decorations;
        chunk.image_url = new_url;

        event::emit(ChunkImageUpdatedEvent { chunk_id: object::uid_to_inner(&chunk.id) });
    }

     entry fun set_image_url(chunk: &mut ChunkNFT, new_url: String) {
        assert!(string::length(&new_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);
        chunk.image_url = new_url;

        event::emit(ChunkImageUpdatedEvent { chunk_id: object::uid_to_inner(&chunk.id) });
    }

    /* ================= READ HELPERS (optional) ================= */

    public fun get_chunk_id(world: &WorldMap, cx: u32, cy: u32): Option<ID> {
        let key = ChunkKey { cx, cy };
        if (!df::exists_(&world.id, key)) {
            option::none<ID>()
        } else {
            option::some<ID>(*df::borrow(&world.id, key))
        }
    }

    /* ================= INTERNAL HELPERS ================= */

    fun pick_random_adjacent(
        world: &WorldMap,
        rng: &mut random::RandomGenerator
    ): (u32, u32) {
        let mut candidates = vector[];
        let total = vector::length(&world.chunks);
        let mut i = 0;
        while (i < total) {
            let chunk = *vector::borrow(&world.chunks, i);
            let cx = chunk.cx;
            let cy = chunk.cy;

            // left
            if (cx > 0) {
                let nx = cx - 1;
                if (!df::exists_(&world.id, ChunkKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, ChunkKey { cx: nx, cy });
                };
            };
            // right (avoid overflow)
            if (cx < U32_MAX) {
                let nx = cx + 1;
                if (!df::exists_(&world.id, ChunkKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, ChunkKey { cx: nx, cy });
                };
            };

            // top
            if (cy > 0) {
                let ny = cy - 1;
                if (!df::exists_(&world.id, ChunkKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, ChunkKey { cx, cy: ny });
                };
            };
            // bottom (avoid overflow)
            if (cy < U32_MAX) {
                let ny = cy + 1;
                if (!df::exists_(&world.id, ChunkKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, ChunkKey { cx, cy: ny });
                };
            };

            i = i + 1;
        };

        let count = vector::length(&candidates);
        assert!(count > 0, E_NO_ADJACENT_CHUNK);
        let index = random::generate_u64_in_range(rng, 0, count - 1);
        let chosen = *vector::borrow(&candidates, index);
        (chosen.cx, chosen.cy)
    }

    fun has_adjacent(world: &WorldMap, cx: u32, cy: u32): bool {
        let mut ok = false;

        // left
        if (cx > 0) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx: cx - 1, cy });
        };
        // right (avoid overflow)
        if (cx < U32_MAX) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx: cx + 1, cy });
        };

        // top
        if (cy > 0) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx, cy: cy - 1 });
        };
        // bottom (avoid overflow)
        if (cy < U32_MAX) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx, cy: cy + 1 });
        };

        ok
    }

    /// Allowed codes: 0-30
    fun is_valid_tile(t: u8): bool {
        t <= 30
    }

    /// Allowed decoration codes: 0-40 (0 = no decoration)
    fun is_valid_decoration(d: u8): bool {
        d <= 40
    }

    fun assert_tiles_valid(tiles: &vector<u8>) {
        let mut i = 0;
        let n = vector::length(tiles);
        while (i < n) {
            let t = *vector::borrow(tiles, i);
            assert!(is_valid_tile(t), E_INVALID_TILE_CODE);
            i = i + 1;
        }
    }

    fun assert_decorations_valid(decorations: &vector<u8>) {
        let mut i = 0;
        let n = vector::length(decorations);
        while (i < n) {
            let d = *vector::borrow(decorations, i);
            assert!(is_valid_decoration(d), E_INVALID_TILE_CODE);
            i = i + 1;
        }
    }
}

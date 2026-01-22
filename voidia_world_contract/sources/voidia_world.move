module voidia_world::world {

    use std::string::{Self, String};
    use sui::bcs;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::display;
    use sui::dynamic_field as df;
    use sui::event;
    use sui::package;
    use sui::random;

    use voidia_world::voidia_coin;
    use voidia_world::voidia_coin::{RewardVault, VOIDIA_COIN};
    use voidia_world::power_stone;
    use voidia_world::power_stone::StoneVault;

    /* ================= CONFIG ================= */

    const TILES_LEN: u64 = 25; // 5*5
    const MAX_URL_BYTES: u64 = 2048;

    const U32_MAX: u32 = 4294967295;
    const PLAY_FEE: u64 = 8;
    // Reward token range for play_v2
    const MIN_REWARD_V2: u64 = 1;
    const MAX_REWARD_V2: u64 = 9;
    // Power stone reward range
    const STONE_MIN_V1: u64 = 0;
    const STONE_MAX_V1: u64 = 2;
    const STONE_MIN_V2: u64 = 2;
    const STONE_MAX_V2: u64 = 5;
    const STONE_BONUS_V1: u64 = 3; // bonus stones possible on claim, based on difficulty% (play_v1)
    const STONE_BONUS_V2: u64 = 5; // bonus stones possible on claim, based on difficulty% (play_v2)
    const PLOT_PRICE_INCREMENT: u64 = 5; // price grows by 5 per plot until 20 plots
    const DAILY_PLAY_LIMIT: u64 = 8;      // play_v2 limit per epoch
    const FREE_DAILY_PLAY_LIMIT: u64 = 3; // play_v1 free limit per epoch

    /* ================= ERRORS ================= */

    const E_INVALID_TILES_LEN: u64 = 1;
    const E_INVALID_TILE_CODE: u64 = 2;
    const E_URL_TOO_LONG: u64 = 4;
    const E_FIRST_PLOT_MUST_BE_ORIGIN: u64 = 6;
    const E_NO_ADJACENT_PLOT: u64 = 7;
    const E_INVALID_FEE: u64 = 8;
    const E_INVALID_REWARD_RANGE: u64 = 9;
    const E_PLAY_NOT_FOUND: u64 = 10;
    const E_INVALID_SEAL: u64 = 11;
    const E_INVALID_DIFFICULTY: u64 = 12;
    const E_CHARACTER_ALREADY_EXISTS: u64 = 13;
    const E_NOT_CHARACTER_OWNER: u64 = 14;
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
    const E_INSUFFICIENT_PAYMENT: u64 = 29;

    /* ================= ADMIN / REGISTRY ================= */

    /// Admin cap. Without it you cannot create worlds.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry to track worlds.
    public struct WorldRegistry has key, store {
        id: UID,
        world_ids: vector<ID>,
    }

    /* ================= WORLD (SHARED) ================= */

    /// Key for dynamic field: (cx, cy) -> plot_id
    public struct PlotKey has copy, drop, store {
        cx: u32,
        cy: u32,
    }

    /// Key for dynamic field: play_id -> PlayTicket
    public struct PlayKey has copy, drop, store {
        id: u64,
    }

    public struct PlayTicket has store {
        player: address,
        policy_id: vector<u8>, // Seal identity (BCS-encoded play_id)
        min_reward: u64,
        max_reward: u64,
        stone_min: u64,
        stone_max: u64,
        approved: bool,
    }

    public struct WorldMap has key, store {
        id: UID,
        name: String,
        plot_count: u64,
        next_play_id: u64,
        admin: address,
        difficulty: u8,
        required_power: u64,
        plots: vector<PlotKey>,
    }

    /* ================= PLOT NFT (OWNED) ================= */

    /// Each plot = 1 owned NFT. Only owner can edit.
    public struct PlotNFT has key, store {
        id: UID,
        world_id: ID,
        cx: u32,
        cy: u32,
        image_url: String,
        tiles: vector<u8>,
        decorations: vector<u8>,
    }

    /// Key to store plot listings: plot_id -> PlotListing
    public struct ListingKey has copy, drop, store {
        plot_id: ID,
    }

    /// Plot listing object stores NFT + sale price
    public struct PlotListing has key, store {
        id: UID,
        plot: PlotNFT,
        seller: address,
        price: u64,
    }

    public struct SellerPayoutKey has copy, drop, store {
        owner: address,
    }

    public struct SellerPayout has key, store {
        id: UID,
        owner: address,
        balance: Balance<VOIDIA_COIN>,
    }

    /* ================= CHARACTER NFT (SOULBOUND) ================= */

    /// Key for dynamic field: owner -> character_id
    public struct CharacterKey has copy, drop, store {
        owner: address,
    }

    /// Each wallet can mint one character (soulbound)
    public struct CharacterNFT has key, store {
        id: UID,
        owner: address,
        name: String,
        health: u64,
        power: u64,
        potential: u64,
        attack: u64,
        power_tier: u8,
        last_play_epoch: u64,
        daily_plays: u64,
        last_free_play_epoch: u64,
        free_daily_plays: u64,
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

    public struct PlotClaimedEvent has copy, drop {
        world_id: ID,
        plot_id: ID,
        cx: u32,
        cy: u32,
        owner: address,
    }

    public struct PlotListedEvent has copy, drop {
        world_id: ID,
        plot_id: ID,
        seller: address,
        price: u64,
    }

    public struct PlotSoldEvent has copy, drop {
        world_id: ID,
        plot_id: ID,
        seller: address,
        buyer: address,
        price: u64,
    }

    public struct PlotDelistedEvent has copy, drop {
        world_id: ID,
        plot_id: ID,
        seller: address,
    }


    public struct PlotImageUpdatedEvent has copy, drop {
        plot_id: ID,
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
        stones: u64,
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

    /* ================= DISPLAY INIT ================= */

    /// One-Time Witness for init()
    public struct WORLD has drop {}

    /// init runs on publish:
    /// - set Display for PlotNFT
    /// - create WorldRegistry (shared)
    /// - create AdminCap for deployer
    fun init(otw: WORLD, ctx: &mut tx_context::TxContext) {
        let admin = tx_context::sender(ctx);

        // 1) Display template for PlotNFT
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

        let values = vector[
            string::utf8(b"plot ({cx},{cy})"),
            string::utf8(b"plot in World {world_id}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"https://your-game.com/plot/{id}"),
            string::utf8(b"https://your-game.com"),
            string::utf8(b"Voidia World"),
        ];

        let mut disp = display::new_with_fields<PlotNFT>(&publisher, keys, values, ctx);
        display::update_version(&mut disp);

        transfer::public_transfer(publisher, admin);
        transfer::public_transfer(disp, admin);

        // 2) Registry shared
        let registry = WorldRegistry {
            id: object::new(ctx),
            world_ids: vector[],
        };
        let registry_id = object::uid_to_inner(&registry.id);
        transfer::share_object(registry);

        // 3) AdminCap to deployer
        let cap = AdminCap { id: object::new(ctx) };
        let cap_id = object::uid_to_inner(&cap.id);
        transfer::public_transfer(cap, admin);

        event::emit(RegistryCreatedEvent { registry_id, admin, admin_cap_id: cap_id });
    }

    /* ================= ADMIN: CREATE / CONFIG WORLD ================= */

    /// Admin creates world (shared).
    entry fun create_world(
        registry: &mut WorldRegistry,
        _cap: &AdminCap,
        name: String,
        difficulty: u8,
        required_power: u64,
        ctx: &mut tx_context::TxContext
    ) {
        assert!(difficulty >= 1 && difficulty <= 9, E_INVALID_DIFFICULTY);
        let name_len = string::length(&name);
        assert!(name_len >= 1 && name_len <= 64, E_INVALID_NAME);

        let admin = tx_context::sender(ctx);
        let world = WorldMap {
            id: object::new(ctx),
            name,
            plot_count: 0,
            next_play_id: 0,
            admin,
            difficulty,
            required_power,
            plots: vector[],
        };

        let world_id = object::uid_to_inner(&world.id);
        vector::push_back(&mut registry.world_ids, world_id);

        transfer::share_object(world);

        event::emit(WorldCreatedEvent { world_id, name, admin });
    }

    /// Read helper
    public fun get_world_ids(registry: &WorldRegistry): &vector<ID> {
        &registry.world_ids
    }

    /* ================= CHARACTER ================= */

    /// Mint one character per wallet
    entry fun create_character(registry: &mut WorldRegistry, name: String, ctx: &mut tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(!df::exists_(&registry.id, CharacterKey { owner: sender }), E_CHARACTER_ALREADY_EXISTS);

        let name_len = string::length(&name);
        assert!(name_len >= 1 && name_len <= 32, E_INVALID_NAME);

        let character = CharacterNFT {
            id: object::new(ctx),
            owner: sender,
            name,
            health: 100,
            power: 0,
            potential: 0,
            attack: 0,
            power_tier: 0,
            last_play_epoch: 0,
            daily_plays: 0,
            last_free_play_epoch: 0,
            free_daily_plays: 0,
        };
        let character_id = object::uid_to_inner(&character.id);
        df::add(&mut registry.id, CharacterKey { owner: sender }, character_id);
        transfer::public_transfer(character, sender);

        event::emit(CharacterCreatedEvent { character_id, owner: sender, name });
    }

    /* ================= CLAIM / EDIT PLOT ================= */

    /// Claim new plot. Price = plot_count * 5 until 20, then 100.
    entry fun claim_plot(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        randomness: &random::Random,
        image_url: String,
        tiles: vector<u8>,
        decorations: vector<u8>,
        mut payment: Coin<VOIDIA_COIN>,
        ctx: &mut tx_context::TxContext
    ) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);
        assert!(string::length(&image_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);

        let sender = tx_context::sender(ctx);
        let price = if (world.plot_count == 0) {
            0
        } else if (world.plot_count < 20) {
            world.plot_count * PLOT_PRICE_INCREMENT
        } else {
            100
        };

        let pay_value = coin::value(&payment);
        assert!(pay_value >= price, E_INSUFFICIENT_PAYMENT);

        if (price > 0) {
            if (pay_value > price) {
                let change = coin::split(&mut payment, price, ctx);
                transfer::public_transfer(change, sender);
            };
            voidia_coin::deposit(vault, payment);
        } else if (pay_value > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        let (cx, cy) = if (world.plot_count == 0) {
            (0u32, 0u32)
        } else {
            let mut rng = random::new_generator(randomness, ctx);
            pick_random_adjacent(world, &mut rng)
        };

        if (world.plot_count == 0) {
            assert!(cx == 0 && cy == 0, E_FIRST_PLOT_MUST_BE_ORIGIN);
        } else {
            assert!(has_adjacent(world, cx, cy), E_NO_ADJACENT_PLOT);
        };

        let plot = PlotNFT {
            id: object::new(ctx),
            world_id: object::uid_to_inner(&world.id),
            cx,
            cy,
            image_url,
            tiles,
            decorations,
        };
        let plot_id = object::uid_to_inner(&plot.id);

        df::add(&mut world.id, PlotKey { cx, cy }, plot_id);
        vector::push_back(&mut world.plots, PlotKey { cx, cy });
        world.plot_count = world.plot_count + 1;

        transfer::public_transfer(plot, sender);
        event::emit(PlotClaimedEvent { world_id: object::uid_to_inner(&world.id), plot_id, cx, cy, owner: sender });
    }

    /// Batch save 25 tiles
    entry fun set_tiles(plot: &mut PlotNFT, tiles: vector<u8>) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        plot.tiles = tiles;
    }

    /// Batch save 25 decorations
    entry fun set_decorations(plot: &mut PlotNFT, decorations: vector<u8>) {
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_decorations_valid(&decorations);
        plot.decorations = decorations;
    }

    /// Batch save both tiles and decorations
    entry fun set_tiles_and_decorations(plot: &mut PlotNFT, tiles: vector<u8>, decorations: vector<u8>) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);
        plot.tiles = tiles;
        plot.decorations = decorations;
    }

    /// Update tiles, decorations, and image URL together
    entry fun update_plot(
        plot: &mut PlotNFT,
        tiles: vector<u8>,
        decorations: vector<u8>,
        new_url: String,
    ) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert!(vector::length(&decorations) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        assert_decorations_valid(&decorations);
        assert!(string::length(&new_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);

        plot.tiles = tiles;
        plot.decorations = decorations;
        plot.image_url = new_url;

        event::emit(PlotImageUpdatedEvent { plot_id: object::uid_to_inner(&plot.id) });
    }

    entry fun set_image_url(plot: &mut PlotNFT, new_url: String) {
        assert!(string::length(&new_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);
        plot.image_url = new_url;

        event::emit(PlotImageUpdatedEvent { plot_id: object::uid_to_inner(&plot.id) });
    }

    /* ================= MARKETPLACE ================= */

    entry fun list_Plot(
        world: &mut WorldMap,
        plot: PlotNFT,
        price: u64,
        ctx: &mut tx_context::TxContext
    ) {
        assert!(price > 0, E_INVALID_PRICE);
        let sender = tx_context::sender(ctx);
        let world_id = object::uid_to_inner(&world.id);
        assert!(plot.world_id == world_id, E_WORLD_MISMATCH);

        let plot_id = object::uid_to_inner(&plot.id);
        let key = ListingKey { plot_id };
        assert!(!df::exists_(&world.id, key), E_LISTING_ALREADY_EXISTS);

        let listing = PlotListing { id: object::new(ctx), plot, seller: sender, price };
        df::add(&mut world.id, key, listing);

        event::emit(PlotListedEvent { world_id, plot_id, seller: sender, price });
    }

    entry fun cancel_listing(world: &mut WorldMap, plot_id: ID, ctx: & tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        let key = ListingKey { plot_id };
        assert!(df::exists_(&world.id, key), E_LISTING_NOT_FOUND);

        let listing: PlotListing = df::remove(&mut world.id, key);
        let PlotListing { id, plot, seller, price: _ } = listing;
        assert!(seller == sender, E_NOT_LISTING_OWNER);

        transfer::public_transfer(plot, sender);
        object::delete(id);

        event::emit(PlotDelistedEvent { world_id: object::uid_to_inner(&world.id), plot_id, seller: sender });
    }

    entry fun buy_Plot(
        world: &mut WorldMap,
        plot_id: ID,
        mut payment: Coin<VOIDIA_COIN>,
        ctx: &mut tx_context::TxContext
    ) {
        let key = ListingKey { plot_id };
        assert!(df::exists_(&world.id, key), E_LISTING_NOT_FOUND);

        let listing: PlotListing = df::remove(&mut world.id, key);
        let PlotListing { id, plot, seller, price } = listing;
        let buyer = tx_context::sender(ctx);
        assert!(buyer != seller, E_BUYER_IS_SELLER);
        let pay_value = coin::value(&payment);
        assert!(pay_value >= price && price > 0, E_INVALID_PRICE);

        if (pay_value > price) {
            let change = coin::split(&mut payment, price, ctx);
            transfer::public_transfer(change, buyer);
        };

        if (!df::exists_(&world.id, SellerPayoutKey { owner: seller })) {
            let payout = SellerPayout { id: object::new(ctx), owner: seller, balance: balance::zero<VOIDIA_COIN>() };
            df::add(&mut world.id, SellerPayoutKey { owner: seller }, payout);
        };
        let payout_obj: &mut SellerPayout = df::borrow_mut(&mut world.id, SellerPayoutKey { owner: seller });
        let bal = coin::into_balance(payment);
        balance::join(&mut payout_obj.balance, bal);

        transfer::public_transfer(plot, buyer);
        object::delete(id);
        event::emit(PlotSoldEvent { world_id: object::uid_to_inner(&world.id), plot_id, seller, buyer, price });
    }

    entry fun withdraw_proceeds(world: &mut WorldMap, amount: u64, ctx: &mut tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        let key = SellerPayoutKey { owner: sender };
        assert!(df::exists_(&world.id, key), E_NO_PROCEEDS);
        assert!(amount > 0, E_INVALID_WITHDRAW_AMOUNT);

        let payout: &mut SellerPayout = df::borrow_mut(&mut world.id, key);
        let available = balance::value(&payout.balance);
        assert!(available >= amount, E_INVALID_WITHDRAW_AMOUNT);

        let partial = balance::split(&mut payout.balance, amount);
        let coin_out = coin::from_balance(partial, ctx);
        transfer::public_transfer(coin_out, sender);
    }

    /* ================= PLAY FLOW ================= */

    /// Play V1: free, drop stone 1-3, increase potential by difficulty
    entry fun play_v1(
        world: &mut WorldMap,
        _vault: &mut RewardVault,
        stones: &mut StoneVault,
        character: &mut CharacterNFT,
        ctx: & tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == character.owner, E_NOT_CHARACTER_OWNER);
        // Require minimum power per world before allowing free play
        assert!(character.power >= world.required_power, E_INSUFFICIENT_POWER);

        let current_epoch = tx_context::epoch(ctx);
        if (character.last_free_play_epoch != current_epoch) {
            character.last_free_play_epoch = current_epoch;
            character.free_daily_plays = 0;
        };
        assert!(character.free_daily_plays < FREE_DAILY_PLAY_LIMIT, E_FREE_DAILY_LIMIT_REACHED);
        character.free_daily_plays = character.free_daily_plays + 1;

        power_stone::reserve(stones, STONE_MAX_V1 + STONE_BONUS_V1);

        let play_id = world.next_play_id;
        world.next_play_id = play_id + 1;
        let policy_id = bcs::to_bytes(&play_id);
        df::add(
            &mut world.id,
            PlayKey { id: play_id },
            PlayTicket { player: sender, policy_id, min_reward: 0, max_reward: 0, stone_min: STONE_MIN_V1, stone_max: STONE_MAX_V1, approved: false }
        );
        let world_id = object::uid_to_inner(&world.id);
        event::emit(PlayCreatedEvent { world_id, play_id, min_reward: 0, max_reward: 0, creator: sender });
    }

    /// Play V2: paid, reward coin + stones
    entry fun play_v2(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        stones: &mut StoneVault,
        character: &mut CharacterNFT,
        mut fee_coin: Coin<VOIDIA_COIN>,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == character.owner, E_NOT_CHARACTER_OWNER);
        assert!(MAX_REWARD_V2 >= MIN_REWARD_V2 && MIN_REWARD_V2 > 0, E_INVALID_REWARD_RANGE);
        assert!(character.power >= world.required_power, E_INSUFFICIENT_POWER);
        let current_epoch = tx_context::epoch(ctx);
        if (character.last_play_epoch != current_epoch) {
            character.last_play_epoch = current_epoch;
            character.daily_plays = 0;
        };
        assert!(character.daily_plays < DAILY_PLAY_LIMIT, E_DAILY_PLAY_LIMIT_REACHED);
        character.daily_plays = character.daily_plays + 1;

        let fee_value = coin::value(&fee_coin);
        assert!(fee_value >= PLAY_FEE, E_INVALID_FEE);
        if (fee_value > PLAY_FEE) {
            let pay_coin = coin::split(&mut fee_coin, PLAY_FEE, ctx);
            voidia_coin::deposit(vault, pay_coin);
            transfer::public_transfer(fee_coin, sender);
        } else {
            voidia_coin::deposit(vault, fee_coin);
        };

        voidia_coin::reserve(vault, MAX_REWARD_V2);
        power_stone::reserve(stones, STONE_MAX_V2 + STONE_BONUS_V2);

        let play_id = world.next_play_id;
        world.next_play_id = play_id + 1;
        let policy_id = bcs::to_bytes(&play_id);
        df::add(
            &mut world.id,
            PlayKey { id: play_id },
            PlayTicket { player: sender, policy_id, min_reward: MIN_REWARD_V2, max_reward: MAX_REWARD_V2, stone_min: STONE_MIN_V2, stone_max: STONE_MAX_V2, approved: false }
        );
        let world_id = object::uid_to_inner(&world.id);
        event::emit(PlayCreatedEvent { world_id, play_id, min_reward: MIN_REWARD_V2, max_reward: MAX_REWARD_V2, creator: sender });
    }

    /// Claim reward and apply power/potential to character
    entry fun claim_reward(
       world: &mut WorldMap,
       vault: &mut RewardVault,
       stones: &mut StoneVault,
       character: &mut CharacterNFT,
       randomness: &random::Random,
       play_id: u64,
       ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == character.owner, E_NOT_CHARACTER_OWNER);
        assert!(df::exists_(&world.id, PlayKey { id: play_id }), E_PLAY_NOT_FOUND);

        let PlayTicket { player, policy_id: _, min_reward, max_reward, stone_min, stone_max, approved } =
            df::remove(&mut world.id, PlayKey { id: play_id });
        assert!(player == sender, E_INVALID_SEAL);
        assert!(max_reward >= min_reward, E_INVALID_REWARD_RANGE);
        assert!(approved, E_INVALID_SEAL);

        let mut rng = random::new_generator(randomness, ctx);
        let reward = if (max_reward > 0) {
            random::generate_u64_in_range(&mut rng, min_reward, max_reward)
        } else { 0 };
        let stone_reward = random::generate_u64_in_range(&mut rng, stone_min, stone_max);
        // Bonus stones based on world difficulty: difficulty% chance to add extra stones
        let bonus_roll = random::generate_u64_in_range(&mut rng, 1, 100);
        let bonus_stones = if (bonus_roll <= (world.difficulty as u64)) {
            if (max_reward > 0) { STONE_BONUS_V2 } else { STONE_BONUS_V1 }
        } else { 0 };
        let total_stones = stone_reward + bonus_stones;

        if (max_reward > 0) {
            voidia_coin::unreserve(vault, max_reward);
        };
        power_stone::unreserve(
            stones,
            stone_max + if (max_reward > 0) { STONE_BONUS_V2 } else { STONE_BONUS_V1 }
        );

        if (reward > 0) {
            let coin_out = voidia_coin::withdraw(vault, reward, ctx);
            transfer::public_transfer(coin_out, sender);
        };
        if (total_stones > 0) {
            let stones_coin = power_stone::withdraw(stones, total_stones, ctx);
            transfer::public_transfer(stones_coin, sender);
        };

        let difficulty = world.difficulty as u64;
        // Scaling gains by tier and current power:
        // - base_gain = 2 * difficulty
        // - tier_multiplier = 1 + power_tier
        // - bonus_pct = +10% per 10_000 power (capped at +500%)
        let base_gain = 2 * difficulty;
        let tier_multiplier = 1 + (character.power_tier as u64);
        let bonus_pct = {
            let raw = (character.power / 10_000) * 10;
            if (raw > 500) { 500 } else { raw }
        };
        let power_gained = base_gain * tier_multiplier * (100 + bonus_pct) / 100;
        let potential_gained = base_gain * tier_multiplier;
        character.power = character.power + power_gained;
        character.potential = character.potential + potential_gained;

        let world_id = object::uid_to_inner(&world.id);
        event::emit(RewardClaimedEvent {
            world_id,
            play_id,
            reward,
            stones: total_stones,
            power_gained,
            potential_gained,
            recipient: sender,
        });

        event::emit(CharacterUpdatedEvent {
            character_id: object::uid_to_inner(&character.id),
            power: character.power,
            potential: character.potential,
        });
    }

    /// Seal approval for off-chain signer
    entry fun seal_approve(
        id: vector<u8>,          // first arg MUST be vector<u8> (Seal SDK)
        play_id: u64,
        world: &mut WorldMap,
        ctx: &tx_context::TxContext
    ) {
        assert!(df::exists_(&world.id, PlayKey { id: play_id }), E_PLAY_NOT_FOUND);
        let ticket: &mut PlayTicket = df::borrow_mut(&mut world.id, PlayKey { id: play_id });
        assert!(ticket.policy_id == id, E_INVALID_SEAL);
        let sender = tx_context::sender(ctx);
        assert!(ticket.player == sender, E_INVALID_SEAL);
        ticket.approved = true;
    }

    /* ================= READ HELPERS ================= */

    public fun get_plot_id(world: &WorldMap, cx: u32, cy: u32): option::Option<ID> {
        let key = PlotKey { cx, cy };
        if (!df::exists_(&world.id, key)) {
            option::none<ID>()
        } else {
            option::some<ID>(*df::borrow(&world.id, key))
        }
    }

    /* ================= INTERNAL HELPERS ================= */

    /// Pick a random empty adjacent coordinate
    fun pick_random_adjacent(
        world: &WorldMap,
        rng: &mut random::RandomGenerator
    ): (u32, u32) {
        let mut candidates = vector[];
        let total = vector::length(&world.plots);
        let mut i = 0;
        while (i < total) {
            let plot = *vector::borrow(&world.plots, i);
            let cx = plot.cx;
            let cy = plot.cy;

            if (cx > 0) {
                let nx = cx - 1;
                if (!df::exists_(&world.id, PlotKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, PlotKey { cx: nx, cy });
                };
            };
            if (cx < U32_MAX) {
                let nx = cx + 1;
                if (!df::exists_(&world.id, PlotKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, PlotKey { cx: nx, cy });
                };
            };

            if (cy > 0) {
                let ny = cy - 1;
                if (!df::exists_(&world.id, PlotKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, PlotKey { cx, cy: ny });
                };
            };
            if (cy < U32_MAX) {
                let ny = cy + 1;
                if (!df::exists_(&world.id, PlotKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, PlotKey { cx, cy: ny });
                };
            };

            i = i + 1;
        };

        let count = vector::length(&candidates);
        assert!(count > 0, E_NO_ADJACENT_PLOT);
        let index = random::generate_u64_in_range(rng, 0, count - 1);
        let chosen = *vector::borrow(&candidates, index);
        (chosen.cx, chosen.cy)
    }

    fun has_adjacent(world: &WorldMap, cx: u32, cy: u32): bool {
        let mut ok = false;

        if (cx > 0) {
            ok = ok || df::exists_(&world.id, PlotKey { cx: cx - 1, cy });
        };
        if (cx < U32_MAX) {
            ok = ok || df::exists_(&world.id, PlotKey { cx: cx + 1, cy });
        };

        if (cy > 0) {
            ok = ok || df::exists_(&world.id, PlotKey { cx, cy: cy - 1 });
        };
        if (cy < U32_MAX) {
            ok = ok || df::exists_(&world.id, PlotKey { cx, cy: cy + 1 });
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

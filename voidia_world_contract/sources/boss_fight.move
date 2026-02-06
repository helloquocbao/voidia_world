/// Boss Fight Rewards Module
/// 
/// This module handles reward claims for the multiplayer boss fight system.
/// The game server signs reward payloads after matches, and players can
/// claim their rewards on-chain by providing the signed payload.
/// 
/// Security model:
/// 1. Server holds Ed25519 private key (set during init)
/// 2. After each boss fight, server calculates player contributions
/// 3. Server signs (wallet, amount, nonce, expiry) payload
/// 4. Player submits signed payload to claim rewards
/// 5. Contract verifies signature and prevents replay (nonce tracking)
module voidia_world::boss_fight {

    use sui::bcs;
    use sui::ed25519;
    use sui::event;
    use sui::hash::keccak256;
    use sui::table::{Self, Table};

    use voidia_world::voidia_coin::{Self, RewardVault};
    use voidia_world::power_stone::{Self, StoneVault};

    /* ================= ERRORS ================= */
    
    const E_NOT_ADMIN: u64 = 1;
    const E_INVALID_SIGNATURE: u64 = 2;
    const E_NONCE_ALREADY_USED: u64 = 3;
    const E_REWARD_EXPIRED: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 6;
    const E_INVALID_PUBLIC_KEY: u64 = 8;

    /* ================= CONFIG ================= */

    /// Configuration object storing server public key
    /// Created on module init, owned by admin
    public struct BossFightConfig has key, store {
        id: UID,
        /// Admin address (can update public key)
        admin: address,
        /// Ed25519 public key of the game server (32 bytes hex)
        server_public_key: vector<u8>,
        /// Nonces that have been used (to prevent replay attacks)
        used_nonces: Table<vector<u8>, bool>,
        /// Total rewards claimed
        total_tokens_claimed: u64,
        total_stones_claimed: u64,
        total_claims: u64,
    }

    /* ================= EVENTS ================= */

    public struct ConfigCreatedEvent has copy, drop {
        config_id: ID,
        admin: address,
    }

    public struct PublicKeyUpdatedEvent has copy, drop {
        config_id: ID,
        old_key_hash: vector<u8>,
        new_key_hash: vector<u8>,
    }

    public struct BossRewardClaimedEvent has copy, drop {
        player: address,
        match_id: vector<u8>,
        reward_id: vector<u8>,
        token_amount: u64,
        stone_amount: u64,
        nonce: vector<u8>,
    }

    /* ================= INIT ================= */

    /// One-Time Witness for init
    public struct BOSS_FIGHT has drop {}

    /// Initialize the module - creates config object
    fun init(_otw: BOSS_FIGHT, ctx: &mut tx_context::TxContext) {
        let admin = tx_context::sender(ctx);
        
        let config = BossFightConfig {
            id: object::new(ctx),
            admin,
            server_public_key: vector::empty(),
            used_nonces: table::new(ctx),
            total_tokens_claimed: 0,
            total_stones_claimed: 0,
            total_claims: 0,
        };

        let config_id = object::uid_to_inner(&config.id);
        
        // Share the config so it can be accessed by claim functions
        transfer::share_object(config);

        event::emit(ConfigCreatedEvent { config_id, admin });
    }

    /* ================= ADMIN FUNCTIONS ================= */

    /// Set or update the server's Ed25519 public key
    /// Only callable by admin
    entry fun set_server_public_key(
        config: &mut BossFightConfig,
        new_public_key: vector<u8>,
        ctx: &tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == config.admin, E_NOT_ADMIN);
        assert!(vector::length(&new_public_key) == 32, E_INVALID_PUBLIC_KEY);

        let old_key_hash = keccak256(&config.server_public_key);
        let new_key_hash = keccak256(&new_public_key);

        config.server_public_key = new_public_key;

        event::emit(PublicKeyUpdatedEvent {
            config_id: object::uid_to_inner(&config.id),
            old_key_hash,
            new_key_hash,
        });
    }

    /// Transfer admin rights to a new address
    entry fun transfer_admin(
        config: &mut BossFightConfig,
        new_admin: address,
        ctx: &tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == config.admin, E_NOT_ADMIN);
        config.admin = new_admin;
    }

    /* ================= CLAIM FUNCTIONS ================= */

    /// Claim tokens from boss fight rewards
    /// Verifies Ed25519 signature from game server
    entry fun claim_boss_reward_tokens(
        config: &mut BossFightConfig,
        vault: &mut RewardVault,
        // Payload components
        match_id: vector<u8>,
        reward_id: vector<u8>,
        reward_amount: u64,
        nonce: vector<u8>,
        expiry: u64,
        // Signature from server
        signature: vector<u8>,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let reward_type = b"token";

        // Verify not expired
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(expiry > current_time, E_REWARD_EXPIRED);

        // Verify nonce not used
        assert!(!table::contains(&config.used_nonces, nonce), E_NONCE_ALREADY_USED);

        // Verify amount is positive
        assert!(reward_amount > 0, E_INVALID_AMOUNT);

        // Build payload hash (must match server's computePayloadHash)
        let payload_hash = build_payload_hash(
            &match_id,
            sender,
            &reward_id,
            reward_amount,
            &reward_type,
            &nonce,
            expiry
        );

        // Verify Ed25519 signature
        let is_valid = ed25519::ed25519_verify(
            &signature,
            &config.server_public_key,
            &payload_hash
        );
        assert!(is_valid, E_INVALID_SIGNATURE);

        // Mark nonce as used
        table::add(&mut config.used_nonces, nonce, true);

        // Update stats
        config.total_tokens_claimed = config.total_tokens_claimed + reward_amount;
        config.total_claims = config.total_claims + 1;

        // Withdraw and transfer tokens
        let coin_out = voidia_coin::withdraw(vault, reward_amount, ctx);
        transfer::public_transfer(coin_out, sender);

        // Emit event
        event::emit(BossRewardClaimedEvent {
            player: sender,
            match_id,
            reward_id,
            token_amount: reward_amount,
            stone_amount: 0,
            nonce,
        });
    }

    /// Claim power stones from boss fight rewards
    entry fun claim_boss_reward_stones(
        config: &mut BossFightConfig,
        stones: &mut StoneVault,
        // Payload components  
        match_id: vector<u8>,
        reward_id: vector<u8>,
        reward_amount: u64,
        nonce: vector<u8>,
        expiry: u64,
        // Signature from server
        signature: vector<u8>,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let reward_type = b"stone";

        // Verify not expired
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(expiry > current_time, E_REWARD_EXPIRED);

        // Verify nonce not used
        assert!(!table::contains(&config.used_nonces, nonce), E_NONCE_ALREADY_USED);

        // Verify amount is positive
        assert!(reward_amount > 0, E_INVALID_AMOUNT);

        // Build payload hash
        let payload_hash = build_payload_hash(
            &match_id,
            sender,
            &reward_id,
            reward_amount,
            &reward_type,
            &nonce,
            expiry
        );

        // Verify Ed25519 signature
        let is_valid = ed25519::ed25519_verify(
            &signature,
            &config.server_public_key,
            &payload_hash
        );
        assert!(is_valid, E_INVALID_SIGNATURE);

        // Mark nonce as used
        table::add(&mut config.used_nonces, nonce, true);

        // Update stats
        config.total_stones_claimed = config.total_stones_claimed + reward_amount;
        config.total_claims = config.total_claims + 1;

        // Withdraw and transfer stones
        let stones_coin = power_stone::withdraw(stones, reward_amount, ctx);
        transfer::public_transfer(stones_coin, sender);

        // Emit event
        event::emit(BossRewardClaimedEvent {
            player: sender,
            match_id,
            reward_id,
            token_amount: 0,
            stone_amount: reward_amount,
            nonce,
        });
    }

    /* ================= VIEW FUNCTIONS ================= */

    /// Check if a nonce has been used
    public fun is_nonce_used(config: &BossFightConfig, nonce: &vector<u8>): bool {
        table::contains(&config.used_nonces, *nonce)
    }

    /// Get total claims stats
    public fun get_stats(config: &BossFightConfig): (u64, u64, u64) {
        (config.total_claims, config.total_tokens_claimed, config.total_stones_claimed)
    }

    /// Get admin address
    public fun get_admin(config: &BossFightConfig): address {
        config.admin
    }

    /* ================= INTERNAL FUNCTIONS ================= */

    /// Build the payload hash that matches server's computePayloadHash
    /// This creates a canonical representation that server must also use
    fun build_payload_hash(
        match_id: &vector<u8>,
        player_address: address,
        reward_id: &vector<u8>,
        reward_amount: u64,
        reward_type: &vector<u8>,
        nonce: &vector<u8>,
        expiry: u64
    ): vector<u8> {
        // Build a deterministic byte representation
        // Format: match_id || player_address || reward_id || reward_amount || reward_type || nonce || expiry
        let mut payload = vector::empty<u8>();
        
        // Append match_id
        let mut i = 0;
        while (i < vector::length(match_id)) {
            vector::push_back(&mut payload, *vector::borrow(match_id, i));
            i = i + 1;
        };

        // Append player address (32 bytes) using BCS serialization
        let addr_bytes = bcs::to_bytes(&player_address);
        i = 0;
        while (i < vector::length(&addr_bytes)) {
            vector::push_back(&mut payload, *vector::borrow(&addr_bytes, i));
            i = i + 1;
        };

        // Append reward_id
        i = 0;
        while (i < vector::length(reward_id)) {
            vector::push_back(&mut payload, *vector::borrow(reward_id, i));
            i = i + 1;
        };

        // Append reward_amount (8 bytes big-endian)
        vector::push_back(&mut payload, ((reward_amount >> 56) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 48) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 40) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 32) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 24) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 16) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount >> 8) & 0xFF as u8));
        vector::push_back(&mut payload, ((reward_amount) & 0xFF as u8));

        // Append reward_type
        i = 0;
        while (i < vector::length(reward_type)) {
            vector::push_back(&mut payload, *vector::borrow(reward_type, i));
            i = i + 1;
        };

        // Append nonce
        i = 0;
        while (i < vector::length(nonce)) {
            vector::push_back(&mut payload, *vector::borrow(nonce, i));
            i = i + 1;
        };

        // Append expiry (8 bytes big-endian)
        vector::push_back(&mut payload, ((expiry >> 56) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 48) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 40) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 32) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 24) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 16) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry >> 8) & 0xFF as u8));
        vector::push_back(&mut payload, ((expiry) & 0xFF as u8));

        // Return SHA256 hash of payload
        sui::hash::keccak256(&payload)
    }

    /* ================= TEST HELPERS ================= */

    #[test_only]
    public fun init_for_testing(ctx: &mut tx_context::TxContext) {
        init(BOSS_FIGHT {}, ctx)
    }
}

module chunk_world::reward_coin;

use std::string;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::coin_registry;
use sui::event;

const TOTAL_SUPPLY: u64 = 50_000_000;
const DECIMALS: u8 = 0;

const E_INSUFFICIENT_AVAILABLE: u64 = 0;
const E_INVALID_AMOUNT: u64 = 1;
const E_INVALID_RESERVED: u64 = 2;

public struct REWARD_COIN has drop {}

public struct RewardVault has key, store {
    id: UID,
    balance: Balance<REWARD_COIN>,
    reserved: u64,
}

public struct RewardVaultCreatedEvent has copy, drop {
    vault_id: ID,
    total_supply: u64,
    decimals: u8,
}

fun init(otw: REWARD_COIN, ctx: &mut TxContext) {
    let admin = tx_context::sender(ctx);

    let (builder, mut treasury_cap) = coin_registry::new_currency_with_otw<REWARD_COIN>(
        otw,
        DECIMALS,
        string::utf8(b"CHUNK"),
        string::utf8(b"Chunk Reward"),
        string::utf8(b"Chunk World reward token"),
        string::utf8(b"https://ik.imagekit.io/huubao/chunk_coin.png"),
        ctx,
    );

    // finalize metadata đúng chuẩn
    let metadata_cap = coin_registry::finalize(builder, ctx); // hoặc builder.finalize(ctx) tùy version/import

    // mint + vault
    let minted = coin::mint<REWARD_COIN>(&mut treasury_cap, TOTAL_SUPPLY, ctx);
    let balance = coin::into_balance(minted);

    let vault = RewardVault { id: object::new(ctx), balance, reserved: 0 };
    let vault_id = object::uid_to_inner(&vault.id);

    transfer::share_object(vault);

    // chuyển caps cho admin
    transfer::public_transfer(treasury_cap, admin);
    transfer::public_transfer(metadata_cap, admin);

    // emit event giữ nguyên
    event::emit(RewardVaultCreatedEvent {
        vault_id,
        total_supply: TOTAL_SUPPLY,
        decimals: DECIMALS,
    });
}

public fun total_supply(): u64 {
    TOTAL_SUPPLY
}

public fun decimals(): u8 {
    DECIMALS
}

public fun available(vault: &RewardVault): u64 {
    let total = balance::value(&vault.balance);
    assert!(total >= vault.reserved, E_INVALID_RESERVED);
    total - vault.reserved
}

fun mint_internal(
    treasury_cap: &mut coin::TreasuryCap<REWARD_COIN>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<REWARD_COIN> {
    assert!(amount > 0, E_INVALID_AMOUNT);
    coin::mint(treasury_cap, amount, ctx)
}

public fun mint(
    treasury_cap: &mut coin::TreasuryCap<REWARD_COIN>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<REWARD_COIN> {
    mint_internal(treasury_cap, amount, ctx)
}

entry fun mint_token(
    treasury_cap: &mut coin::TreasuryCap<REWARD_COIN>,
    amount: u64,
    ctx: &mut TxContext,
) {
    let coin = mint_internal(treasury_cap, amount, ctx);
    let recipient = tx_context::sender(ctx);
    transfer::public_transfer(coin, recipient);
}

entry fun mint_to_vault(
    treasury_cap: &mut coin::TreasuryCap<REWARD_COIN>,
    vault: &mut RewardVault,
    amount: u64,
    ctx: &mut TxContext,
) {
    let coin = mint_internal(treasury_cap, amount, ctx);
    deposit(vault, coin);
}

public(package) fun deposit(vault: &mut RewardVault, coin: Coin<REWARD_COIN>) {
    let bal = coin::into_balance(coin);
    balance::join(&mut vault.balance, bal);
}

public(package) fun reserve(vault: &mut RewardVault, amount: u64) {
    assert!(amount > 0, E_INVALID_AMOUNT);
    let avail = available(vault);
    assert!(avail >= amount, E_INSUFFICIENT_AVAILABLE);
    vault.reserved = vault.reserved + amount;
}

public(package) fun unreserve(vault: &mut RewardVault, amount: u64) {
    assert!(amount > 0, E_INVALID_AMOUNT);
    assert!(vault.reserved >= amount, E_INVALID_RESERVED);
    vault.reserved = vault.reserved - amount;
}

public(package) fun withdraw(
    vault: &mut RewardVault,
    amount: u64,
    ctx: &mut TxContext,
): Coin<REWARD_COIN> {
    assert!(amount > 0, E_INVALID_AMOUNT);
    coin::take(&mut vault.balance, amount, ctx)
}

/// Simple faucet that sends a specified amount from the shared vault to caller
entry fun faucet(vault: &mut RewardVault, amount: u64, ctx: &mut TxContext) {
    let coin = withdraw(vault, amount, ctx);
    let recipient = tx_context::sender(ctx);
    transfer::public_transfer(coin, recipient);
}

module voidia_world::power_stone;

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

/// Power stone fungible token
public struct POWER_STONE has drop {}

/// Shared vault to hold and dispense stones as rewards
public struct StoneVault has key, store {
    id: UID,
    balance: Balance<POWER_STONE>,
    reserved: u64,
}

public struct StoneVaultCreatedEvent has copy, drop {
    vault_id: ID,
    total_supply: u64,
    decimals: u8,
}

fun init(otw: POWER_STONE, ctx: &mut TxContext) {
    let admin = tx_context::sender(ctx);

    let (builder, mut treasury_cap) = coin_registry::new_currency_with_otw<POWER_STONE>(
        otw,
        DECIMALS,
        string::utf8(b"POWER_STONE"),
        string::utf8(b"Power Stone"),
        string::utf8(b"Upgrade material for Voidia World"),
        // reuse existing artwork until having a dedicated icon
        string::utf8(b"https://ik.imagekit.io/huubao/chunk_coin.png"),
        ctx,
    );

    let metadata_cap = coin_registry::finalize(builder, ctx);

    let minted = coin::mint<POWER_STONE>(&mut treasury_cap, TOTAL_SUPPLY, ctx);
    let balance = coin::into_balance(minted);

    let vault = StoneVault { id: object::new(ctx), balance, reserved: 0 };
    let vault_id = object::uid_to_inner(&vault.id);

    transfer::share_object(vault);

    transfer::public_transfer(treasury_cap, admin);
    transfer::public_transfer(metadata_cap, admin);

    event::emit(StoneVaultCreatedEvent {
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

public fun available(vault: &StoneVault): u64 {
    let total = balance::value(&vault.balance);
    assert!(total >= vault.reserved, E_INVALID_RESERVED);
    total - vault.reserved
}

public fun reserve(vault: &mut StoneVault, amount: u64) {
    assert!(amount > 0, E_INVALID_AMOUNT);
    let avail = available(vault);
    assert!(avail >= amount, E_INSUFFICIENT_AVAILABLE);
    vault.reserved = vault.reserved + amount;
}

public fun unreserve(vault: &mut StoneVault, amount: u64) {
    assert!(amount > 0, E_INVALID_AMOUNT);
    assert!(vault.reserved >= amount, E_INVALID_RESERVED);
    vault.reserved = vault.reserved - amount;
}

public fun withdraw(
    vault: &mut StoneVault,
    amount: u64,
    ctx: &mut TxContext,
): Coin<POWER_STONE> {
    assert!(amount > 0, E_INVALID_AMOUNT);
    coin::take(&mut vault.balance, amount, ctx)
}

public fun deposit(vault: &mut StoneVault, coin: Coin<POWER_STONE>) {
    let bal = coin::into_balance(coin);
    balance::join(&mut vault.balance, bal);
}

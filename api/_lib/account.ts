import { kv } from '@vercel/kv';
import {
  COSMETIC_CATALOG,
  createEmptyAvatarState,
  getCosmeticById,
  setEquippedCosmeticId,
  type AccountAvatarPayload,
  type AvatarState,
  type CosmeticDefinition,
  type CosmeticSlot,
} from '../../src/data/cosmetics.js';

const COIN_BALANCE_FIELD = 'coinBalance';
const EQUIPPED_SHIRT_FIELD = 'equippedShirtId';
const EQUIPPED_HAT_FIELD = 'equippedHatId';
const EQUIPPED_GLASSES_FIELD = 'equippedGlassesId';
const EQUIPPED_MOUSTACHE_FIELD = 'equippedMoustacheId';
const DAILY_COIN_AWARD_TTL_SECONDS = 60 * 60 * 72;

interface FallbackAccountState {
  coinBalance: number;
  avatar: AvatarState;
  ownedCosmeticIds: Set<string>;
}

export type AccountPayload = AccountAvatarPayload;

export interface DailyCoinAwardResult {
  awarded: boolean;
  coinBalance: number;
}

export type PurchaseCosmeticStatus = 'PURCHASED' | 'ALREADY_OWNED' | 'INSUFFICIENT_COINS';

export interface PurchaseCosmeticResult {
  status: PurchaseCosmeticStatus;
  account: AccountPayload;
  purchasedCosmeticId: string | null;
}

export interface GrantCosmeticsResult {
  account: AccountPayload;
  grantedCosmeticIds: string[];
}

const ACCOUNT_FALLBACK_STORE = new Map<string, FallbackAccountState>();
const DAILY_COIN_AWARD_FALLBACK_STORE = new Set<string>();
const PROMO_COIN_AWARD_FALLBACK_STORE = new Set<string>();

/**
 * Lua scripts are created lazily: kv.createScript() throws when KV env vars are
 * absent, and at module scope that killed every route importing this file
 * (bootstrap, daily, party, avatar/*) during zero-backend local dev — before
 * the isKvConfigured() guards at each call site could take effect.
 */
function createAwardDailyCoinsScript() {
  return kv.createScript<[number, string]>(`
local markerKey = KEYS[1]
local userKey = KEYS[2]
local fieldName = ARGV[1]
local coins = tonumber(ARGV[2]) or 0
local ttlSeconds = tonumber(ARGV[3]) or 0

local awarded = redis.call('SETNX', markerKey, coins)

if awarded == 1 then
  if ttlSeconds > 0 then
    redis.call('EXPIRE', markerKey, ttlSeconds)
  end

  redis.call('HINCRBY', userKey, fieldName, coins)
end

local balance = redis.call('HGET', userKey, fieldName)
if not balance then
  balance = '0'
end

return {awarded, balance}
`);
}

function createPurchaseCosmeticScript() {
  return kv.createScript<[string]>(`
local userKey = KEYS[1]
local ownedKey = KEYS[2]
local coinField = ARGV[1]
local equippedField = ARGV[2]
local cosmeticId = ARGV[3]
local price = tonumber(ARGV[4]) or 0

if redis.call('SISMEMBER', ownedKey, cosmeticId) == 1 then
  return {'ALREADY_OWNED'}
end

local balance = tonumber(redis.call('HGET', userKey, coinField) or '0') or 0
if balance < price then
  return {'INSUFFICIENT_COINS'}
end

redis.call('HINCRBY', userKey, coinField, -price)
redis.call('SADD', ownedKey, cosmeticId)
redis.call('HSET', userKey, equippedField, cosmeticId)

return {'PURCHASED'}
`);
}

let awardDailyCoinsScriptInstance: ReturnType<typeof createAwardDailyCoinsScript> | null = null;
let purchaseCosmeticScriptInstance: ReturnType<typeof createPurchaseCosmeticScript> | null = null;

function awardDailyCoinsScript() {
  return (awardDailyCoinsScriptInstance ??= createAwardDailyCoinsScript());
}

function purchaseCosmeticScript() {
  return (purchaseCosmeticScriptInstance ??= createPurchaseCosmeticScript());
}

function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function normalizeInteger(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeCoinAmount(coins: number) {
  if (!Number.isFinite(coins)) {
    return 0;
  }

  return Math.max(0, Math.trunc(coins));
}

function accountKey(userId: string) {
  return `user:${userId}`;
}

function ownedCosmeticsKey(userId: string) {
  return `${accountKey(userId)}:ownedCosmetics`;
}

function dailyCoinAwardKey(dateKey: string, userId: string) {
  return `daily:coins-awarded:${dateKey}:${userId}`;
}

function promoCoinAwardKey(promoCode: string, userId: string) {
  return `promo:coins-awarded:${promoCode}:${userId}`;
}

function equippedFieldForSlot(slot: CosmeticSlot) {
  switch (slot) {
    case 'shirt':
      return EQUIPPED_SHIRT_FIELD;
    case 'hat':
      return EQUIPPED_HAT_FIELD;
    case 'glasses':
      return EQUIPPED_GLASSES_FIELD;
    case 'moustache':
      return EQUIPPED_MOUSTACHE_FIELD;
  }

  throw new Error('Unsupported cosmetic slot');
}

function createFallbackAccountState(): FallbackAccountState {
  return {
    coinBalance: 0,
    avatar: createEmptyAvatarState(),
    ownedCosmeticIds: new Set<string>(),
  };
}

function cloneFallbackAccountState(state: FallbackAccountState): FallbackAccountState {
  return {
    coinBalance: state.coinBalance,
    avatar: { ...state.avatar },
    ownedCosmeticIds: new Set(state.ownedCosmeticIds),
  };
}

function getFallbackAccountState(userId: string) {
  const existing = ACCOUNT_FALLBACK_STORE.get(accountKey(userId));
  return existing ? cloneFallbackAccountState(existing) : createFallbackAccountState();
}

function setFallbackAccountState(userId: string, state: FallbackAccountState) {
  ACCOUNT_FALLBACK_STORE.set(accountKey(userId), cloneFallbackAccountState(state));
}

function getOrderedCosmeticIds(values: Iterable<string>) {
  const normalized = new Set<string>();

  for (const value of values) {
    if (getCosmeticById(value)) {
      normalized.add(value);
    }
  }

  return COSMETIC_CATALOG
    .map((cosmetic) => cosmetic.id)
    .filter((cosmeticId) => normalized.has(cosmeticId));
}

function normalizeEquippedCosmeticId(
  rawValue: unknown,
  slot: CosmeticSlot,
  ownedCosmeticIds: Set<string>,
) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  const cosmetic = getCosmeticById(rawValue);
  if (!cosmetic || cosmetic.slot !== slot || !ownedCosmeticIds.has(cosmetic.id)) {
    return null;
  }

  return cosmetic.id;
}

function accountPayloadFromState(state: FallbackAccountState): AccountPayload {
  const ownedCosmeticIds = getOrderedCosmeticIds(state.ownedCosmeticIds);
  const ownedSet = new Set(ownedCosmeticIds);

  return {
    coinBalance: state.coinBalance,
    avatar: {
      equippedShirtId: normalizeEquippedCosmeticId(state.avatar.equippedShirtId, 'shirt', ownedSet),
      equippedHatId: normalizeEquippedCosmeticId(state.avatar.equippedHatId, 'hat', ownedSet),
      equippedGlassesId: normalizeEquippedCosmeticId(state.avatar.equippedGlassesId, 'glasses', ownedSet),
      equippedMoustacheId: normalizeEquippedCosmeticId(state.avatar.equippedMoustacheId, 'moustache', ownedSet),
    },
    ownedCosmeticIds,
  };
}

function getFallbackCoinBalance(userId: string) {
  return getFallbackAccountState(userId).coinBalance;
}

function setFallbackCoinBalance(userId: string, coinBalance: number) {
  const state = getFallbackAccountState(userId);
  state.coinBalance = coinBalance;
  setFallbackAccountState(userId, state);
}

function awardCoinsOnceFallback(
  markerStore: Set<string>,
  markerKey: string,
  userId: string,
  coins: number,
): DailyCoinAwardResult {
  const normalizedCoins = normalizeCoinAmount(coins);

  if (!markerStore.has(markerKey)) {
    markerStore.add(markerKey);

    const nextBalance = getFallbackCoinBalance(userId) + normalizedCoins;
    setFallbackCoinBalance(userId, nextBalance);

    return {
      awarded: true,
      coinBalance: nextBalance,
    };
  }

  return {
    awarded: false,
    coinBalance: getFallbackCoinBalance(userId),
  };
}

function awardDailyCoinsOnceFallback(dateKey: string, userId: string, coins: number): DailyCoinAwardResult {
  return awardCoinsOnceFallback(
    DAILY_COIN_AWARD_FALLBACK_STORE,
    dailyCoinAwardKey(dateKey, userId),
    userId,
    coins,
  );
}

function awardPromoCoinsOnceFallback(promoCode: string, userId: string, coins: number): DailyCoinAwardResult {
  return awardCoinsOnceFallback(
    PROMO_COIN_AWARD_FALLBACK_STORE,
    promoCoinAwardKey(promoCode, userId),
    userId,
    coins,
  );
}

function normalizeOwnedCosmeticIds(rawValues: unknown) {
  if (!Array.isArray(rawValues)) {
    return [] as string[];
  }

  return getOrderedCosmeticIds(
    rawValues
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function normalizePurchaseStatus(value: unknown): PurchaseCosmeticStatus {
  if (value === 'ALREADY_OWNED' || value === 'INSUFFICIENT_COINS' || value === 'PURCHASED') {
    return value;
  }

  return 'INSUFFICIENT_COINS';
}

async function readKvAccountState(userId: string): Promise<FallbackAccountState> {
  const [rawBalance, rawShirtId, rawHatId, rawGlassesId, rawMoustacheId, rawOwnedCosmeticIds] = await Promise.all([
    kv.hget(accountKey(userId), COIN_BALANCE_FIELD),
    kv.hget(accountKey(userId), EQUIPPED_SHIRT_FIELD),
    kv.hget(accountKey(userId), EQUIPPED_HAT_FIELD),
    kv.hget(accountKey(userId), EQUIPPED_GLASSES_FIELD),
    kv.hget(accountKey(userId), EQUIPPED_MOUSTACHE_FIELD),
    kv.smembers(ownedCosmeticsKey(userId)),
  ]);

  const ownedCosmeticIds = normalizeOwnedCosmeticIds(rawOwnedCosmeticIds);
  const ownedCosmeticSet = new Set(ownedCosmeticIds);

  return {
    coinBalance: normalizeInteger(rawBalance, 0),
    avatar: {
      equippedShirtId: normalizeEquippedCosmeticId(rawShirtId, 'shirt', ownedCosmeticSet),
      equippedHatId: normalizeEquippedCosmeticId(rawHatId, 'hat', ownedCosmeticSet),
      equippedGlassesId: normalizeEquippedCosmeticId(rawGlassesId, 'glasses', ownedCosmeticSet),
      equippedMoustacheId: normalizeEquippedCosmeticId(rawMoustacheId, 'moustache', ownedCosmeticSet),
    },
    ownedCosmeticIds: ownedCosmeticSet,
  };
}

export async function getUserAccount(userId: string): Promise<AccountPayload> {
  if (!isKvConfigured()) {
    return accountPayloadFromState(getFallbackAccountState(userId));
  }

  try {
    const state = await readKvAccountState(userId);
    setFallbackAccountState(userId, state);
    return accountPayloadFromState(state);
  } catch (error) {
    console.warn('Account storage falling back to in-memory avatar state.', error);
    return accountPayloadFromState(getFallbackAccountState(userId));
  }
}

export async function getUserCoinBalance(userId: string) {
  const account = await getUserAccount(userId);
  return account.coinBalance;
}

export async function awardDailyCoinsOnce(
  dateKey: string,
  userId: string,
  coins: number,
): Promise<DailyCoinAwardResult> {
  const markerKey = dailyCoinAwardKey(dateKey, userId);
  const normalizedCoins = normalizeCoinAmount(coins);

  if (!isKvConfigured()) {
    return awardDailyCoinsOnceFallback(dateKey, userId, normalizedCoins);
  }

  try {
    const [awardedRaw, balanceRaw] = await awardDailyCoinsScript().exec(
      [markerKey, accountKey(userId)],
      [COIN_BALANCE_FIELD, String(normalizedCoins), String(DAILY_COIN_AWARD_TTL_SECONDS)],
    );

    const awarded = normalizeInteger(awardedRaw, 0) === 1;
    const coinBalance = normalizeInteger(balanceRaw, getFallbackCoinBalance(userId));

    DAILY_COIN_AWARD_FALLBACK_STORE.add(markerKey);
    setFallbackCoinBalance(userId, coinBalance);

    return {
      awarded,
      coinBalance,
    };
  } catch (error) {
    console.warn('Coin award storage falling back to in-memory state.', error);
    return awardDailyCoinsOnceFallback(dateKey, userId, normalizedCoins);
  }
}

export async function awardPromoCoinsOnce(
  promoCode: string,
  userId: string,
  coins: number,
): Promise<DailyCoinAwardResult> {
  const markerKey = promoCoinAwardKey(promoCode, userId);
  const normalizedCoins = normalizeCoinAmount(coins);

  if (!isKvConfigured()) {
    return awardPromoCoinsOnceFallback(promoCode, userId, normalizedCoins);
  }

  try {
    const [awardedRaw, balanceRaw] = await awardDailyCoinsScript().exec(
      [markerKey, accountKey(userId)],
      [COIN_BALANCE_FIELD, String(normalizedCoins), '0'],
    );

    const awarded = normalizeInteger(awardedRaw, 0) === 1;
    const coinBalance = normalizeInteger(balanceRaw, getFallbackCoinBalance(userId));

    PROMO_COIN_AWARD_FALLBACK_STORE.add(markerKey);
    setFallbackCoinBalance(userId, coinBalance);

    return {
      awarded,
      coinBalance,
    };
  } catch (error) {
    console.warn('Promo coin award storage falling back to in-memory state.', error);
    return awardPromoCoinsOnceFallback(promoCode, userId, normalizedCoins);
  }
}

function purchaseCosmeticFallback(userId: string, cosmetic: CosmeticDefinition): PurchaseCosmeticResult {
  const state = getFallbackAccountState(userId);

  if (state.ownedCosmeticIds.has(cosmetic.id)) {
    return {
      status: 'ALREADY_OWNED',
      account: accountPayloadFromState(state),
      purchasedCosmeticId: null,
    };
  }

  if (state.coinBalance < cosmetic.price) {
    return {
      status: 'INSUFFICIENT_COINS',
      account: accountPayloadFromState(state),
      purchasedCosmeticId: null,
    };
  }

  state.coinBalance -= cosmetic.price;
  state.ownedCosmeticIds.add(cosmetic.id);
  state.avatar = setEquippedCosmeticId(state.avatar, cosmetic.slot, cosmetic.id);
  setFallbackAccountState(userId, state);

  return {
    status: 'PURCHASED',
    account: accountPayloadFromState(state),
    purchasedCosmeticId: cosmetic.id,
  };
}

function grantCosmeticsFallback(userId: string, cosmeticIds: string[]): GrantCosmeticsResult {
  const state = getFallbackAccountState(userId);
  const grantedCosmeticIds: string[] = [];

  cosmeticIds.forEach((cosmeticId) => {
    if (!state.ownedCosmeticIds.has(cosmeticId)) {
      state.ownedCosmeticIds.add(cosmeticId);
      grantedCosmeticIds.push(cosmeticId);
    }
  });

  setFallbackAccountState(userId, state);

  return {
    account: accountPayloadFromState(state),
    grantedCosmeticIds,
  };
}

export async function purchaseUserCosmetic(
  userId: string,
  cosmetic: CosmeticDefinition,
): Promise<PurchaseCosmeticResult> {
  if (!isKvConfigured()) {
    return purchaseCosmeticFallback(userId, cosmetic);
  }

  try {
    const [statusRaw] = await purchaseCosmeticScript().exec(
      [accountKey(userId), ownedCosmeticsKey(userId)],
      [
        COIN_BALANCE_FIELD,
        equippedFieldForSlot(cosmetic.slot),
        cosmetic.id,
        String(cosmetic.price),
      ],
    );

    const status = normalizePurchaseStatus(statusRaw);
    const account = await getUserAccount(userId);

    return {
      status,
      account,
      purchasedCosmeticId: status === 'PURCHASED' ? cosmetic.id : null,
    };
  } catch (error) {
    console.warn('Cosmetic purchase storage falling back to in-memory state.', error);
    return purchaseCosmeticFallback(userId, cosmetic);
  }
}

export async function grantUserCosmetics(
  userId: string,
  cosmeticIds: string[],
): Promise<GrantCosmeticsResult> {
  const validCosmeticIds = getOrderedCosmeticIds(cosmeticIds);

  if (validCosmeticIds.length === 0) {
    return {
      account: await getUserAccount(userId),
      grantedCosmeticIds: [],
    };
  }

  if (!isKvConfigured()) {
    return grantCosmeticsFallback(userId, validCosmeticIds);
  }

  try {
    const grantedCosmeticIds = (
      await Promise.all(
        validCosmeticIds.map(async (cosmeticId) => {
          const addedRaw = await kv.sadd(ownedCosmeticsKey(userId), cosmeticId);
          return normalizeInteger(addedRaw, 0) > 0 ? cosmeticId : null;
        }),
      )
    ).filter((cosmeticId): cosmeticId is string => Boolean(cosmeticId));

    const account = await getUserAccount(userId);

    return {
      account,
      grantedCosmeticIds,
    };
  } catch (error) {
    console.warn('Cosmetic grant storage falling back to in-memory state.', error);
    return grantCosmeticsFallback(userId, validCosmeticIds);
  }
}

function equipCosmeticFallback(userId: string, slot: CosmeticSlot, cosmeticId: string | null) {
  const state = getFallbackAccountState(userId);

  if (cosmeticId && !state.ownedCosmeticIds.has(cosmeticId)) {
    return null;
  }

  state.avatar = setEquippedCosmeticId(state.avatar, slot, cosmeticId);
  setFallbackAccountState(userId, state);
  return accountPayloadFromState(state);
}

export async function equipUserCosmetic(userId: string, slot: CosmeticSlot, cosmeticId: string | null) {
  if (!isKvConfigured()) {
    return equipCosmeticFallback(userId, slot, cosmeticId);
  }

  try {
    if (cosmeticId) {
      const isOwnedRaw = await kv.sismember(ownedCosmeticsKey(userId), cosmeticId);
      const isOwned = Number(isOwnedRaw) === 1;

      if (!isOwned) {
        return null;
      }
    }

    await kv.hset(accountKey(userId), {
      [equippedFieldForSlot(slot)]: cosmeticId ?? '',
    });

    return getUserAccount(userId);
  } catch (error) {
    console.warn('Cosmetic equip storage falling back to in-memory state.', error);
    return equipCosmeticFallback(userId, slot, cosmeticId);
  }
}

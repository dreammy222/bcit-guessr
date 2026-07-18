import { SCHOOL } from '../config/school';
import { GENERIC_COSMETICS } from './cosmeticsPacks/generic';
import { UBC_COSMETICS } from './cosmeticsPacks/ubc';

export const COSMETIC_SLOTS = ['shirt', 'hat', 'glasses', 'moustache'] as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export interface CosmeticDefinition {
  id: string;
  name: string;
  slot: CosmeticSlot;
  price: number;
  assetPath: string;
  previewAssetPath?: string;
  bodyAssetPath?: string;
  leftSleeveAssetPath?: string;
  rightSleeveAssetPath?: string;
  hidesBaseHead?: boolean;
}

export interface AvatarState {
  equippedShirtId: string | null;
  equippedHatId: string | null;
  equippedGlassesId: string | null;
  equippedMoustacheId: string | null;
}

export interface AccountAvatarPayload {
  coinBalance: number;
  avatar: AvatarState;
  ownedCosmeticIds: string[];
}

export const BASE_AVATAR_BODY_ASSET_PATH = '/cosmetics/avatar/body.png';
export const BASE_AVATAR_SIT_BODY_ASSET_PATH = '/cosmetics/avatar/body_sit.png';
export const BASE_AVATAR_HEAD_ASSET_PATH = '/cosmetics/avatar/head.png';
export const BASE_AVATAR_LEFT_ARM_ASSET_PATH = '/cosmetics/avatar/larm.png';
export const BASE_AVATAR_RIGHT_ARM_ASSET_PATH = '/cosmetics/avatar/rarm.png';
export const AVATAR_ASPECT_RATIO = '427 / 584';

export const COSMETIC_PACKS: Record<string, CosmeticDefinition[]> = {
  ubc: UBC_COSMETICS,
};

const SCHOOL_PACK = COSMETIC_PACKS[SCHOOL.cosmeticsPackId] ?? [];

export const COSMETIC_CATALOG: CosmeticDefinition[] = [...SCHOOL_PACK, ...GENERIC_COSMETICS];

const COSMETIC_BY_ID = new Map(COSMETIC_CATALOG.map((cosmetic) => [cosmetic.id, cosmetic]));

export function createEmptyAvatarState(): AvatarState {
  return {
    equippedShirtId: null,
    equippedHatId: null,
    equippedGlassesId: null,
    equippedMoustacheId: null,
  };
}

export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
  return typeof value === 'string' && COSMETIC_SLOTS.includes(value as CosmeticSlot);
}

export function getCosmeticById(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return COSMETIC_BY_ID.get(id) ?? null;
}

export function getCosmeticsBySlot(slot: CosmeticSlot) {
  return COSMETIC_CATALOG.filter((cosmetic) => cosmetic.slot === slot);
}

export function getEquippedCosmeticId(avatar: AvatarState | null | undefined, slot: CosmeticSlot) {
  if (!avatar) {
    return null;
  }

  switch (slot) {
    case 'shirt':
      return avatar.equippedShirtId;
    case 'hat':
      return avatar.equippedHatId;
    case 'glasses':
      return avatar.equippedGlassesId;
    case 'moustache':
      return avatar.equippedMoustacheId;
  }

  return null;
}

export function setEquippedCosmeticId(avatar: AvatarState, slot: CosmeticSlot, cosmeticId: string | null): AvatarState {
  switch (slot) {
    case 'shirt':
      return {
        ...avatar,
        equippedShirtId: cosmeticId,
      };
    case 'hat':
      return {
        ...avatar,
        equippedHatId: cosmeticId,
      };
    case 'glasses':
      return {
        ...avatar,
        equippedGlassesId: cosmeticId,
      };
    case 'moustache':
      return {
        ...avatar,
        equippedMoustacheId: cosmeticId,
      };
  }

  throw new Error('Unsupported cosmetic slot');
}

export function resolveAvatarCosmetics(avatar: AvatarState | null | undefined) {
  const shirt = getCosmeticById(avatar?.equippedShirtId);
  const hat = getCosmeticById(avatar?.equippedHatId);
  const shouldRenderBaseHead = !hat?.hidesBaseHead;

  return {
    shirt,
    hat,
    glasses: shouldRenderBaseHead ? getCosmeticById(avatar?.equippedGlassesId) : null,
    moustache: shouldRenderBaseHead ? getCosmeticById(avatar?.equippedMoustacheId) : null,
    shouldRenderBaseHead,
  };
}

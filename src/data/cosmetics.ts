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

export const COSMETIC_CATALOG: CosmeticDefinition[] = [
  {
    id: 'ubc_hoodie',
    name: 'UBC Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/ubc_hoodie/ubc_hoodie.png',
    bodyAssetPath: '/cosmetics/shirts/ubc_hoodie/ubc_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/ubc_hoodie/ubc_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/ubc_hoodie/ubc_hoodie_rsleeve.png',
  },
  {
    id: 'sauder_hoodie',
    name: 'Sauder Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/sauder_hoodie/sauder_hoodie_body.png',
    previewAssetPath: '/cosmetics/shirts/sauder_hoodie/sauder_hoodie_icon.png',
    bodyAssetPath: '/cosmetics/shirts/sauder_hoodie/sauder_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/sauder_hoodie/sauder_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/sauder_hoodie/sauder_hoodie_rsleeve.png',
  },
  {
    id: 'sus_hoodie',
    name: 'Science Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/sus_hoodie/sus_hoodie_body.png',
    previewAssetPath: '/cosmetics/shirts/sus_hoodie/sus_hoodie_icon.png',
    bodyAssetPath: '/cosmetics/shirts/sus_hoodie/sus_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/sus_hoodie/sus_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/sus_hoodie/sus_hoodie_rsleeve.png',
  },
  {
    id: 'aus_hoodie',
    name: 'Arts Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/aus_hoodie/aus_hoodie_body.png',
    previewAssetPath: '/cosmetics/shirts/aus_hoodie/aus_hoodie_icon.png',
    bodyAssetPath: '/cosmetics/shirts/aus_hoodie/aus_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/aus_hoodie/aus_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/aus_hoodie/aus_hoodie_rsleeve.png',
  },
  {
    id: 'eus_hoodie',
    name: 'Engineering Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/eus_hoodie/eus_hoodie_body.png',
    previewAssetPath: '/cosmetics/shirts/eus_hoodie/eus_hoodie_icon.png',
    bodyAssetPath: '/cosmetics/shirts/eus_hoodie/eus_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/eus_hoodie/eus_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/eus_hoodie/eus_hoodie_rsleeve.png',
  },
  {
    id: 'pus_hoodie',
    name: 'Pharm Sci Hoodie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/pus_hoodie/pus_hoodie_body.png',
    previewAssetPath: '/cosmetics/shirts/pus_hoodie/pus_hoodie_icon.png',
    bodyAssetPath: '/cosmetics/shirts/pus_hoodie/pus_hoodie_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/pus_hoodie/pus_hoodie_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/pus_hoodie/pus_hoodie_rsleeve.png',
  },
  {
    id: 'suit',
    name: 'Suit and Tie',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/suit/suit_body.png',
    previewAssetPath: '/cosmetics/shirts/suit/suit_icon.png',
    bodyAssetPath: '/cosmetics/shirts/suit/suit_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/suit/suit_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/suit/suit_rsleeve.png',
  },
  {
    id: 'jacket',
    name: 'Jacket',
    slot: 'shirt',
    price: 5000,
    assetPath: '/cosmetics/shirts/jacket/jacket_body.png',
    previewAssetPath: '/cosmetics/shirts/jacket/jacket_icon.png',
    bodyAssetPath: '/cosmetics/shirts/jacket/jacket_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/jacket/jacket_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/jacket/jacket_rsleeve.png',
  },
  {
    id: 'hksa_shirt',
    name: 'HKSA Shirt',
    slot: 'shirt',
    price: 7000,
    assetPath: '/cosmetics/shirts/hksa_shirt/hksa_shirt_body.png',
    previewAssetPath: '/cosmetics/shirts/hksa_shirt/hksa_shirt_icon.png',
    bodyAssetPath: '/cosmetics/shirts/hksa_shirt/hksa_shirt_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/hksa_shirt/hksa_shirt_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/hksa_shirt/hksa_shirt_rsleeve.png',
  },
//   {
//     id: 'biztech',
//     name: 'Biztech Zip',
//     slot: 'shirt',
//     price: 7000,
//     assetPath: '/cosmetics/shirts/biztech/biztech_body.png',
//     previewAssetPath: '/cosmetics/shirts/biztech/biztech_icon.png',
//     bodyAssetPath: '/cosmetics/shirts/biztech/biztech_body.png',
//     leftSleeveAssetPath: '/cosmetics/shirts/biztech/biztech_lsleeve.png',
//     rightSleeveAssetPath: '/cosmetics/shirts/biztech/biztech_rsleeve.png',
//   },
//   {
//     id: 'cvc_shirt',
//     name: 'CVC Shirt',
//     slot: 'shirt',
//     price: 7000,
//     assetPath: '/cosmetics/shirts/cvc_shirt/cvc_shirt_body.png',
//     previewAssetPath: '/cosmetics/shirts/cvc_shirt/cvc_shirt_icon.png',
//     bodyAssetPath: '/cosmetics/shirts/cvc_shirt/cvc_shirt_body.png',
//     leftSleeveAssetPath: '/cosmetics/shirts/cvc_shirt/cvc_shirt_lsleeve.png',
//     rightSleeveAssetPath: '/cosmetics/shirts/cvc_shirt/cvc_shirt_rsleeve.png',
//   },
  {
    id: 'csa_shirt',
    name: 'CSA Shirt',
    slot: 'shirt',
    price: 7000,
    assetPath: '/cosmetics/shirts/csa_shirt/csa_shirt_body.png',
    previewAssetPath: '/cosmetics/shirts/csa_shirt/csa_shirt_icon.png',
    bodyAssetPath: '/cosmetics/shirts/csa_shirt/csa_shirt_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/csa_shirt/csa_shirt_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/csa_shirt/csa_shirt_rsleeve.png',
  },
  {
    id: 'bigway_shirt',
    name: 'Bigway Shirt',
    slot: 'shirt',
    price: 7000,
    assetPath: '/cosmetics/shirts/bigway_shirt/bigway_shirt_body.png',
    previewAssetPath: '/cosmetics/shirts/bigway_shirt/bigway_shirt_icon.png',
    bodyAssetPath: '/cosmetics/shirts/bigway_shirt/bigway_shirt_body.png',
    leftSleeveAssetPath: '/cosmetics/shirts/bigway_shirt/bigway_shirt_lsleeve.png',
    rightSleeveAssetPath: '/cosmetics/shirts/bigway_shirt/bigway_shirt_rsleeve.png',
  },
  {
    id: 'ubc_cap',
    name: 'UBC Cap',
    slot: 'hat',
    price: 5000,
    assetPath: '/cosmetics/hats/ubc_cap.png',
    previewAssetPath: '/cosmetics/hats/ubc_cap_icon.png',
  },
  {
    id: 'tophat',
    name: 'Top Hat',
    slot: 'hat',
    price: 5000,
    assetPath: '/cosmetics/hats/tophat.png',
    previewAssetPath: '/cosmetics/hats/tophat_icon.png',
  },
  {
    id: 'toque',
    name: 'Toque',
    slot: 'hat',
    price: 5000,
    assetPath: '/cosmetics/hats/toque.png',
    previewAssetPath: '/cosmetics/hats/toque_icon.png',
  },
  {
    id: 'bandana',
    name: 'Bandana',
    slot: 'hat',
    price: 5000,
    assetPath: '/cosmetics/hats/bandana.png',
    previewAssetPath: '/cosmetics/hats/bandana_icon.png',
  },
  {
    id: 'cowboy',
    name: 'Cowboy Hat',
    slot: 'hat',
    price: 5000,
    assetPath: '/cosmetics/hats/cowboy.png',
    previewAssetPath: '/cosmetics/hats/cowboy_icon.png',
  },
//   {
//     id: 'biztech_cap',
//     name: 'Biztech Cap',
//     slot: 'hat',
//     price: 7000,
//     assetPath: '/cosmetics/hats/biztech_cap.png',
//     previewAssetPath: '/cosmetics/hats/biztech_cap_icon.png',
//   },
//   {
//     id: 'cvc_cap',
//     name: 'CVC Cap',
//     slot: 'hat',
//     price: 7000,
//     assetPath: '/cosmetics/hats/cvc_cap.png',
//     previewAssetPath: '/cosmetics/hats/cvc_cap_icon.png',
//   },
  {
    id: 'snake_hat',
    name: 'Snake Hat',
    slot: 'hat',
    price: 8000,
    assetPath: '/cosmetics/hats/snake_hat.png',
    previewAssetPath: '/cosmetics/hats/snake_hat_icon.png',
  },
  {
    id: 'thunderbird_head',
    name: 'Thunderbird Head',
    slot: 'hat',
    price: 8000,
    assetPath: '/cosmetics/hats/thunderbird_head.png',
    previewAssetPath: '/cosmetics/hats/thunderbird_head_icon.png',
    hidesBaseHead: true,
  },
  {
    id: 'hksa_cap',
    name: 'HKSA Cap',
    slot: 'hat',
    price: 7000,
    assetPath: '/cosmetics/hats/hksa_cap.png',
    previewAssetPath: '/cosmetics/hats/hksa_cap_icon.png',
  },
  {
    id: 'glasses',
    name: 'Glasses',
    slot: 'glasses',
    price: 5000,
    assetPath: '/cosmetics/glasses/glasses.png',
    previewAssetPath: '/cosmetics/glasses/glasses_icon.png',
  },
  {
    id: 'sunglasses',
    name: 'Sunglasses',
    slot: 'glasses',
    price: 5000,
    assetPath: '/cosmetics/glasses/sunglasses.png',
    previewAssetPath: '/cosmetics/glasses/sunglasses_icon.png',
  },
  {
    id: 'monocle',
    name: 'Monocle',
    slot: 'glasses',
    price: 5000,
    assetPath: '/cosmetics/glasses/monocle.png',
    previewAssetPath: '/cosmetics/glasses/monocle_icon.png',
  },
  {
    id: 'money_glasses',
    name: 'Money Glasses',
    slot: 'glasses',
    price: 5000,
    assetPath: '/cosmetics/glasses/money_glasses.png',
    previewAssetPath: '/cosmetics/glasses/money_glasses_icon.png',
  },
  {
    id: 'eyepatch',
    name: 'Eyepatch',
    slot: 'glasses',
    price: 5000,
    assetPath: '/cosmetics/glasses/eyepatch.png',
    previewAssetPath: '/cosmetics/glasses/eyepatch_icon.png',
  },
  {
    id: 'moustache',
    name: 'Moustache',
    slot: 'moustache',
    price: 5000,
    assetPath: '/cosmetics/moustache/moustache.png',
    previewAssetPath: '/cosmetics/moustache/moustache_icon.png',
  },
  {
    id: 'beard',
    name: 'Beard',
    slot: 'moustache',
    price: 5000,
    assetPath: '/cosmetics/moustache/beard.png',
    previewAssetPath: '/cosmetics/moustache/beard_icon.png',
  },
];

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

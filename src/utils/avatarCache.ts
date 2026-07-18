import type { AvatarState } from '../data/cosmetics';

const AVATAR_CACHE_KEY = 'ubc_guessr_equipped_avatar';

export function isAvatarState(value: unknown): value is AvatarState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const avatar = value as Partial<AvatarState>;

  return (
    (typeof avatar.equippedShirtId === 'string' || avatar.equippedShirtId === null) &&
    (typeof avatar.equippedHatId === 'string' || avatar.equippedHatId === null) &&
    (typeof avatar.equippedGlassesId === 'string' || avatar.equippedGlassesId === null) &&
    (typeof avatar.equippedMoustacheId === 'string' || avatar.equippedMoustacheId === null)
  );
}

export function readCachedAvatar() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawAvatar = window.sessionStorage.getItem(AVATAR_CACHE_KEY);
  if (!rawAvatar) {
    return null;
  }

  try {
    const parsedAvatar = JSON.parse(rawAvatar);

    if (!isAvatarState(parsedAvatar)) {
      window.sessionStorage.removeItem(AVATAR_CACHE_KEY);
      return null;
    }

    return parsedAvatar;
  } catch {
    window.sessionStorage.removeItem(AVATAR_CACHE_KEY);
    return null;
  }
}

export function writeCachedAvatar(avatar: AvatarState | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!avatar) {
    window.sessionStorage.removeItem(AVATAR_CACHE_KEY);
    return;
  }

  window.sessionStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(avatar));
}

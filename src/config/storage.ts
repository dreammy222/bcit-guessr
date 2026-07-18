import { SCHOOL } from './school';

/**
 * Builds a namespaced client storage key: `${storagePrefix}_${suffix}`.
 * Suffixes preserve the pre-template literal tails, so a school with
 * storagePrefix 'ubc' produces byte-identical keys to the original app
 * (e.g. storageKey('party_guest_token') === 'ubc_party_guest_token').
 */
export function storageKey(suffix: string) {
  return `${SCHOOL.storagePrefix}_${suffix}`;
}

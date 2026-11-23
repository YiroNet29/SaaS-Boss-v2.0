/**
 * Links into the separate vault app. StackTrack stores only references (item ids), never secrets.
 */

/** The made-up address workspaces used to get by default. It counts as "no vault set". */
export const OLD_PLACEHOLDER_VAULT_URL = 'https://vault.internal.net';

/** The vault's address without a trailing slash, or '' when none is set (or it isn't an http(s) address). */
export function vaultUrl(base: string | undefined | null): string {
  const v = (base ?? '').trim().replace(/\/+$/, '');
  if (!v || v === OLD_PLACEHOLDER_VAULT_URL) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : '';
  } catch {
    return '';
  }
}

/** A link that opens one key in the vault, or null when no vault address is set. */
export function vaultItemUrl(base: string | undefined | null, itemId: string): string | null {
  const b = vaultUrl(base);
  return b && itemId ? `${b}/vault/api-keys/${encodeURIComponent(itemId)}` : null;
}

/**
 * Import token — a short-lived, scope-narrowed credential for the agent's local
 * import helper. The MCP connection may be OAuth, so the real token must never
 * reach the shell; the helper gets a time-limited, narrowed ticket instead.
 *
 * Shape: `imp1.{b64url(userId)}.{expEpochSec}.{b64url(hmacSha256(secret, userId.exp))}`
 * Stateless (HMAC self-verifies, nothing persisted), secret=BETTER_AUTH_SECRET.
 * Accepted by a single endpoint, /api/studio/media, whose route allowlists only the
 * helper's narrow local-relay and audio actions. Local visual bytes never receive a
 * cloud-upload capability.
 */

const VERSION = 'imp1';
export const IMPORT_TOKEN_TTL_SEC = 1800; // 30 minutes

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(payload: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured (import tokens are signed with it)');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createImportToken(userId: string, ttlSec = IMPORT_TOKEN_TTL_SEC): Promise<{ token: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await hmac(`${userId}.${exp}`);
  return { token: `${VERSION}.${b64url(new TextEncoder().encode(userId))}.${exp}.${sig}`, expiresAt: exp };
}

export type ImportTokenVerdict = { ok: true; userId: string } | { ok: false; reason: 'expired' | 'invalid' };

/** Verify the token. Expiry is only reported for tokens whose signature checks out —
 *  a forged token must read as `invalid`, never leak whether its timestamp was plausible. */
export async function verifyImportToken(token: string): Promise<ImportTokenVerdict> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return { ok: false, reason: 'invalid' };
  try {
    const userId = b64urlDecode(parts[1]!);
    const exp = Number(parts[2]);
    if (!userId || !Number.isFinite(exp)) return { ok: false, reason: 'invalid' };
    const expect = await hmac(`${userId}.${exp}`);
    if (expect !== parts[3]) return { ok: false, reason: 'invalid' };
    if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
    return { ok: true, userId };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Import token — a short-lived, scope-narrowed credential for the agent's local
 * import helper. The MCP connection may be OAuth, so the real token must never
 * reach the shell; the helper gets a time-limited, narrowed ticket instead.
 *
 * Shape: `imp1.{b64url(userId)}.{expEpochSec}.{b64url(hmacSha256(secret, userId.exp))}`
 * Stateless (HMAC self-verifies, nothing persisted), secret=BETTER_AUTH_SECRET.
 * Accepted by a single endpoint, /api/studio/media (four actions:
 * put/put-audio/asr/register — exactly what the helper needs).
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

/** Verify the token; returns userId if valid, null if invalid/expired. */
export async function verifyImportToken(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const userId = b64urlDecode(parts[1]!);
    const exp = Number(parts[2]);
    if (!userId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
    const expect = await hmac(`${userId}.${exp}`);
    return expect === parts[3] ? userId : null;
  } catch {
    return null;
  }
}

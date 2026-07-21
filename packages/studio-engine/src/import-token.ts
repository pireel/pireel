/**
 * 导入短令牌 —— agent 本地导入 helper 的临时凭证(对标 a reference transcript editor 的 30 分钟
 * import token:MCP 连接可能是 OAuth,token 不能也不该交给 shell;helper 只拿
 * 一张范围收窄、限时的票)。
 *
 * 形态:`imp1.{b64url(userId)}.{expEpochSec}.{b64url(hmacSha256(secret, userId.exp))}`
 * 无状态(HMAC 自校验,不落库),secret=BETTER_AUTH_SECRET。只被 /api/studio/media
 * 一个端点接受(put/put-audio/asr/register 四个动作,正好覆盖 helper 的全部所需)。
 */

const VERSION = 'imp1';
export const IMPORT_TOKEN_TTL_SEC = 1800; // 30 分钟

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(payload: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET 未配置(导入令牌需要它签名)');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createImportToken(userId: string, ttlSec = IMPORT_TOKEN_TTL_SEC): Promise<{ token: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await hmac(`${userId}.${exp}`);
  return { token: `${VERSION}.${b64url(new TextEncoder().encode(userId))}.${exp}.${sig}`, expiresAt: exp };
}

/** 校验令牌;有效返回 userId,无效/过期返回 null。 */
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

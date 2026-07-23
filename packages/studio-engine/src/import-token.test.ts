import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createImportToken, verifyImportToken } from './import-token';

describe('导入短令牌(HMAC 自校验,无状态)', () => {
  const prev = process.env.BETTER_AUTH_SECRET;
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'test-secret';
  });
  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = prev;
  });
  it('roundtrip:签发→校验回 userId', async () => {
    const { token } = await createImportToken('user-1');
    expect(await verifyImportToken(token)).toEqual({ ok: true, userId: 'user-1' });
  });
  it('过期报 expired(签名合法才报,伪造件不泄露时间窗)', async () => {
    const { token: expired } = await createImportToken('user-1', -10);
    expect(await verifyImportToken(expired)).toEqual({ ok: false, reason: 'expired' });
    // 同样过期但签名被篡改 → invalid,不是 expired
    expect(await verifyImportToken(expired.slice(0, -2) + 'xx')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('篡改/换密钥/格式坏都拒绝为 invalid', async () => {
    const { token } = await createImportToken('user-1');
    expect(await verifyImportToken(token.slice(0, -2) + 'xx')).toEqual({ ok: false, reason: 'invalid' });
    process.env.BETTER_AUTH_SECRET = 'other-secret';
    expect(await verifyImportToken(token)).toEqual({ ok: false, reason: 'invalid' });
    expect(await verifyImportToken('imp1.garbage')).toEqual({ ok: false, reason: 'invalid' });
  });
});

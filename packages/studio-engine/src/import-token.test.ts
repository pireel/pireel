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
    expect(await verifyImportToken(token)).toBe('user-1');
  });
  it('过期/篡改/换密钥都拒绝', async () => {
    const { token: expired } = await createImportToken('user-1', -10);
    expect(await verifyImportToken(expired)).toBeNull();
    const { token } = await createImportToken('user-1');
    expect(await verifyImportToken(token.slice(0, -2) + 'xx')).toBeNull();
    process.env.BETTER_AUTH_SECRET = 'other-secret';
    expect(await verifyImportToken(token)).toBeNull();
    expect(await verifyImportToken('imp1.garbage')).toBeNull();
  });
});

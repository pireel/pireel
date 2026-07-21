/** studio 源视频在 R2 字节汇合点的内容寻址 key(单一来源:presign 路由与
 *  import_media 登记必须同一推导,否则 agent 传的字节浏览器找不回)。 */
export async function studioMediaKey(userId: string, sig: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `studio-src/${userId}/${hex}`;
}

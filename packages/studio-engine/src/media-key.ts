/** Content-addressed key for a studio source video at the R2 byte rendezvous (single
 *  source: the presign route and import_media registration must derive it identically,
 *  or the browser can't retrieve the bytes the agent uploaded). */
export async function studioMediaKey(userId: string, sig: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `studio-src/${userId}/${hex}`;
}

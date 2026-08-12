const LOCAL_IMAGE_PREFIX = 'pireel-local-image:';

const encodeLocatorSig = (sig: string) => encodeURIComponent(sig).replace(/[!'()*]/g, (char) =>
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Persist a device-local image by identity, never by an ephemeral blob URL or cloud URL. */
export function localImageLocator(sig: string): string {
  return `${LOCAL_IMAGE_PREFIX}${encodeLocatorSig(sig)}`;
}

/** Read a device-local image identity from persisted block markup. */
export function parseLocalImageLocator(value: string | null | undefined): string | null {
  if (!value?.startsWith(LOCAL_IMAGE_PREFIX)) return null;
  const encoded = value.slice(LOCAL_IMAGE_PREFIX.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Find every device-local image referenced by custom block HTML. */
export function localImageLocatorSigs(markup: string): string[] {
  const out = new Set<string>();
  const pattern = /pireel-local-image:[^\s"'<>)]*/g;
  for (const match of markup.matchAll(pattern)) {
    const sig = parseLocalImageLocator(match[0]);
    if (sig) out.add(sig);
  }
  return [...out];
}

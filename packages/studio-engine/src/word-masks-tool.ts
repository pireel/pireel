/** Shared parsing/summary for the mask_words tool (browser runner + offline executor). */
import type { DocumentAddressedWord } from './editor-document/transcript-address';
import { DEFAULT_MASK_TEXT, type WordMaskPatch } from './word-masks';

export { applyWordMasks } from './word-masks';

export function parseMaskWordsInput(input: Record<string, unknown>): { ids: string[]; patch: WordMaskPatch } | { error: string } {
  const ids = Array.isArray(input.wordIds) ? [...new Set(input.wordIds.map(String))].filter(Boolean) : [];
  if (!ids.length) return { error: 'wordIds must contain at least one id from list_words' };
  const patch: WordMaskPatch = {};
  if (input.audio !== undefined) {
    if (input.audio === 'beep' || input.audio === 'mute') patch.audio = input.audio;
    else if (input.audio === 'original' || input.audio === null) patch.audio = null;
    else return { error: "audio must be 'beep', 'mute' or 'original'" };
  }
  if (input.caption !== undefined) {
    if (input.caption === 'original' || input.caption === null) patch.text = null;
    else if (typeof input.caption === 'string') patch.text = input.caption.trim() || DEFAULT_MASK_TEXT;
    else return { error: "caption must be a string or 'original'" };
  }
  // The product's default replacement is the censor beep (what "消音 / bleep" means in the studio UI).
  if (patch.audio === undefined && patch.text === undefined) patch.audio = 'beep';
  return { ids, patch };
}

export function groupWordsByAsset(words: readonly DocumentAddressedWord[]): Map<string, { sentenceIndex: number; wordIndex: number }[]> {
  const out = new Map<string, { sentenceIndex: number; wordIndex: number }[]>();
  for (const word of words) out.set(word.assetId, [...(out.get(word.assetId) ?? []), { sentenceIndex: word.sentenceIndex, wordIndex: word.wordIndex }]);
  return out;
}

export function maskWordsSummary(count: number, patch: WordMaskPatch): string {
  const parts: string[] = [];
  if (patch.audio === 'beep') parts.push('bleeped');
  else if (patch.audio === 'mute') parts.push('muted');
  else if (patch.audio === null) parts.push('sound restored');
  if (typeof patch.text === 'string') parts.push(`caption shows ${patch.text}`);
  else if (patch.text === null) parts.push('caption restored');
  return `${count} word${count === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

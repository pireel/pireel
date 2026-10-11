/**
 * Hesitation fillers a speech cleanup removes: the word alone, with any trailing punctuation
 * (full- or half-width). Sentence particles that carry tone (啊/呢/吧) are left alone — cutting
 * them changes what was said.
 */
const FILLER_WORD = /^(?:嗯+|呃+|唔+|额+|诶+|欸+|哦+|噢+|哎+|唉+|um+|uh+|erm*|emm+|hmm+)[\p{P}\s]*$/iu;

export function isFillerWord(text: string): boolean {
  return FILLER_WORD.test(text.trim());
}

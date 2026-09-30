import { normalizeErasureOptions } from './subtitle-removal';
import { sceneLanguage } from './scene-languages';
import type { CaptionTaskRecord } from './scene-project';
import type { CaptionTaskOptions } from './caption-task';
import { dubbingSpeakers, dubbingTurns, dubbingVoiceFor, splitDubbingScript } from './dubbing-task';

export interface SceneCreditInput {
  durationSec: number; asr: boolean; translation: boolean; emphasis: boolean; lipSync: boolean;
  subtitleRemoval?: boolean; erasureKind?: import('./subtitle-removal').ErasureKind; erasureTier?: import('./erasure-pricing').ErasureTier; erasureWidth?: number; erasureHeight?: number; sfxPlanning?: boolean; brollFrames?: number; sourceTokens?: number; asrPasses?: number;
  speech: { voiceId: string; minUnits: number; maxUnits: number; maxChunks: number; estimatedUnits?: number; estimatedChunks?: number }[];
}
export interface SceneCreditEstimate {
  min: number; max: number; estimate: number; durationBased: boolean;
  sfxGenerationUnitCredits?: number;
  erasure?: { tier: import('./erasure-pricing').ErasureTier; baseCnyPerMinute: number; cnyPerCredit: number; costCny: number; prechargeCredits: number; outputFpsCap: number; outputResolution: string };
  items: { kind: 'asr' | 'translation' | 'emphasis' | 'speech' | 'lipSync' | 'visual' | 'matching' | 'sfx' | 'subtitleRemoval'; min: number; max: number; estimate: number }[];
}
const units = (text: string) => [...text].reduce((sum, char) => sum + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
/** Compact usage hints for a read-only estimate, never authorization or actual billing input. */
export function sceneCreditInput(task: CaptionTaskRecord, options: CaptionTaskOptions, reuseCompleted = true): SceneCreditInput {
  const transcript = task.transcript ?? [];
  const source = transcript.map((segment) => segment.text).join('\n');
  const input: SceneCreditInput = { durationSec: task.durationSec, asr: !reuseCompleted || !transcript.length, translation: false, emphasis: false, lipSync: false, speech: [], ...(source ? { sourceTokens: Math.max([...source].length, Math.ceil(new TextEncoder().encode(source).byteLength / 2)) } : {}) };
  if (task.scene === 'subtitle-removal') { input.asr = false; input.subtitleRemoval = true; input.erasureKind = options.subtitleRemoval?.kind ?? 'subtitles'; input.erasureTier = normalizeErasureOptions(options.subtitleRemoval).tier; input.erasureWidth = task.width; input.erasureHeight = task.height; return input; }
  if (task.scene === 'sfx') { input.sfxPlanning = !!options.sfx && 'density' in options.sfx; input.emphasis = !!options.sfx && 'captions' in options.sfx && options.sfx.captions && !!options.highlights; return input; }
  if ((task.scene === 'broll' || task.scene === 'pip' || task.scene === 'ugc-ad')) {
    input.brollFrames = (options.broll?.assets ?? []).reduce((sum, a) => sum + (a.kind === 'image' ? 1 : 8), 0);
    input.emphasis = !!options.broll?.captions && !!options.highlights;
    return input;
  }
  if (task.scene !== 'dubbing') {
    input.translation = !!options.translationLanguage && !(reuseCompleted && task.stage === 'completed' && task.translation?.language === options.translationLanguage && task.options.shortenPauses === options.shortenPauses);
    input.emphasis = !!options.highlights;
    return input;
  }
  const config = options.dubbing;
  if (!config) return input;
  input.lipSync = config.lipSync;
  const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
  // Mirrors the runner's plan: every speaker's lines are timed turns; only a hand-written whole
  // script (single speaker) is one block.
  const scripted = !multiple && !!config.script?.trim();
  const lined = !scripted && transcript.some((segment) => segment.text.trim());
  const turns = lined ? dubbingTurns(transcript, task.durationSec) : [];
  const cachedTranslation = task.dubbing?.language === config.language && (lined ? task.dubbing.turnsKey === JSON.stringify(turns) && task.dubbing.translatedTurns?.length === turns.length : task.dubbing.sourceText === source && !!task.dubbing.translatedText);
  input.translation = !scripted && (!reuseCompleted || !cachedTranslation);
  const groups: { text?: string; voiceId: string; group: number; start: number; end: number; source?: string }[] = lined ? turns.map((turn, index) => ({ text: config.turnScripts?.[turn.id] ?? (cachedTranslation ? task.dubbing!.translatedTurns![index] : undefined), voiceId: dubbingVoiceFor(turn.speaker, speakers, config), group: index, start: turn.start, end: turn.end, source: turn.text })) : [{ text: config.script?.trim() || (cachedTranslation ? task.dubbing?.translatedText : undefined), voiceId: config.voiceId, group: 0, start: transcript.length ? Math.max(0, Math.min(...transcript.map((row) => row.start))) : 0, end: transcript.length ? Math.min(task.durationSec, Math.max(...transcript.map((row) => row.end))) : task.durationSec }];
  const known = groups.every((group) => !!group.text?.trim());
  const plan = known ? groups.flatMap((group) => splitDubbingScript(group.text!).map((text) => ({ ...group, text }))) : [];
  // Keep the exact signature used by the runner; JSON property order is intentional.
  const orderedPlan = plan.map(({ text, voiceId, group, start, end, source }) => lined ? { text, voiceId, group, start, end, source } : { text, voiceId, group, start, end });
  const legacySignature = known ? lined ? JSON.stringify(plan.map(({ text, voiceId, group, start, end }) => ({ text, voiceId, group, start, end }))) : JSON.stringify([groups[0].text, config.voiceId]) : '';
  const signature = known ? lined ? JSON.stringify([config.language, orderedPlan]) : JSON.stringify([groups[0].text, config.voiceId, config.language]) : '';
  const legacyLanguageMatches = task.dubbing?.language === config.language;
  const reuse = reuseCompleted && !!signature && (task.dubbing?.speechSignature === signature || (legacyLanguageMatches && task.dubbing?.speechSignature === legacySignature));
  if (known) {
    input.speech = plan.flatMap((part, index) => ((reuse && task.dubbing?.speechParts?.[index]) || (reuseCompleted && plan.length === 1 && legacyLanguageMatches && (task.dubbing?.speech?.signature === signature || task.dubbing?.speech?.signature === legacySignature))) ? [] : [{ voiceId: part.voiceId, minUnits: units(part.text.trim()), maxUnits: units(part.text.trim()), maxChunks: 1, estimatedUnits: units(part.text.trim()), estimatedChunks: 1 }]);
  } else {
    // Budget assumptions, not calibrated speech statistics or a spending cap:
    // English/default: 150 words × 6 characters; Mandarin/Cantonese: 300 Han characters × 2.
    const code = sceneLanguage(config.language)?.code;
    const unitsPerMinute = code === 'zh' || code === 'yue' ? 600 : 900;
    input.speech = groups.map((group) => {
      const minutes = Math.max(1, group.end - group.start) / 60;
      const minUnits = Math.max(1, Math.ceil(minutes * 400)); const maxUnits = Math.max(minUnits, Math.ceil(minutes * 1400));
      const estimatedUnits = Math.ceil(minutes * unitsPerMinute);
      const estimatedCharacters = estimatedUnits / (code === 'zh' || code === 'yue' ? 2 : 1);
      return { voiceId: group.voiceId, minUnits, maxUnits, maxChunks: Math.max(1, Math.ceil(maxUnits / 2000)), estimatedUnits, estimatedChunks: Math.max(1, Math.ceil(estimatedCharacters / 4000)) };
    });
  }
  if (config.captions) {
    input.emphasis = !!options.highlights;
    if (!(reuse && task.dubbing?.captionSignature === signature && task.dubbing.captionTranscript?.length)) {
      input.asrPasses = input.asr ? 2 : 1; input.asr = true;
    }
  }
  return input;
}

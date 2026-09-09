import type { CaptionTaskRecord } from './scene-project';
import type { CaptionTaskOptions } from './caption-task';
import { dubbingSpeakers, dubbingTurns, dubbingVoiceFor, splitDubbingScript } from './dubbing-task';

export interface SceneCreditInput {
  durationSec: number; asr: boolean; translation: boolean; emphasis: boolean; lipSync: boolean;
  sourceTokens?: number;
  speech: { voiceId: string; minUnits: number; maxUnits: number; maxChunks: number }[];
}
export interface SceneCreditEstimate {
  min: number; max: number;
  items: { kind: 'asr' | 'translation' | 'emphasis' | 'speech' | 'lipSync'; min: number; max: number }[];
}
const units = (text: string) => [...text].reduce((sum, char) => sum + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
/** Compact usage hints for a read-only estimate, never authorization or actual billing input. */
export function sceneCreditInput(task: CaptionTaskRecord, options: CaptionTaskOptions): SceneCreditInput {
  const transcript = task.transcript ?? [];
  const source = transcript.map((segment) => segment.text).join('\n');
  const input: SceneCreditInput = { durationSec: task.durationSec, asr: !transcript.length, translation: false, emphasis: false, lipSync: false, speech: [], ...(source ? { sourceTokens: Math.max([...source].length, Math.ceil(new TextEncoder().encode(source).byteLength / 2)) } : {}) };
  if (task.scene !== 'dubbing') {
    input.translation = !!options.translationLanguage && !(task.stage === 'completed' && task.translation?.language === options.translationLanguage && task.options.shortenPauses === options.shortenPauses);
    input.emphasis = options.presetId === 'keywords';
    return input;
  }
  const config = options.dubbing;
  if (!config) return input;
  input.lipSync = config.lipSync;
  const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
  const turns = multiple ? dubbingTurns(transcript, task.durationSec) : [];
  const cachedTranslation = task.dubbing?.language === config.language && (multiple ? task.dubbing.turnsKey === JSON.stringify(turns) && task.dubbing.translatedTurns?.length === turns.length : task.dubbing.sourceText === source && !!task.dubbing.translatedText);
  input.translation = multiple ? !cachedTranslation : !config.script?.trim() && !cachedTranslation;
  const groups = multiple ? turns.map((turn, index) => ({ text: config.turnScripts?.[turn.id] ?? (cachedTranslation ? task.dubbing!.translatedTurns![index] : undefined), voiceId: dubbingVoiceFor(turn.speaker, speakers, config), group: index, start: turn.start, end: turn.end })) : [{ text: config.script?.trim() || (cachedTranslation ? task.dubbing?.translatedText : undefined), voiceId: config.voiceId, group: 0, start: transcript.length ? Math.max(0, Math.min(...transcript.map((row) => row.start))) : 0, end: transcript.length ? Math.min(task.durationSec, Math.max(...transcript.map((row) => row.end))) : task.durationSec }];
  const known = groups.every((group) => !!group.text?.trim());
  const plan = known ? groups.flatMap((group) => splitDubbingScript(group.text!).map((text) => ({ ...group, text }))) : [];
  // Keep the exact signature used by the runner; JSON property order is intentional.
  const orderedPlan = plan.map(({ text, voiceId, group, start, end }) => ({ text, voiceId, group, start, end }));
  const legacySignature = known ? multiple ? JSON.stringify(orderedPlan) : JSON.stringify([groups[0].text, config.voiceId]) : '';
  const signature = known ? multiple ? JSON.stringify([config.language, orderedPlan]) : JSON.stringify([groups[0].text, config.voiceId, config.language]) : '';
  const legacyLanguageMatches = task.dubbing?.language === config.language;
  const reuse = !!signature && (task.dubbing?.speechSignature === signature || (legacyLanguageMatches && task.dubbing?.speechSignature === legacySignature));
  if (known) {
    input.speech = plan.flatMap((part, index) => ((reuse && task.dubbing?.speechParts?.[index]) || (plan.length === 1 && legacyLanguageMatches && (task.dubbing?.speech?.signature === signature || task.dubbing?.speech?.signature === legacySignature))) ? [] : [{ voiceId: part.voiceId, minUnits: units(part.text.trim()), maxUnits: units(part.text.trim()), maxChunks: 1 }]);
  } else {
    // Broad duration heuristic, not an industry rate or an upper spending cap.
    input.speech = groups.map((group) => {
      const minutes = Math.max(1, group.end - group.start) / 60;
      const minUnits = Math.max(1, Math.ceil(minutes * 400)); const maxUnits = Math.max(minUnits, Math.ceil(minutes * 1400));
      return { voiceId: group.voiceId, minUnits, maxUnits, maxChunks: Math.max(1, Math.ceil(maxUnits / 2000)) };
    });
  }
  return input;
}

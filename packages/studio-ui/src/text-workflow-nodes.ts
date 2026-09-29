import { detectLang } from '@pireel/studio-engine/caption-fx';
import { DUBBING_LANGUAGES } from '@pireel/studio-engine/scene-languages';
import { dubbingSpeakers, dubbingTurns, dubbingSpeechWindow, dubbingVoiceFor, splitDubbingScript, type DubbingOptions } from '@pireel/studio-engine/dubbing-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { TEXT_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-text-contracts';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { SceneNode, SceneMedia, SceneWorkflowHost } from './scene-workflow-runtime';
import { translateTextRows } from './caption-translation-operation';
export interface TextUnit { id: string; text: string }
export interface TextTranslation { sourceKey: string; language: string; items: TextUnit[] }
interface SpeechSource { sourceText: string; multiple: boolean; turnsKey: string; speakers: ReturnType<typeof dubbingSpeakers>; turns: ReturnType<typeof dubbingTurns> }
export function textWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: TEXT_WORKFLOW_CAPABILITIES.find(c => c.id === id)!, ...body });
  return [
    node('data.value', { async execute(args) { return { value: args.value }; } }),
    node('speech.prepare', { async execute(args) {
      const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
      const media = store.read<SceneMedia>(args.media, 'media');
      const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
      const window = dubbingSpeechWindow(transcript, media.durationSec);
      const sourceText = transcript.map(segment => segment.text).join('\n');
      // Lines stay at their own moments; only a hand-written whole script is one block over the speech window.
      const turns = !args.script ? dubbingTurns(transcript, media.durationSec) : [{ id: 'turn-0', speaker: speakers[0].id, text: String(args.script), start: window.start, end: window.end }];
      if (multiple && args.script) throw new Error('多位说话人请在配音规划中逐段配置稿件。');
      return { units: workflowJson(turns.map(turn => ({ id: turn.id, text: turn.text }))), source: workflowJson({ sourceText, speakers, multiple, turns, turnsKey: JSON.stringify(turns) }), translate: !args.script, language: DUBBING_LANGUAGES.find(language => language.code === (args.script ? detectLang(String(args.script)) : transcript.find(segment => segment.lang)?.lang?.split('-')[0] ?? detectLang(sourceText)))?.id ?? 'English' };
    } }),
    node('text.translate', { stage: 'translating', async execute(args, context) {
      const units = args.units as unknown as TextUnit[];
      if (!units.length || new Set(units.map(unit => unit.id)).size !== units.length) throw new Error('文本单元为空或 ID 重复。');
      let items = structuredClone(units);
      if (args.enabled !== false) {
        const translate = studioProviders().translate; if (!translate) throw new Error('翻译服务尚未连接。');
        const chunks = units.flatMap(unit => (unit.text.match(/[^\n]{1,350}/gu) ?? []).map(text => ({ id: unit.id, text })));
        const rows = await translateTextRows(chunks.map(chunk => chunk.text), String(args.language), (rows, language) => translate(rows, language, { signal: host.hooks.signal, onUsage: context.recordUsage }), host.check, (done, total) => host.report('translating', { status: 'running', fraction: done / total, done, total }));
        const values = new Map(rows.map(row => [row.index, row.text.trim()]));
        items = units.map(unit => ({ id: unit.id, text: chunks.flatMap((chunk, index) => chunk.id === unit.id ? [values.get(index)!] : []).join('\n') }));
      }
      const value: TextTranslation = { sourceKey: await artifactVersion(units), language: String(args.language), items };
      return { value: workflowJson(value), translation: workflowJson(await store.put('translation', 'text', value)) };
    } }),
    node('speech.plan', { async execute(args) {
      const source = args.source as unknown as SpeechSource;
      const units = args.units as unknown as TextUnit[];
      const translation = args.translation as unknown as TextTranslation;
      const config = { ...(args.config as unknown as DubbingOptions), language: translation.language };
      if (translation.sourceKey !== await artifactVersion(units) || translation.items.length !== units.length || new Set(translation.items.map(item => item.id)).size !== units.length) throw new Error('译文与原文或目标语言不匹配。');
      if (!config.voiceId || source.speakers.some(speaker => !dubbingVoiceFor(speaker.id, source.speakers, config))) throw new Error('请为每位说话人选择音色。');
      const translated = source.turns.map(turn => translation.items.find(item => item.id === turn.id)?.text);
      if (translated.some(text => !text?.trim())) throw new Error('译文缺少发言单元。');
      const edited = source.turns.map((turn, index) => (config.turnScripts?.[turn.id] ?? translated[index]!).trim());
      const text = edited.join('\n'); splitDubbingScript(text);
      const parts = source.turns.flatMap((turn, index) => splitDubbingScript(edited[index]).map(text => ({ text, voiceId: dubbingVoiceFor(turn.speaker, source.speakers, config), group: index, start: turn.start, end: turn.end })));
      const value = { text, language: config.language, sourceText: source.sourceText, ...(source.multiple ? { translatedTurns: translated, turnsKey: source.turnsKey } : {}), parts, signature: source.multiple ? JSON.stringify([config.language, parts]) : JSON.stringify([text, config.voiceId, config.language]) };
      return { value: workflowJson(value), plan: workflowJson(await store.put('speech-plan', 'dubbing', value)) };
    }, project: outputs => { const value = outputs.value as unknown as { text: string; language: string; sourceText: string }; return { dubbing: { ...host.task.dubbing, translatedText: value.text, language: value.language, sourceText: value.sourceText } }; } }),
  ];
}

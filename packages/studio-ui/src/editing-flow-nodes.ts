import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyCaptionDocumentEdit } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { EDITING_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/editing-node-contracts';
import { editingDuration, editingSpeechCues, mergeEditingCuts } from '@pireel/studio-engine/editing-operations';
import { DUBBING_LANGUAGES } from '@pireel/studio-engine/dubbing-task';
import type { CaptionPlan } from './caption-workflow-artifacts';
import type { TextTranslation } from './text-workflow-nodes';
import type { SceneNode, SceneWorkflowHost, SceneMedia } from './scene-workflow-runtime';
const unitsOf = (plan: CaptionPlan) => plan.units.map(unit => ({ id: unit.id, text: unit.text.split(' | ').join(' ') }));
export function editingFlowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: EDITING_WORKFLOW_CAPABILITIES.find(cap => cap.id === id)!, ...body });
  const documentOutput = async (document: EditorDocumentV2) => ({ document: workflowJson(await store.put('document', 'flow-document', document)) });
  return [
    node('flow.units', { async execute(args) { return { units: workflowJson(unitsOf(store.read<CaptionPlan>(args.plan, 'caption-plan'))) }; } }),
    node('flow.translation', { async execute(args) {
      const plan = store.read<CaptionPlan>(args.plan, 'caption-plan'); const value = args.value as unknown as TextTranslation;
      if (value.language !== args.language || value.sourceKey !== await artifactVersion(unitsOf(plan)) || value.items.length !== plan.units.length || new Set(value.items.map(item => item.id)).size !== plan.units.length) throw new Error('译文与输入文稿不匹配。');
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const transcripts = structuredClone(plan.transcripts); const spoken: AsrSegment[] = [];
      for (const unit of plan.units) {
        const item = value.items.find(item => item.id === unit.id); if (!item?.text.trim() || !unit.assetId || !transcripts[unit.assetId]?.[unit.seg]) throw new Error('译文缺少段落。');
        const segment = transcripts[unit.assetId][unit.seg]; segment.sub = item.text; segment.subLang = value.language; delete segment.cueSubs;
        const lines = plan.lines.filter(line => line.assetId === unit.assetId && line.seg === unit.seg);
        if (lines.length) spoken.push({ text: item.text, start: Math.min(...lines.map(line => line.start)), end: Math.max(...lines.map(line => line.start + line.duration)), ...(segment.speaker ? { speaker: segment.speaker } : {}), lang: DUBBING_LANGUAGES.find(language => language.id === value.language)?.code });
      }
      const owner = plan.lines[0]?.assetId; const original = store.read<AsrSegment[]>(args.transcript, 'transcript');
      const ref = args.transcript as unknown as { id: string };
      return { ...await documentOutput({ ...document, semantics: { ...document.semantics, transcripts } }), transcript: workflowJson(await store.put('transcript', ref.id, owner ? transcripts[owner] : original)), spoken: workflowJson(await store.put('transcript', 'translated-speech', spoken)), value: args.value };
    } }),
    node('flow.clock', { async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document'); const media = store.read<SceneMedia>(args.media, 'media');
      return { transcript: workflowJson(await store.put('transcript', 'flow-edited-speech', editingSpeechCues(document, store.read(args.transcript, 'transcript')))), media: workflowJson(await store.put('media', 'flow-timing', { ...media, durationSec: editingDuration(document) })) };
    } }),
    node('flow.voice', { async execute(args) {
      const original = store.read<EditorDocumentV2>(args.document, 'document'); const next = structuredClone(original); const audio = store.read<SceneMedia>(args.audio, 'media'); const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
      if (Math.abs(audio.durationSec - editingDuration(next)) > .1) throw new Error('配音时长与输入视频不一致。');
      const id = String(args.instanceId); const assetId = id + '-audio'; const trackId = id + '-narration';
      next.assets[assetId] = { id: assetId, kind: 'audio', label: '配音', locator: { localSig: audio.sig }, metadata: { durationSec: audio.durationSec } };
      for (const track of next.timeline.tracks) {
        if (track.role === 'narration') { track.muted = true; delete track.role; }
        for (const clip of track.clips) if (clip.kind === 'narrative') clip.properties.audioMuted = true;
      }
      next.timeline.tracks.push({ id: trackId, type: 'audio', role: 'narration', name: '配音', hidden: false, muted: false, locked: false, syncLocked: true, stackOrder: 0, clips: [{ id: id + '-voice', kind: 'audio', anchor: { type: 'timeline' }, assetId, startFrame: 0, durationFrames: Math.round(audio.durationSec * next.canvas.fps), sourceInSec: 0, sourceOutSec: audio.durationSec, enabled: true, properties: { volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 } }] });
      next.semantics.transcripts[assetId] = transcript;
      let document = next;
      if (original.appearance.captionStyle?.on) {
        const captions = applyCaptionDocumentEdit({ document, source: { mode: 'track', trackId }, patch: { sub: undefined }, mainTranscript: null, clipTranscripts: { [assetId]: transcript }, relayout: true });
        if (!captions.ok) throw new Error(captions.error.message); document = captions.document;
      }
      const checked = applyDocumentTransaction(original, { ops: [{ op: 'document.replace', input: { document } }] }, { projectId: host.task.id });
      if (!checked.ok) throw new Error(checked.error.message); return documentOutput(checked.document);
    } }),
    node('flow.cut', { stage: 'cleaning', async execute(args) {
      const original = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { minimumPauseSec: number; paddingSec: number; fillers: boolean };
      const track = original.timeline.tracks.find(track => track.role === 'narration' && !track.muted) ?? original.timeline.tracks.find(track => track.id === original.semantics.primaryNarrativeTrackId)!;
      const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript'); const ranges: { fromSec: number; toSec: number }[] = [];
      const { detectSpeechSilenceCuts } = await import('./speech-silence'); const detected = new Map<string, { fromSec: number; toSec: number }[]>();
      for (const clip of track.clips) {
        if (!clip.enabled || (clip.kind !== 'audio' && clip.kind !== 'narrative')) continue;
        const asset = original.assets[clip.assetId]; const sig = asset.locator.localSig!;
        if (!detected.has(sig)) {
          const file = await host.media({ sig, name: asset.label ?? 'speech', width: 0, height: 0, durationSec: asset.metadata.durationSec ?? editingDuration(original), url: asset.locator.remoteUrl });
          detected.set(sig, await detectSpeechSilenceCuts(file, { minimumPauseSec: options.minimumPauseSec, speechPaddingSec: options.paddingSec })); host.check();
        }
        const end = clip.sourceOutSec ?? clip.sourceInSec + clip.durationFrames / original.canvas.fps;
        const rate = (end - clip.sourceInSec) / (clip.durationFrames / original.canvas.fps);
        const fillers = options.fillers ? transcript.flatMap(segment => (segment.words ?? []).filter(word => /^(嗯+|呃+|额+|uh+|um+|erm+)[，,。.!?？]*$/iu.test(word.text.trim())).map(word => ({ fromSec: word.start, toSec: word.end }))) : [];
        for (const cut of [...detected.get(sig)!, ...fillers]) {
          const from = Math.max(clip.sourceInSec, cut.fromSec); const to = Math.min(end, cut.toSec);
          if (to > from) ranges.push({ fromSec: clip.startFrame / original.canvas.fps + (from - clip.sourceInSec) / rate, toSec: clip.startFrame / original.canvas.fps + (to - clip.sourceInSec) / rate });
        }
      }
      const merged = mergeEditingCuts(ranges, editingDuration(original)); let document = structuredClone(original);
      const sync = new Map(document.timeline.tracks.map(track => [track.id, track.syncLocked])); document.timeline.tracks.forEach(track => { track.syncLocked = true; });
      for (const range of merged.reverse()) {
        const startFrame = Math.round(range.fromSec * document.canvas.fps); const endFrame = Math.round(range.toSec * document.canvas.fps); if (endFrame <= startFrame) continue;
        const result = applyDocumentTransaction(document, { ops: [{ op: 'command', input: { command: { type: 'range.remove', trackId: document.semantics.primaryNarrativeTrackId, startFrame, endFrame, mode: 'ripple', includeLinked: true } } }] }, { projectId: host.task.id });
        if (!result.ok) throw new Error(result.error.message); document = result.document;
      }
      document.timeline.tracks.forEach(track => { track.syncLocked = sync.get(track.id) ?? track.syncLocked; });
      return { ...await documentOutput(document), report: { removedSec: editingDuration(original) - editingDuration(document) } };
    } }),
  ];
}

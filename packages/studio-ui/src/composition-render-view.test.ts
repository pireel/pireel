import { describe, expect, it } from 'vitest';
import {
  editorDocumentRenderPlan,
  emptyComposition,
  emptyEditorDocumentV2,
  type AudioClip,
  type Block,
  type EditorTrack,
} from '@pireel/studio-engine/composition';
import { compositionRenderView } from './composition-render-view';

const block = (id: string): Block => ({
  id,
  templateId: 'custom',
  label: id,
  startSec: 0,
  durationSec: 1,
  trackIndex: 1,
  slots: {},
});

const audio = (id: string, muted = false): AudioClip => ({ id, src: `blob:${id}`, durationSec: 1, muted });

describe('Composition render view', () => {
  it('filters visual flags without deleting the editing projection', () => {
    const document = emptyEditorDocumentV2();
    const graphics: EditorTrack = {
      id: 'graphics', type: 'graphics', role: 'graphics', name: 'Graphics',
      muted: false, hidden: true, locked: false, syncLocked: true, stackOrder: 2,
      clips: [{
        id: 'title', kind: 'graphic', startFrame: 0, durationFrames: 30, enabled: true,
        anchor: { type: 'timeline' }, block: { templateId: 'custom', label: 'title', slots: {} },
      }],
    };
    const captions: EditorTrack = {
      id: 'captions', type: 'caption', role: 'managedCaptions', name: 'Captions',
      muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 3,
      clips: [{
        id: 'caption', kind: 'caption', startFrame: 0, durationFrames: 30, enabled: false,
        managed: true, anchor: { type: 'timeline' },
        block: { templateId: 'caption', label: 'caption', slots: {} },
      }],
    };
    document.timeline.tracks.push(graphics, captions);
    document.semantics.managedCaptionTrackId = captions.id;
    const composition = { ...emptyComposition(), blocks: [block('title'), block('caption')] };

    const view = compositionRenderView(composition, editorDocumentRenderPlan(document));
    expect(view.blocks).toEqual([]);
    expect(composition.blocks.map((item) => item.id)).toEqual(['title', 'caption']);
  });

  it('excludes disabled audio and applies track mute without flattening clip state', () => {
    const document = emptyEditorDocumentV2();
    document.assets.music = {
      id: 'music', kind: 'audio', locator: { localSig: 'music' }, metadata: { durationSec: 1 },
    };
    document.timeline.tracks.push({
      id: 'music-track', type: 'audio', role: 'music', name: 'Music',
      muted: true, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [
        {
          id: 'playing', kind: 'audio', assetId: 'music', startFrame: 0, durationFrames: 30,
          sourceInSec: 0, sourceOutSec: 1, properties: {}, anchor: { type: 'timeline' }, enabled: true,
        },
        {
          id: 'disabled', kind: 'audio', assetId: 'music', startFrame: 0, durationFrames: 30,
          sourceInSec: 0, sourceOutSec: 1, properties: {}, anchor: { type: 'timeline' }, enabled: false,
        },
      ],
    });
    const playing = audio('playing');
    const disabled = audio('disabled');
    const composition = { ...emptyComposition(), audioTracks: [playing, disabled] };

    const view = compositionRenderView(composition, editorDocumentRenderPlan(document));
    expect(view.audioTracks).toEqual([{ ...playing, muted: true }]);
    expect(composition.audioTracks).toEqual([playing, disabled]);
  });
});

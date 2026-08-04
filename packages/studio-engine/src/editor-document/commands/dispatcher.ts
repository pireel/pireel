import type { EditorDocumentV2 } from '../types';
import { patchEditorCanvas } from './canvas';
import { insertAudioClip } from './audio-insert';
import { patchAudioClips } from './audio-patch';
import { patchEditorClip } from './clip-patch';
import { insertEditorClips } from './insert';
import { relayManagedCaptionTrack } from './managed-captions';
import { patchNarrativeClips } from './narrative-patch';
import { patchOverlayClips } from './overlay-patch';
import { moveOverlayClip } from './overlay-move';
import { duplicateOverlayClip } from './overlay-duplicate';
import { removeEditorClips } from './remove';
import { splitEditorClip } from './split';
import { removeEditorRange } from './range';
import { insertEditorTrack, moveEditorTrack, patchEditorTrack, removeEditorTrack } from './tracks';
import { commandFailure, type EditorCommand, type EditorCommandResult } from './types';

/** Single mutation gateway for UI, agents, keyboard actions and server-side editing. */
export function applyEditorCommand(document: EditorDocumentV2, command: EditorCommand): EditorCommandResult {
  switch (command.type) {
    case 'canvas.patch':
      return patchEditorCanvas(document, command.patch);
    case 'track.insert':
      return insertEditorTrack(document, command.track, command.index);
    case 'track.remove':
      return removeEditorTrack(document, command.trackId);
    case 'track.patch':
      return patchEditorTrack(document, command.trackId, command.patch);
    case 'track.move':
      return moveEditorTrack(document, command.trackId, command.toIndex);
    case 'clip.patch':
      return patchEditorClip(document, command.trackId, command.clipId, command.patch);
    case 'overlay.patch':
      return patchOverlayClips(document, command.updates);
    case 'overlay.move':
      return moveOverlayClip(document, command.clipId, command.toTrackId);
    case 'overlay.duplicate':
      return duplicateOverlayClip(document, command.clipId, command.newClipId, command.startFrame, command.toTrackId);
    case 'audio.insert':
      return insertAudioClip(document, command.trackId, command.clip, command.asset);
    case 'audio.patch':
      return patchAudioClips(document, command.updates);
    case 'captions.relay':
      return relayManagedCaptionTrack(document);
    case 'clips.remove':
      return removeEditorClips(document, command);
    case 'clips.insert':
      return insertEditorClips(document, command);
    case 'range.remove':
      return removeEditorRange(document, command);
    case 'clip.split':
      return splitEditorClip(document, command);
    case 'narrative.patch':
      return patchNarrativeClips(document, command.updates);
    default: {
      const unreachable: never = command;
      return commandFailure(document, 'invalid-command', `Unsupported editor command: ${String(unreachable)}`);
    }
  }
}

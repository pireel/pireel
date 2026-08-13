import type { EditorCommandError, EditorCommandErrorCode } from '@pireel/studio-engine/editor-document';
import { t } from './i18n';

const ERROR_KEYS: Record<EditorCommandErrorCode, string> = {
  'invalid-command': 'editorError.invalidCommand',
  'invalid-range': 'editorError.invalidRange',
  'invalid-document': 'editorError.invalidDocument',
  'track-not-found': 'editorError.trackNotFound',
  'clip-not-found': 'editorError.clipNotFound',
  'duplicate-track-id': 'editorError.duplicateTrackId',
  'duplicate-clip-id': 'editorError.duplicateClipId',
  'invalid-track-role': 'editorError.invalidTrackRole',
  'primary-track-required': 'editorError.primaryTrackRequired',
  'track-locked': 'editorError.trackLocked',
};

/** Convert engine diagnostics into locale-safe UI copy. Raw engine messages remain available for logs. */
export function editorErrorMessage(error: EditorCommandError): string {
  return t(ERROR_KEYS[error.code]);
}

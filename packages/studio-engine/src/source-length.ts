/**
 * The longest recording that is edited whole. Its speech is transcribed in one pass, and a
 * transcription that long is the most a single request can wait for; past it the editor also holds
 * more decoded audio than a browser tab has room for. The picker says so when the file is chosen,
 * and the server refuses longer audio.
 */
export const MAX_SOURCE_DURATION_SEC = 2 * 60 * 60;

export const sourceTooLong = (durationSec: number | null | undefined): boolean =>
  typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > MAX_SOURCE_DURATION_SEC;

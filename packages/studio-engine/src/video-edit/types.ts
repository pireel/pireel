/**
 * Shared types for the video-edit module.
 *
 * Scope: browser-side video processing infrastructure — probe / extract-audio /
 * scene detection / thumbnails / render. No business orchestration (LLM timeline,
 * persistence, etc.) — that lives in higher-level components.
 */

export type ClipMeta = {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
};

export type SceneCut = {
  /** Timestamp of the cut (seconds) */
  timestamp: number;
  /** HSV difference score, for tuning the threshold */
  score: number;
};

export type SceneSegment = {
  start: number;
  end: number;
};

export type Thumbnail = {
  /** Frame timestamp (seconds) */
  timestamp: number;
  /** Object URL pointing at the Blob — remember to revoke */
  url: string;
  /** The Blob itself, for when you need to upload */
  blob: Blob;
};

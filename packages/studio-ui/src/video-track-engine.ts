/**
 * Parent-layer video track engine (decode/clock/audio side of the canvas render mode):
 *
 * Root cause: the preview iframe is sandboxed + double-buffered, so rebuilding the document
 * recreates <video> and decoder sessions churn — the whole "decode zombie" class of bugs
 * grows from this. Fix: keep decode elements resident in the parent layer (one hidden <video>
 * per source, fully decoupled from document lifecycle); the video track inside the iframe is
 * just a <canvas>, frames pushed over via ImageBitmap postMessage (zero-copy transfer); audio
 * comes straight from the parent element (the active source is unmuted).
 *
 * Master clock = the active source element's currentTime while footage is present, with a
 * timeline rAF clock for graphics/audio-only regions. Boundary handoff / dead-window skipping use a debuggable TS implementation here
 * (port and retirement of the old VIDEO_TRIM_SHIM state machine). Caption/HTML blocks are
 * still DOM/GSAP in the iframe — during playback the parent sends hf:seekTimelines every frame
 * to align; the edit surface is unchanged.
 *
 * Pixels come from WebCodecs (video-frame-decoder.ts): every source is demuxed once and read at
 * independent positions — the active segment, both sides of a cut transition, and every overlay
 * video layer — so no picture ever depends on a media element's seek. The element remains the
 * sound and the master clock; when a source cannot be decoded here, its element is the picture
 * source again (the original createImageBitmap(video) path).
 */

import type { ShotPreciseFraming } from '@pireel/studio-engine/composition';
import { type MaskedAudioRange, type WordAudioMask, maskedAudioAt } from '@pireel/studio-engine/word-masks';
import { FrameCursor, SourceFrameDecoder } from './video-frame-decoder';
import {
  segmentSourceRate,
  segmentSourceTimeAt,
  segmentTimelineEnd,
  segmentTimelineStart,
  segmentTimelineTimeAt,
} from './video-segment-time';

/** Preview lead for word masks: muting a media element and ramping the tone take a couple of audio
 *  buffers to be heard, so the mask is evaluated this far AHEAD of the clock — the replacement then
 *  lands on the word instead of trailing it at both ends. Export renders sample-exact and needs none. */
export const MASK_PREVIEW_LEAD_SEC = 0.09;

export interface EngineSeg {
  /** Source key: 'main' or this segment's src (blob/remote URL). */
  key: string;
  /** Element-scoped key for mask/portrait use: 'main' or clip_<shotId> (matches the personMaskAt protocol). */
  elKey: string;
  srcStart: number;
  srcEnd: number;
  /** Native edited-timeline placement. Omit for the legacy contiguous fallback. */
  timelineStart?: number;
  timelineEnd?: number;
  /** Linear audio gain (shotGain of the shot; absent = 1, and >1 is a real boost — see setElGain). Segments of
   *  the same source share one element, so the value re-applies at every handoff, including the same-source
   *  roll-through swap that skips activateIdx. */
  gain?: number;
  /** Segment-local fade factor (shotFadeAt); absent = no fade. Evaluated per tick, so the level rides the
   *  curve instead of stepping at the segment's edges. */
  fadeAt?: (tLocal: number) => number;
  /** Only source-normalized precision belongs here; legacy cover precision stays on #vidEl's CSS timeline. */
  framing?: ShotPreciseFraming;
}

/** Audio-clip spec for the preview (declarative; envelope + source-time mapping arrive as closures
 *  so the engine stays ignorant of the clip model — workbench builds them from the same pure fns as export). */
export interface EngineAudioClip {
  id: string;
  url: string;
  /** Playback speed (element playbackRate; preservesPitch stays ON — the export runs a pitch-preserving stretch too). */
  speed: number;
  /** Full envelope at edited time t (level × fades); 0 outside the clip's window, may exceed 1 (boost). */
  gainAt: (t: number) => number;
  /** Edited time → source seconds; null = outside the playable range (element parks paused). */
  srcTimeAt: (t: number) => number | null;
  /** Word mask at a source time (beeped / muted words on this clip's transcript); absent = none. */
  maskAt?: (srcT: number) => WordAudioMask | null;
}

/** An overlay video layer (any visual lane other than the primary narrative): picture only, drawn on its
 *  own canvas in the preview document; its sound is an EngineAudioClip like music. */
export interface EngineLayer {
  /** Clip id. */
  id: string;
  /** Id of the canvas element that receives this layer's frames. */
  elKey: string;
  /** Source key (shared with segments of the same source). */
  key: string;
  srcStart: number;
  srcEnd: number;
  timelineStart: number;
  timelineEnd: number;
}

export interface LayerFrameInfo {
  t: number;
  srcT: number;
  sourceWidth: number;
  sourceHeight: number;
}

/** WebAudio requires CORS-clean media even when a plain <audio> element can play the same URL.
 * Generated speech/music lives on our CDN, whose bytes are already exposed through the authenticated
 * same-origin media proxy for browser-side processing. Route cross-origin preview audio through that
 * proxy before attaching a MediaElementAudioSourceNode; local blob/data and same-origin URLs stay direct. */
export function previewAudioSource(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    const target = new URL(url, window.location.href);
    if ((target.protocol === 'http:' || target.protocol === 'https:') && target.origin !== window.location.origin) {
      return `/api/media/fetch?url=${encodeURIComponent(target.toString())}`;
    }
  } catch {
    // Keep malformed/opaque values unchanged; the media element will surface the real load failure.
  }
  return url;
}

export interface FrameInfo {
  t: number;
  elKey: string;
  srcT: number;
  /** true = pre-baked finished transition frame (shim lays it down directly, no compositing). */
  baked?: boolean;
  framing?: ShotPreciseFraming;
  framing2?: ShotPreciseFraming;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Display dimensions for the transition's secondary frame. ImageBitmap may expose the coded
   *  surface (for example landscape pixels plus rotation metadata), so the iframe must not infer
   *  presentation geometry from frame2.width/frame2.height. */
  sourceWidth2?: number;
  sourceHeight2?: number;
}

const EPS = 0.04;

/** Removing a playing media element from the DOM does not reliably stop its audio. Pause it before
 * releasing the node so a transient preview respec cannot leave an orphan narration playing beside
 * the replacement element. Source swaps reuse the resident decoder and let assigning the new src
 * stop the old resource; this helper is only for permanent removal. */
function releaseMediaElement(el: HTMLMediaElement): void {
  if (!el.paused) el.pause();
  el.removeAttribute('src');
  el.remove();
}

export class VideoTrackEngine {
  private host: HTMLDivElement | null = null;
  private els = new Map<string, HTMLVideoElement>();
  private urls = new Map<string, string>(); // objectURLs we created (revoked when swapping source)
  private srcIds = new Map<string, File | string>(); // source identity: File by reference, URL by string for idempotence checks
  private segs: EngineSeg[] = [];
  private starts: number[] = [];
  private ends: number[] = [];
  private segmentTotal = 0;
  private timelineTotal = 0;
  private total = 0;
  private playing = false;
  private tEdited = 0;
  private raf = 0;
  private curIdx = -1; // active segment index (-1 = none)
  private bitmapInflight = false;
  /** A seek/frame request arrived while createImageBitmap was busy. Keep one latest retry instead
   *  of dropping it: hover scrubbing can invalidate the in-flight video frame, and without this
   *  retry the iframe stays cleared until a reload or another lucky seek. */
  private bitmapPending = false;
  /** Browser video frames may expose coded (pre-rotation) bitmap dimensions. Cache whether each
   *  resident decoder needs a display-oriented canvas normalization; the common path stays zero-copy. */
  private bitmapModes = new WeakMap<HTMLVideoElement, { width: number; height: number; normalize: boolean }>();
  private bitmapStages = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();
  private lastPush: { key: string; srcT: number } | null = null;
  private seekGen = 0;
  /** Cut transition table (film seconds): inside a window the frame push carries the other side's picture. */
  private trs: { cut: number; half: number }[] = [];
  // WebCodecs picture side. One decoder per source (opened when the source is set; `null` once open
  // failed = this source keeps its element as the picture source), read through independent cursors:
  // `${key}::main` for the active segment, `${key}::pre|post` for the two sides of a cut transition,
  // `layer:${clipId}` for overlay video layers.
  private decoders = new Map<string, { decoder: SourceFrameDecoder | null; ready: boolean; gen: number }>();
  private cursors = new Map<string, FrameCursor>();
  private decoderGen = 0;
  // Overlay video layers: picture only, each on its own canvas; sound travels as an EngineAudioClip.
  private layers: EngineLayer[] = [];
  private layerGen = 0;
  private layerInflight = new Set<string>();
  private layerPending = new Map<string, number>();
  private layerLastPush = new Map<string, number>();
  private layerVisible = new Set<string>();
  private layerWarned = new Set<string>();
  // Audio clips (music lane): one resident <audio> element per clip, volume driven per tick from the
  // envelope closure. Deliberately loose sync (music has no lip-sync): only correct drift > 0.35s.
  // Each element is routed through a WebAudio gain node so a clip can be BOOSTED past source level
  // (element.volume caps at 1). The takeover is permanent per element, so every lane clip goes through
  // the graph — never half native, half routed. Video elements get the same treatment, but lazily
  // (setElGain): footage is usually attenuated, and an unnecessary AudioContext is a liability.
  private audioClips = new Map<string, { el: HTMLAudioElement; spec: EngineAudioClip; gain?: GainNode; maskDebug?: WordAudioMask | null }>();
  private actx: AudioContext | null = null;
  // Narration dub: a processed-audio stand-in (denoise bake) keyed by source. While a dub exists for a
  // source, its decode element is force-muted and the dub carries the sound in SOURCE seconds — lip-sync
  // matters here, so drift correction is tight (0.08s) against the video element's own clock.
  private dubs = new Map<string, { el: HTMLAudioElement; url: string }>();
  /** Word masks per source key (source seconds): the sound is replaced while the clock crosses a span. */
  private audioMasks = new Map<string, readonly MaskedAudioRange[]>();
  /** The mask currently applied to the active element (null = source sound plays). */
  private maskActive: WordAudioMask | null = null;
  /** Whether any audio-lane / visual-lane clip is inside a beeped span this tick. */
  private clipBeep = false;
  /** Beep tone: its own tiny graph, never attached to a media element (see setElGain for why that matters). */
  private beep: { ctx: AudioContext; gain: GainNode } | null = null;
  // Per-element gain nodes for the VIDEO/dub side, created only when a level above source is asked for
  // (see setElGain). Keyed by element so a recreated element simply gets a fresh chain.
  private elGains = new WeakMap<HTMLMediaElement, { el: HTMLMediaElement; gain?: GainNode }>();
  // Smooth clock: el.currentTime steps at video frame rate (30fps footage = 33ms jumps), so
  // aligning transition progress / overlays directly to it isn't smooth. During playback, advance
  // by wall clock and pull back when drift from the raw clock exceeds 80ms (seek/handoff self-heal).
  private tSmooth = -1;

  onFrame?: (frame: ImageBitmap, info: FrameInfo, frame2?: ImageBitmap | null) => void;
  onBlank?: (t: number) => void;
  onTick?: (t: number) => void;
  onEnded?: () => void;
  /** A resident source element failed to load (a stale File handle, a revoked URL): the segment is
   *  dead until the owner sets the source again from fresh bytes. */
  onSourceError?: (key: string, error: MediaError | null) => void;
  /** An overlay layer's frame (drawn into the canvas named by layer.elKey). */
  onLayerFrame?: (layer: EngineLayer, frame: ImageBitmap, info: LayerFrameInfo) => void;
  /** An overlay layer left its window or lost its source: its canvas should clear. */
  onLayerBlank?: (layer: EngineLayer) => void;
  /** Transition pre-bake provider (workbench): cut → decoded frame set; null = not baked/decoded (falls back to the two-cursor path).
   *  When baked, the window pushes finished frames and the second read position stays idle — "on-the-fly scheduling" leaves the critical path. */
  bakeProvider?: (cut: number) => { fps: number; half: number; frames: ImageBitmap[] } | null;

  private ensureHost(): HTMLDivElement {
    if (!this.host) {
      const d = document.createElement('div');
      // avoid display:none: hidden off-screen but still rendering, so decode/frame-grab isn't throttled
      d.style.cssText = 'position:fixed;left:-200vw;top:0;width:8px;height:8px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(d);
      this.host = d;
    }
    return this.host;
  }

  /**
   * Register a source's bytes: a File or a URL. `null` removes the source. Same File (by reference) /
   * same URL is idempotent — the idempotence check MUST happen *before* createObjectURL: objectURL is a
   * new string every time, so comparing it means never idempotent, and any segment-table change reloads
   * every source via load() (observed: deleting a clip has an adjacent segment's hover/handoff hit the
   * reload window, and a perfectly good segment gets skipped as a dead window).
   *
   * `segment` sources (the narrative lane) get a resident media element for sound and clock; `layer`
   * sources are picture-only and get no element unless a segment also uses them. Both open a
   * WebCodecs decoder for the picture.
   */
  setSource(key: string, source: File | string | null, role: 'segment' | 'layer' = 'segment'): void {
    const prev = this.els.get(key);
    if (source == null) {
      if (prev) {
        this.trace(key, 'remove');
        this.bitmapModes.delete(prev);
        this.bitmapStages.delete(prev);
        releaseMediaElement(prev);
        this.els.delete(key);
      }
      this.dropDecoder(key);
      this.srcIds.delete(key);
      const u = this.urls.get(key);
      if (u) {
        URL.revokeObjectURL(u);
        this.urls.delete(key);
      }
      return;
    }
    if (this.srcIds.get(key) === source) {
      if (role === 'segment' && !prev) this.createElement(key);
      return; // idempotent: same File reference / same URL
    }
    this.srcIds.set(key, source);
    this.dropDecoder(key);
    this.openDecoder(key, source);
    if (prev) {
      const url = this.elementUrl(key);
      if (prev.dataset.hfSrcTag === url) return; // idempotent
      this.trace(key, `swap src (${typeof source === 'string' ? 'url' : `file ${source.size}`}) rs=${prev.readyState} ct=${prev.currentTime.toFixed(2)}`);
      this.bitmapModes.delete(prev);
      this.bitmapStages.delete(prev);
      prev.src = url;
      prev.dataset.hfSrcTag = url;
      prev.load();
      return;
    }
    if (role === 'segment') this.createElement(key);
  }

  /** The element URL for a registered source: the URL itself, or one object URL per File (revoked on swap/removal). */
  private elementUrl(key: string): string {
    const source = this.srcIds.get(key)!;
    const old = this.urls.get(key);
    if (old) {
      URL.revokeObjectURL(old);
      this.urls.delete(key);
    }
    if (typeof source === 'string') return source;
    const url = URL.createObjectURL(source);
    this.urls.set(key, url);
    return url;
  }

  private createElement(key: string): void {
    const source = this.srcIds.get(key);
    if (source == null) return;
    this.trace(key, `create (${typeof source === 'string' ? 'url' : `file ${source.size}`})`);
    const url = this.elementUrl(key);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('error', () => {
      if (this.els.get(key) === v) this.onSourceError?.(key, v.error);
    });
    v.src = url;
    v.dataset.hfSrcTag = url;
    this.ensureHost().appendChild(v);
    this.els.set(key, v);
  }

  /** Open the WebCodecs decoder for a source. Until it resolves (or when it cannot decode this file),
   *  the source's element is the picture source; once ready, the current picture is re-pushed. */
  private openDecoder(key: string, source: File | string): void {
    const gen = ++this.decoderGen;
    this.decoders.set(key, { decoder: null, ready: false, gen });
    void SourceFrameDecoder.open(source).then(
      (decoder) => {
        const entry = this.decoders.get(key);
        if (!entry || entry.gen !== gen) {
          decoder?.close();
          return;
        }
        entry.decoder = decoder;
        entry.ready = true;
        this.trace(key, decoder ? `decoder ready ${decoder.width}x${decoder.height}` : 'decoder unavailable (element picture)');
        if (decoder) this.repushKey(key);
      },
      (error: unknown) => {
        const entry = this.decoders.get(key);
        if (entry && entry.gen === gen) entry.ready = true;
        this.trace(key, `decoder failed: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  }

  private dropDecoder(key: string): void {
    for (const [cursorKey, cursor] of this.cursors) {
      if (cursorKey.startsWith(`${key}::`)) {
        cursor.close();
        this.cursors.delete(cursorKey);
      }
    }
    for (const layer of this.layers) {
      if (layer.key !== key) continue;
      const cursor = this.cursors.get(`layer:${layer.id}`);
      if (cursor) {
        cursor.close();
        this.cursors.delete(`layer:${layer.id}`);
      }
      this.layerLastPush.delete(layer.id);
    }
    const entry = this.decoders.get(key);
    if (entry) {
      entry.decoder?.close();
      this.decoders.delete(key);
    }
  }

  private decoderFor(key: string): SourceFrameDecoder | null {
    return this.decoders.get(key)?.decoder ?? null;
  }

  /** A read position on a source's decoder; null while the decoder is not (or cannot be) open. */
  private cursorFor(key: string, side: 'main' | 'pre' | 'post'): FrameCursor | null {
    const decoder = this.decoderFor(key);
    if (!decoder) return null;
    const cursorKey = `${key}::${side}`;
    let cursor = this.cursors.get(cursorKey);
    if (!cursor) {
      cursor = decoder.cursor();
      this.cursors.set(cursorKey, cursor);
    }
    return cursor;
  }

  /** A decoder came up for a source that is on screen right now: push its picture (paused only — during
   *  playback the next tick does it). */
  private repushKey(key: string): void {
    if (this.playing) return;
    const active = this.segs[this.curIdx];
    if (active && active.key === key) {
      this.lastPush = null;
      this.pushFrame(undefined, segmentSourceTimeAt(active, this.tEdited, this.starts[this.curIdx]!, this.ends[this.curIdx]!));
    }
    for (const layer of this.layers) if (layer.key === key) this.layerLastPush.delete(layer.id);
    this.pushLayers(this.tEdited);
  }

  /**
   * Rebuild a resident element's pipeline from the bytes it already has (a fresh object URL for a
   * File source, `load()` for a URL source). Synchronous, so a seek that follows an `error` event
   * finds the element alive again instead of a dead window and a cleared canvas.
   */
  reloadSource(key: string): boolean {
    const el = this.els.get(key);
    const source = this.srcIds.get(key);
    if (!el || source == null) return false;
    this.trace(key, `reload after error rs=${el.readyState} ct=${el.currentTime.toFixed(2)} err=${el.error?.code ?? '-'}`);
    this.bitmapModes.delete(el);
    this.bitmapStages.delete(el);
    if (typeof source === 'string') {
      el.load();
      return true;
    }
    const url = this.elementUrl(key);
    el.src = url;
    el.dataset.hfSrcTag = url;
    el.load();
    return true;
  }

  /** Diagnostic view of one source's resident element, with the last operations the engine ran on it. */
  sourceState(key: string): {
    present: boolean; error: number | null; readyState: number | null; networkState: number | null; currentTime: number | null;
    buffered: string; src: string; decoder: 'ready' | 'opening' | 'unavailable' | 'none'; trace: string[];
  } {
    const el = this.els.get(key);
    const buffered = el ? Array.from({ length: el.buffered.length }, (_, i) => `${el.buffered.start(i).toFixed(2)}-${el.buffered.end(i).toFixed(2)}`).join(',') : '';
    const entry = this.decoders.get(key);
    return {
      present: !!el,
      error: el?.error?.code ?? null,
      readyState: el?.readyState ?? null,
      networkState: el?.networkState ?? null,
      currentTime: el ? Math.round(el.currentTime * 1000) / 1000 : null,
      buffered,
      src: (el?.currentSrc || el?.src || '').slice(0, 48),
      decoder: !entry ? 'none' : entry.decoder ? 'ready' : entry.ready ? 'unavailable' : 'opening',
      trace: [...(this.traces.get(key) ?? [])],
    };
  }

  private traces = new Map<string, string[]>();
  private trace(key: string, op: string): void {
    const list = this.traces.get(key) ?? [];
    list.push(`${(performance.now() / 1000).toFixed(2)}s ${op}`);
    if (list.length > 16) list.shift();
    this.traces.set(key, list);
  }

  setSegments(segs: EngineSeg[]): boolean {
    // Level-only respec (a volume/fade edit leaves the cut list identical): keep the clock, the active
    // index and the decode state exactly as they are and just swap the numbers in. Without this, dragging
    // a volume slider re-seats the whole segment table on every pointer move — and mid-playback that
    // means restarting playback per frame.
    const sameShape =
      this.segs.length === segs.length &&
      this.segs.every((s, i) => {
        const n = segs[i]!;
        const oldStart = this.starts[i] ?? 0;
        const nextStart = segmentTimelineStart(n, oldStart);
        return n.key === s.key && n.elKey === s.elKey
          && Math.abs(n.srcStart - s.srcStart) < 1e-6
          && Math.abs(n.srcEnd - s.srcEnd) < 1e-6
          && Math.abs(nextStart - oldStart) < 1e-6
          && Math.abs(segmentTimelineEnd(n, nextStart) - (this.ends[i] ?? oldStart)) < 1e-6;
      });
    if (sameShape) {
      const framingChanged = this.segs.some((s, i) => {
        const a = s.framing;
        const b = segs[i]!.framing;
        return a?.scale !== b?.scale || a?.anchorX !== b?.anchorX || a?.anchorY !== b?.anchorY || a?.coordinateSpace !== b?.coordinateSpace;
      });
      this.segs = segs;
      const cur = this.segs[this.curIdx];
      const el = cur && this.els.get(cur.key);
      if (el && !el.muted) this.setElGain(el, this.segGain(this.curIdx)); // audible immediately, no wait for the next tick
      if (framingChanged) this.lastPush = null;
      return framingChanged;
    }
    this.segs = segs;
    this.starts = [];
    this.ends = [];
    let cursor = 0;
    let maxEnd = 0;
    for (const s of segs) {
      const start = segmentTimelineStart(s, cursor);
      const end = segmentTimelineEnd(s, start);
      this.starts.push(start);
      this.ends.push(end);
      cursor = end;
      maxEnd = Math.max(maxEnd, end);
    }
    this.segmentTotal = maxEnd;
    this.total = Math.max(this.segmentTotal, this.timelineTotal);
    this.curIdx = -1; // segment table changed: recompute the active one
    // segment table changed mid-playback (delete/trim/insert while playing): the rAF loop only knows
    // curIdx, and without re-locating it spins dead — restart playback from the current film time
    // (play clamps t, re-finds a playable segment, reschedules rAF)
    if (this.playing) this.play(Math.min(this.tEdited, this.total));
    return true;
  }

  get durationSec(): number {
    return this.total;
  }

  /** Lets the React shell avoid replaying the media element after a direct user-gesture start. */
  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Sets the authoritative timeline end. Video is one possible clock source, not the document
   * duration: graphics/audio-only edits and content after the final video frame still need time.
   */
  setTimelineDuration(durationSec: number): void {
    this.timelineTotal = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
    this.total = Math.max(this.segmentTotal, this.timelineTotal);
    if (this.tEdited > this.total) this.seek(this.total);
  }

  private segGain(i: number, tEdited?: number): number {
    const seg = this.segs[i];
    if (!seg) return 1;
    const base = seg.gain == null ? 1 : Math.max(0, seg.gain); // >1 is a real boost — setElGain routes it
    if (!seg.fadeAt || base <= 0) return base;
    const local = (tEdited ?? this.tEdited) - (this.starts[i] ?? 0);
    return Math.max(0, base * seg.fadeAt(local));
  }

  /** Cut transition table (film seconds): inside the window, pushFrame carries the "other side" picture (frame2). */
  setTransitions(trs: { cut: number; half: number }[]): void {
    this.trs = trs;
  }

  /** Reconcile the audio-clip set: same-url respec (knob turns) keeps the element — only the closures
   *  swap, no reload, no playback interruption; removed ids drop their elements. */
  setAudioClips(specs: EngineAudioClip[]): void {
    const keep = new Set(specs.map((sp) => sp.id));
    for (const [id, c] of this.audioClips) {
      if (!keep.has(id)) {
        c.gain?.disconnect();
        releaseMediaElement(c.el);
        this.audioClips.delete(id);
      }
    }
    for (const spec of specs) {
      const cur = this.audioClips.get(spec.id);
      const source = previewAudioSource(spec.url);
      if (!cur) {
        const a = document.createElement('audio');
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
        a.src = source;
        a.dataset.hfSrcTag = source;
        this.ensureHost().appendChild(a);
        this.audioClips.set(spec.id, { el: a, spec });
      } else {
        if (cur.el.dataset.hfSrcTag !== source) {
          cur.el.src = source;
          cur.el.dataset.hfSrcTag = source;
          cur.el.load();
        }
        cur.spec = spec;
      }
    }
    this.syncAudioClips(this.tEdited, this.playing, true);
  }

  /** Replace a source's word-mask spans (source seconds). Empty removes them. */
  setAudioMasks(key: string, ranges: readonly MaskedAudioRange[]): void {
    if ((window as unknown as { __hfMaskDebug?: boolean }).__hfMaskDebug) {
      console.info('[mask:narration]', { key: key.slice(0, 60), ranges: ranges.map((r) => `${r.audio} ${r.start.toFixed(2)}-${r.end.toFixed(2)}`), sources: [...this.els.keys()].map((k) => k.slice(0, 60)), segments: this.segs.length });
    }
    if (ranges.length) this.audioMasks.set(key, ranges);
    else this.audioMasks.delete(key);
    if (!this.audioMasks.size) this.setBeep(false);
  }

  private maskAt(key: string, srcT: number): WordAudioMask | null {
    const ranges = this.audioMasks.get(key);
    return ranges ? maskedAudioAt(ranges, srcT) : null;
  }

  /** One tone for every masked source: on while the narration or any clip sits inside a beeped span. */
  private updateBeep(): void {
    this.setBeep(this.maskActive === 'beep' || this.clipBeep);
  }

  /** Beep on/off with short ramps (no clicks). The oscillator runs only while a beep is audible. */
  private setBeep(on: boolean): void {
    if (!on) {
      if (!this.beep) return;
      const now = this.beep.ctx.currentTime;
      this.beep.gain.gain.cancelScheduledValues(now);
      this.beep.gain.gain.setTargetAtTime(0, now, 0.004);
      return;
    }
    if (!this.beep) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1000;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        this.beep = { ctx, gain };
      } catch {
        return; // no context: the word is still muted, only the tone is missing in preview
      }
    }
    if (this.beep.ctx.state === 'suspended') void this.beep.ctx.resume();
    const now = this.beep.ctx.currentTime;
    this.beep.gain.gain.cancelScheduledValues(now);
    this.beep.gain.gain.setTargetAtTime(0.22, now, 0.004);
  }

  /** Per tick: silence the active element (and its dub) across a masked span, play the tone for a beep,
   *  and hand the sound back the moment the clock leaves the span. */
  private applyMask(key: string, el: HTMLMediaElement, srcT: number, dubbed: boolean): void {
    const rate = el.playbackRate > 1e-9 ? el.playbackRate : 1;
    const mask = this.maskAt(key, srcT + MASK_PREVIEW_LEAD_SEC * rate);
    if ((window as unknown as { __hfMaskDebug?: boolean }).__hfMaskDebug && (mask !== this.maskActive)) {
      console.info('[mask]', { key, srcT: srcT.toFixed(3), mask, muted: el.muted, volume: el.volume, routed: this.elGains.has(el), dubbed, clips: this.audioClips.size });
    }
    if (mask) {
      // Belt and braces: mute AND zero the level. An element that was ever routed through the WebAudio
      // graph (a boost) carries its level on the gain node, where `muted` alone is not guaranteed to bite.
      if (!el.muted) el.muted = true;
      this.setElGain(el, 0);
      const dub = this.dubs.get(key);
      if (dub) this.setElGain(dub.el, 0);
      if (mask !== this.maskActive) {
        this.maskActive = mask;
        this.updateBeep();
      }
      return;
    }
    if (!this.maskActive) return;
    this.maskActive = null;
    this.updateBeep();
    this.setElGain(el, this.segGain(this.curIdx)); // level back to the shot's own envelope
    el.muted = dubbed; // a mounted dub keeps carrying the sound; otherwise the element speaks again
  }

  /** Mount/swap/remove a source's narration dub (baked processed audio, same source-seconds timeline).
   *  Same-url is idempotent; url change swaps the element src in place (re-blend after a strength change). */
  setNarrationDub(key: string, url: string | null): void {
    const cur = this.dubs.get(key);
    if (!url) {
      if (cur) {
        releaseMediaElement(cur.el);
        this.dubs.delete(key);
      }
      // hand the sound back to the decode element: stopped → the next activate/seek does it;
      // playing → un-mute the active element NOW, or the source stays silent until the next
      // segment change (turning denoise off mid-playback used to cut the sound entirely).
      if (!this.playing) {
        this.seek(this.tEdited);
        return;
      }
      const active = this.segs[this.curIdx];
      const el = active && active.key === key ? this.els.get(key) : undefined;
      if (el) {
        el.muted = false;
        this.setElGain(el, this.segGain(this.curIdx));
        if (el.paused) el.play().catch(() => {});
      }
      return;
    }
    if (cur?.url === url) return;
    const source = previewAudioSource(url);
    if (cur) {
      cur.el.src = source;
      cur.el.load();
      cur.url = url;
    } else {
      const a = document.createElement('audio');
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      a.src = source;
      this.ensureHost().appendChild(a);
      this.dubs.set(key, { el: a, url });
    }
    if (!this.playing) this.seek(this.tEdited); // re-run activation so muting/dub parking take effect
  }

  /** Dub sync for the active source (called from activate/seek/tick): the video element stays the clock,
   *  the dub follows in source seconds; corrections only past 0.08s (audible micro-gap, so keep them rare). */
  private syncDub(key: string, videoEl: HTMLVideoElement, gain: number, wantPlay: boolean): boolean {
    for (const [k, d] of this.dubs) {
      if (k !== key && !d.el.paused) d.el.pause();
    }
    const dub = this.dubs.get(key);
    if (!dub) return false;
    this.setElGain(dub.el, gain);
    dub.el.playbackRate = videoEl.playbackRate;
    (dub.el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true; // same rule as the decode element: speed keeps the voice's pitch
    if (!dub.el.seeking && Math.abs(dub.el.currentTime - videoEl.currentTime) > 0.08) {
      try {
        dub.el.currentTime = videoEl.currentTime;
      } catch {
        /* metadata not ready: next tick retries */
      }
    }
    if (wantPlay && dub.el.paused) dub.el.play().catch(() => {});
    else if (!wantPlay && !dub.el.paused) dub.el.pause();
    return true;
  }

  /** Lazily build (and reuse) an element's WebAudio chain: element → gain → destination. Returns null when
   *  the browser refuses a context; the caller then degrades to element volume (boosts just won't be
   *  audible in preview, while export still applies them). */
  private gainFor(entry: { el: HTMLMediaElement; gain?: GainNode }): GainNode | null {
    if (entry.gain) return entry.gain;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!this.actx) this.actx = new Ctor();
      const gain = this.actx.createGain();
      this.actx.createMediaElementSource(entry.el).connect(gain).connect(this.actx.destination);
      entry.gain = gain;
      return gain;
    } catch {
      return null; // already-taken-over element / autoplay policy: stay on the native path
    }
  }

  /** Set a video/dub element's level, boosts included. An element's own volume caps at 1, so anything above
   *  source level has to go through the graph. The takeover is permanent per element, so it happens lazily —
   *  a project that never boosts never creates an AudioContext, and therefore can't be silenced by one that
   *  won't start. Once routed, the node carries every level (never half native, half routed). */
  private setElGain(el: HTMLMediaElement, g: number): void {
    let entry = this.elGains.get(el);
    if (!entry && g > 1) {
      entry = { el };
      if (this.gainFor(entry)) this.elGains.set(el, entry);
      else entry = undefined; // no context: stay native, boost is inaudible here (export still applies it)
    }
    if (entry?.gain) {
      const v = Math.max(0, g);
      if (entry.gain.gain.value !== v) entry.gain.gain.value = v;
      if (el.volume !== 1) el.volume = 1;
      return;
    }
    // Write only on change. Every segment now carries a fade envelope (the seam micro-fades), so this runs
    // every frame of playback — and assigning el.volume is not free: it is a media-element property whose
    // setter reaches into the platform's audio path. The value is constant outside the ramps.
    const v = Math.max(0, Math.min(1, g));
    if (el.volume !== v) el.volume = v;
  }

  /** Per-tick / on-seek clip sync: volume from the envelope closure, playbackRate = speed with
   *  preservesPitch ON (the export stretches pitch-preserving too); drift correction only past 0.35s. force = hard seek. */
  private syncAudioClips(t: number, wantPlay: boolean, force = false): void {
    if (wantPlay && this.actx?.state === 'suspended') void this.actx.resume(); // play is a user gesture
    let clipBeep = false;
    for (const entry of this.audioClips.values()) {
      const { el, spec } = entry;
      const srcT = spec.srcTimeAt(t);
      const gainNode = this.gainFor(entry);
      const setGain = (g: number) => {
        if (gainNode) {
          gainNode.gain.value = Math.max(0, g);
          el.volume = 1; // the graph carries the level now
        } else {
          el.volume = Math.max(0, Math.min(1, g)); // no graph: boosts are inaudible here, export still applies them
        }
      };
      if (srcT == null) {
        setGain(0);
        if (!el.paused) el.pause();
        continue;
      }
      const maskSrcT = wantPlay && spec.maskAt ? spec.srcTimeAt(t + MASK_PREVIEW_LEAD_SEC) : null;
      const mask = maskSrcT != null && spec.maskAt ? spec.maskAt(maskSrcT) : null;
      if (mask === 'beep') clipBeep = true;
      if ((window as unknown as { __hfMaskDebug?: boolean }).__hfMaskDebug && mask !== entry.maskDebug) {
        entry.maskDebug = mask;
        console.info('[mask:clip]', { id: spec.id, srcT: srcT.toFixed(3), mask, graph: !!gainNode, ctx: this.actx?.state, volume: el.volume, muted: el.muted, paused: el.paused, src: el.currentSrc.slice(0, 60) });
      }
      setGain(mask ? 0 : spec.gainAt(t));
      el.playbackRate = spec.speed;
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      if ((force || Math.abs(el.currentTime - srcT) > 0.35) && !el.seeking) {
        try {
          el.currentTime = srcT;
        } catch {
          /* metadata not ready: next tick retries */
        }
      }
      if (wantPlay && el.paused) el.play().catch(() => {});
      else if (!wantPlay && !el.paused) el.pause();
    }
    if (clipBeep !== this.clipBeep) {
      this.clipBeep = clipBeep;
      this.updateBeep();
    }
  }

  /** The transition window containing t (with 0.3s warm-up lead) → both-side segment indices; null if the cut doesn't align to a segment boundary. */
  private transitionWinAt(t: number): { cut: number; half: number; iA: number; iB: number } | null {
    for (const tr of this.trs) {
      if (t < tr.cut - tr.half - 0.3 || t > tr.cut + tr.half + 0.05) continue;
      for (let i = 1; i < this.segs.length; i++) {
        if (Math.abs(this.starts[i]! - tr.cut) < 0.05) return { cut: tr.cut, half: tr.half, iA: i - 1, iB: i };
      }
      return null;
    }
    return null;
  }

  /** Replace the overlay video layer set. Same ids keep their read positions; removed ids release them. */
  setLayers(layers: EngineLayer[]): void {
    const keep = new Set(layers.map((layer) => layer.id));
    for (const layer of this.layers) {
      if (keep.has(layer.id)) continue;
      const cursor = this.cursors.get(`layer:${layer.id}`);
      if (cursor) {
        cursor.close();
        this.cursors.delete(`layer:${layer.id}`);
      }
      this.layerLastPush.delete(layer.id);
      this.layerPending.delete(layer.id);
      if (this.layerVisible.delete(layer.id)) this.onLayerBlank?.(layer);
    }
    const previous = new Map(this.layers.map((layer) => [layer.id, layer]));
    for (const layer of layers) {
      const old = previous.get(layer.id);
      if (old && old.key !== layer.key) {
        const cursor = this.cursors.get(`layer:${layer.id}`);
        if (cursor) {
          cursor.close();
          this.cursors.delete(`layer:${layer.id}`);
        }
      }
      if (!old || old.key !== layer.key || old.srcStart !== layer.srcStart || old.srcEnd !== layer.srcEnd
        || old.timelineStart !== layer.timelineStart || old.timelineEnd !== layer.timelineEnd || old.elKey !== layer.elKey) {
        this.layerLastPush.delete(layer.id);
      }
    }
    this.layers = layers;
    this.layerGen += 1;
    if (!this.playing) this.pushLayers(this.tEdited);
  }

  private layerCursor(layer: EngineLayer): FrameCursor | null {
    const decoder = this.decoderFor(layer.key);
    if (!decoder) return null;
    const cursorKey = `layer:${layer.id}`;
    let cursor = this.cursors.get(cursorKey);
    if (!cursor) {
      cursor = decoder.cursor();
      this.cursors.set(cursorKey, cursor);
    }
    return cursor;
  }

  /** Per tick / on seek: every layer inside its window gets the frame for the clock; layers outside clear. */
  private pushLayers(t: number): void {
    for (const layer of this.layers) {
      const active = t >= layer.timelineStart - 1e-6 && t < layer.timelineEnd - 1e-6;
      if (!active) {
        if (this.layerVisible.delete(layer.id)) this.onLayerBlank?.(layer);
        this.layerPending.delete(layer.id);
        continue;
      }
      this.pushLayer(layer, t);
    }
  }

  private pushLayer(layer: EngineLayer, t: number): void {
    const duration = Math.max(1e-9, layer.timelineEnd - layer.timelineStart);
    const rate = Math.max(0, layer.srcEnd - layer.srcStart) / duration;
    const srcT = Math.min(layer.srcEnd, Math.max(layer.srcStart, layer.srcStart + (t - layer.timelineStart) * rate));
    const last = this.layerLastPush.get(layer.id);
    if (last != null && Math.abs(last - srcT) < 1 / 60) return;
    if (this.layerInflight.has(layer.id)) {
      this.layerPending.set(layer.id, t);
      return;
    }
    const cursor = this.layerCursor(layer);
    if (!cursor) {
      const entry = this.decoders.get(layer.key);
      if (entry?.ready && !entry.decoder && !this.layerWarned.has(layer.id)) {
        this.layerWarned.add(layer.id);
        console.warn('[studio] overlay video cannot be decoded here; its layer stays blank', { clipId: layer.id, key: layer.key.slice(0, 48) });
      }
      return;
    }
    const gen = this.layerGen;
    this.layerInflight.add(layer.id);
    cursor.frameAt(srcT)
      .then(async (frame) => {
        if (!frame) return;
        const bitmap = await createImageBitmap(frame.canvas);
        if (gen !== this.layerGen || !this.layers.includes(layer) || !this.onLayerFrame) {
          bitmap.close();
          return;
        }
        this.layerLastPush.set(layer.id, srcT);
        this.layerVisible.add(layer.id);
        this.onLayerFrame(layer, bitmap, { t, srcT, sourceWidth: frame.width, sourceHeight: frame.height });
      })
      .catch(() => undefined)
      .then(() => {
        this.layerInflight.delete(layer.id);
        const pending = this.layerPending.get(layer.id);
        if (pending == null || !this.layers.includes(layer)) return;
        this.layerPending.delete(layer.id);
        this.pushLayer(layer, pending);
      });
  }

  /** The "other side" of a cut transition at t: which segment, its source time, and the read position to use. */
  private transitionOtherAt(t: number, w: { cut: number; half: number; iA: number; iB: number }): { seg: EngineSeg; srcT: number; side: 'pre' | 'post' } {
    const pre = t < w.cut;
    const otherIndex = pre ? w.iB : w.iA;
    const seg = this.segs[otherIndex]!;
    const rate = segmentSourceRate(seg, this.starts[otherIndex]!, this.ends[otherIndex]!);
    const srcT = pre
      ? Math.max(0, seg.srcStart - (w.cut - t) * rate)
      : seg.srcEnd + (t - w.cut) * rate;
    return { seg, srcT, side: pre ? 'pre' : 'post' };
  }

  private alive(i: number): boolean {
    const s = this.segs[i];
    if (!s) return false;
    if (this.decoderFor(s.key)) return true; // the picture no longer depends on the element
    const el = this.els.get(s.key);
    // A just-created element has currentSrc '' until resource selection starts — it IS alive (seek
    // parks a 'loadeddata' listener and the frame arrives once loaded). Requiring currentSrc here
    // made the first insert's synchronous refresh() give up with curIdx=-1 and nothing ever retried
    // (blank canvas until the next seek). Dead = no element (source removed/missing) or a load error.
    return !!el && !el.error && (!!el.currentSrc || !!el.src);
  }

  private segIndexAt(t: number): number {
    for (let i = 0; i < this.segs.length; i++) {
      if (t >= this.starts[i]! - 1e-6 && t < this.ends[i]! - 1e-6) return i;
    }
    return -1;
  }

  /** The playable segment covering t. Native gaps and unresolved clips return -1. */
  private playableAt(t: number): number {
    const i = this.segIndexAt(t);
    return i >= 0 && this.alive(i) ? i : -1;
  }

  private enterBlank(t: number): void {
    this.curIdx = -1;
    this.lastPush = null;
    for (const el of this.els.values()) {
      el.muted = true;
      if (!el.paused) el.pause();
    }
    for (const dub of this.dubs.values()) if (!dub.el.paused) dub.el.pause();
    this.onBlank?.(t);
  }

  private activateIdx(i: number, srcT: number, wantPlay: boolean): void {
    this.curIdx = i;
    const key = this.segs[i]!.key;
    for (const [k, el] of this.els) {
      if (k === key) continue;
      el.muted = true;
      if (!el.paused) el.pause();
    }
    const el = this.els.get(key);
    if (!el) return;
    const rate = segmentSourceRate(this.segs[i]!, this.starts[i]!, this.ends[i]!);
    el.playbackRate = rate > 1e-9 ? rate : 1;
    // Explicit: a retimed shot keeps the speaker's pitch here AND in the export (time-stretch.ts)
    (el as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
    try {
      el.currentTime = Math.max(0, srcT);
    } catch {
      /* metadata not ready: the next seek after loadedmetadata covers it */
    }
    this.setElGain(el, this.segGain(i));
    // a mounted dub carries this source's sound → the decode element stays muted no matter what
    const dubbed = this.syncDub(key, el, this.segGain(i), wantPlay);
    el.muted = dubbed || !wantPlay; // only the active element makes sound during playback
    if (this.maskActive) {
      this.maskActive = null;
      this.updateBeep();
    }
    if (wantPlay && this.audioMasks.size) this.applyMask(key, el, Math.max(0, srcT), dubbed);
    if (wantPlay) {
      const p = el.play();
      if (p?.catch) p.catch(() => {});
    } else if (!el.paused) {
      el.pause();
    }
  }

  private finishBitmapPush(): void {
    this.bitmapInflight = false;
    if (!this.bitmapPending) return;
    this.bitmapPending = false;
    this.pushFrame(undefined, this.pendingSrcT ?? undefined);
    this.pendingSrcT = null;
  }

  /** The source time a coalesced re-push should use (decoder path: the element may not be there yet). */
  private pendingSrcT: number | null = null;

  /** Display dimensions of a source: the decoder's (rotation applied) or the element's. */
  private sourceDims(key: string, el: HTMLVideoElement | undefined): { w: number; h: number } | null {
    const decoder = this.decoderFor(key);
    if (decoder) return { w: decoder.width, h: decoder.height };
    if (el && el.videoWidth) return { w: el.videoWidth, h: el.videoHeight };
    return null;
  }

  /**
   * Push the picture for the active segment. `srcTOverride` names the source time when the element's
   * clock is not the reference (a paused seek that has not settled, a dead element kept alive by its
   * decoder); otherwise the element's currentTime is the truth.
   */
  private pushFrame(tOverride?: number, srcTOverride?: number): void {
    if (this.bitmapInflight) {
      this.bitmapPending = true;
      if (srcTOverride != null) this.pendingSrcT = srcTOverride;
      return;
    }
    if (this.curIdx < 0) return;
    const requestGen = this.seekGen;
    const requestIdx = this.curIdx;
    const seg = this.segs[this.curIdx];
    if (!seg) return;
    const el = this.els.get(seg.key);
    const cursor = this.cursorFor(seg.key, 'main');
    if (!cursor && (!el || el.readyState < 2 || !el.videoWidth)) return;
    const dims = this.sourceDims(seg.key, el);
    if (!dims) return;
    const srcT = srcTOverride ?? (el && !el.error ? el.currentTime : segmentSourceTimeAt(seg, this.tEdited, this.starts[this.curIdx]!, this.ends[this.curIdx]!));
    const t = tOverride ?? segmentTimelineTimeAt(seg, srcT, this.starts[this.curIdx]!, this.ends[this.curIdx]!);
    // inside the transition window (excluding warm-up), carry the other side's picture; skip dedup (the other side is moving, push even if the main frame is same-position)
    const w = this.transitionWinAt(t);
    const inWin = !!w && t >= w.cut - w.half;
    const bake = inWin ? this.bakeProvider?.(w!.cut) : null;
    if (bake && inWin && bake.frames.length) {
      // pre-bake path: push finished frames by frame index (clone then transfer; dedup same frame), decoder doesn't touch the picture at all
      const idx = Math.max(0, Math.min(bake.frames.length - 1, Math.round((t - (w!.cut - bake.half)) * bake.fps)));
      const bkey = `bake@${w!.cut}`;
      if (this.lastPush && this.lastPush.key === bkey && this.lastPush.srcT === idx) return;
      this.bitmapInflight = true;
      createImageBitmap(bake.frames[idx]!).then(
        (bmp) => {
          if (requestGen !== this.seekGen || requestIdx !== this.curIdx) {
            bmp.close();
            this.finishBitmapPush();
            return;
          }
          this.lastPush = { key: bkey, srcT: idx };
          this.onFrame?.(
            bmp,
            {
              t,
              elKey: seg.elKey,
              srcT,
              baked: true,
              sourceWidth: dims.w,
              sourceHeight: dims.h,
              ...(seg.framing ? { framing: seg.framing } : {}),
            },
            null,
          );
          this.finishBitmapPush();
        },
        () => {
          this.finishBitmapPush();
        },
      );
      return;
    }
    // The other side of a cut: a second read position on that source (decoder path only; an element-only
    // source has no second picture and the runtime degrades to a hard cut).
    const other = inWin && w ? this.transitionOtherAt(t, w) : null;
    const otherCursor = other ? this.cursorFor(other.seg.key, other.side) : null;
    if (!otherCursor && this.lastPush && this.lastPush.key === seg.key && Math.abs(this.lastPush.srcT - srcT) < 1 / 60) return;
    this.bitmapInflight = true;
    const grabMain: Promise<ImageBitmap | null> = cursor
      ? cursor.frameAt(srcT).then((frame) => (frame ? createImageBitmap(frame.canvas) : null))
      : this.displayBitmap(el!);
    const grabOther: Promise<{ bmp: ImageBitmap; w: number; h: number } | null> = otherCursor && other
      ? otherCursor.frameAt(other.srcT).then(async (frame) => (frame ? { bmp: await createImageBitmap(frame.canvas), w: frame.width, h: frame.height } : null)).catch(() => null)
      : Promise.resolve(null);
    Promise.all([grabMain, grabOther]).then(
      ([bmp, second]) => {
        if (!bmp || requestGen !== this.seekGen || requestIdx !== this.curIdx) {
          // superseded (a newer seek took the cursor) or stale: the newer request pushes
          bmp?.close();
          second?.bmp.close();
          this.finishBitmapPush();
          return;
        }
        this.lastPush = { key: seg.key, srcT };
        this.onFrame?.(
          bmp,
          {
            t,
            elKey: seg.elKey,
            srcT,
            sourceWidth: dims.w,
            sourceHeight: dims.h,
            ...(seg.framing ? { framing: seg.framing } : {}),
            ...(second && other?.seg.framing ? { framing2: other.seg.framing } : {}),
            ...(second ? { sourceWidth2: second.w, sourceHeight2: second.h } : {}),
          },
          second?.bmp ?? null,
        );
        this.finishBitmapPush();
      },
      () => {
        this.finishBitmapPush();
      },
    );
  }

  /** Element picture path (no decoder for this source). Produce a bitmap in the video's display
   *  coordinate space. Most sources return the video bitmap directly. For phone footage whose
   *  ImageBitmap still exposes the encoded landscape surface while videoWidth/videoHeight are portrait,
   *  normalize through a correctly-sized canvas. That one-time mismatch decision is cached per element. */
  private async displayBitmap(el: HTMLVideoElement): Promise<ImageBitmap> {
    const width = el.videoWidth;
    const height = el.videoHeight;
    const mode = this.bitmapModes.get(el);
    if (mode?.width === width && mode.height === height && mode.normalize) {
      return this.normalizedBitmap(el, width, height);
    }
    const bitmap = await createImageBitmap(el);
    const normalize = bitmap.width !== width || bitmap.height !== height;
    this.bitmapModes.set(el, { width, height, normalize });
    if (!normalize) return bitmap;
    try {
      const normalized = await this.normalizedBitmap(el, width, height);
      bitmap.close();
      return normalized;
    } catch {
      return bitmap;
    }
  }

  private normalizedBitmap(el: HTMLVideoElement, width: number, height: number): Promise<ImageBitmap> {
    let canvas = this.bitmapStages.get(el);
    if (!canvas) {
      canvas = document.createElement('canvas');
      this.bitmapStages.set(el, canvas);
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('2D canvas is unavailable.'));
    context.clearRect(0, 0, width, height);
    context.drawImage(el, 0, 0, width, height);
    return createImageBitmap(canvas);
  }

  /** Paused seek: park the active element, push the frame for the new position, align every layer. */
  seek(t: number): void {
    const gen = ++this.seekGen;
    this.tEdited = Math.max(0, Math.min(this.total, t));
    this.tSmooth = this.tEdited;
    this.layerLastPush.clear(); // an explicit seek re-pushes every layer (a fresh document has blank canvases)
    const i = this.playableAt(this.tEdited);
    if (i < 0) {
      this.enterBlank(this.tEdited);
      this.syncAudioClips(this.tEdited, this.playing, true);
      this.pushLayers(this.tEdited);
      return;
    }
    const seg = this.segs[i]!;
    // seek into a dead window: degrade to showing the first frame of the next playable segment (same as the shim era, no freeze)
    const srcT = segmentSourceTimeAt(seg, this.tEdited, this.starts[i]!, this.ends[i]!);
    this.activateIdx(i, srcT, this.playing);
    this.syncAudioClips(this.tEdited, this.playing, true); // park the clips at the new position (aligned resume)
    this.pushLayers(this.tEdited);
    const el = this.els.get(seg.key);
    this.trace(seg.key, `seek t=${this.tEdited.toFixed(2)} src=${srcT.toFixed(3)} rs=${el?.readyState ?? '-'} seeking=${el?.seeking ?? '-'}`);
    const push = (srcTKnown?: number) => {
      if (gen !== this.seekGen) return;
      this.lastPush = null; // the seek frame must push (same-frame dedup would block a re-push on an in-place seek)
      this.pushFrame(undefined, srcTKnown);
    };
    if (this.decoderFor(seg.key)) {
      push(srcT); // the picture does not wait for the element's seek
      return;
    }
    if (!el) return;
    if (el.readyState >= 2 && Math.abs(el.currentTime - srcT) < 0.01) push();
    else {
      el.addEventListener('seeked', () => push(), { once: true });
      el.addEventListener('loadeddata', () => push(), { once: true });
    }
  }

  play(t: number): void {
    this.tEdited = Math.max(0, Math.min(this.total, t));
    this.playing = true;
    const i = this.playableAt(this.tEdited);
    if (i >= 0) this.trace(this.segs[i]!.key, `play t=${this.tEdited.toFixed(2)}`);
    if (i < 0) {
      this.enterBlank(this.tEdited);
    } else {
      const seg = this.segs[i]!;
      const srcT = segmentSourceTimeAt(seg, this.tEdited, this.starts[i]!, this.ends[i]!);
      this.activateIdx(i, srcT, true);
    }
    this.syncAudioClips(this.tEdited, true, true); // hard-align the clips at play start
    if (this.raf) cancelAnimationFrame(this.raf);
    let lastCt = -1;
    let lastCtAt = performance.now();
    let lastLoopAt = performance.now();
    this.tSmooth = this.tEdited;
    /** Segment-tail handoff: roll into an adjacent native segment, enter a gap, or finish. Returns false when playback ended. */
    const handoff = (idx: number, sg: EngineSeg, el: HTMLVideoElement | null): boolean => {
      // Segment-tail handoff only rolls through an immediately adjacent native segment.
      // A real gap (or unresolved segment) enters the timeline clock and clears the frame.
      const boundary = this.ends[idx]!;
      this.tEdited = Math.min(this.total, boundary);
      const nx = this.playableAt(this.tEdited + 1e-6);
      if (nx >= 0) {
        const nxSeg = this.segs[nx]!;
        if (el && nxSeg.key === sg.key && Math.abs(nxSeg.srcStart - sg.srcEnd) < 0.05 && !el.ended && !el.paused) {
          // continuous same-source split point (pure split, no footage removed): the element is already
          // playing right here — swap the active index without a seek so decode isn't interrupted (forcing
          // an in-place currentTime seek stalls 50–150ms, visible as a "flash/stutter" at the cut)
          this.curIdx = nx;
          const nextRate = segmentSourceRate(nxSeg, this.starts[nx]!, this.ends[nx]!);
          el.playbackRate = nextRate > 1e-9 ? nextRate : 1;
          this.setElGain(el, this.segGain(nx)); // roll-through skips activateIdx, but the two shots may carry different gains
        } else {
          this.activateIdx(nx, nxSeg.srcStart, true);
        }
        return true;
      }
      if (this.tEdited < this.total - EPS) {
        this.enterBlank(this.tEdited);
        this.tSmooth = Math.max(this.tSmooth, this.tEdited);
        return true;
      }
      this.pause();
      this.tEdited = this.total;
      this.onTick?.(this.total);
      this.onEnded?.();
      return false;
    };
    const loop = () => {
      if (!this.playing) return;
      const idx = this.curIdx;
      const sg = idx >= 0 ? this.segs[idx] : null;
      const el = sg ? this.els.get(sg.key) : null;
      const nowLoop = performance.now();
      const dtWall = Math.min(0.1, (nowLoop - lastLoopAt) / 1000);
      lastLoopAt = nowLoop;
      if (sg && el && !el.error) {
        const ct = el.currentTime;
        this.tEdited = segmentTimelineTimeAt(sg, Math.min(ct, sg.srcEnd), this.starts[idx]!, this.ends[idx]!);
        // smooth clock: wall-clock advance + proportional pull-back (close 12% of the drift per frame).
        // Hard snap-back is reserved for real jumps (>250ms: seek/handoff) — a smaller threshold aliases:
        // when the media clock stutters, wall clock runs ahead, and once the threshold builds up it yanks
        // back, visibly jerking the playhead and reversing transition progress (observed). During soft
        // correction, never run backward (monotonic).
        let ts;
        if (this.tSmooth < 0) ts = this.tEdited;
        else {
          // clock discipline: never run backward (going back = baked transition frames replay in reverse,
          // observed as "the transition played twice"). Leading the media (at the cut, the main element's
          // audio-trim seek stalls the media clock) = coast at reduced rate to catch up, no hard yank;
          // lagging >0.25s (forward seek/handoff) = jump forward only. Inside the bake window, free-wheel
          // (picture doesn't need the decoder), but leading >0.6s also halves the rate as a backstop.
          const wB = this.transitionWinAt(this.tSmooth);
          const freewheel = !!wB && this.tSmooth >= wB.cut - wB.half && !!this.bakeProvider?.(wB.cut);
          const lead = this.tSmooth - this.tEdited;
          let rate = 1;
          if (!freewheel && lead > 0.04) rate = Math.max(0.3, 1 - lead * 2.5);
          if (freewheel && lead > 0.6) rate = 0.5;
          ts = this.tSmooth + dtWall * rate;
          if (ts - this.tEdited < -0.25) ts = this.tEdited; // too far behind: jump forward (forward doesn't hurt perception)
          if (ts < this.tSmooth) ts = this.tSmooth;
        }
        this.tSmooth = ts;
        this.onTick?.(ts);
        this.syncAudioClips(ts, true);
        if (this.segs[idx]?.fadeAt && !el.muted) this.setElGain(el, this.segGain(idx, ts)); // shot audio fades ride the clock
        const dubbedNow = this.dubs.size > 0 && this.syncDub(sg.key, el, this.segGain(this.curIdx), true);
        if (dubbedNow) el.muted = true;
        if (this.audioMasks.size || this.maskActive) this.applyMask(sg.key, el, ct, dubbedNow);
        this.pushFrame(ts);
        this.pushLayers(ts);
        // segment-end detection, three checks: (1) reached segment end; (2) element fires ended;
        // (3) stall backstop — streaming webm duration is estimated via Infinity-seek and may be too
        // high (measured 4.0 vs data ending at 3.92), so the element neither fires ended nor reaches
        // srcEnd; only "clock not advancing near the tail" closes it out
        const durCap = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
        const segEnd = Math.min(sg.srcEnd, durCap);
        const now = performance.now();
        if (Math.abs(ct - lastCt) > 0.005) {
          lastCt = ct;
          lastCtAt = now;
        }
        const stalledAtTail = now - lastCtAt > 700 && ct >= segEnd - 0.6 && !el.seeking;
        if ((ct >= segEnd - EPS || el.ended || stalledAtTail) && !handoff(idx, sg, el)) return;
      } else if (sg && this.decoderFor(sg.key)) {
        // The element is dead (a load error) but the decoder holds the picture: keep time by wall clock,
        // silent, until the owner re-seats the element.
        this.tEdited = Math.min(this.total, this.tEdited + dtWall);
        this.tSmooth = this.tEdited;
        this.onTick?.(this.tEdited);
        this.syncAudioClips(this.tEdited, true);
        if (this.tEdited >= this.ends[idx]! - 1e-6) {
          if (!handoff(idx, sg, null)) return;
        } else {
          this.pushFrame(this.tEdited, segmentSourceTimeAt(sg, this.tEdited, this.starts[idx]!, this.ends[idx]!));
        }
        this.pushLayers(this.tEdited);
      } else {
        // No playable video at this time (or no video at all): advance the document clock from
        // wall time. This is the canonical path for graphics/audio-only projects.
        this.tEdited = Math.min(this.total, this.tEdited + dtWall);
        this.tSmooth = this.tEdited;
        const nextVideo = this.playableAt(this.tEdited);
        if (nextVideo >= 0) {
          const nextSeg = this.segs[nextVideo]!;
          this.activateIdx(
            nextVideo,
            segmentSourceTimeAt(nextSeg, this.tEdited, this.starts[nextVideo]!, this.ends[nextVideo]!),
            true,
          );
        }
        this.onTick?.(this.tEdited);
        this.syncAudioClips(this.tEdited, true);
        this.pushLayers(this.tEdited);
        if (this.tEdited >= this.total - 1e-6) {
          this.pause();
          this.tEdited = this.total;
          this.onTick?.(this.total);
          this.onEnded?.();
          return;
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.maskActive = null;
    this.clipBeep = false;
    this.setBeep(false);
    for (const el of this.els.values()) {
      el.muted = true;
      if (!el.paused) el.pause();
    }
    for (const c of this.audioClips.values()) if (!c.el.paused) c.el.pause();
    for (const d of this.dubs.values()) if (!d.el.paused) d.el.pause();
  }

  /** Re-push the current picture, every layer included (after a buffer swap the new document's canvases are blank). */
  refresh(): void {
    if (this.playing) return; // during playback the next frame arrives naturally
    this.seek(this.tEdited);
  }

  dispose(): void {
    this.pause();
    if (this.beep) {
      void this.beep.ctx.close().catch(() => {});
      this.beep = null;
    }
    for (const c of this.audioClips.values()) {
      c.gain?.disconnect();
      releaseMediaElement(c.el);
    }
    this.audioClips.clear();
    void this.actx?.close().catch(() => {});
    this.actx = null;
    for (const d of this.dubs.values()) releaseMediaElement(d.el);
    this.dubs.clear();
    for (const el of this.els.values()) releaseMediaElement(el);
    for (const cursor of this.cursors.values()) cursor.close();
    this.cursors.clear();
    for (const entry of this.decoders.values()) entry.decoder?.close();
    this.decoders.clear();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.els.clear();
    this.urls.clear();
    this.srcIds.clear();
    this.layers = [];
    this.layerVisible.clear();
    this.layerLastPush.clear();
    this.layerPending.clear();
    this.layerInflight.clear();
    this.host?.remove();
    this.host = null;
  }
}

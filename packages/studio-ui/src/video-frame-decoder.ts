/**
 * WebCodecs frame access for the preview engine.
 *
 * The picture side of the preview used to come from `<video>` elements: seek, wait for `seeked`,
 * `createImageBitmap(video)`. Element seeks go through the browser's media pipeline, which is built
 * for playback, not for random access — a scrub that lands mid-GOP stalls, a demuxer that trips on a
 * seek marks the element as errored, and a document that swaps decoders churns. Here the file is
 * demuxed once and every read position is an independent decoder that produces the frame at a
 * timestamp on request. Sound and the master clock stay on the media element; only pixels move.
 *
 * A cursor answers the newest frame at or before a source time. Reads that move forward a little
 * (playback, a hover that walks along the clip) pull the next samples of the running decode; reads
 * that jump start a fresh decode at the target. Requests are serialized per cursor and a request
 * superseded before it starts resolves `null`, so a burst of hover seeks costs one decode.
 */

import '@pireel/studio-engine/video-edit/mediabunny-warnings';
import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink, type InputVideoTrack, type VideoSample } from 'mediabunny';

export interface DecodedFrame {
  /** A canvas holding the frame in display orientation (rotation metadata applied). Valid until the cursor's next resolved read. */
  canvas: HTMLCanvasElement;
  /** Source timestamp of the frame in seconds. */
  timestamp: number;
  duration: number;
  width: number;
  height: number;
}

/** Forward reads within this window continue the running decode instead of restarting it. */
const SEQUENTIAL_WINDOW_SEC = 1.5;

/** Same-origin URL for a media resource: WebCodecs reads bytes with `fetch`, so cross-origin media goes
 *  through the authenticated media proxy (which forwards Range requests). Local and same-origin stay direct. */
export function decodableMediaUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    const target = new URL(url, window.location.href);
    if ((target.protocol === 'http:' || target.protocol === 'https:') && target.origin !== window.location.origin) {
      return `/api/media/fetch?url=${encodeURIComponent(target.toString())}`;
    }
  } catch {
    // Keep opaque values unchanged; opening the input surfaces the real failure.
  }
  return url;
}

export class FrameCursor {
  private readonly sink: VideoSampleSink;
  private iterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private iteratorStart = -1;
  private current: VideoSample | null = null;
  private pending: VideoSample | null = null;
  private stage: HTMLCanvasElement | null = null;
  private stagedTimestamp = -1;
  private chain: Promise<unknown> = Promise.resolve();
  private latest = 0;
  private closed = false;

  constructor(track: InputVideoTrack, readonly width: number, readonly height: number) {
    this.sink = new VideoSampleSink(track);
  }

  /** The frame at or before `srcT`, drawn into the cursor's stage canvas. `null` when superseded or closed. */
  frameAt(srcT: number): Promise<DecodedFrame | null> {
    const request = ++this.latest;
    const run = this.chain.then(async () => {
      if (this.closed || request !== this.latest) return null;
      await this.advance(srcT);
      if (this.closed || request !== this.latest) return null;
      return this.staged();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Whether the frame currently held covers `srcT` (no decode needed to answer it). */
  covers(srcT: number): boolean {
    const cur = this.current;
    if (!cur) return false;
    if (srcT < cur.timestamp) return false;
    if (this.pending) return srcT < this.pending.timestamp;
    return srcT < cur.timestamp + Math.max(cur.duration, 1 / 120);
  }

  private async advance(srcT: number): Promise<void> {
    if (this.covers(srcT)) return;
    const cur = this.current;
    const forward = !!cur && !!this.iterator && srcT >= cur.timestamp && srcT - cur.timestamp <= SEQUENTIAL_WINDOW_SEC;
    if (!forward) this.restart(srcT);
    for (;;) {
      if (this.pending) {
        if (this.pending.timestamp <= srcT) {
          this.current?.close();
          this.current = this.pending;
          this.pending = null;
          continue;
        }
        break;
      }
      if (!this.iterator) break;
      const next = await this.iterator.next();
      if (this.closed) {
        if (!next.done && next.value) next.value.close();
        return;
      }
      if (next.done || !next.value) {
        this.iterator = null;
        break;
      }
      if (next.value.timestamp <= srcT || !this.current) {
        this.current?.close();
        this.current = next.value;
      } else {
        this.pending = next.value;
        break;
      }
    }
  }

  private restart(srcT: number): void {
    void this.iterator?.return(undefined);
    this.current?.close();
    this.pending?.close();
    this.current = null;
    this.pending = null;
    this.iteratorStart = Math.max(0, srcT);
    this.iterator = this.sink.samples(this.iteratorStart);
  }

  private staged(): DecodedFrame | null {
    const cur = this.current;
    if (!cur) return null;
    if (!this.stage) this.stage = document.createElement('canvas');
    const stage = this.stage;
    if (stage.width !== this.width) stage.width = this.width;
    if (stage.height !== this.height) stage.height = this.height;
    if (this.stagedTimestamp !== cur.timestamp) {
      const context = stage.getContext('2d');
      if (!context) return null;
      context.clearRect(0, 0, this.width, this.height);
      cur.draw(context, 0, 0, this.width, this.height);
      this.stagedTimestamp = cur.timestamp;
    }
    return { canvas: stage, timestamp: cur.timestamp, duration: cur.duration, width: this.width, height: this.height };
  }

  close(): void {
    this.closed = true;
    this.latest += 1;
    void this.iterator?.return(undefined);
    this.iterator = null;
    this.current?.close();
    this.pending?.close();
    this.current = null;
    this.pending = null;
    this.stage = null;
    this.stagedTimestamp = -1;
  }
}

/** One demuxed source; hands out independent read positions (main picture, transition sides, overlay layers). */
export class SourceFrameDecoder {
  private readonly cursors = new Set<FrameCursor>();
  private closed = false;

  private constructor(
    private readonly input: Input,
    private readonly track: InputVideoTrack,
    readonly width: number,
    readonly height: number,
    readonly durationSec: number,
  ) {}

  /**
   * Open a File or URL for decoding. Resolves `null` when the container or codec cannot be decoded
   * here (the caller then keeps the media element as its picture source).
   */
  static async open(source: File | string): Promise<SourceFrameDecoder | null> {
    if (typeof VideoDecoder === 'undefined') return null;
    const input = new Input({
      source: typeof source === 'string' ? new UrlSource(decodableMediaUrl(source)) : new BlobSource(source),
      formats: ALL_FORMATS,
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) {
        void input.dispose();
        return null;
      }
      const duration = await track.computeDuration();
      return new SourceFrameDecoder(input, track, track.displayWidth, track.displayHeight, duration);
    } catch {
      void input.dispose();
      return null;
    }
  }

  cursor(): FrameCursor {
    const cursor = new FrameCursor(this.track, this.width, this.height);
    this.cursors.add(cursor);
    return cursor;
  }

  release(cursor: FrameCursor): void {
    cursor.close();
    this.cursors.delete(cursor);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cursor of this.cursors) cursor.close();
    this.cursors.clear();
    void this.input.dispose();
  }
}

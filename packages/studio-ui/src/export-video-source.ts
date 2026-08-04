import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import { t } from './i18n';

/** Sequential MediaBunny source reader shared by export and transition baking. */
export interface SourceRig {
  input: Input;
  video: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;
  audio: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>;
  it: AsyncIterator<VideoSample> | null;
  cur: VideoSample | null;
  pending: VideoSample | null;
  sw: number;
  sh: number;
}

export async function openSource(file: File, from: number, to: number): Promise<SourceRig> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) {
    void input.dispose();
    throw new Error(t('common.sourceNoVideoTrack'));
  }
  const audio = await input.getPrimaryAudioTrack();
  const sink = new VideoSampleSink(video);
  return {
    input,
    video,
    audio,
    it: sink.samples(from, to + 0.5)[Symbol.asyncIterator](),
    cur: null,
    pending: null,
    sw: video.displayWidth,
    sh: video.displayHeight,
  };
}

/** Take the last sequentially decoded frame whose timestamp is at or before srcT. */
export async function sampleAt(rig: SourceRig, srcT: number): Promise<VideoSample | null> {
  for (;;) {
    if (rig.pending) {
      if (rig.pending.timestamp <= srcT) {
        rig.cur?.close();
        rig.cur = rig.pending;
        rig.pending = null;
        continue;
      }
      break;
    }
    if (!rig.it) break;
    const { value, done } = await rig.it.next();
    if (done || !value) break;
    if (value.timestamp <= srcT) {
      rig.cur?.close();
      rig.cur = value;
    } else {
      rig.pending = value;
      break;
    }
  }
  return rig.cur;
}

export function disposeSourceRig(rig: SourceRig): void {
  rig.cur?.close();
  rig.pending?.close();
  void rig.it?.return?.(undefined);
  void rig.input.dispose();
}

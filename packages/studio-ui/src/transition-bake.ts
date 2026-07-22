/**
 * Pre-bake a transition window: cut/duration/effect are all known, so compose the
 * whole window offline (MediaBunny two-sided sampling + one gl-transitions mixer) and
 * just play frames back — takes "schedule two decoders live" off the critical path.
 *
 * Output = webp frame sequence (0.5× comp resolution, 30fps; a 1s transition ≈ 30
 * frames × ~80KB ≈ 2.4MB memory). The engine calls decodeBake into ImageBitmaps as it
 * approaches the window, then drops them once past. Bake fails / didn't finish → engine
 * falls back to the shadow-decode path, same semantics.
 *
 * Frame content matches the preview shim exactly: both source frames composed cover
 * (no framing/grading — those are element-level CSS transform/filter on #vidEl in the
 * preview, applied by GSAP keyframes over the whole canvas as usual).
 */

import { type GlMixer, createGlMixer, glDirection } from '@pireel/studio-engine/transition-gl';
import type { CutTransitionEffect, TransitionDirection } from '@pireel/studio-engine/composition';
import { type SourceRig, openSource, sampleAt } from './client-export';

export interface BakeSpec {
  /** Output cut point (seconds) and half-width. */
  cut: number;
  half: number;
  effect: CutTransitionEffect;
  dir: TransitionDirection;
  /** Both source files and their source times at the cut (A ends at aEnd, B starts at bStart). */
  fileA: File;
  aEnd: number;
  fileB: File;
  bStart: number;
  /** Canvas (comp) size — bake renders at 0.5×. */
  compW: number;
  compH: number;
}

export interface BakedWindow {
  cut: number;
  half: number;
  fps: number;
  w: number;
  h: number;
  frames: Blob[];
}

/** Frame budget: short windows bake at high fps (1s ≈ 48fps), long windows drop fps to cap memory; clamped 24–60. */
const FRAME_BUDGET = 96;

/** Bake one transition window. cancelled() polls for cancellation (frequent re-bakes while editing; stale tasks yield immediately). */
export async function bakeTransitionWindow(spec: BakeSpec, cancelled?: () => boolean): Promise<BakedWindow | null> {
  const W = Math.max(2, Math.round(spec.compW / 2));
  const H = Math.max(2, Math.round(spec.compH / 2));
  const mixer: GlMixer | null = createGlMixer(W, H);
  if (!mixer) return null;
  const fps = Math.max(24, Math.min(60, FRAME_BUDGET / (2 * spec.half)));
  const n = Math.max(2, Math.round(2 * spec.half * fps));
  // Two sequential sample streams per side (live + handle; sampleAt is monotonic per stream, and the time domains don't connect so they must be separate)
  const rigs: SourceRig[] = [];
  const open = async (f: File, from: number, to: number) => {
    const r = await openSource(f, Math.max(0, from), Math.max(0, to), W, H);
    rigs.push(r);
    return r;
  };
  const stageF = new OffscreenCanvas(W, H);
  const stageT = new OffscreenCanvas(W, H);
  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d')!;
  try {
    const liveA = await open(spec.fileA, spec.aEnd - spec.half, spec.aEnd);
    const ghostB = await open(spec.fileB, spec.bStart - spec.half, spec.bStart);
    const ghostA = await open(spec.fileA, spec.aEnd, spec.aEnd + spec.half);
    const liveB = await open(spec.fileB, spec.bStart, spec.bStart + spec.half);
    const [dx, dy] = glDirection(spec.dir);
    const frames: Blob[] = [];
    // Each side draws into its own stage; if sampling runs out of bounds (handle too short), reuse the last frame rather than aborting the bake
    let haveF = false;
    let haveT = false;
    const drawSide = async (rig: SourceRig, srcT: number, stage: OffscreenCanvas): Promise<boolean> => {
      const smp = await sampleAt(rig, srcT);
      if (!smp) return false;
      const g = stage.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      smp.draw(g, (W - rig.dw) / 2, (H - rig.dh) / 2, rig.dw, rig.dh);
      return true;
    };
    for (let i = 0; i < n; i++) {
      if (cancelled?.()) return null;
      const t = spec.cut - spec.half + (i / (n - 1)) * 2 * spec.half;
      const p = i / (n - 1);
      const pre = t < spec.cut;
      // from/to same convention as shim: before cut A live / B pre-roll, after cut A tail / B live
      haveF = (pre ? await drawSide(liveA, spec.aEnd - (spec.cut - t), stageF) : await drawSide(ghostA, spec.aEnd + (t - spec.cut), stageF)) || haveF;
      haveT = (pre ? await drawSide(ghostB, spec.bStart - (spec.cut - t), stageT) : await drawSide(liveB, spec.bStart + (t - spec.cut), stageT)) || haveT;
      if (!haveF || !haveT) return null; // can't even sample the first frame: this window can't be baked (media boundary)
      if (!mixer.render(stageF, stageT, spec.effect, p, dx, dy, `f${i}`, `t${i}`)) return null;
      octx.clearRect(0, 0, W, H);
      octx.drawImage(mixer.canvas, 0, 0);
      frames.push(await out.convertToBlob({ type: 'image/webp', quality: 0.82 }));
    }
    return { cut: spec.cut, half: spec.half, fps: (n - 1) / (2 * spec.half), w: W, h: H, frames };
  } catch {
    return null;
  } finally {
    for (const r of rigs) {
      r.cur?.close();
      r.pending?.close();
      void r.input.dispose();
    }
  }
}

/** webp frame sequence → ImageBitmap sequence (called as the engine approaches the window; close the whole set once past). */
export async function decodeBake(b: BakedWindow): Promise<ImageBitmap[]> {
  return Promise.all(b.frames.map((blob) => createImageBitmap(blob)));
}

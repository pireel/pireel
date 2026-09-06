/** Minimal typings for signalsmith-stretch (no upstream types). The module is self-contained:
 *  the WASM is embedded as base64 and the AudioWorklet processor is registered from a blob URL,
 *  so nothing needs asset plumbing under Vite. We only use the sample-buffer mode offline. */
declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    /** Audio-context time this change applies at (seconds). */
    output?: number;
    active?: boolean;
    /** Position in the loaded input buffer (seconds). */
    input?: number;
    /** Playback rate: 0.5 = half speed, 2 = double. Pitch is preserved. */
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  export interface StretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(change: StretchSchedule): Promise<unknown>;
    start(when?: number, offset?: number, duration?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    /** Append planar channel buffers (equal length, one per channel). Resolves to the new buffer end time in seconds. */
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<unknown>;
    latency(): Promise<number>;
    configure(options: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: 'default' | 'cheaper' }): Promise<unknown>;
    setUpdateInterval(seconds: number, callback?: (inputTime: number) => void): Promise<unknown>;
  }
  const SignalsmithStretch: (
    audioContext: BaseAudioContext,
    options?: { numberOfInputs?: number; numberOfOutputs?: number; outputChannelCount?: number[] },
  ) => Promise<StretchNode>;
  export default SignalsmithStretch;
}

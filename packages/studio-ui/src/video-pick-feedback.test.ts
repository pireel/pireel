import { describe, expect, it } from 'vitest';
import {
  outputSwitchVideoPickOptions,
  videoPickSuccessNotices,
} from './video-pick-feedback';

describe('video pick success feedback', () => {
  it('keeps output-switch media reconnection silent', () => {
    const options = outputSwitchVideoPickOptions('video-sig');
    expect(options).toEqual({ asSig: 'video-sig', reconnect: true, successFeedback: 'silent' });
    expect(videoPickSuccessNotices(true, options)).toEqual({ reconnected: false, loaded: false });
  });

  it('keeps success feedback for an explicit user-driven video pick', () => {
    expect(videoPickSuccessNotices(true)).toEqual({ reconnected: true, loaded: true });
    expect(videoPickSuccessNotices(false)).toEqual({ reconnected: false, loaded: true });
  });
});

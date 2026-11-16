import { describe, expect, it, vi } from 'vitest';
import { endMediaDownload, mediaDownloads, noteMediaDownload } from './media-downloads';

describe('media downloads', () => {
  it('reports how far a download is, and nothing once it is over', () => {
    expect(mediaDownloads.get('a:100:0')).toBeUndefined();
    noteMediaDownload('a:100:0', 0, 100);
    expect(mediaDownloads.get('a:100:0')).toEqual({ fraction: 0 });
    noteMediaDownload('a:100:0', 42, 100);
    expect(mediaDownloads.get('a:100:0')).toEqual({ fraction: 0.42 });
    endMediaDownload('a:100:0');
    expect(mediaDownloads.get('a:100:0')).toBeUndefined();
    expect(mediaDownloads.any()).toBe(false);
  });

  it('is downloading without a figure when the size is not known', () => {
    noteMediaDownload('unknown', 5_000, null);
    expect(mediaDownloads.get('unknown')).toEqual({ fraction: null });
    endMediaDownload('unknown');
  });

  it('tells listeners when the whole percent changes, not for every chunk', () => {
    const heard = vi.fn();
    const stop = mediaDownloads.subscribe(heard);
    noteMediaDownload('b', 0, 1_000_000);
    for (let received = 1; received <= 20_000; received += 1_000) noteMediaDownload('b', received, 1_000_000);
    expect(heard).toHaveBeenCalledTimes(3); // 0%, 1%, 2%
    const same = mediaDownloads.get('b');
    noteMediaDownload('b', 20_100, 1_000_000);
    expect(mediaDownloads.get('b')).toBe(same);
    endMediaDownload('b');
    expect(heard).toHaveBeenCalledTimes(4);
    endMediaDownload('b');
    expect(heard).toHaveBeenCalledTimes(4);
    stop();
  });
});

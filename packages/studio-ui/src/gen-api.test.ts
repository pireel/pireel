import { beforeEach as configureHttpHost, afterEach as restoreHttpHost } from 'vitest';
import { studioProviders, setStudioProviders } from '@pireel/studio-engine/providers';
let previousHttpHost: ReturnType<typeof studioProviders>;
configureHttpHost(() => {
  previousHttpHost = studioProviders();
  setStudioProviders({ ...previousHttpHost, request: (input, init) => init === undefined ? fetch(input) : fetch(input, init) });
});
restoreHttpHost(() => setStudioProviders(previousHttpHost));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStudioSpaceId, listStudioGens, resolveStudioSpaceId, genJobFromCreation } from '@pireel/studio-ui/gen-api';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('generation space resolution', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads history without creating a space, and stays quiet when there is none', async () => {
    // A project that was never saved to the cloud has no space and no history. Three panels ask
    // on every open, so asking must not POST (which answers 404 for that project) to find out.
    const fetchMock = vi.fn(async () => Response.json({ ok: true, space: null }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveStudioSpaceId('p1')).toBeNull();
    expect(await listStudioGens('p1', 'image')).toEqual([]);

    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect(init?.method ?? 'GET').toBe('GET');
    }
  });

  it('creates the space only on the path that is about to write one, then caches it', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, space: { id: 'studio_u1_p1' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getStudioSpaceId('p1')).toBe('studio_u1_p1');
    expect(fetchMock.mock.calls[0]).toEqual(['/api/studio/projects/p1/gen-space', { method: 'POST' }]);
    // The cached id serves both paths; neither asks the server again.
    expect(await resolveStudioSpaceId('p1')).toBe('studio_u1_p1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it('keeps a cover scene request identity when restoring generation history', () => {
  expect(genJobFromCreation({ id: 'job', status: 'pending', params: { _cover_run_id: 'cover-run-123', user_prompt: 'Cover headline' } })).toMatchObject({ id: 'job', coverRunId: 'cover-run-123', prompt: 'Cover headline' });
});

it('tells a failed generation in words the user can act on, keeping the raw failure on the job', async () => {
  const { generationFailureMessage, startSpaceGeneration } = await import('@pireel/studio-ui/gen-api');
  const { t } = await import('@pireel/studio-ui/i18n');
  expect(generationFailureMessage('atlascloud_poll HTTP 400: code=400 msg=The request failed because the output audio may contain sensitive information.')).toBe(t('common.generationRejected'));
  expect(generationFailureMessage('doubao_video_gen HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation"}}')).toBe(t('common.generationRejected'));
  expect(generationFailureMessage('task_timeout_30min')).toBe(t('common.generationTimedOut'));
  expect(generationFailureMessage('fetch failed')).toBe(t('common.generationFailedRetry'));
  expect(generationFailureMessage(undefined)).toBe(t('common.generationFailedRetry'));
  expect(genJobFromCreation({ id: 'c', status: 'failed', error: 'task_timeout_30min', prompt: 'p' } as never).error).toBe('task_timeout_30min');
  // A start refused with an error code reads as a failed request, not as the code.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'creation_failed', id: 'x' }), { status: 500 })));
  const started = await startSpaceGeneration('space', 'image-gen', { prompt: 'p' });
  expect(started).toMatchObject({ ok: false, kind: 'error' });
  expect((started as { message: string }).message).not.toContain('creation_failed');
  vi.unstubAllGlobals();
});

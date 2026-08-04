import { describe, expect, it, vi } from 'vitest';
import { downloadLocalVisualModel } from './local-visual-search-model';

const responseOf = (chunks: number[], status = 200) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((size, index) => controller.enqueue(new Uint8Array(size).fill(index + 1)));
        controller.close();
      },
    }),
    { status },
  );

describe('downloadLocalVisualModel', () => {
  it('streams progress and stores the response without assembling the model in JS memory', async () => {
    const stored: Response[] = [];
    const progress: number[] = [];
    const result = await downloadLocalVisualModel({
      sources: ['https://cdn.example/model.onnx'],
      expectedBytes: 5,
      fetchImpl: vi.fn(async () => responseOf([2, 3])) as unknown as typeof fetch,
      store: {
        put: async (response) => {
          stored.push(response);
          await response.arrayBuffer();
        },
        delete: async () => {},
      },
      onProgress: (bytes) => progress.push(bytes),
    });

    expect(result).toEqual({ source: 'https://cdn.example/model.onnx', bytes: 5 });
    expect(progress).toEqual([2, 5, 5]);
    expect(stored[0]?.headers.get('content-length')).toBe('5');
  });

  it('falls back to the pinned upstream when a hosted mirror is unavailable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(responseOf([4]));
    let deletes = 0;

    const result = await downloadLocalVisualModel({
      sources: ['https://cdn.example/model.onnx', 'https://upstream.example/model.onnx'],
      expectedBytes: 4,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      store: {
        put: async (response) => {
          await response.arrayBuffer();
        },
        delete: async () => {
          deletes += 1;
        },
      },
    });

    expect(result.source).toBe('https://upstream.example/model.onnx');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(deletes).toBe(1);
  });

  it('rejects and removes a truncated or pointer-file response', async () => {
    let deletes = 0;
    await expect(downloadLocalVisualModel({
      sources: ['https://cdn.example/model.onnx'],
      expectedBytes: 10,
      fetchImpl: vi.fn(async () => responseOf([3])) as unknown as typeof fetch,
      store: {
        put: async (response) => {
          await response.arrayBuffer();
        },
        delete: async () => {
          deletes += 1;
        },
      },
    })).rejects.toThrow('Model size mismatch (3/10)');
    expect(deletes).toBe(1);
  });
});

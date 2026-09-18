/** Defers effect cleanup by one microtask so React Strict Mode's setup-cleanup-setup probe
 * can retain the same resource. With no subsequent setup, the latest cleanup still runs. */
export class DeferredEffectDisposer {
  private readonly generations = new WeakMap<object, number>();

  retain(resource: object): number {
    const generation = (this.generations.get(resource) ?? 0) + 1;
    this.generations.set(resource, generation);
    return generation;
  }

  release(resource: object, generation: number, dispose: () => void): void {
    queueMicrotask(() => {
      if (this.generations.get(resource) !== generation) return;
      this.generations.delete(resource);
      dispose();
    });
  }
}

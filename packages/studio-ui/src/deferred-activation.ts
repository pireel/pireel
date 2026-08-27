/**
 * Arms a mount-time side effect only after the current render/effect cascade has
 * settled. Re-scheduling cancels the previous timer, which also makes this safe
 * under React Strict Mode's setup-cleanup-setup probe.
 */
export class DeferredActivation {
  private armed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get active(): boolean {
    return this.armed;
  }

  defer(): () => void {
    if (this.armed) return () => {};
    if (this.timer) clearTimeout(this.timer);
    const timer = setTimeout(() => {
      if (this.timer !== timer) return;
      this.timer = null;
      this.armed = true;
    }, 0);
    this.timer = timer;
    return () => {
      if (this.timer !== timer) return;
      clearTimeout(timer);
      this.timer = null;
    };
  }
}

interface ProtocolMarker {
  open: string;
  /** Missing close means the rest of this text part is protocol payload. */
  close?: string;
}

const PROTOCOL_MARKERS: readonly ProtocolMarker[] = [
  { open: '<｜｜DSML｜｜tool_calls>', close: '</｜｜DSML｜｜tool_calls>' },
  { open: '<|DSML|tool_calls>', close: '</|DSML|tool_calls>' },
  { open: '<tool_calls>', close: '</tool_calls>' },
  { open: '<｜｜DSML｜｜invoke' },
  { open: '<|DSML|invoke' },
];

function heldMarkerPrefixLength(value: string): number {
  let held = 0;
  for (const marker of PROTOCOL_MARKERS) {
    const max = Math.min(marker.open.length - 1, value.length);
    for (let length = max; length > held; length -= 1) {
      if (marker.open.startsWith(value.slice(-length))) {
        held = length;
        break;
      }
    }
  }
  return held;
}

/** Incrementally strips provider-native tool transport markup that was misclassified as visible text. */
export class ToolProtocolTextScrubber {
  private buffer = '';
  private activeClose: string | null | undefined;

  push(text: string): string {
    this.buffer += text;
    return this.flush(false);
  }

  end(): string {
    return this.flush(true);
  }

  private flush(final: boolean): string {
    let visible = '';
    for (;;) {
      if (this.activeClose !== undefined) {
        if (this.activeClose === null) {
          this.buffer = '';
          return visible;
        }
        const closeAt = this.buffer.indexOf(this.activeClose);
        if (closeAt < 0) {
          this.buffer = final ? '' : this.buffer.slice(-Math.max(0, this.activeClose.length - 1));
          return visible;
        }
        this.buffer = this.buffer.slice(closeAt + this.activeClose.length);
        this.activeClose = undefined;
        continue;
      }

      let hit: { at: number; marker: ProtocolMarker } | null = null;
      for (const marker of PROTOCOL_MARKERS) {
        const at = this.buffer.indexOf(marker.open);
        if (at >= 0 && (!hit || at < hit.at)) hit = { at, marker };
      }
      if (hit) {
        visible += this.buffer.slice(0, hit.at);
        this.buffer = this.buffer.slice(hit.at + hit.marker.open.length);
        this.activeClose = hit.marker.close ?? null;
        continue;
      }

      if (final) {
        visible += this.buffer;
        this.buffer = '';
        return visible;
      }
      const held = heldMarkerPrefixLength(this.buffer);
      const emitLength = this.buffer.length - held;
      visible += this.buffer.slice(0, emitLength);
      this.buffer = this.buffer.slice(emitLength);
      return visible;
    }
  }
}

export function stripLeakedToolProtocolText(text: string): string {
  const scrubber = new ToolProtocolTextScrubber();
  return scrubber.push(text) + scrubber.end();
}

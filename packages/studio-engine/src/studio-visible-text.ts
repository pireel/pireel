/** Recognize provider handoff/compaction prose accidentally emitted as an assistant answer.
 * Do not censor technical vocabulary: ordinary explanations and requested code remain intact. */
export function internalHandoffOffset(text: string): number {
  const introduction = /(?:^|\n)[ \t]*(?:#{1,6}\s*)?(?:让我按时间顺序梳理这段对话|让我(?:先)?(?:梳理|分析)(?:一下)?这段对话以(?:便|进行)总结|Let me (?:go through|analy[sz]e|review) (?:this|the) conversation (?:chronologically|in chronological order|to (?:create|prepare|write) (?:a |the )?summary))/im.exec(text);
  if (introduction) return introduction.index;
  // The numbered engineering-handoff template, not a normal editing recap.
  const heading = /(?:^|\n)[ \t]*(?:#{1,6}\s*)?(?:\*\*)?1[.、)]\s*(?:主要请求与意图|Primary Request and Intent)\s*[:：]/im.exec(text);
  if (heading && /(?:关键技术概念|Key Technical Concepts|文件和代码部分|Files and Code Sections)/i.test(text.slice(heading.index))) return heading.index;
  return -1;
}

/** Stored history can split the same answer into several text parts. Keep every tool receipt. */
export function withoutInternalHandoffParts<T extends { type: string; text?: string }>(parts: T[]): T[] {
  const at = internalHandoffOffset(parts.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n'));
  if (at < 0) return parts;
  let offset = 0;
  return parts.flatMap(part => {
    if (part.type !== 'text') return [part];
    const original = part.text ?? '';
    const text = original.slice(0, Math.max(0, at - offset));
    offset += original.length + 1;
    return text.trim() ? [{ ...part, text }] : [];
  });
}

/** Buffer a short opening line so a split handoff marker never flashes in the UI. Once a handoff
 * starts, the rest of that text block belongs to it; tool events are handled separately. */
export class StudioVisibleTextScrubber {
  private buffer = '';
  private blocked = false;
  get suppressesRemainder(): boolean { return this.blocked; }
  push(text: string): string {
    if (this.blocked) return '';
    this.buffer += text;
    const at = internalHandoffOffset(this.buffer);
    if (at >= 0) { const safe = this.buffer.slice(0, at); this.buffer = ''; this.blocked = true; return safe; }
    // Hold a possible structured handoff until its next section identifies it.
    if (/^\s*(?:\*\*)?1[.、)]\s*(?:主要请求与意图|Primary Request and Intent)/i.test(this.buffer) && this.buffer.length < 8192) return '';
    const newline = this.buffer.lastIndexOf('\n');
    const length = newline >= 0 ? newline + 1 : Math.max(0, this.buffer.length - 256);
    const safe = this.buffer.slice(0, length); this.buffer = this.buffer.slice(length);
    return safe;
  }
  end(): string {
    const safe = this.blocked ? '' : this.buffer;
    this.buffer = '';
    return safe;
  }
}

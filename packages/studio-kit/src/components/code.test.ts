import { describe, expect, it } from "vitest";
import { renderCode } from "./code";

const ctx = {
  box: { w: 900, h: 620 },
  canvas: { w: 1920, h: 1080 },
  durationSec: 6,
};

describe("code Motion Graphic", () => {
  it("uses the HyperFrames caret-following choreography for typing", () => {
    const block = renderCode(
      "code1",
      { variant: "typing", code: "const value = await load();" },
      ctx,
    );
    expect(block.html).toContain('class="caret"');
    expect(block.html).not.toContain('class="hl-box"');
    expect(block.timeline).toContain("offsetLeft");
    expect(block.timeline).toContain("offsetWidth");
    expect(block.timeline).toContain("ease:'none'");
  });

  it("renders a real red/green line diff and animates removal before addition", () => {
    const block = renderCode(
      "code2",
      {
        variant: "diff",
        code: "const res = await fetch(url, { signal });",
        before: "const res = await fetch(url);",
        after: "const res = await fetch(url, { signal });",
      },
      ctx,
    );
    expect(block.html).toContain("diff-del");
    expect(block.html).toContain("diff-add");
    expect(block.timeline.indexOf(".diff-del")).toBeLessThan(
      block.timeline.indexOf(".diff-add"),
    );
  });

  it("keeps the scroll highlight inside the moving code plane", () => {
    const code = Array.from(
      { length: 24 },
      (_, i) => `const row${i + 1} = true;`,
    ).join("\n");
    const block = renderCode(
      "code3",
      { variant: "scroll", code, highlightLine: 18 },
      ctx,
    );
    expect(block.html).toContain('class="hl-box scroll-box"');
    expect(block.timeline).toContain("[code,gutter]");
    expect(block.timeline).toContain("power2.inOut");
  });

  it("escapes source instead of executing or paraphrasing it", () => {
    const block = renderCode(
      "code4",
      { variant: "highlight", code: '<img src=x onerror="alert(1)">' },
      ctx,
    );
    expect(block.html).not.toContain("<img");
    expect(block.html).toContain("&lt;");
  });
});

describe('code layouts land within the block', () => {
  const ctx = { box: { w: 600, h: 380 }, canvas: { w: 1920, h: 1080 }, durationSec: 2.5 };
  const long = Array.from({ length: 10 }, (_, i) => `const value${i} = await pireel.compose({ source: "clip-${i}.mp4" });`).join('\n');

  it('typing finishes before the block ends, whatever the length of the code', () => {
    const out = renderCode('c1', { variant: 'typing', code: long }, ctx);
    const per = Number(/i\*([\d.]+)/.exec(out.timeline)?.[1]);
    const chars = (out.html.match(/class="ch/g) ?? []).length;
    expect(0.45 + chars * per).toBeLessThan(2.5);
  });

  it('a diff keeps the removed lines on screen next to the added ones', () => {
    const out = renderCode('c2', { variant: 'diff', before: 'a = 1;', after: 'a = 2;' }, ctx);
    expect(out.html).toContain('diff-del');
    expect(out.html).toContain('diff-add');
    expect(out.timeline).not.toMatch(/diff-del',\{height:0/);
  });

  it('shrinks the type so the longest line fits the window', () => {
    const size = (code: string) => Number(/\.line\{[^}]*font-size:(\d+)px/.exec(renderCode('c3', { variant: 'highlight', code }, ctx).html)?.[1]);
    expect(size(long)).toBeLessThan(size('const a = 1;'));
  });
});

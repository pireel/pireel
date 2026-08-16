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

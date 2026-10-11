import { describe, expect, it } from "vitest";
import {
  AGENT_TRANSCRIPT_MAX_CHARS,
  BLOCK_SYSTEM,
  THEME_GENERAL_BRIEF,
  buildChatContextBlocks,
  withActiveTheme,
  wrapAgentTranscript,
} from "./index";

describe("静态提示词完整性", () => {
  const STATICS: Array<[name: string, s: string]> = [
    ["BLOCK_SYSTEM", BLOCK_SYSTEM],
    ["THEME_GENERAL_BRIEF", THEME_GENERAL_BRIEF],
  ];
  for (const [name, s] of STATICS) {
    it(`${name} 非空且无未转义的模板残留`, () => {
      expect(s.length).toBeGreaterThan(100);
      // 迁移期残留检查:不允许旧 {{var}} 占位语法混进来
      expect(s).not.toMatch(/\{\{\w+\}\}/);
    });
  }
  it("所有模型入口都把 Component 作为上层概念、Motion Graphic 作为当前子集", () => {
    expect(BLOCK_SYSTEM).toContain("producing ONE Motion Graphic Component");
    // editable properties: the ```json schema fence and the only two ways to consume it in the markup
    expect(BLOCK_SYSTEM).toContain("```json fence");
    expect(BLOCK_SYSTEM).toContain("var(--p-<key>)");
    expect(BLOCK_SYSTEM).toContain('[data-p-<key>="v"]');
    expect(BLOCK_SYSTEM).not.toContain("same component");
  });
});

describe("chat 上下文块:静态、逐次字节相同", () => {
  it("普通长度口播稿完整进入上下文,只有超长稿明确标记截断", () => {
    const ordinary = "a".repeat(12_000);
    expect(wrapAgentTranscript(ordinary)).toContain(ordinary);
    expect(wrapAgentTranscript(ordinary)).not.toContain("truncated");
    const long = wrapAgentTranscript(
      "b".repeat(AGENT_TRANSCRIPT_MAX_CHARS + 1),
    );
    expect(long).toContain("truncated; use search_media");
    expect(long).not.toContain("b".repeat(AGENT_TRANSCRIPT_MAX_CHARS + 1));
  });

  it("未选 Skill 时只推荐显式目录，不自动声称已选择", () => {
    const catalog = [
      { id: "talking-head-edit", title: "Talking-head edit", summary: "Speech-led complete edit." },
      { id: "short-video-ad-remix", title: "Short-video ad remix", summary: "Multi-output product ad remix." },
    ];
    const blocks = buildChatContextBlocks(null, catalog);
    expect(blocks).toContain("No Studio Skill is selected");
    expect(blocks).toContain("Do not infer, auto-select, or claim that a Skill is active");
    expect(blocks).toContain("talking-head-edit");
    expect(blocks).toContain("short-video-ad-remix");
    expect(blocks).not.toContain("<studio_skill id=");
    expect(blocks).toBe(buildChatContextBlocks(null, catalog));
  });
  it("品牌块:创作者自己的风格,字幕外观随品牌,用户显式指令优先", () => {
    const brand = { name: 'Jin "Z"', brief: "BRAND BRIEF" };
    const blocks = buildChatContextBlocks(null, undefined, brand);
    expect(blocks).toContain(`<creator_brand name="Jin 'Z'">`);
    expect(blocks).toContain("BRAND BRIEF");
    expect(blocks).toContain("Use its caption look whenever you add or restyle captions.");
    expect(blocks).toContain("The latest explicit user instruction wins over the brand.");
    expect(blocks).not.toContain("already carry its captions");
    expect(blocks).not.toContain("<frame_attached");
    expect(blocks).not.toContain("<frame_catalog");
    expect(blocks).toBe(buildChatContextBlocks(null, undefined, brand));
  });
  it("同时选择 Skill 与品牌时并列注入", () => {
    const blocks = buildChatContextBlocks(
      { id: "product-demo", title: "Product Demo", description: "Demonstrate a product.", markdown: "# Product Demo\n\nFollow verified product evidence." },
      undefined,
      { name: "Me", brief: "BRAND BRIEF" },
    );
    expect(blocks).toContain('<studio_skill id="product-demo"');
    expect(blocks).toContain('<creator_brand name="Me">');
    expect(blocks.indexOf("<studio_skill")).toBeLessThan(blocks.indexOf("<creator_brand"));
    expect(buildChatContextBlocks()).toBe("");
  });
});

describe("主题装配", () => {
  it("无主题 = 原样返回(不加空壳段落)", () => {
    expect(withActiveTheme("SYS")).toBe("SYS");
  });
  it("compose 主题包裹:含约束文案 + 主题内容", () => {
    const s = withActiveTheme("SYS", "THEME_TOKENS");
    expect(s.startsWith("SYS\n\n")).toBe(true);
    expect(s).toContain("ACTIVE THEME (preset design system)");
    expect(s).toContain("THEME DISTINCTIVENESS IS STRUCTURAL, NOT A RECOLOR");
    expect(s).toContain("at least TWO non-token signatures");
    expect(s).toContain(
      "A polished generic rectangle wearing the theme colors is a failure",
    );
    expect(s).toContain("Code Motion Graphic owns its editor chrome");
    expect(s).toContain("only position the Code block");
    expect(s).toContain("current project/manual UI controls");
    expect(s).toContain(
      "Never reapply a theme default over a newer project value",
    );
    expect(s).toContain("THEME_TOKENS");
  });
});

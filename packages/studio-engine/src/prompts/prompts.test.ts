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
    const blocks = buildChatContextBlocks(null, undefined, null, catalog);
    expect(blocks).toContain("No Studio Skill is selected");
    expect(blocks).toContain("Do not infer, auto-select, or claim that a Skill is active");
    expect(blocks).toContain("talking-head-edit");
    expect(blocks).toContain("short-video-ad-remix");
    expect(blocks).not.toContain("<studio_skill id=");
    expect(blocks).toBe(buildChatContextBlocks(null, undefined, null, catalog));
  });
  it("未选 Frame 时不隐式适配，推荐流程由 Skill 按需定义", () => {
    const blocks = buildChatContextBlocks(null, "- zen-white · Zen White\n- editorial-bold · Editorial Bold");
    expect(blocks).toContain("No visual direction is attached");
    expect(blocks).toContain("A complete edit does not authorize silent Frame selection");
    expect(blocks).toContain("host's neutral visual-craft floor");
    expect(blocks).toContain("only after the user explicitly chooses it or delegates the choice");
    expect(blocks).toContain("Do not use a hidden default");
    expect(blocks).not.toContain("choose the best-fitting frame");
  });
  it("Frame 是艺术指导，配色字幕布局作为独立覆盖项;读取走 manage_frame", () => {
    const blocks = buildChatContextBlocks({ id: "zen-white", title: "留白 Zen" });
    expect(blocks).toContain("professional art-direction playbook");
    expect(blocks).toContain("manage_frame action:read ONCE");
    expect(blocks).not.toContain("read_frame");
    expect(blocks).toContain("shape language, material and image treatment, typography personality");
    expect(blocks).toContain("Project-level palette, captions and layout controls remain independent");
    expect(blocks).toContain("The editor owns story, evidence, timing");
  });
  it("同时选择 Skill 与 Frame 时并列注入，不产生绑定关系", () => {
    const blocks = buildChatContextBlocks(
      { id: "afterimage", title: "余像 Afterimage" },
      undefined,
      { id: "product-demo", title: "Product Demo", description: "Demonstrate a product.", markdown: "# Product Demo\n\nFollow verified product evidence." },
    );
    expect(blocks).toContain('<studio_skill id="product-demo"');
    expect(blocks).toContain('<frame_attached id="afterimage"');
    expect(blocks).toContain("independently selected");
    expect(blocks).not.toContain("product-demo is compatible with afterimage");
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

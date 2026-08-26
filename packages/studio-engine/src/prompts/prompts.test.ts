import { describe, expect, it } from "vitest";
import {
  AGENT_TRANSCRIPT_MAX_CHARS,
  BLOCK_SYSTEM,
  CHAT_IDENTITY,
  STUDIO_TOOLS,
  THEME_GENERAL_BRIEF,
  VIDEO_DESIGN_METHOD,
  buildChatSystem,
  buildSituation,
  mcpInstructions,
  withActiveTheme,
  wrapAgentTranscript,
} from "./index";

describe("静态提示词完整性", () => {
  const STATICS: Array<[name: string, s: string]> = [
    ["BLOCK_SYSTEM", BLOCK_SYSTEM],
    ["CHAT_IDENTITY", CHAT_IDENTITY],
    ["THEME_GENERAL_BRIEF", THEME_GENERAL_BRIEF],
  ];
  for (const [name, s] of STATICS) {
    it(`${name} 非空且无未转义的模板残留`, () => {
      expect(s.length).toBeGreaterThan(100);
      // 迁移期残留检查:不允许旧 {{var}} 占位语法混进来
      expect(s).not.toMatch(/\{\{\w+\}\}/);
    });
  }
  it("系统身份是剪辑专家，Skill 保持 Markdown 判断空间", () => {
    expect(CHAT_IDENTITY).toContain("Studio's video editing expert");
    expect(CHAT_IDENTITY).toContain("professional editorial judgment");
    expect(CHAT_IDENTITY).toContain(
      "selected Studio Skill is a rich Markdown expert playbook",
    );
    expect(CHAT_IDENTITY).toContain("NOT a structured configuration");
    expect(CHAT_IDENTITY).toContain(
      "Skill and visual direction are orthogonal session inputs",
    );
    expect(CHAT_IDENTITY).toContain(
      "NEVER infer, choose, reject or switch a visual direction because a Skill is active",
    );
    expect(CHAT_IDENTITY).toContain("There is no scenario-specific edit macro");
    expect(CHAT_IDENTITY).toContain(
      "Do not force it through as one uninterrupted execution",
    );
    expect(CHAT_IDENTITY).toContain(
      "For a small set of named choices call ask_user and WAIT",
    );
    expect(CHAT_IDENTITY).toContain(
      "For open-ended information, ask ONE concise natural-language question and stop",
    );
    expect(CHAT_IDENTITY).toContain(
      "Resolve only ONE blocking decision per wait",
    );
    expect(CHAT_IDENTITY).toContain(
      "call request_approval and WAIT before executing it",
    );
    expect(CHAT_IDENTITY).toContain(
      "The approval card is not a fixed editing-plan form",
    );
    expect(CHAT_IDENTITY).toContain(
      "Outside those direct-execution scopes, before Approve do not call set_director_plan, remove_silence",
    );
    expect(CHAT_IDENTITY).toContain(
      "CONSERVATIVE SPEECH CLEANUP IS A DIRECT EXECUTION SCOPE",
    );
    expect(CHAT_IDENTITY).toContain(
      "Run it without request_approval, set_director_plan, set_scene_designs, full visual analysis",
    );
    expect(CHAT_IDENTITY).toContain(
      "Do not block cleanup by asking whether the user wants visual enhancement",
    );
    expect(CHAT_IDENTITY).toContain(
      "ORDINARY SHORT-AD REMIX IS ALSO A DIRECT EXECUTION SCOPE",
    );
    expect(CHAT_IDENTITY).toContain(
      "Run it without request_approval, set_director_plan, set_scene_designs, sceneId bookkeeping, or a Frame recommendation",
    );
    expect(CHAT_IDENTITY).toContain(
      "every selected span with one coherent visible physical action as a Foley candidate by default",
    );
    expect(CHAT_IDENTITY).toContain(
      "CALL one generate_foley batch so its exact event approval card is actually shown",
    );
    expect(CHAT_IDENTITY).toContain(
      "Initial analyze_visual with assessAudio=false is not evidence that an action needs no sound",
    );
    expect(CHAT_IDENTITY).toContain(
      "the collision allocator reuses a free SFX lane and creates parallel SFX lanes only for overlapping events",
    );
    expect(CHAT_IDENTITY).toContain("EMPTY OUTPUT SOURCE RESOLUTION");
    expect(CHAT_IDENTITY).toContain(
      "With exactly one compatible video or spoken-audio candidate",
    );
    expect(CHAT_IDENTITY).toContain(
      "With several plausible candidates, never add all or choose from filenames",
    );
    expect(CHAT_IDENTITY).toContain("is NOT permission to make one output");
    expect(CHAT_IDENTITY).toContain("each version means one independently editable output/deliverable");
    expect(CHAT_IDENTITY).toContain("It never means candidate narration takes");
    expect(CHAT_IDENTITY).toContain("uniform slices, filename-order assembly");
    expect(CHAT_IDENTITY).toContain(
      "IMAGE GENERATION IS AN ART-DIRECTION DECISION",
    );
    expect(CHAT_IDENTITY).toContain(
      "A complete-edit request authorizes a proportionate number of such images",
    );
    expect(CHAT_IDENTITY).toContain(
      "The active Frame governs HOW a generated image should look",
    );
    expect(CHAT_IDENTITY).toContain("AD DISPLAY TYPE USES THE SAME MOTION GRAPHIC SYSTEM");
    expect(CHAT_IDENTITY).toContain("NO-VOICEOVER ADS STILL USE AN INDEPENDENT SCREEN-COPY TRACK");
    expect(CHAT_IDENTITY).toContain("The absence of speech or a transcript is never a reason to omit designed ad copy");
    expect(CHAT_IDENTITY).toContain("actual shot cuts, visible action peaks, evidence holds, and music beats");
    expect(CHAT_IDENTITY).toContain("not a new timeline object, Director Plan, caption layer, or approval artifact");
    expect(CHAT_IDENTITY).toContain("not a separate native text-sticker object");
    expect(CHAT_IDENTITY).toContain("whole-object rotation, proportional scale, and position belong to the Motion card's canvas controls");
    expect(CHAT_IDENTITY).toContain(
      "exact subject and physical action/relation",
    );
    expect(CHAT_IDENTITY).toContain(
      "BRIEF MOTION GRAPHICS BY MEANING, NOT BY A GENERIC UI SHAPE",
    );
    expect(CHAT_IDENTITY).toContain(
      'Do not pre-solve it as a "top label", "bottom card", "CTA box"',
    );
    expect(CHAT_IDENTITY).toContain(
      "approval of that proposal authorizes attaching the recommendation",
    );
    expect(CHAT_IDENTITY).toContain(
      "Issue independent read-only inspection calls together in the same model turn",
    );
    expect(CHAT_IDENTITY).toContain(
      "one call per item when the tool accepts a batch",
    );
    expect(CHAT_IDENTITY).toContain("non-speech-or-noise");
    expect(CHAT_IDENTITY).toContain("analyze_visual with assessAudio=false");
    expect(CHAT_IDENTITY).toContain("Never pre-register it");
    expect(CHAT_IDENTITY).toContain("goes directly to analyze_visual/read_script while still unplaced");
    expect(CHAT_IDENTITY).toContain("ask at most TWO short sentences");
    expect(CHAT_IDENTITY).toContain("private deliberation out of visible text");
    expect(CHAT_IDENTITY).toContain("ALWAYS emit a short structured recap");
    expect(CHAT_IDENTITY).not.toContain("hard pre-pilot checkpoint");
    expect(mcpInstructions("test-version")).toContain(
      "Ask one concise question and wait when only the user can resolve that boundary",
    );
    expect(mcpInstructions("test-version")).toContain(
      "present it in your host UI, and WAIT for explicit user approval",
    );
    expect(mcpInstructions("test-version")).toContain(
      "do not force a fixed checklist of layout, theme, duration, or asset gaps",
    );
    expect(mcpInstructions("test-version")).toContain(
      "requires an explicit output count, purpose and meaningful variation dimension",
    );
    expect(mcpInstructions("test-version")).toContain(
      "N independently editable finished outputs",
    );
    expect(mcpInstructions("test-version")).toContain(
      "Uniform slices or filename-order assembly",
    );
    expect(mcpInstructions("test-version")).toContain(
      "IMAGE GENERATION IS AN ART-DIRECTION DECISION",
    );
    expect(mcpInstructions("test-version")).toContain(
      "A complete-edit request authorizes a proportionate number of such images",
    );
    expect(mcpInstructions("test-version")).toContain(
      "Prefer one strong proposition over keyword soup",
    );
    expect(mcpInstructions("test-version")).toContain(
      "approval of that proposal authorizes attaching the recommendation",
    );
    expect(mcpInstructions("test-version")).toContain(
      "Issue independent read-only inspection calls together",
    );
    expect(mcpInstructions("test-version")).not.toContain(
      "hard pre-pilot checkpoint",
    );
    expect(mcpInstructions("test-version")).toContain(
      "distribution-specific update section",
    );
    expect(mcpInstructions("test-version")).toContain(
      "verified Skill-to-Plugin migration section",
    );
    expect(mcpInstructions("test-version")).toContain(
      "never delete the working standalone connection first",
    );
    expect(mcpInstructions("test-version")).toContain("Plugin SemVer");
    expect(mcpInstructions("test-version")).not.toContain(
      "npx skills update pireel",
    );
    expect(
      STUDIO_TOOLS.some((tool) =>
        ["analyze_narration", "lay_out", "add_graphics"].includes(tool.id),
      ),
    ).toBe(false);
  });

  it("广告花字复用 Motion Graphic，原生文字只保留普通标题能力", () => {
    const addTexts = STUDIO_TOOLS.find((tool) => tool.id === "add_texts");
    const updateText = STUDIO_TOOLS.find((tool) => tool.id === "update_text");
    expect(addTexts?.description).toContain("ordinary title/subtitle text Components");
    expect(updateText?.description).toContain("main text, subtitle, start, and duration");
    const schema = JSON.stringify(addTexts?.inputSchema);
    expect(schema).not.toContain('"outline-pop"');
    expect(schema).not.toContain('"textRole"');
    expect(schema).not.toContain('"rotationDeg"');
    expect(BLOCK_SYSTEM).toContain("LIGHTWEIGHT AD TYPOGRAPHY");
    expect(BLOCK_SYSTEM).toContain("not a separate text-sticker system");
    expect(BLOCK_SYSTEM).toContain("rotation belong to the Motion card's canvas transform controls");
  });
  it("回复语言只由用户输入决定，不跟随英文工具回执", () => {
    expect(CHAT_IDENTITY).toContain("latest USER-AUTHORED message");
    expect(CHAT_IDENTITY).toContain("Tool calls, tool receipts, transcript envelopes");
    expect(CHAT_IDENTITY).toContain("must never switch the reply language during a tool loop");
  });
  it("Chat 身份是剪辑专家，而不是被动助手或泛化导演", () => {
    expect(CHAT_IDENTITY).toContain("Studio's video editing expert");
    expect(CHAT_IDENTITY).toContain("professional editorial judgment");
    expect(CHAT_IDENTITY).not.toContain("AI video DIRECTOR");
  });
  it("所有模型入口都把 Component 作为上层概念、Motion Graphic 作为当前子集", () => {
    expect(CHAT_IDENTITY).toContain("COMPONENTS");
    expect(CHAT_IDENTITY).toContain(
      "Motion Graphics are the primary Component family",
    );
    expect(CHAT_IDENTITY).not.toContain("OVERLAY BLOCKS");
    expect(BLOCK_SYSTEM).toContain("producing ONE Motion Graphic Component");
    expect(BLOCK_SYSTEM).not.toContain("same component");
    expect(mcpInstructions("test-version")).toContain(
      "Component is the broad extensible element concept",
    );
    expect(mcpInstructions("test-version")).not.toContain(
      "backwards-compatible field name",
    );
  });
  it("内置 Agent 与 MCP 共享整片视频设计方法", () => {
    for (const phrase of [
      "one creative thesis",
      "one rhythm arc",
      "one shared\n  video design system",
      "full canvas composition through time",
      "Motion Graphic is one possible layer",
      "entrance, development, payoff",
      "normal playback speed",
    ]) {
      expect(VIDEO_DESIGN_METHOD).toContain(phrase);
    }
    expect(VIDEO_DESIGN_METHOD).toContain("user-set layout");
    expect(CHAT_IDENTITY).toContain(VIDEO_DESIGN_METHOD);
    expect(mcpInstructions("test-version")).toContain(VIDEO_DESIGN_METHOD);
  });
  it("Chat 禁止把模型私有工具协议输出给用户", () => {
    expect(CHAT_IDENTITY).toContain("NEVER print or imitate XML, HTML, DSML");
  });
});

describe("chat 缓存架构:system 静态、局势在消息里", () => {
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

  it("buildChatSystem 不含局势正文(identity 提到 <composition_state> 是在告诉模型它在消息里)", () => {
    for (const sys of [
      buildChatSystem(null, "- f1 · F1 — x"),
      buildChatSystem({ id: "f1", title: "F1" }),
    ]) {
      expect(sys).not.toContain("Edited duration:");
      expect(sys).not.toContain("Overlay blocks");
      expect(sys).not.toContain("Playhead:");
    }
  });
  it("buildChatSystem 同参数逐次字节相同(纯函数,无 request-time 动态内容)", () => {
    expect(buildChatSystem(null, "- f1 · F1 — x")).toBe(
      buildChatSystem(null, "- f1 · F1 — x"),
    );
  });
  it("未选 Skill 时只推荐显式目录，不自动声称已选择", () => {
    const catalog = [
      {
        id: "talking-head-edit",
        title: "Talking-head edit",
        summary: "Speech-led complete edit.",
      },
      {
        id: "short-video-ad-remix",
        title: "Short-video ad remix",
        summary: "Multi-output product ad remix.",
      },
    ];
    const system = buildChatSystem(null, undefined, null, undefined, catalog);
    expect(system).toContain("No Studio Skill is selected");
    expect(system).toContain(
      "Do not infer, auto-select, or claim that a Skill is active",
    );
    expect(system).toContain("talking-head-edit");
    expect(system).toContain("short-video-ad-remix");
    expect(system).not.toContain("<studio_skill id=");
  });
  it("生成配音在准确文案和音色确认后仍经过最终费用批准", () => {
    const system = buildChatSystem(null);
    expect(system).toContain("exact script, voice and current credit charge in its own final approval card");
    const speech = STUDIO_TOOLS.find((tool) => tool.id === "generate_speech");
    expect(speech?.description).toContain("rejection generates nothing and charges nothing");
  });
  it("未选 Frame 时不隐式适配，完整创意任务会主动提供可跳过的选择", () => {
    const system = buildChatSystem(
      null,
      "- zen-white · Zen White\n- editorial-bold · Editorial Bold",
    );
    expect(system).toContain("No visual direction is attached");
    expect(system).toContain(
      "A complete edit does not authorize silent Frame selection",
    );
    expect(system).toContain("host's neutral visual-craft floor");
    expect(system).toContain("not permission to emit generic fixed cards");
    expect(system).toContain(
      "approves a whole-film proposal that names the exact recommendation",
    );
    expect(system).toContain(
      "put it inside the whole-film proposal",
    );
    expect(system).toContain(
      "catalog previews are samples of a visual language",
    );
    expect(system).toContain(
      "Recommend from stated visual intent and footage evidence, never from supposed Skill compatibility",
    );
    expect(system).toContain("Do not use a hidden default");
    expect(system).not.toContain("choose the best-fitting frame");
    expect(system).not.toContain(
      "zen-white is present in the catalog, it is the safe default",
    );

    const attach = STUDIO_TOOLS.find((tool) => tool.id === "attach_frame")!;
    expect(attach.description).toContain(
      "only after the user chooses a direction or delegates the choice",
    );
    expect(attach.description).toContain(
      "Skill and visual direction are independent",
    );
  });
  it("Frame 是艺术指导，配色字幕布局作为独立覆盖项", () => {
    const system = buildChatSystem({ id: "zen-white", title: "留白 Zen" });
    expect(system).toContain("professional art-direction playbook");
    expect(system).toContain(
      "shape language, material and image treatment, typography personality",
    );
    expect(system).toContain(
      "palette, caption and layout controls are independent explicit choices",
    );
    expect(system).toContain(
      "The latest explicit user instruction and current manually configured project values are authoritative",
    );
    expect(system).toContain(
      "never reset current values after reading the Frame",
    );
    expect(system).toContain(
      "Skill and Director own story, evidence, timing",
    );
    expect(system).toContain(
      "Named situations and showcases are reference vocabulary",
    );
    expect(
      STUDIO_TOOLS.find((tool) => tool.id === "read_frame")?.description,
    ).toContain("professional art-direction playbook");
    expect(mcpInstructions("test-version")).toContain(
      "A Frame supplies professional art direction",
    );
    expect(mcpInstructions("test-version")).toContain(
      "Palette, captions and layout remain independent project controls",
    );
    expect(mcpInstructions("test-version")).toContain(
      "current project/manual UI state returned by the latest get_state",
    );
    expect(mcpInstructions("test-version")).toContain(
      "Preserve them unless the user now asks to change them",
    );
  });
  it("同时选择 Skill 与 Frame 时并列注入，不产生绑定关系", () => {
    const system = buildChatSystem(
      { id: "afterimage", title: "余像 Afterimage" },
      undefined,
      {
        id: "product-demo",
        title: "Product Demo",
        description: "Demonstrate a product.",
        markdown: "# Product Demo\n\nFollow verified product evidence.",
      },
    );
    expect(system).toContain('<studio_skill id="product-demo"');
    expect(system).toContain('<frame_attached id="afterimage"');
    expect(system).toContain("independently selected");
    expect(system).not.toContain("product-demo is compatible with afterimage");
  });
  it("图片素材理解是像素检查工具，不复用元数据猜测", () => {
    const inspect = STUDIO_TOOLS.find((tool) => tool.id === "inspect_images")!;
    expect(inspect.chatOnly).toBe(true);
    expect(inspect.description).toContain("ACTUAL PIXELS");
    expect(inspect.description).toContain(
      "instead of inferring image contents from filenames or dimensions",
    );
  });
  it("buildSituation 不带口播稿正文(稿子经 read_script 一次性进信息流)", () => {
    const s = buildSituation({
      composition: { durationSec: 10 },
      playheadSec: 1,
      pipeline: { asr: true },
    });
    expect(s).not.toContain("Spoken script");
    expect(s).toContain("Pipeline: transcript done");
  });
  it("buildSituation 明确当前成片以及动态序号和稳定 id 的边界", () => {
    const s = buildSituation({
      output: { id: "output-stable", title: "短版", position: 2, total: 3 },
      composition: { durationSec: 10 },
    });
    expect(s).toContain('Active output: #2 "短版"');
    expect(s).toContain("stable id output-stable");
    expect(s).toContain(
      "All unqualified edits and @ element references target this active output",
    );
  });
  it("buildSituation 不再把空主轨解释成隐式主视频", () => {
    const empty = buildSituation({ composition: { durationSec: 0, shots: [] } });
    expect(empty).toContain("Narrative-lane shots: (none; the active output is empty)");
    expect(empty).toContain("call list_assets before concluding that no source exists");
    expect(empty).not.toContain("single full clip");

    const unsplit = buildSituation({ composition: { durationSec: 10, shots: [] } });
    expect(unsplit).toContain("Narrative-lane shots: (none; the current duration comes from other tracks)");
    expect(unsplit).not.toContain("the active output is empty");
  });
  it("buildSituation 只携带 Director Plan 索引，完整 Markdown 按需读取", () => {
    const s = buildSituation({
      composition: { durationSec: 10 },
      directorPlan: {
        goal: "让观众相信结论",
        creativeThesis: "先问题，后证据",
        scenes: [
          {
            id: "proof",
            label: "证据落地",
            startSec: 4,
            endSec: 8,
            clipIds: ["shot-proof", "block-proof"],
          },
        ],
      },
    });
    expect(s).toContain('Director Plan saved as director-plan.md: goal "让观众相信结论"');
    expect(s).toContain("sceneId=proof");
    expect(s).toContain("@shot-proof, @block-proof");
    expect(s).toContain("call read_director_plan");
    expect(s).not.toContain("B-roll:");
    expect(STUDIO_TOOLS.some((tool) => tool.id === "read_director_plan")).toBe(true);
  });
  it("buildSituation 携带 Scene 设计文件索引而不重复开放式正文", () => {
    const s = buildSituation({
      composition: { durationSec: 10 },
      sceneDesigns: { path: "scene-designs.md", sceneIds: ["opening", "proof"] },
    });
    expect(s).toContain("Authored Scene designs saved as scene-designs.md for 2 Scene(s): opening, proof");
    expect(s).toContain("Call read_scene_designs");
    expect(s).not.toContain("protected zones");
  });
  it("新对话把已有项目状态当作素材现状，而不是继承上一段对话的任务", () => {
    const s = buildSituation(
      {
        composition: { durationSec: 10 },
        directorPlan: {
          goal: "上一段对话的目标",
          creativeThesis: "上一段对话的策略",
          scenes: [],
        },
      },
      { freshConversation: true },
    );
    expect(s).toContain("independent new conversation");
    expect(s).toContain("not an instruction to continue prior intent");
    expect(s).not.toContain("continue it through ordinary tools");
  });
  it("read_script 工具在契约表里(插入片段的稿子靠它按需进上下文)", () => {
    expect(STUDIO_TOOLS.some((t) => t.id === "read_script")).toBe(true);
    const transcript = STUDIO_TOOLS.find((tool) => tool.id === "read_script")!;
    expect(STUDIO_TOOLS.some((tool) => tool.id === "extract_asr")).toBe(false);
    const schema = transcript.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("localSig");
    expect(schema.properties).toHaveProperty("assetId");
    expect(schema.properties).toHaveProperty("clipId");
    expect(schema.properties).toHaveProperty("measuredTiming");
    expect(transcript.description).toContain("semantic text truth");
    expect(transcript.description).toContain("pass its exact assetId");
    expect(transcript.description).toContain("legacy compatibility locator");
    expect(CHAT_IDENTITY).toContain(
      "SEMANTIC truth, not automatically TIMING truth",
    );
  });
  it("字幕/口播稿剪辑工具在契约表里", () => {
    for (const id of [
      "set_captions",
      "remove_captions",
      "edit_caption_text",
      "remove_silence",
      "cut_narration",
      "list_words",
      "delete_words",
    ]) {
      expect(STUDIO_TOOLS.some((t) => t.id === id)).toBe(true);
    }
    expect(STUDIO_TOOLS.find((tool) => tool.id === "list_words")?.description)
      .toContain("NEVER issue several list_words calls in parallel");
  });
  it("全局 P0 编辑原语在 Chat/MCP 同一契约表里", () => {
    for (const id of [
      "set_canvas",
      "set_shot_framing",
      "set_media_transform",
      "set_media_crop",
      "apply_layout",
    ]) {
      expect(STUDIO_TOOLS.some((t) => t.id === id)).toBe(true);
    }
  });
  it("视频画布、生成和导出规格默认由程序自适应", () => {
    expect(CHAT_IDENTITY).toContain(
      "Never ask the user to choose canvas ratio, video-generation resolution, export resolution, fps, or format",
    );
    const generateVideo = STUDIO_TOOLS.find((tool) => tool.id === "generate_video")!;
    expect(generateVideo.description).toContain("Never ask the user to choose them");
    expect(generateVideo.description).toContain("runtime matches the active canvas");
    const exportVideo = STUDIO_TOOLS.find((tool) => tool.id === "export_video")!;
    expect(exportVideo.description).toContain("Never ask the user to choose resolution, fps, or format");
    expect(exportVideo.description).toContain("has no settings chooser");
    expect(mcpInstructions("test-version")).toContain(
      "never ask for ratio, generation resolution, export resolution, fps, or format",
    );
  });
  it("完整创作允许导演按内容需要生图，并要求可执行的 Frame 提示词", () => {
    const generate = STUDIO_TOOLS.find((tool) => tool.id === "generate_image")!;
    expect(generate.description).toContain(
      "without a separate permission pause",
    );
    expect(generate.description).toContain(
      "authored/stylized scene, controlled composition",
    );
    expect(generate.description).toContain(
      "Frame governs visual language, not permission",
    );
    const schema = generate.inputSchema as {
      properties: Record<string, { description?: string }>;
    };
    expect(schema.properties.prompt?.description).toContain(
      "camera distance/angle/lens",
    );
    expect(schema.properties.prompt?.description).toContain(
      "active-Frame image treatment/palette/material/texture/visual-world traits",
    );
    expect(schema.properties.prompt?.description).toContain(
      "one strong proposition over keyword soup",
    );
  });
  it("完整编辑先审批模型自由方案，再保存可校验导演计划", () => {
    const approval = STUDIO_TOOLS.find((tool) => tool.id === "request_approval")!;
    expect(approval.chatOnly).toBe(true);
    expect(approval.description).toContain("instead of filling a host-defined checklist");
    expect((approval.inputSchema as { required: string[] }).required).toEqual(["content"]);
    const plan = STUDIO_TOOLS.find((tool) => tool.id === "set_director_plan")!;
    expect(plan.chatOnly).not.toBe(true);
    expect(plan.description).toContain("NOT a macro");
    expect(plan.description).toContain("receiving Approve from request_approval");
    const schema = plan.inputSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual(["goal", "creativeThesis", "rhythmArc", "deliverySafety", "designSystem", "scenes"]);
    expect(schema.properties).toHaveProperty("deliverySafety");
    expect(schema.properties).toHaveProperty("rhythmArc");
    expect(schema.properties).toHaveProperty("designSystem");
    expect(schema.properties).toHaveProperty("scenes");
    const sceneSchema = (
      schema.properties.scenes as {
        items: { required: string[]; properties: Record<string, unknown> };
      }
    ).items;
    expect(sceneSchema.required).toEqual(
      expect.arrayContaining([
        "treatmentId",
        "visualAnchor",
        "visualTreatment",
        "motionPlan",
        "soundPlan",
        "assetStrategy",
        "brollDecision",
        "brollRationale",
      ]),
    );
    expect(sceneSchema.properties).toHaveProperty("visualMetaphor");
    expect(CHAT_IDENTITY).toContain(
      "call set_director_plan before the remaining timeline mutations",
    );
    expect(CHAT_IDENTITY).toContain(
      "Every planned add_block, add_texts, add_clips, insert_clips, and insert_clip call MUST pass the exact sceneId",
    );
    expect(CHAT_IDENTITY).toContain(
      "call analyze_visual before approval whenever a Frame is attached",
    );
    expect(CHAT_IDENTITY).toContain(
      "MUST NOT be implemented as add_block calls alone",
    );
    expect(CHAT_IDENTITY).toContain("pass placement and backdrop in the creation call");
    expect(CHAT_IDENTITY).toContain(
      "Treat B-roll selection as DIRECTOR judgment",
    );
    expect(CHAT_IDENTITY).toContain(
      "A complete edit is NOT complete if review_visuals fails",
    );
    const sceneDesigns = STUDIO_TOOLS.find((tool) => tool.id === "set_scene_designs")!;
    expect(sceneDesigns.chatOnly).not.toBe(true);
    expect(sceneDesigns.description).toContain("open design layer");
    const sceneDesignSchema = sceneDesigns.inputSchema as {
      properties: { scenes: { items: { required: string[]; properties: Record<string, unknown> } } };
    };
    expect(sceneDesignSchema.properties.scenes.items.required).toEqual([
      "sceneId", "designIntent", "composition", "choreography", "continuity", "successCriteria",
    ]);
    expect(sceneDesignSchema.properties.scenes.items.properties).not.toHaveProperty("layout");
    expect(CHAT_IDENTITY).toContain("set_scene_designs BEFORE its planned visual mutations");
    expect(CHAT_IDENTITY).toContain("may coexist and interact at the same time");
    expect(STUDIO_TOOLS.some((tool) => tool.id === "read_scene_designs")).toBe(true);
  });
  it("取景预设与原子 transform/crop 分层，不暴露完整自动重构工具", () => {
    const transform = STUDIO_TOOLS.find(
      (tool) => tool.id === "set_media_transform",
    )!;
    const crop = STUDIO_TOOLS.find((tool) => tool.id === "set_media_crop")!;
    expect(transform.description).toContain("atomic layer transform");
    expect(crop.description).toContain("atomic crop primitive");
    expect(CHAT_IDENTITY).toContain("Combine these atoms");
  });
  it("原生多轨放置也携带 Director Scene 归属", () => {
    for (const id of ["add_clips", "insert_clips"]) {
      const tool = STUDIO_TOOLS.find((candidate) => candidate.id === id)!;
      const schema = tool.inputSchema as {
        properties: {
          clips: { items: { properties: Record<string, unknown> } };
        };
      };
      expect(schema.properties.clips.items.properties).toHaveProperty(
        "sceneId",
      );
      expect(tool.description).toContain("sceneId");
    }
    const addTexts = STUDIO_TOOLS.find(
      (candidate) => candidate.id === "add_texts",
    )!;
    const textSchema = addTexts.inputSchema as {
      properties: { items: { items: { properties: Record<string, unknown> } } };
    };
    expect(textSchema.properties.items.items.properties).toHaveProperty(
      "sceneId",
    );
  });
  it("素材检索以显式 scope 为权限边界，本地图片有独立准备通道", () => {
    const search = STUDIO_TOOLS.find((tool) => tool.id === "search_assets")!;
    const searchSchema = search.inputSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(searchSchema.required).toContain("scope");
    expect(search.description).toContain("permission boundary");
    const list = STUDIO_TOOLS.find((tool) => tool.id === "list_assets")!;
    expect(list.description).toContain("least-privilege default");
    const prepare = STUDIO_TOOLS.find(
      (tool) => tool.id === "prepare_local_image",
    )!;
    expect(prepare.chatOnly).toBe(true);
    expect(prepare.description).toContain("does NOT grant access");
  });
  it("新增动态图形在生成前获得完整时长、场景归属与真实画面区域", () => {
    const add = STUDIO_TOOLS.find((tool) => tool.id === "add_block")!;
    const schema = add.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("durationSec");
    expect(schema.properties).toHaveProperty("sceneId");
    expect(schema.properties).toHaveProperty("placement");
    expect(schema.properties).toHaveProperty("backdrop");
    expect(add.description).toContain("placement BEFORE generation");
    expect(add.description).toContain("whole-film design system");
    const insert = STUDIO_TOOLS.find((tool) => tool.id === "insert_clip")!;
    const insertSchema = insert.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(insertSchema.properties).toHaveProperty("sceneId");
    expect(insert.description).toContain("scene's evidence + assetStrategy");
  });
  it("语音与口型同步是可组合原子能力,不是数字人大工具", () => {
    const speech = STUDIO_TOOLS.find((tool) => tool.id === "generate_speech")!;
    const lipSync = STUDIO_TOOLS.find((tool) => tool.id === "lip_sync")!;
    expect(speech.kind).toBe("card");
    expect(lipSync.kind).toBe("card");
    expect((speech.inputSchema as { required: string[] }).required).toEqual([
      "text",
      "voiceId",
    ]);
    expect(speech.description).toContain("Script approval and concrete voice selection are separate decisions");
    expect((lipSync.inputSchema as { required: string[] }).required).toEqual([
      "audioUrl",
    ]);
    expect(CHAT_IDENTITY).toContain(
      "VOICE AND LIP-SYNC ARE COMPOSED ATOMICALLY",
    );
    expect(CHAT_IDENTITY).toContain("A stored/default voice is neither a recommendation nor approval");
    expect(mcpInstructions("test-version")).toContain("Generated narration always has two explicit decisions");
    expect(CHAT_IDENTITY).toContain(
      "never look for or claim a monolithic digital-human workflow",
    );
  });
  it("画幅重构由 Agent 组合原语，不暴露完整功能工具", () => {
    expect(
      STUDIO_TOOLS.some((t) =>
        ["auto_reframe", "reframe_video"].includes(t.id),
      ),
    ).toBe(false);
    expect(CHAT_IDENTITY).toContain(
      "ASPECT REFRAMING IS A WORKFLOW, NOT A TOOL",
    );
    for (const id of [
      "analyze_visual",
      "set_canvas",
      "split_shot",
      "set_shot_framing",
      "review_visuals",
    ]) {
      expect(CHAT_IDENTITY).toContain(id);
    }
  });
  it("批量精确取景是一笔原子调用,画面分析先返回本地稳定人物区间", () => {
    const framing = STUDIO_TOOLS.find(
      (tool) => tool.id === "set_shot_framing",
    )!;
    const framingSchema = framing.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(framingSchema.properties).toHaveProperty("updates");
    expect(framing.description).toContain("ONE updates[] call");
    expect(CHAT_IDENTITY).toContain(
      "ONE set_shot_framing {updates:[...]} call",
    );
    const visual = STUDIO_TOOLS.find((tool) => tool.id === "analyze_visual")!;
    expect(visual.description).toContain("subjectTracks");
    expect(visual.description).toContain("already clustered locally");
    expect(visual.description).toContain(
      "Audio-led projects may analyze their B-roll video directly",
    );
    const visualSchema = visual.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(visualSchema.properties).toHaveProperty("assessAudio");
    expect(visualSchema.properties).toHaveProperty("assetId");
    expect(visualSchema.properties).toHaveProperty("clipId");
    const assets = STUDIO_TOOLS.find((tool) => tool.id === "list_assets")!;
    expect(assets.description).toContain("complete logical reference used by Chat, direct analysis/transcription, and placement");
    expect(assets.description).toContain("directly to analyze_visual/read_script without registering or placing it first");
    expect(assets.description).toContain("only when the requested edit actually needs it on the timeline");
    expect(assets.description).toContain("resolves private byte locators on demand");
    expect(assets.description).toContain("every media kind");
    expect(CHAT_IDENTITY).toContain("Project-library membership is sufficient for analyze_visual/read_script");
    expect(CHAT_IDENTITY).toContain("placing it on the timeline is not an access-recovery step");
    const register = STUDIO_TOOLS.find((tool) => tool.id === "register_media")!;
    expect(register.description).toContain("id alone is sufficient");
    expect(register.description).toContain("never copy, print, or guess contentSig/localSig");
    const registerSchema = register.inputSchema as {
      properties: { assets: { items: { required: string[] } } };
    };
    expect(registerSchema.properties.assets.items.required).toEqual(["id"]);
    const prepareLocalImage = STUDIO_TOOLS.find((tool) => tool.id === "prepare_local_image")!;
    expect(prepareLocalImage.description).toContain("pass its exact assetId");
    const prepareLocalImageSchema = prepareLocalImage.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(prepareLocalImageSchema.properties).toHaveProperty("assetId");
    expect(prepareLocalImageSchema.required).toEqual(["assetId"]);
  });
  it("批量切分带 framing 目的,稳定人物区间内由运行时拒绝冗余切点", () => {
    const split = STUDIO_TOOLS.find((tool) => tool.id === "split_shot")!;
    const schema = split.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty("atSecs");
    expect(schema.properties).toHaveProperty("purpose");
    expect(split.description).toContain("ONE atSecs[] call");
    expect(CHAT_IDENTITY).toContain('purpose:"framing"');
  });
  it("MCP 与内置 Agent 共享批处理规则，不施加完整任务调用次数上限", () => {
    const instructions = mcpInstructions("test-version");
    expect(instructions).not.toContain("INTERNAL EXECUTION CAPACITY");
    expect(instructions).not.toContain("Pireel tool calls");
    expect(instructions).toContain(
      'ONE split_shot {atSecs:[...],purpose:"framing"}',
    );
    expect(instructions).toContain("ONE set_shot_framing {updates:[...]}");
  });
  it("成品画面复检先本地去重，并允许显式逐帧云端检查", () => {
    const review = STUDIO_TOOLS.find((tool) => tool.id === "review_visuals")!;
    const schema = review.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(review.description).toContain("sends the ordered temporal states together");
    expect(review.description).toContain("missing temporal development");
    expect(review.description).toContain("entrance, development, payoff and exit");
    expect(review.description).toContain("repairScope");
    expect(schema.properties).toHaveProperty("sceneIds");
    expect(schema.properties).toHaveProperty("forceCloudAll");
    expect(CHAT_IDENTITY).toContain(
      "samples Scene entrance, development, payoff and exit states",
    );
    expect(CHAT_IDENTITY).toContain("repair ONLY the listed Semantic Scenes");
  });
  it("口播剪辑手册单独 skill:工具在表、映射到我们的剪辑面、按需进(不进 system)", () => {
    expect(STUDIO_TOOLS.some((t) => t.id === "read_editing_guide")).toBe(true);
    expect(
      STUDIO_TOOLS.find((t) => t.id === "cut_narration")!.description,
    ).toContain("semantic passages");
    // 内容包按需读,绝不进静态 system(缓存前缀不被打穿)
  });
  it("set_captions 的 preset enum 从字幕预设表来(agent 只能选、不能自造)", () => {
    const preset = (
      STUDIO_TOOLS.find((t) => t.id === "set_captions")!.inputSchema as {
        properties: { preset: { enum: string[] } };
      }
    ).properties.preset;
    expect(preset.enum).toContain("em-yellow");
    expect(preset.enum.length).toBeGreaterThanOrEqual(18);
  });
  it("<caption_catalog> 进静态 system,且逐次字节相同", () => {
    const sys = buildChatSystem(null);
    expect(sys).toContain("<caption_catalog>");
    expect(sys).toContain("em-yellow");
    expect(sys).toBe(buildChatSystem(null));
  });
  it("buildSituation 反映字幕开关态", () => {
    expect(buildSituation({ composition: { durationSec: 10 } })).toContain(
      "Captions: off",
    );
    expect(
      buildSituation({
        composition: {
          durationSec: 10,
          captions: { preset: "ln-black", yPct: 88 },
        },
      }),
    ).toContain("Captions: ON — preset ln-black");
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

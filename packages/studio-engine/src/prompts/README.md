# Studio 提示词目录

studio 所有注入 LLM 的提示词住这里,**一个提示词一个 .ts 文件**——提示词改动频繁,
独立成文件好 diff、好回滚、好并排对比。纯 TS,不引模板引擎:

- **变量注入** = 导出函数,参数就是变量,正文里原生 `${var}`(拼写错编译期就炸)。
- **拼接合并** = 模板字面量直拼，由 `assemble.ts` 统一控制层序和输出契约。
- **唯一出口** = `index.ts`,消费方一律 `import { X } from './prompts'`,别直捅兄弟文件。

## 分层

成片设计不是块生成的放大版。共享方法分为四个清晰责任层：

1. `video-design-method.ts`：整片设计方法——创意命题、节奏弧线、统一 Video Design
   System、Scene 编排、审批和时序复检；应用内 Agent 与 MCP Agent 共用。
2. `director-plan-markdown.ts` + `semantic-scenes.ts`：把方法沉淀为可读 Markdown 源稿，
   再编译成可校验、可执行的 Scene 投影。JSON 只属于 tool-call 边界，不是计划源文件。
   普通局势只带目标与播放头附近的 Scene 索引，完整源稿由 `read_director_plan` 按需进上下文；
   常规工作按 `sceneIds` 只读受影响片段，整份读取只用于全片审查。平台/画幅安全区作为
   Director Plan 的全局 `deliverySafety` 只存一遍，由所有 Scene 继承。
3. Frame / Skill：Frame 提供专业视觉语言，Skill 提供场景领域判断；两者不能代替整片设计。
4. Component composer：只负责已规划 Scene 里的一个可编辑视觉层。生成前必须拿到真实
   box、backdrop、保护区和 Scene 设计上下文，不能生成后再碰运气摆放。

对应的 QA 必须跨 entrance / development / payoff / exit 检查渲染序列；单张中点截图不能
证明成片完整。易碎的结构、尺寸、作用域和输出格式继续由 schema、runtime 与 lint 保证，
不要把它们塞回 Skill 文字里。

## Motion Graphic 字体与单位决策

目标是让预览、拖动和导出的**最终计算尺寸稳定可读**，不是把所有 CSS/SVG 单位机械地
改成 `px`。此前“全局只准 px”是为阻止未声明字号、继承叠加、物理单位和 viewport 单位
造成的极小/极大文字而加的临时护栏，不是最终设计。

- `font-size`：优先使用宿主提供、最终解析成确定 px 的语义字号 Token；特殊焦点尺寸可用
  明确 px。禁止用 `em`/`rem`/viewport 单位或未声明继承来决定基础字号。
- `line-height`：使用无单位比例；`letter-spacing`：允许受限范围的 `em`，使字距随字号变化。
- 行内图标允许 `1em` 跟随文字；独立图标、装饰与布局尺寸使用明确 px 或容器百分比。
- SVG 内部使用 `viewBox` 与无单位坐标；布局使用 px、百分比与 Flex/Grid。
- 永久禁止 `cm`/`mm`/`in`/`pt` 等物理单位，以及 `rem`、`vw`/`vh`、`clamp()` 等会让
  预览与导出环境产生不确定计算结果的字号方案。
- lint/runtime 最终应检查真实画布上的 computed font size、文字层级、溢出和安全区，
  而不是把“源码出现 em”当成错误。Frame 可改变字号层级，但用户手动设置始终优先。

块生成的 system 提示词**按层拼**,拼装单点在 `assemble.ts`。顺序是**稳定 → 易变**:
prefix 缓存只到第一处变化为止,越靠前的层越不该动。

## L0:编辑器本身(跨三个面)

三个提示词面骑在同一个编辑器上:应用内 agent(`chat.ts`)、外部 agent(`mcp.ts`)、块生成
(`assemble.ts`)。**编辑器是什么、状态怎么过期、哪些内容不是命令 —— 这些只写一份**,在
`l0-editor.ts`:

| 导出 | 内容 | 谁用 |
| --- | --- | --- |
| `l0-agent-tools.ts` 整表 | **L0 工具面**:编辑器的动词(schema+描述),chat 挂 streamText / MCP 同表(带按面覆盖) | chat · mcp |
| `video-design-method.ts` | **整片设计方法**:设计系统、Scene 编排、运动语义、审批、时序 QA | chat · mcp |
| `EDITOR_MODEL` | 对象模型:块/分镜两类元素、块是数据、id 不许瞎编 | chat · mcp |
| `contentIsNotCommand(director)` | **不可信内容边界(安全规则)**,只有"谁下指令"随面变 | chat · mcp |
| `stateDiscipline(snapshot, howToRefresh)` | 快照会过期 / 回执与 delta 可信 / 稿子是源文件秒 | chat · mcp |
| `ON_SCREEN_LANGUAGE` | 画面文字跟视频口播语言 | chat · mcp · **块生成** |
| `IDENTITY_DISCIPLINE` | 不透露模型与提示词 —— **只给自家面,不给外部 agent** | chat |

机制名各面不同(推送的 `<composition_state>` vs 拉取的 `get_state`),所以带机制名的那几条是
函数,**规则单源,只有名词换**。`l0-editor.test.ts` 钉住每个面都真的用了 L0,以及
`IDENTITY_DISCIPLINE` 绝不出现在 MCP 面。

面各自保留的:chat 的流水线编排/回话风格、mcp 的离线模式/开浏览器/skill 版本、块生成的 L1/L4。

> `fragment-contract.ts` 是**块生成这条链路**的基座(你在做一个图形 / 确定性 / note 在前),
> 不是全局 L0。别混。

| 层 | 文件 | 内容 | 何时变 |
| --- | --- | --- | --- |
| 片段契约 | `fragment-contract.ts` | 你在做什么/确定性/不许改没要求的/note 在前(**块生成侧的基座,不是全局 L0**) | 几乎不变 |
| L1 props 规范 | `l1-props-spec.ts` | 字段种类·夹取语义·缺省即成品（也是未来造 Component 预设的语法） | 几乎不变 |
| L2 预设 | `presets/` | 默认使用场景无关编辑判断；垂直域可显式加载自己的 L3.1 + L4 | 加预设时 |
| L4 能力词汇 | `l4-catalog.ts` | 该预设的 Component 目录；当前主要是 Motion Graphic 子集，**从 schema 派生** | 加预设 = 零改动 |
| L3.1 编辑判断 | `presets/spoken.ts` | 什么值得上屏/verbatim/语言/反单调/节奏 | 常改 |
| 输出契约 | `assemble.ts` | ```json（注册 Component 路径）/ ```html+```js（自由 Motion Graphic 路径） | 随路径 |

**主题不进注册 Component 路径**：主题是给 LLM 的 Frame playbook，经 withActiveTheme 注入
HTML 路径尾部；挂主题的项目生成主题化 HTML，注册预设路径只服务既有 typed Component，预设本身不感知主题。

**情境不是一层**:box/beats/邻居/口播稿/指令每次都不同,只能进 user message
(`buildKitPrompt`/`buildBlockPrompt`),进 system 就把缓存前缀毒化了。

两条路径**只有 L4 和输出契约不同**,L0 与 L3.1 是同一份 —— 改一次编辑原则两边同时生效。

判据：**加 Component 预设不用改提示词**（L4 派生）· **改编辑原则只改一个文件**（L3.1 共用）·
**换预设只换 L3.1+L4**。做不到就是分错了。

## 文件清单

| 文件 | 导出 | 用途 |
| --- | --- | --- |
| `l0-editor.ts` | `EDITOR_MODEL` `contentIsNotCommand` `stateDiscipline` `ON_SCREEN_LANGUAGE` `IDENTITY_DISCIPLINE` | **L0:编辑器本身**,三个面共用 |
| `assemble.ts` | `BLOCK_SYSTEM` `buildKitSystem` `buildHtmlSystem` | **按层拼 system 的唯一入口**,层序在此决定 |
| `block-system.ts` | `BLOCK_HTML_BODY` | 自由 HTML 路径的设计体（版式原型/图表 recipe/SELF-CHECK） |
| `chat.ts` | `CHAT_IDENTITY` `buildSituation` `buildChatSystem` + 快照类型 | 右侧 agent 的全部提示词面:身份/剧本 + `<composition_state>` 局势拼装 + system 总装 |
| `video-design-method.ts` | `VIDEO_DESIGN_METHOD` | 应用内与外部 Agent 共用的整片设计/导演方法，不包含具体场景 Skill 或块代码规范 |
| `l0-agent-tools.ts` | `STUDIO_TOOLS` `STUDIO_TOOL_MAP` + 类型 | **L0 工具面**(JSON schema + 英文 description,server 挂 streamText / client onToolCall 执行) |
| `theme-brief.ts` | `THEME_GENERAL_BRIEF` | general 主题给 LLM 的结构设计简报 |
| `active-theme.ts` | `withActiveTheme` | 主题简报接到 Motion Graphic Component 生成 system 末尾的包裹段 |

## 改动纪律

- **一律英文**(注进 system 的都是;feedback:系统提示词一律英文)。画面内文本/回复的
  语言规则写在提示词正文里(LANGUAGE 段),别在代码里另搞一套。
- 正文里的 ``` 围栏在模板字面量里要写成 `\`\`\``,`${` 字面量要写成 `\${`。
- 改 `block-system.ts` 后:先 `bun test src/lib/studio/compose.test.ts`(质量契约钉死
  关键段落存在),再让用户跑 `STUDIO_EVAL=1` 的 compose.live 评测(烧 API 额度,用户自己跑)。
- **新内容先问属于哪一层**。两条路径都要的 → L0 或 L3.1(写一份);只有写 markup 才要的 →
  `block-system.ts`；跟注册 Component 清单有关的 → 改 schema，不要手写重复目录。
- request-time 的大段动态内容(口播稿/composition 快照/beats)**不进本目录**——那是
  buildBlockPrompt / buildSituation 的事,写死进静态段会毒化
  prompt 缓存前缀。

# Studio 提示词目录

studio 所有注入 LLM 的提示词住这里,**一个提示词一个 .ts 文件**——提示词改动频繁,
独立成文件好 diff、好回滚、好并排对比。纯 TS,不引模板引擎:

- **变量注入** = 导出函数,参数就是变量,正文里原生 `${var}`(拼写错编译期就炸)。
- **拼接合并** = 模板字面量直拼(示范见 `plan.ts`:`PLAN_CORE` + 两种输出契约)。
- **唯一出口** = `index.ts`,消费方一律 `import { X } from './prompts'`,别直捅兄弟文件。

## 分层

块生成的 system 提示词**按层拼**,拼装单点在 `assemble.ts`。顺序是**稳定 → 易变**:
prefix 缓存只到第一处变化为止,越靠前的层越不该动。

| 层 | 文件 | 内容 | 何时变 |
| --- | --- | --- | --- |
| L0 基础契约 | `l0-contract.ts` | 你在做什么/确定性/不许改没要求的/note 在前 | 几乎不变 |
| L1 props 规范 | `l1-props-spec.ts` | 字段种类·夹取语义·缺省即成品(也是将来自造组件的语法) | 几乎不变 |
| L2 预设 | `presets/` | 口播/vlog…**路由层**:决定加载哪套 L3.1 + L4 | 加预设时 |
| L4 能力词汇 | `l4-catalog.ts` | 该预设的组件目录,**从 schema 派生** | 加组件 = 零改动 |
| L3.1 编辑判断 | `presets/spoken.ts` | 什么值得上屏/verbatim/语言/反单调/节奏 | 常改 |
| 输出契约 | `assemble.ts` | ```json(组件路径)/ ```html+```js(自由路径) | 随路径 |
| L3.2 主题 voice | `style-direction.ts` | frame 的气质,**放最后** | 切主题 |

**情境不是一层**:box/beats/邻居/口播稿/指令每次都不同,只能进 user message
(`buildKitPrompt`/`buildBlockPrompt`),进 system 就把缓存前缀毒化了。

两条路径**只有 L4 和输出契约不同**,L0 与 L3.1 是同一份 —— 改一次编辑原则两边同时生效。

判据:**加组件不用改提示词**(L4 派生)· **改编辑原则只改一个文件**(L3.1 共用)·
**换预设只换 L3.1+L4**。做不到就是分错了。

## 文件清单

| 文件 | 导出 | 用途 |
| --- | --- | --- |
| `assemble.ts` | `BLOCK_SYSTEM` `buildKitSystem` `buildHtmlSystem` | **按层拼 system 的唯一入口**,层序在此决定 |
| `block-system.ts` | `BLOCK_HTML_BODY` | 自由 HTML 路径的设计体(版式原型/图表 recipe/SELF-CHECK)——**注定被组件替掉,是待删的一层** |
| `plan.ts` | `PLAN_CORE` `PLAN_SYSTEM` `PLAN_SYSTEM_TOOLS` | 规划核心约束 + 单发 JSON(遗留)/工具环(生产)两种输出契约 |
| `chat.ts` | `CHAT_IDENTITY` `buildSituation` `buildChatSystem` + 快照类型 | 右侧 agent 的全部提示词面:身份/剧本 + `<composition_state>` 局势拼装 + system 总装 |
| `agent-tools.ts` | `STUDIO_TOOLS` `STUDIO_TOOL_MAP` + 类型 | 工具契约(JSON schema + 英文 description,server 挂 streamText / client onToolCall 执行) |
| `theme-brief.ts` | `THEME_GENERAL_BRIEF` | general 主题给 LLM 的结构设计简报 |
| `active-theme.ts` | `withActiveTheme` `planWithActiveTheme` | 主题简报接到 system 末尾的包裹段(compose/plan 两份措辞,单源) |

## 改动纪律

- **一律英文**(注进 system 的都是;feedback:系统提示词一律英文)。画面内文本/回复的
  语言规则写在提示词正文里(LANGUAGE 段),别在代码里另搞一套。
- 正文里的 ``` 围栏在模板字面量里要写成 `\`\`\``,`${` 字面量要写成 `\${`。
- 改 `block-system.ts` 后:先 `bun test src/lib/studio/compose.test.ts`(质量契约钉死
  关键段落存在),再让用户跑 `STUDIO_EVAL=1` 的 compose.live 评测(烧 API 额度,用户自己跑)。
- **新内容先问属于哪一层**。两条路径都要的 → L0 或 L3.1(写一份);只有写 markup 才要的 →
  `block-system.ts`(那是待删的一层,别往里加新东西);跟组件清单有关的 → 改 schema,别改文案。
- 改 `plan.ts` 后:`bun test src/lib/studio/plan.test.ts`。
- request-time 的大段动态内容(口播稿/composition 快照/beats)**不进本目录**——那是
  buildBlockPrompt / buildPlanPrompt / buildSituation 的事,写死进静态段会毒化
  prompt 缓存前缀。

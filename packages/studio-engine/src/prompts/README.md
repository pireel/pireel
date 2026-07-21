# Studio 提示词目录

studio 所有注入 LLM 的提示词住这里,**一个提示词一个 .ts 文件**——提示词改动频繁,
独立成文件好 diff、好回滚、好并排对比。纯 TS,不引模板引擎:

- **变量注入** = 导出函数,参数就是变量,正文里原生 `${var}`(拼写错编译期就炸)。
- **拼接合并** = 模板字面量直拼(示范见 `plan.ts`:`PLAN_CORE` + 两种输出契约)。
- **唯一出口** = `index.ts`,消费方一律 `import { X } from './prompts'`,别直捅兄弟文件。

## 文件清单

| 文件 | 导出 | 用途 |
| --- | --- | --- |
| `block-system.ts` | `BLOCK_SYSTEM` | 单块片段契约:设计约束/组件词汇/图表 recipe/SELF-CHECK(最热改) |
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
- 改 `plan.ts` 后:`bun test src/lib/studio/plan.test.ts`。
- request-time 的大段动态内容(口播稿/composition 快照/beats)**不进本目录**——那是
  buildBlockPrompt / buildPlanPrompt / buildSituation 的事,写死进静态段会毒化
  prompt 缓存前缀。

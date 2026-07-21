/**
 * Studio 提示词的**唯一出口**。
 *
 * 组织:一个提示词一个 .ts 文件(提示词改动频繁,独立成文件好 diff 好回滚),
 * 变量注入 = 函数参数 + 原生 ${}(TS 编译期兜底),拼接合并 = 模板字面量直拼
 * (见 plan.ts:核心段 + 两种输出契约)。消费方一律从这里 import,别直捅兄弟文件。
 *
 * 扩展方式:
 *  - 加静态提示词:新建 xxx.ts 导出 const → 这里 re-export。
 *  - 加带变量的提示词:导出函数,参数就是变量(拼写错编译期就炸,不需要模板引擎)。
 *  - request-time 的大段动态内容(口播稿/composition 快照)不进本目录 —— 那是
 *    buildXxxPrompt 的事,写死进静态段会毒化 prompt 缓存前缀。
 *
 * 纪律:正文一律英文(系统提示词规则);正文里的 ``` 围栏要转义成 \`\`\`;
 * 改 block-system 先跑 compose.test 质量契约 + 让用户跑 STUDIO_EVAL 评测。
 */

export { BLOCK_SYSTEM } from './block-system';
export { PLAN_CORE, PLAN_SYSTEM, PLAN_SYSTEM_TOOLS } from './plan';
export * from './chat';
export { THEME_GENERAL_BRIEF } from './theme-brief';
export { withActiveTheme, planWithActiveTheme } from './active-theme';
// 工具契约(schema + 英文 description,server 挂 streamText / client onToolCall 执行)
export * from './agent-tools';
export { AROLL_GUIDE } from './aroll-guide';
// 外部 agent(MCP)的 instructions + description 改写表
export { MCP_INSTRUCTIONS, MCP_DESCRIPTION_OVERRIDES } from './mcp';

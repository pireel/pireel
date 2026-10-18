# Pireel 编辑器组件

保留 Pireel 原工作台体验的开源视频编辑器，可嵌入你自己的应用。原有画布、时间线、字幕稿、属性面板、素材管理和 AI 对话／编辑工具都在组件中。

[English](README.md) · 简体中文

## 运行示例应用

```bash
git clone https://github.com/pireel/pireel.git
cd pireel
corepack enable
pnpm install
pnpm dev
```

示例入口加载原编辑器，没有另一套简化界面。本地导入、编辑、预览和导出可以独立使用；AI 的模型、转写、生成和存储服务由宿主配置。

## 嵌入

```tsx
import { PireelEditor } from '@pireel/studio-ui/editor';
import { unavailableProviders } from '@pireel/studio-engine/providers';

const providers = {
  ...unavailableProviders(),
  chatEndpoint: '/api/editor/chat',
  request: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
};

export function EditorPage() {
  return <PireelEditor projectId="local" locale="zh" providers={providers} className="h-screen w-full" />;
}
```

`chatEndpoint` 对接宿主实现的 AI 聊天服务；`StudioProviders` 同时定义转写、图形生成、存储等接口。配置模型服务不等于移除 AI 界面。当前运行时按页面共享服务配置，一个页面使用一套 Provider。

`extensions` 可提供素材目录和 `WorkflowEntry` 场景入口。具体字幕、B-roll、译制、擦除等场景页面与完整编排，以及官方制作方法、计费和平台服务不属于编辑器组件，位于托管产品侧。

宿主还需加载 Tailwind v4、`@pireel/ui/theme.css` 与 `@pireel/studio-ui/studio.css`，示例应用提供完整样式入口。外部 Agent 连接通过可选 `bridgeUrl` 配置。

## 完整产品

[Pireel](https://pireel.com) 提供已连接服务的完整创作场景。[公开 Agent 连接器](https://github.com/pireel/pireel-agent) 用于连接托管服务。

## 许可证

[AGPL-3.0-only](LICENSE)。独立 Agent 连接器使用 Apache-2.0。

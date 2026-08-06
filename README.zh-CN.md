<div align="center">

# Pireel Studio

**一款面向多素材、多成片项目的开源、无后端 AI 视频编辑器。**

[English](README.md) | [简体中文](README.zh-CN.md)

导入一个或多个视频片段，创建可独立编辑的多个成片版本——编辑、分镜设计、
视觉图形、动态字幕、主题、实时预览、时间线和导出
全都**完全在浏览器中**运行。无需账户，也无需服务器。

<img src="https://cdn.pireel.com/static/landing/hero.png" alt="Pireel Studio 编辑器" width="880" />

[![许可证：AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Agent 插件](https://img.shields.io/badge/Agent-plugin-8b5cf6.svg)](https://github.com/pireel/pireel-agent)
&nbsp;·&nbsp; [pireel.com](https://pireel.com)

</div>

---

本仓库包含编辑器软件包的源代码，以及一个用于
将其挂载为普通 Vite 应用的最简 shell。它由 Pireel monorepo 单向同步；
请基于 [pireel.com](https://pireel.com) 上的托管产品进行开发。

## 快速开始

使用 AI 编程 Agent（Codex / Claude
Code）是操控 Pireel 最快捷的方式——安装插件后，它会通过 MCP 连接编辑器：

```bash
npx skills add pireel/pireel-agent
```

也可以在本地运行编辑器 shell：

```bash
pnpm install
pnpm dev
```

打开终端输出的 URL，拖入视频即可开始编辑。草稿保存在
`localStorage` 中，视频字节保存在 OPFS 中——任何内容都不会离开浏览器。

## 主题

每个视频都可以套用一整套设计系统，包括配色、字体和版式语言。
`@pireel/studio-frames` 随附了数十种主题；以下是其中几种。

<div align="center">

<img src="https://cdn.pireel.com/static/landing/frame-covers/cinema-frame.webp" alt="Cinema Frame" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/neon-runner.webp" alt="Neon Runner" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/noir-gold.webp" alt="Noir Gold" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/glass-tech.webp" alt="Glass Tech" width="210" />
<br />
<img src="https://cdn.pireel.com/static/landing/frame-covers/memphis-pop.webp" alt="Memphis Pop" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/y2k-chrome.webp" alt="Y2K Chrome" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/botanic-press.webp" alt="Botanic Press" width="210" />
<img src="https://cdn.pireel.com/static/landing/frame-covers/paper-cut.webp" alt="Paper Cut" width="210" />

</div>

## 无需后端即可使用的功能

- **本地编辑**：多来源视频分镜、成片版本、元素、字幕、时间线和实时
  预览——全部在客户端完成。
- **客户端导出**：基于 WebCodecs（Chromium）的所见即所得导出。
- **主题**：完整目录由 `@pireel/studio-frames` 提供。
- **本地上传**：由磁盘支持的开发路由（`/local-assets`）用于存储
  按内容寻址的文件，是托管上传 Provider 在本地的对应实现。

## 需要 Provider 的功能

生成能力（元素生成、口播稿规划、转录、云媒体
库、跨设备同步、图像/视频生成）通过
`StudioProviders` 注入。shell 注册了 `unavailableProviders()`，因此在完成接入前，
这些路径会失败并显示提示。可以通过两种方式启用：

1. 在
   [`apps/studio-oss/src/providers.ts`](apps/studio-oss/src/providers.ts) 中**注入自己的 Provider**——其中包含六个
   小型接口（composer / planner / transcriber / vault / projects / uploads），可将它们
   指向任意后端或本地模型。
2. **自带 Agent**：编辑器设计为由外部
   Agent 通过 MCP 驱动。请参阅
   [Agent 插件](https://github.com/pireel/pireel-agent)以及
   [pireel.com/connect-agent.md](https://pireel.com/connect-agent.md) 上的连接指南。

## 目录结构

```
apps/studio-oss/        # 挂载编辑器的最简 Vite shell
packages/studio-ui/     # 编辑器 UI（工作台、面板、时间线、客户端导出）
packages/studio-engine/ # 编排核心、Brief、提示词和视频编辑工具
packages/studio-frames/ # 主题（设计系统）和内容
packages/ui/            # 共享基础组件、品牌标识和主题 Token
```

## 许可证

[AGPL-3.0-only](LICENSE)。

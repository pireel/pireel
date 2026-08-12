<div align="center">

# Pireel Studio

**为人和 AI Agent 共同设计的开源 AI 视频编辑器。**

[English](README.md) · [简体中文](README.zh-CN.md)

从一段视频、多种素材或一个空白成片开始。你可以直接在画布和时间线上编辑，
也可以用自然语言描述想要的结果。

<img src="https://cdn.pireel.com/static/landing/editorial-scenes/chat-editing-hero-dark-v8.jpg" alt="Pireel Studio 视频剪辑工作台" width="880" />

[![许可证：AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Agent 插件](https://img.shields.io/badge/Agent-plugin-8b5cf6.svg)](https://github.com/pireel/pireel-agent)

[体验 Pireel](https://pireel.com) · [连接 Agent](https://pireel.com/connect-agent.md)

</div>

---

Pireel 把 AI 放进真正的剪辑工作台。AI 可以帮你完成第一版，但画布、时间线、
字幕、图形、音频和最终导出始终可以由你继续调整。

## 你可以制作什么

- 节奏更干净、字幕更清晰的口播视频
- 从长视频中提炼出的短视频
- 产品演示、教程、知识讲解和营销内容
- 组合视频、图片、音频与图形的多素材内容
- 面向不同平台、比例和受众的多个版本
- 使用剪辑 Skill 与视觉 Frame 塑造的成片

## 按你喜欢的方式剪辑

- **直接使用 Studio**，在画布和时间线上完成细节调整
- **使用 Chat**，描述删减、节奏、字幕、版式和视觉想法
- **连接 AI Agent**，让 Codex、Claude Code 等工具参与剪辑
- **混合使用以上方式**，随时接手或继续 AI 的工作

## 运行开源编辑器

```bash
git clone https://github.com/pireel/pireel.git
cd pireel
corepack enable
pnpm install
pnpm dev
```

打开终端显示的地址并导入素材即可开始。

开源版专注于本地剪辑。需要内置 Chat 与完整在线体验时，可以访问
[pireel.com](https://pireel.com)。

## 连接 AI Agent

安装公开的 Pireel Agent 插件：

```bash
npx skills add pireel/pireel-agent
```

然后告诉 Agent“设置 Pireel”。支持的 Agent 与连接步骤请查看
[接入指南](https://pireel.com/connect-agent.md)。

## 许可证

[AGPL-3.0-only](LICENSE)。独立的 Agent 插件使用 Apache-2.0 许可证。

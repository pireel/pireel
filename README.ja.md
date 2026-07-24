<div align="center">

# Pireel Studio

**トーキングヘッド動画向けの、オープンソースでバックエンド不要の AI 動画エディター。**

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

クリップを読み込むと、キャンバスが映像に追従します。編集、ストーリーボード作成、
デザイングラフィック、キネティックキャプション、テーマ、ライブプレビュー、タイムライン、書き出しは
すべて**ブラウザー内だけで**動作します。アカウントもサーバーも不要です。

<img src="https://cdn.pireel.com/static/landing/hero.png" alt="Pireel Studio エディター" width="880" />

[![ライセンス：AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Agent プラグイン](https://img.shields.io/badge/Agent-plugin-8b5cf6.svg)](https://github.com/pireel/pireel-agent)
&nbsp;·&nbsp; [pireel.com](https://pireel.com)

</div>

---

このリポジトリには、エディターパッケージのソースと、それらを
通常の Vite アプリとしてマウントする最小構成のシェルが含まれています。Pireel monorepo から一方向に同期されているため、
[pireel.com](https://pireel.com) のホスティング製品を対象に開発してください。

## クイックスタート

AI コーディング Agent（Codex / Claude
Code）から操作するのが、Pireel を最もすばやく使う方法です。プラグインをインストールすると、MCP 経由でエディターに接続されます。

```bash
npx skills add pireel/pireel-agent
```

または、エディターシェルをローカルで実行します。

```bash
pnpm install
pnpm dev
```

出力された URL を開き、動画をドロップして編集を開始します。下書きは
`localStorage` に、動画のバイトデータは OPFS に保存され、ブラウザーの外には何も送信されません。

## テーマ

各動画には、パレット、書体、レイアウト表現を含む完全なデザインシステムを適用できます。
`@pireel/studio-frames` には数十種類が同梱されています。以下はその一例です。

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

## バックエンドなしで動作する機能

- **ローカル編集**：トーキングヘッドのトラック、ブロック、キャプション、タイムライン、ライブ
  プレビューはすべてクライアント側で動作します。
- **クライアント書き出し**：WebCodecs（Chromium）を使用した WYSIWYG 書き出し。
- **フレームテーマ**：完全なカタログは `@pireel/studio-frames` から提供されます。
- **ローカルアップロード**：ディスクを使用する開発用ルート（`/local-assets`）に
  コンテンツアドレス方式のファイルを保存します。これはホスティング環境のアップロード Provider に相当するローカル実装です。

## Provider が必要な機能

生成機能（ブロック構成、ナレーション計画、文字起こし、クラウドメディア
保管庫、デバイス間同期、画像・動画生成）は、
`StudioProviders` を通じて注入されます。シェルは `unavailableProviders()` を登録するため、接続するまでは
該当する処理がヒントを表示して失敗します。有効化する方法は 2 つあります。

1. **独自の Provider を注入**：
   [`apps/studio-oss/src/providers.ts`](apps/studio-oss/src/providers.ts) にある 5 つの
   小さなインターフェース（composer / planner / transcriber / vault / projects）を
   任意のバックエンドまたはローカルモデルに接続できます。
2. **独自の Agent を使用**：エディターは、外部
   Agent から MCP 経由で操作できるように設計されています。
   [Agent プラグイン](https://github.com/pireel/pireel-agent)と、
   [pireel.com/connect-agent.md](https://pireel.com/connect-agent.md) の接続ガイドを参照してください。

## レイアウト

```
apps/studio-oss/        # エディターをマウントする最小構成の Vite シェル
packages/studio-ui/     # エディター UI（ワークベンチ、パネル、タイムライン、クライアント書き出し）
packages/studio-engine/ # コンポジションコア、Brief、プロンプト、動画編集ユーティリティ
packages/studio-frames/ # フレームテーマ（デザインシステム）とコンテンツ
packages/ui/            # 共有プリミティブ、ブランドマーク、テーマトークン
```

## ライセンス

[AGPL-3.0-only](LICENSE)。

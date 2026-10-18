# Pireel editor component

An embeddable video editor preserving the original Pireel workbench: canvas, timeline, transcript, properties, assets, AI chat and editing tools. There is no separate simplified UI.

English · [简体中文](README.zh-CN.md)

## Run the example

```bash
git clone https://github.com/pireel/pireel.git
cd pireel
corepack enable
pnpm install
pnpm dev
```

Local import, editing, preview and export run independently. AI remains part of the component; the embedding host supplies model, transcription, generation and persistence services.

## Embed

```tsx
import { PireelEditor } from '@pireel/studio-ui/editor';
import { unavailableProviders } from '@pireel/studio-engine/providers';

const providers = {
  ...unavailableProviders(),
  chatEndpoint: '/api/editor/chat',
  request: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
};
export function EditorPage() {
  return <PireelEditor projectId="local" locale="en" providers={providers} className="h-screen w-full" />;
}
```

Implement the chat service and other capabilities using `StudioProviders`. Runtime service configuration is shared per page; use one provider configuration on a page. The editor includes no platform credentials.

The optional `extensions` prop supplies host UI and catalogs. `StudioShell.WorkflowEntry` mounts a product-owned workflow surface. Complete scene pages and recipes (dubbing, B-roll, erasure and other production flows), official playbooks, billing and platform services remain in the hosted product.

Load Tailwind v4, `@pireel/ui/theme.css` and `@pireel/studio-ui/studio.css` in the host; the example app contains the complete stylesheet entry. External Agent connections use the optional `bridgeUrl` port.

## Hosted product

[Pireel](https://pireel.com) offers the complete connected production workflows. The [public Agent connector](https://github.com/pireel/pireel-agent) connects to that service.

## License

[AGPL-3.0-only](LICENSE). The separate Agent connector is Apache-2.0.

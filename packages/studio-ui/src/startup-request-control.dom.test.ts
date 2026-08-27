/** @vitest-environment jsdom */

import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { STUDIO_AUTO_SKILL_ID } from "@pireel/studio-engine/scenario-skills";

const mocks = vi.hoisted(() => ({
  composerProps: null as Record<string, (...args: never[]) => unknown> | null,
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: ({ messages }: { messages: unknown[] }) => ({
    messages,
    sendMessage: vi.fn(),
    status: "ready",
    stop: vi.fn(),
    setMessages: vi.fn(),
    addToolOutput: vi.fn(),
    error: null,
  }),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {},
  lastAssistantMessageIsCompleteWithToolCalls: () => false,
}));

vi.mock("@pireel/ui/ai-elements/conversation", () => ({
  Conversation: () => null,
  ConversationContent: () => null,
  ConversationEmptyState: () => null,
  ConversationScrollButton: () => null,
}));

vi.mock("@pireel/ui/ai-elements/message", () => ({
  Message: () => null,
  MessageContent: () => null,
  MessageResponse: () => null,
}));

vi.mock("@pireel/studio-engine/providers", () => ({
  studioProviders: () => ({ chatEndpoint: "/api/studio/chat" }),
}));

vi.mock("./chat-format", () => ({
  mid: () => "message-id",
  PiAvatar: () => null,
  ThinkingDots: () => null,
  renderTextWithElementPills: (text: string) => text,
}));

vi.mock("./chat-tool-parts", () => ({
  renderToolPart: () => null,
  renderToolPartGroup: () => null,
  toolStatus: () => ({ kind: "done" }),
}));

vi.mock("./chat-composer", () => ({
  Composer: (props: Record<string, (...args: never[]) => unknown>) => {
    mocks.composerProps = props;
    return null;
  },
}));

vi.mock("./chat-thread-store", () => ({
  assistantHasOpenOrInterruptedInteraction: () => false,
  assistantMessageHasRenderableOutput: () => true,
  isRecoverableStudioChatError: () => false,
}));

vi.mock("./chat-thread-context", () => ({
  scopeSituationToThread: (value: unknown) => value,
}));

vi.mock("./i18n", () => ({
  studioLocale: () => "zh",
  t: (key: string) => key,
}));

vi.mock("./chat-local-asset-mention", () => ({
  localAssetMentionContext: () => [],
}));

vi.mock("./chat-timeline-frame-evidence", () => ({
  inspectTimelineFrameEvidence: vi.fn(),
}));

import { ChatThread } from "./chat-thread";
import { DeferredActivation } from "./deferred-activation";
import {
  FrameCatalogRequestCache,
  type FrameCatalogItem,
} from "./use-frame-catalog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; host: HTMLDivElement }> = [];

beforeEach(() => {
  mocks.composerProps = null;
});

afterEach(() => {
  vi.useRealTimers();
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

const frame = (id: string): FrameCatalogItem => ({
  id,
  title: id,
  summary: "",
  icon: "",
  showcase: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("startup request control", () => {
  it("shares a locale request across concurrent Frame consumers", async () => {
    const sourceResult = deferred<FrameCatalogItem[]>();
    const source = vi.fn(() => sourceResult.promise);
    const cache = new FrameCatalogRequestCache(source);

    const first = cache.load("zh");
    const second = cache.load("zh");

    expect(first).toBe(second);
    expect(source).toHaveBeenCalledOnce();
    sourceResult.resolve([frame("editorial")]);
    await expect(first).resolves.toEqual([frame("editorial")]);
    expect(cache.get("zh")).toEqual([frame("editorial")]);
  });

  it("does not let an obsolete Frame source populate the new cache", async () => {
    const oldSourceResult = deferred<FrameCatalogItem[]>();
    const cache = new FrameCatalogRequestCache(() => oldSourceResult.promise);
    const oldRequest = cache.load("zh");
    cache.setSource(async () => [frame("new")]);

    await expect(cache.load("zh")).resolves.toEqual([frame("new")]);
    oldSourceResult.resolve([frame("old")]);
    await oldRequest;

    expect(cache.get("zh")).toEqual([frame("new")]);
  });

  it("arms only after the final mount-effect setup settles", () => {
    vi.useFakeTimers();
    const activation = new DeferredActivation();

    const strictModeCleanup = activation.defer();
    strictModeCleanup();
    activation.defer();
    expect(activation.active).toBe(false);

    vi.runOnlyPendingTimers();
    expect(activation.active).toBe(true);
  });

  it("does not save restored chat state on mount but saves explicit changes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const onSnapshot = vi.fn();
    const initialMessages: UIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] },
    ];

    act(() => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(ChatThread, {
            threadId: "thread-1",
            initialMessages,
            initialFrame: null,
            initialSkillId: STUDIO_AUTO_SKILL_ID,
            scenarioSkills: [],
            frames: [],
            runTool: vi.fn(),
            getBody: () => ({}),
            timelineFramePickActive: false,
            timelineFramePickBusy: false,
            timelineFramePickAvailable: true,
            elements: [],
            onSnapshot,
            handleRef: { current: null },
          }),
        ),
      );
    });

    expect(onSnapshot).not.toHaveBeenCalled();

    act(() => {
      mocks.composerProps!.onPickFrame({
        id: "frame-1",
        title: "Frame 1",
        icon: "",
      } as never);
    });
    expect(onSnapshot).toHaveBeenLastCalledWith(
      initialMessages,
      { id: "frame-1", title: "Frame 1", icon: "" },
      STUDIO_AUTO_SKILL_ID,
    );

    act(() => {
      mocks.composerProps!.onPickSkill("short-video-ad-remix" as never);
    });
    expect(onSnapshot).toHaveBeenLastCalledWith(
      initialMessages,
      { id: "frame-1", title: "Frame 1", icon: "" },
      "short-video-ad-remix",
    );
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });
});

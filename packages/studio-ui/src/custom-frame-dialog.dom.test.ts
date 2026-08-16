// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOM_STYLE_PALETTES,
  DEFAULT_CUSTOM_VISUAL_STYLE,
} from "@pireel/studio-engine/visual-style";
import { CustomFrameDialog } from "./custom-frame-dialog";
import type { FrameCatalogItem } from "./use-frame-catalog";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const frames: FrameCatalogItem[] = [
  {
    id: "editorial-quiet",
    title: "编辑留白",
    summary: "Editorial",
    icon: "E",
    showcase: [],
    palette: {
      ...CUSTOM_STYLE_PALETTES.monochrome,
      paper: "#F2F0E9",
      panel: "#151515",
      muted: "#716D66",
      line: "#15151533",
    },
  },
  {
    id: "memphis-motion",
    title: "孟菲斯",
    summary: "Memphis",
    icon: "M",
    showcase: [],
    palette: { ...CUSTOM_STYLE_PALETTES.ember },
  },
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("custom frame preview stability", () => {
  it("keeps fixed preview slots and aspect ratios while switching directions", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const root = createRoot(mount);

    await act(async () => {
      root.render(
        createElement(CustomFrameDialog, {
          style: { ...DEFAULT_CUSTOM_VISUAL_STYLE },
          frames,
          frameId: "editorial-quiet",
          onClose: () => {},
          onUse: () => {},
          onDisable: () => {},
        }),
      );
    });

    const before = [
      ...document.querySelectorAll<HTMLElement>("[data-preview-slot]"),
    ];
    const previewShells = [
      ...document.querySelectorAll<HTMLElement>("[data-motion-preview]"),
    ];
    const previewThumbnails = [
      ...document.querySelectorAll<HTMLElement>("[data-motion-thumbnail]"),
    ];
    expect(before).toHaveLength(13);
    expect(previewShells).toHaveLength(0);
    expect(previewThumbnails).toHaveLength(13);
    expect(
      previewThumbnails.every((shell) =>
        shell.classList.contains("aspect-video"),
      ),
    ).toBe(true);
    const editorialHero = document.querySelector<HTMLElement>(
      '[data-visual-direction="editorial"]',
    );
    const editorialImageOverlay =
      editorialHero?.querySelector<HTMLElement>("img + span");
    expect(editorialImageOverlay?.style.background).toContain(
      "rgb(242, 240, 233)",
    );
    expect(editorialImageOverlay?.style.background).not.toContain("gradient");

    const memphis = [
      ...document.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ].find((button) => button.textContent?.includes("孟菲斯"));
    expect(memphis).toBeDefined();
    await act(async () => {
      memphis!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const after = [
      ...document.querySelectorAll<HTMLElement>("[data-preview-slot]"),
    ];
    expect(after).toHaveLength(before.length);
    expect(after.every((slot, index) => slot === before[index])).toBe(true);

    await act(async () => {
      after[0]!
        .closest("button")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelectorAll("[data-motion-preview]")).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it("offers a real no-visual state and disables the attached Frame", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const root = createRoot(mount);
    const onDisable = vi.fn();

    await act(async () => {
      root.render(
        createElement(CustomFrameDialog, {
          style: { ...DEFAULT_CUSTOM_VISUAL_STYLE },
          frames,
          frameId: null,
          onClose: () => {},
          onUse: () => {},
          onDisable,
        }),
      );
    });

    const noneOption = [
      ...document.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ].find((button) => button.textContent?.includes("不使用视觉风格"));
    expect(noneOption?.getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).not.toContain("色彩倾向");

    const disableButton = [
      ...document.querySelectorAll<HTMLButtonElement>("button:not([role])"),
    ].find((button) => button.textContent?.trim() === "不使用视觉风格");
    expect(disableButton).toBeDefined();
    await act(async () => disableButton!.click());
    expect(onDisable).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});

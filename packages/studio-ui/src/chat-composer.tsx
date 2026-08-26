"use client";

/** Studio chat input: contenteditable composer with @ element pills and the theme (frame) picker. */

import { useImperativeHandle, useRef, useState } from "react";
import { AtSign, ArrowUp, Square, Palette } from "lucide-react";
import type { ChatStatus } from "ai";
import {
  TriggerPopover,
  type TriggerPopoverHandle,
  type TriggerPopoverPickContext,
} from "@pireel/ui/trigger-popover";
import type { StudioScenarioSkillId } from "@pireel/studio-engine/scenario-skills";
import { ChatSkillPicker } from "./chat-skill-picker";
import type { FrameCatalogItem } from "./use-frame-catalog";
import {
  appendChatPillRemoveIcon,
  CHAT_PILL_CLASS,
  CHAT_PILL_ICON_CLASS,
  CHAT_PILL_LABEL_CLASS,
  elementIcon,
  makeElementPill,
} from "./chat-format";
import { t } from "./i18n";
import type {
  AttachedFrame,
  AttachedTimelineFrame,
  PendingTimelineFrame,
  StudioChatDraftPart,
  StudioChatProps,
  StudioElementRef,
} from "./studio-chat";
import type { StudioScenarioSkillOption } from "./shell-context";
import {
  ChatTimelineFramePicker,
  formatTimelineFrameTime,
} from "./chat-timeline-frame-picker";
import { CustomFrameDialog } from "./custom-frame-dialog";
import {
  customFrameCatalogItem,
  useCustomFrameStyle,
} from "./custom-frame-style";

const noopTimelineFramePick = () => {};

export interface ComposerHandle {
  insertElementPill(el: StudioElementRef | null): void;
  /** Drop all element references when the active output changes; ids are scoped to one output. */
  clearElementPills(): void;
  /** Append text at the end and focus (used by the generate panel's "@reference"): fill only, don't send. */
  insertText(text: string): void;
  /** Replace the whole box with text and focus (used by quick prompts): tapping different prompts swaps, doesn't concatenate. */
  setText(text: string): void;
  /** Focus only (cursor to end), don't touch content (used by the component floating bar's "AI edit"). */
  focusInput(): void;
  beginTimelineFrameCapture(frame: PendingTimelineFrame): void;
  resolveTimelineFrameCapture(frame: AttachedTimelineFrame): void;
  failTimelineFrameCapture(id: string): void;
}

export function Composer({
  placeholder,
  status,
  elements,
  skillId,
  scenarioSkills,
  onImportScenarioSkill,
  onDeleteScenarioSkill,
  onPickSkill,
  frame,
  frames,
  onPickFrame,
  timelineFramePickActive,
  timelineFramePickBusy,
  timelineFramePickAvailable,
  onTimelineFramePickActiveChange,
  onSubmit,
  onStop,
  methodsRef,
}: {
  placeholder: string;
  status: ChatStatus;
  elements: StudioElementRef[];
  /** Rich Markdown Studio Skill attached to this chat session. */
  skillId: StudioScenarioSkillId;
  /** Browser-safe host catalog; full Markdown never enters this component. */
  scenarioSkills: readonly StudioScenarioSkillOption[];
  onImportScenarioSkill?: (file: File) => Promise<StudioScenarioSkillOption>;
  onDeleteScenarioSkill?: (id: string) => Promise<void>;
  onPickSkill: (id: StudioScenarioSkillId) => void;
  /** Visual direction attached to the current session. */
  frame: AttachedFrame | null;
  /** Art-direction catalog rendered in the unified visual-style dialog. */
  frames: FrameCatalogItem[];
  onPickFrame: (frame: AttachedFrame | null) => void;
  timelineFramePickActive: boolean;
  timelineFramePickBusy: boolean;
  timelineFramePickAvailable: boolean;
  onTimelineFramePickActiveChange?: StudioChatProps["onTimelineFramePickActiveChange"];
  onSubmit: (parts: StudioChatDraftPart[]) => boolean | Promise<boolean>;
  onStop: () => void;
  methodsRef: React.MutableRefObject<ComposerHandle | null>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const refPopoverRef = useRef<TriggerPopoverHandle>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const timelineFramesRef = useRef<Map<string, AttachedTimelineFrame | null>>(
    new Map(),
  );
  const [empty, setEmpty] = useState(true);
  const [timelineFrameCount, setTimelineFrameCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStyle, saveCustomStyle] = useCustomFrameStyle();
  const isBusy = submitting || status === "streaming" || status === "submitted";

  function recomputeEmpty() {
    const el = editorRef.current;
    if (!el) return;
    const isEmpty = (el.textContent ?? "").length === 0;
    if (
      isEmpty &&
      (el.innerHTML === "<br>" || el.innerHTML === "<div><br></div>")
    )
      el.innerHTML = "";
    setEmpty(isEmpty);
  }

  function rememberEditorSelection() {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (root.contains(range.startContainer))
      savedSelectionRef.current = range.cloneRange();
  }

  /** Serialize contenteditable in visual order: text/@ pills and every ready timeline-frame tag. */
  function serializeToParts(): StudioChatDraftPart[] {
    const el = editorRef.current;
    if (!el) return [];
    const out: StudioChatDraftPart[] = [];
    let buf = "";
    const flushText = () => {
      if (!buf) return;
      out.push({ type: "text", text: buf });
      buf = "";
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buf += node.textContent ?? "";
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.timelineFrameId) {
        const timelineFrame = timelineFramesRef.current.get(
          node.dataset.timelineFrameId,
        );
        if (timelineFrame) {
          flushText();
          out.push({ type: "timeline-frame", frame: timelineFrame });
        }
        return;
      }
      if (node.dataset.refId) {
        buf += `@${node.dataset.refId}`;
        return;
      }
      if (node.tagName === "BR") {
        buf += "\n";
        return;
      }
      if (
        (node.tagName === "DIV" || node.tagName === "P") &&
        buf &&
        !buf.endsWith("\n")
      )
        buf += "\n";
      node.childNodes.forEach(walk);
    };
    el.childNodes.forEach(walk);
    flushText();
    return out;
  }

  function hasLoadingTimelineFrame(): boolean {
    return !!editorRef.current?.querySelector(
      '[data-timeline-frame-state="loading"]',
    );
  }

  function syncTimelineFrameCount() {
    const root = editorRef.current;
    if (!root) {
      timelineFramesRef.current.clear();
      setTimelineFrameCount(0);
      return;
    }
    const pills = root.querySelectorAll<HTMLElement>(
      "[data-timeline-frame-id]",
    );
    const liveIds = new Set(
      Array.from(pills, (pill) => pill.dataset.timelineFrameId).filter(Boolean),
    );
    for (const id of timelineFramesRef.current.keys())
      if (!liveIds.has(id)) timelineFramesRef.current.delete(id);
    setTimelineFrameCount(pills.length);
  }

  function clear() {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = "";
      el.focus();
    }
    timelineFramesRef.current.clear();
    hideTimelineFrameHoverPreview();
    savedSelectionRef.current = null;
    setTimelineFrameCount(0);
    setEmpty(true);
  }

  async function fireSubmit() {
    if (isBusy) return;
    if (hasLoadingTimelineFrame()) {
      return;
    }
    const parts = serializeToParts();
    const firstText = parts.findIndex((part) => part.type === "text");
    let lastText = -1;
    for (let index = parts.length - 1; index >= 0; index--) {
      if (parts[index]!.type === "text") {
        lastText = index;
        break;
      }
    }
    const firstTextPart = firstText >= 0 ? parts[firstText] : undefined;
    const lastTextPart = lastText >= 0 ? parts[lastText] : undefined;
    if (firstTextPart?.type === "text")
      firstTextPart.text = firstTextPart.text.trimStart();
    if (lastTextPart?.type === "text")
      lastTextPart.text = lastTextPart.text.trimEnd();
    const final = parts.filter(
      (part) => part.type !== "text" || part.text.length > 0,
    );
    if (!final.length) return;
    setSubmitting(true);
    try {
      if (await onSubmit(final)) clear();
    } finally {
      setSubmitting(false);
    }
  }

  /** Remove a trigger and its live filter text (`/口播`) after a command-menu selection. */
  function consumeTriggerQuery(trigger: string) {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel) return;

    const removeFromNode = (node: Node, caretOffset: number): boolean => {
      if (node.nodeType !== Node.TEXT_NODE || !root.contains(node))
        return false;
      const text = node.textContent ?? "";
      const triggerIdx = text.slice(0, caretOffset).lastIndexOf(trigger);
      if (triggerIdx < 0) return false;
      const query = text.slice(triggerIdx + trigger.length, caretOffset);
      if (/\s/.test(query)) return false;
      node.textContent = text.slice(0, triggerIdx) + text.slice(caretOffset);
      const next = document.createRange();
      next.setStart(node, triggerIdx);
      next.collapse(true);
      sel.removeAllRanges();
      sel.addRange(next);
      savedSelectionRef.current = next.cloneRange();
      return true;
    };

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (removeFromNode(range.startContainer, range.startOffset)) return;
    }

    // Some browsers normalize a contenteditable caret onto the root after a captured Enter.
    // Fall back to the final live text node, which still contains the slash query that opened this menu.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!;
      if (removeFromNode(node, node.textContent?.length ?? 0)) return;
    }
  }

  function insertPillAtCursor(span: HTMLElement) {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const sp = document.createTextNode(" ");
    let range: Range | null = null;
    const saved = savedSelectionRef.current;
    if (saved && el.contains(saved.startContainer)) range = saved.cloneRange();
    else if (
      sel &&
      sel.rangeCount > 0 &&
      el.contains(sel.getRangeAt(0).startContainer)
    )
      range = sel.getRangeAt(0).cloneRange();
    el.focus({ preventScroll: true });
    if (range) {
      range.deleteContents();
      range.insertNode(span);
      span.parentNode?.insertBefore(sp, span.nextSibling);
      const after = document.createRange();
      after.setStartAfter(sp);
      after.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(after);
      savedSelectionRef.current = after.cloneRange();
    } else {
      el.appendChild(span);
      el.appendChild(sp);
      const after = document.createRange();
      after.setStartAfter(sp);
      after.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(after);
      savedSelectionRef.current = after.cloneRange();
    }
  }

  function focusAfterPill(span: HTMLElement) {
    const root = editorRef.current;
    if (!root || !span.isConnected) return;
    root.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const spacer = span.nextSibling;
    if (spacer?.nodeType === Node.TEXT_NODE)
      range.setStart(spacer, spacer.textContent?.length ?? 0);
    else range.setStartAfter(span);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  }

  function removePillNode(pill: HTMLElement) {
    const root = editorRef.current;
    if (!root) return;
    const next = pill.nextSibling;
    if (
      next?.nodeType === Node.TEXT_NODE &&
      next.textContent?.startsWith(" ")
    ) {
      next.textContent = next.textContent.slice(1);
      if (!next.textContent) next.remove();
    }
    pill.remove();
    recomputeEmpty();
  }

  function makeEditableElementPill(el: StudioElementRef, auto = false) {
    const pill = makeElementPill(el, {
      auto,
      onRemove: () => removePillNode(pill),
    });
    return pill;
  }

  function removeTimelineFramePill(id: string) {
    const root = editorRef.current;
    if (!root) return;
    const pill = findTimelineFramePill(root, id);
    if (!pill) return;
    removePillNode(pill);
    timelineFramesRef.current.delete(id);
    hideTimelineFrameHoverPreview(id);
    syncTimelineFrameCount();
  }

  /** Unified visual-style dialog → attach one visual direction plus independent user controls. */
  function pickFrame(item: FrameCatalogItem) {
    onPickFrame({
      id: item.id,
      title: item.title,
      icon: item.icon,
      iconKey: item.iconKey ?? null,
      ...(item.customVisualStyle
        ? { customVisualStyle: item.customVisualStyle }
        : {}),
    });
  }

  /** @ picker selection → insert pill. */
  function pickElement(
    el: StudioElementRef,
    context: TriggerPopoverPickContext,
  ) {
    const root = editorRef.current;
    if (root && findElementPill(root, el.id, false)) {
      if (context.source === "trigger") consumeTriggerQuery("@");
      recomputeEmpty();
      return;
    }
    if (context.source === "trigger") consumeTriggerQuery("@");
    insertPillAtCursor(makeEditableElementPill(el));
    recomputeEmpty();
  }

  useImperativeHandle(
    methodsRef,
    () => ({
      insertElementPill: (el: StudioElementRef | null) => {
        const root = editorRef.current;
        if (!root) return;
        // Remove the previous "currently selected" pill (and the space after it)
        root.querySelectorAll("[data-auto]").forEach((n) => {
          const next = n.nextSibling;
          if (
            next &&
            next.nodeType === Node.TEXT_NODE &&
            next.textContent === " "
          )
            next.remove();
          n.remove();
        });
        if (el) {
          // Already explicitly @-mentioned the same one → don't add again
          if (!findElementPill(root, el.id)) {
            root.appendChild(makeEditableElementPill(el, true));
            root.appendChild(document.createTextNode(" "));
          }
        }
        recomputeEmpty();
      },
      clearElementPills: () => {
        const root = editorRef.current;
        if (!root) return;
        root
          .querySelectorAll("[data-ref-id], [data-timeline-frame-id]")
          .forEach((node) => {
            const next = node.nextSibling;
            if (
              next?.nodeType === Node.TEXT_NODE &&
              next.textContent?.startsWith(" ")
            ) {
              next.textContent = next.textContent.slice(1);
            }
            node.remove();
          });
        timelineFramesRef.current.clear();
        hideTimelineFrameHoverPreview();
        syncTimelineFrameCount();
        recomputeEmpty();
      },
      setText: (text: string) => {
        const root = editorRef.current;
        if (!root) return;
        root.innerHTML = "";
        root.appendChild(document.createTextNode(`${text} `));
        recomputeEmpty();
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      insertText: (text: string) => {
        const root = editorRef.current;
        if (!root) return;
        root.appendChild(document.createTextNode(`${text} `));
        recomputeEmpty();
        // Focus and put the cursor at the end so the user's next typing becomes an addendum
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      focusInput: () => {
        const root = editorRef.current;
        if (!root) return;
        root.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(root);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      },
      beginTimelineFrameCapture: (pendingFrame) => {
        const root = editorRef.current;
        if (!root) return;
        timelineFramesRef.current.set(pendingFrame.id, null);
        const pill = makeTimelineFramePill(
          pendingFrame,
          () => timelineFramesRef.current.get(pendingFrame.id) ?? null,
          () => removeTimelineFramePill(pendingFrame.id),
        );
        insertPillAtCursor(pill);
        syncTimelineFrameCount();
        recomputeEmpty();
      },
      resolveTimelineFrameCapture: (nextFrame) => {
        const root = editorRef.current;
        if (!root) return;
        const pill = findTimelineFramePill(root, nextFrame.id);
        if (!pill) return;
        timelineFramesRef.current.set(nextFrame.id, nextFrame);
        pill.dataset.timelineFrameState = "ready";
        rebuildTimelineFramePill(pill, nextFrame, () =>
          removeTimelineFramePill(nextFrame.id),
        );
        focusAfterPill(pill);
      },
      failTimelineFrameCapture: (id) => {
        removeTimelineFramePill(id);
      },
    }),
    // DOM-backed composer state deliberately lives in refs; keep the imperative surface stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    e.preventDefault();
    void fireSubmit();
  }

  return (
    <>
      <div className="border-line bg-panel-2 focus-within:border-ink-4 relative rounded-md border transition-colors">
        <div className="relative">
          {empty && (
            <div className="text-ink-4 pointer-events-none absolute left-3 top-2.5 text-[13px]">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onInput={() => {
              hideTimelineFrameHoverPreviewIfDetached(editorRef.current);
              syncTimelineFrameCount();
              recomputeEmpty();
              rememberEditorSelection();
            }}
            onKeyUp={rememberEditorSelection}
            onMouseUp={rememberEditorSelection}
            onFocus={rememberEditorSelection}
            onPaste={(e) => {
              e.preventDefault();
              const raw =
                e.clipboardData.getData("text/plain") ||
                e.clipboardData.getData("text");
              const text = raw.replace(/^[\r\n]+|[\r\n]+$/g, "");
              if (text) document.execCommand("insertText", false, text);
            }}
            className="max-h-[220px] min-h-[80px] overflow-y-auto whitespace-pre-wrap px-3 pb-2 pt-2.5 text-[13px] outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md"
              onClick={(e) => refPopoverRef.current?.open(e.currentTarget)}
              title={t("chatGen.mentionElementShot")}
            >
              <AtSign className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            {/* Visual-style button opens the unified direction + controls dialog. Disabled while the
                turn is running because a mid-generation direction switch would split one batch. */}
            <button
              type="button"
              disabled={isBusy}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-30 ${
                frame
                  ? "bg-accent/15 text-accent hover:bg-accent/25"
                  : "text-ink-3 hover:bg-line hover:text-ink"
              }`}
              onClick={() => setCustomOpen(true)}
              title={
                frame
                  ? t("chatGen.themeTitle", { title: frame.title })
                  : t("chatGen.pickTheme")
              }
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            <ChatTimelineFramePicker
              disabled={isBusy}
              available={timelineFramePickAvailable}
              active={timelineFramePickActive}
              busy={timelineFramePickBusy}
              count={timelineFrameCount}
              onActiveChange={(active) => {
                if (active) rememberEditorSelection();
                (onTimelineFramePickActiveChange ?? noopTimelineFramePick)(
                  active,
                );
              }}
            />
            <ChatSkillPicker
              editorRef={editorRef}
              skillId={skillId}
              skills={scenarioSkills}
              onImportMarkdown={onImportScenarioSkill}
              onDeleteCustom={onDeleteScenarioSkill}
              disabled={isBusy}
              onChange={onPickSkill}
              onTriggerPick={() => {
                consumeTriggerQuery("/");
                recomputeEmpty();
              }}
            />
          </div>
          {isBusy ? (
            <button
              type="button"
              className="bg-destructive inline-flex h-7 w-7 items-center justify-center rounded-md text-white hover:brightness-110"
              onClick={onStop}
              title={t("chatGen.stop")}
            >
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="bg-ink text-bg inline-flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-25"
              disabled={empty || timelineFramePickBusy}
              onClick={() => void fireSubmit()}
              title={t("chatGen.sendEnter")}
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <TriggerPopover<StudioElementRef>
        ref={refPopoverRef}
        trigger="@"
        editorRef={editorRef}
        items={elements}
        itemSearchText={(el) => `${el.label} ${el.kind}`}
        itemKey={(el) => el.id}
        title={t("chatGen.mentionElementN", { n: elements.length })}
        className="w-[260px]"
        emptyOriginal={
          <div className="text-ink-3 px-2 py-3 text-center text-[12px]">
            {t("chatGen.noElementsShotsYet")}
          </div>
        }
        onPick={pickElement}
        renderItem={(el, { active, pick, setActive }) => (
          <button
            type="button"
            data-active={active || undefined}
            onMouseEnter={setActive}
            onMouseDown={(e) => e.preventDefault()}
            onClick={pick}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${active ? "bg-panel-2" : ""}`}
          >
            <span className="shrink-0">{elementIcon(el)}</span>
            <span className="text-ink truncate">{el.label}</span>
            <span className="text-ink-4 ml-auto shrink-0 text-[11px]">
              {el.isShot ? t("common.shot") : el.kind}
            </span>
          </button>
        )}
      />

      <CustomFrameDialog
        style={customOpen ? (frame?.customVisualStyle ?? customStyle) : null}
        frames={frames}
        frameId={frame?.id ?? null}
        onClose={() => setCustomOpen(false)}
        onUse={(style, directionId) => {
          saveCustomStyle(style);
          const direction = frames.find((item) => item.id === directionId);
          pickFrame(
            customFrameCatalogItem(
              style,
              t("customFrame.title"),
              t("customFrame.summary"),
              direction,
            ),
          );
          setCustomOpen(false);
        }}
        onDisable={() => {
          onPickFrame(null);
          setCustomOpen(false);
        }}
      />
    </>
  );
}

function makeTimelineFramePill(
  pendingFrame: PendingTimelineFrame,
  getFrame: () => AttachedTimelineFrame | null,
  onRemove: () => void,
): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.timelineFrameId = pendingFrame.id;
  span.dataset.timelineFrameState = "loading";
  rebuildTimelineFramePill(span, pendingFrame, onRemove);

  let showTimer: number | null = null;
  span.addEventListener("mouseenter", () => {
    const frame = getFrame();
    if (!frame) return;
    if (showTimer != null) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      showTimelineFrameHoverPreview(frame, span.getBoundingClientRect());
      showTimer = null;
    }, 260);
  });
  span.addEventListener("mouseleave", () => {
    if (showTimer != null) window.clearTimeout(showTimer);
    showTimer = null;
    hideTimelineFrameHoverPreview(pendingFrame.id);
  });
  return span;
}

/** Rebuild only the pill's children so its DOM identity and the user's caret position stay intact. */
function rebuildTimelineFramePill(
  span: HTMLElement,
  frame: PendingTimelineFrame | AttachedTimelineFrame,
  onRemove: () => void,
) {
  const ready = "dataUrl" in frame;
  span.className = `${CHAT_PILL_CLASS} sc-frame-pill ${ready ? "" : "border-dashed opacity-75"}`;
  span.innerHTML = "";

  const thumb = document.createElement("span");
  thumb.className = CHAT_PILL_ICON_CLASS;
  if (ready) {
    const image = document.createElement("img");
    image.src = frame.dataUrl;
    image.alt = "";
    image.className = "h-full w-full object-cover";
    thumb.appendChild(image);
  } else {
    const spinner = document.createElement("span");
    spinner.className =
      "text-ink-3 h-2.5 w-2.5 animate-spin rounded-full border border-current border-r-transparent";
    spinner.setAttribute("aria-hidden", "true");
    thumb.appendChild(spinner);
  }
  span.appendChild(thumb);

  const label = document.createElement("span");
  label.className = `${CHAT_PILL_LABEL_CLASS} font-mono tabular-nums`;
  label.textContent = ready
    ? t("chatGen.timelineFrameTag", {
        time: formatTimelineFrameTime(frame.atSec, frame.fps),
      })
    : t("chatGen.timelineFrameCapturing");
  span.appendChild(label);

  appendChatPillRemoveIcon(span, t("chatGen.removeTimelineFrame"), onRemove);
}

let timelineFrameHoverEl: HTMLDivElement | null = null;
let timelineFrameHoverId: string | null = null;

function ensureTimelineFrameHoverPreview(): HTMLDivElement {
  if (timelineFrameHoverEl) return timelineFrameHoverEl;
  const preview = document.createElement("div");
  preview.className =
    "border-line bg-black fixed z-[1000] hidden overflow-hidden rounded-md border shadow-2xl";
  preview.style.pointerEvents = "none";
  document.body.appendChild(preview);
  timelineFrameHoverEl = preview;
  return preview;
}

function showTimelineFrameHoverPreview(
  frame: AttachedTimelineFrame,
  anchor: DOMRect,
) {
  const preview = ensureTimelineFrameHoverPreview();
  preview.innerHTML = "";
  const aspect =
    frame.width > 0 && frame.height > 0 ? frame.width / frame.height : 16 / 9;
  const width = Math.round(Math.max(112, Math.min(240, aspect * 156)));
  const height = Math.round(Math.min(240, width / aspect));
  const image = document.createElement("img");
  image.src = frame.dataUrl;
  image.alt = "";
  image.className = "block h-full w-full object-contain";
  preview.appendChild(image);
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  preview.style.top = `${anchor.top >= height + 12 ? anchor.top - height - 8 : anchor.bottom + 8}px`;
  preview.style.display = "block";
  timelineFrameHoverId = frame.id;
}

function hideTimelineFrameHoverPreview(id?: string) {
  if (id && timelineFrameHoverId !== id) return;
  if (timelineFrameHoverEl) timelineFrameHoverEl.style.display = "none";
  timelineFrameHoverId = null;
}

function hideTimelineFrameHoverPreviewIfDetached(editor: HTMLElement | null) {
  if (!timelineFrameHoverId || !editor) return;
  if (!findTimelineFramePill(editor, timelineFrameHoverId)) {
    hideTimelineFrameHoverPreview();
  }
}

function findTimelineFramePill(
  root: HTMLElement,
  id: string,
): HTMLElement | null {
  return (
    Array.from(
      root.querySelectorAll<HTMLElement>("[data-timeline-frame-id]"),
    ).find((pill) => pill.dataset.timelineFrameId === id) ?? null
  );
}

function findElementPill(
  root: HTMLElement,
  id: string,
  includeAuto = true,
): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-ref-id]")).find(
      (pill) =>
        pill.dataset.refId === id && (includeAuto || !pill.dataset.auto),
    ) ?? null
  );
}

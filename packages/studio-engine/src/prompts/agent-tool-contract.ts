/**
 * Shared shapes of an agent tool call as every surface renders and answers it: the feed
 * presentation of a call, the result envelope a tool returns, and the frame image a tool can
 * attach. Which tools exist and what they accept lives in `agent-surface-v3/`.
 */

export type StudioToolKind = 'badge' | 'card';

export interface StudioToolDef {
  id: string;
  /** badge = instant state change (small badge); card = needs generation, slower (card shows note). */
  kind: StudioToolKind;
  /** Small icon in the feed (emoji). */
  icon: string;
  /** UI label key (used for progress / card title). */
  label: string;
  /** Default busy text while running (shown on the card before any streamed note/stage progress). */
  busyText?: string;
}

/** Errors meaning "not the open document's to answer": the in-chat runner edits one project and owns
 *  no account-level capability, so it declines these. mcp.ts reads the same codes off a bridge answer
 *  to fall an external agent's call through to the server, which does own them. Both sides name them
 *  from here, so a rename cannot break that handoff while types and tests stay green. */
export const TAB_CANNOT_SERVE_ERRORS = {
  projectNav: 'project_nav_not_available_in_chat',
  handoff: 'handoff_not_available_in_chat',
} as const;

/** Tool result (client runTool returns → addToolOutput → shared by model + card render). */
export interface StudioToolResult {
  ok: boolean;
  /** One-line summary (shown on card/badge on success, also fed to the model for continuation). */
  summary?: string;
  /** Failure reason. */
  error?: string;
  /** Structured data for query tools (for the model; not rendered on the card). */
  data?: unknown;
  /** Captured frame — the MCP side turns it into image content, the chat route hands it to the model as an image. */
  image?: ToolFrameImage;
  /** Multiple frames (inspect_timeline samples) — each becomes one image for the agent, in order. */
  images?: ToolFrameImage[];
}

/**
 * One frame a tool captured. Preferred form is a cloud key (the browser stored the JPEG in the
 * user's content-addressed media space; the host reads the bytes when it builds a prompt), so a
 * thread carries a few dozen bytes per frame instead of the picture. `data` (base64, no prefix)
 * is the fallback when no cloud store is reachable.
 */
export interface ToolFrameImage {
  mimeType: string;
  key?: string;
  data?: string;
  width?: number;
  height?: number;
}

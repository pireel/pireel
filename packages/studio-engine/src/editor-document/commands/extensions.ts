import type { EditorDocumentV2 } from "../types";
import {
  commandFailure,
  type EditorCommand,
  type EditorCommandResult,
} from "./types";
type Handler = (
  document: EditorDocumentV2,
  command: EditorCommand,
) => EditorCommandResult;
const handlers = new Map<string, Handler>();
/** Hosts may implement optional metadata operations without adding product policy to the editor. */
export function registerEditorCommandExtension(type: string, handler: Handler) {
  handlers.set(type, handler);
}
export function applyEditorCommandExtension(
  document: EditorDocumentV2,
  command: EditorCommand,
): EditorCommandResult {
  return (
    handlers.get(command.type)?.(document, command) ??
    commandFailure(
      document,
      "invalid-command",
      "This command requires a host extension.",
    )
  );
}

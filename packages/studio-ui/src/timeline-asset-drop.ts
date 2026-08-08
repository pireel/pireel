/** Shared contract between the timeline drop planner and the media insertion hook. */
export type TimelineInsertMode = 'overwrite' | 'ripple';

export type TimelineVisualDropTarget =
  | { kind: 'visual'; trackId: string }
  | { kind: 'visual-new'; stackOrder: number; slot: number };

export type TimelineMediaDropTarget =
  | { kind: 'primary'; insertIndex?: number }
  | TimelineVisualDropTarget;

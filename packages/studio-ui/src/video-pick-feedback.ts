export interface VideoPickOptions {
  asSig?: string;
  reconnect?: boolean;
  successFeedback?: 'default' | 'silent';
}

export function outputSwitchVideoPickOptions(asSig: string): VideoPickOptions {
  return { asSig, reconnect: true, successFeedback: 'silent' };
}

export function videoPickSuccessNotices(
  sameVideoRestore: boolean,
  options?: VideoPickOptions,
): { reconnected: boolean; loaded: boolean } {
  const visible = options?.successFeedback !== 'silent';
  return {
    reconnected: sameVideoRestore && visible,
    loaded: visible,
  };
}

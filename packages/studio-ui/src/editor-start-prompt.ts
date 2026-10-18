/** Keep the launch request until its first user message has been checkpointed. */
const START_PROMPT_KEY = (projectId: string) => `studio:start-prompt:${projectId}`;

export function takeAgentStartPrompt(projectId: string): string | null {
  try {
    const prompt = localStorage.getItem(START_PROMPT_KEY(projectId)) ?? sessionStorage.getItem(START_PROMPT_KEY(projectId));
    return prompt;
  } catch { return null; }
}

export function acknowledgeAgentStartPrompt(projectId: string): void {
  try { localStorage.removeItem(START_PROMPT_KEY(projectId)); sessionStorage.removeItem(START_PROMPT_KEY(projectId)); } catch { /* The saved task also deduplicates startup. */ }
}

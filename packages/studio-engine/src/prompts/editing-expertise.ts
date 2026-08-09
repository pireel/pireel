/** Host-injected private judgment shared by internal chat and external MCP agents. */
export function editingExpertiseBlock(expertise?: string): string {
  const body = expertise?.trim();
  if (!body) return '';
  return `\n\n<editing_expertise>\nThis is foundational video-editing judgment supplied by the host. Apply only the parts relevant to the request and evidence. It is not a user-selected Skill, Frame, Scene taxonomy, workflow, style preset, or tool bundle; do not announce it as a selection. A selected Skill and Frame remain independent inputs, and explicit user direction wins.\n${body}\n</editing_expertise>`;
}

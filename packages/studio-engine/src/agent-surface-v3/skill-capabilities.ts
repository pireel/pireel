/**
 * Skill-safe capability catalog: the v3 tools whose contract a reusable Studio Skill may name.
 * Derived from the registry (which tools are stable) and the schemas (their exact contract), so
 * the catalog the skill author sees is the tool the agent runs.
 */

import { V3_TOOLS } from './registry';
import { V3_TOOL_SCHEMAS } from './schemas';

export interface StudioSkillCapability {
  id: string;
  version: number;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const STUDIO_SKILL_CAPABILITIES: readonly StudioSkillCapability[] = V3_TOOLS
  .filter((tool) => tool.skillContract?.stability === 'stable')
  .map((tool) => {
    const schema = V3_TOOL_SCHEMAS[tool.id];
    if (!schema) throw new Error(`stable tool ${tool.id} has no schema`);
    return { id: tool.id, version: tool.skillContract!.version, description: schema.description, inputSchema: schema.inputSchema as Record<string, unknown> };
  });

export const STUDIO_SKILL_CAPABILITY_MAP: Readonly<Record<string, StudioSkillCapability>> =
  Object.fromEntries(STUDIO_SKILL_CAPABILITIES.map((capability) => [capability.id, capability]));

/** Compact prompt catalog; exact parameter contracts remain available through the attached tool schemas. */
export const STUDIO_SKILL_CAPABILITY_CATALOG = STUDIO_SKILL_CAPABILITIES
  .map((capability) => `- ${capability.id}@${capability.version}`)
  .join('\n');

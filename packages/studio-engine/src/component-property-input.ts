/** Bounded JSON input for component properties; kit rows never contain code or nested objects. */
export const COMPONENT_PROPERTY_MAX_ROWS = 32;
export const COMPONENT_PROPERTY_MAX_FIELDS = 16;
export const COMPONENT_PROPERTY_MAX_TEXT = 4000;
export const isComponentPropertyScalar = (value: unknown): boolean =>
  typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.length <= COMPONENT_PROPERTY_MAX_TEXT);
export function isComponentPropertyRows(value: unknown): boolean {
  return Array.isArray(value) && value.length <= COMPONENT_PROPERTY_MAX_ROWS && value.every((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const entries = Object.entries(row);
    return entries.length <= COMPONENT_PROPERTY_MAX_FIELDS && entries.every(([key, cell]) => key.length > 0 && key.length <= 64 && !['__proto__', 'constructor', 'prototype'].includes(key) && isComponentPropertyScalar(cell));
  });
}
export const isComponentPropertyValue = (value: unknown): boolean => isComponentPropertyScalar(value) || isComponentPropertyRows(value);

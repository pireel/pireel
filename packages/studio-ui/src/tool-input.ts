/**
 * A tool call's input as an object. Some models send the arguments JSON-encoded a second time (a
 * string holding the object); reading fields off that string finds none, and the call is refused
 * for "missing" fields it actually carried. Anything else that is not an object becomes {}.
 */
export function toolInputObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

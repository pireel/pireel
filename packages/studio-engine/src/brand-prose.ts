/** Read old three-part descriptions as prose without changing their observations or references. */
export function techniqueProse(value: { text?: unknown; use?: unknown; degree?: unknown; looks?: unknown }): string {
  if (typeof value.text === 'string' && value.text.trim()) return naturalTechniqueText(value.text);
  const parts = [value.use, value.degree, value.looks].map(part => typeof part === 'string' ? part.trim() : '');
  return joinStatements(parts);
}

function joinStatements(parts: string[]): string {
  // A bare affirmative adds no description; retain negative and qualified observations.
  const statements = parts.filter((part, index) => part && !(index === 0 && parts.slice(1).some(Boolean) && /^(?:用|使用|是|有|yes|used|use)[。.!！]?$/i.test(part)));
  return statements.map(part => /[。！？.!?…]$/.test(part) ? part : `${part}${/[\u3400-\u9fff]/.test(part) ? '。' : '.'}`).join(' ');
}

export function naturalTechniqueText(text: string): string {
  // Match only the complete former generated format, not labels inside ordinary authored prose.
  const match = /^\s*(?:用不用|Use)\s*[:：]\s*([\s\S]*?)\n\s*(?:程度|Degree)\s*[:：]\s*([\s\S]*?)\n\s*(?:样子|Looks)\s*[:：]\s*([\s\S]*?)\s*$/i.exec(text);
  return match ? joinStatements(match.slice(1).map(part => part.trim())) : text;
}

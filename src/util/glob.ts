export interface GlobMatchOptions {
  stripLeadingDotSlash?: boolean;
}

export function normalizeGlobPath(value: string, options: GlobMatchOptions = {}): string {
  const stripLeadingDotSlash = options.stripLeadingDotSlash ?? true;
  const normalized = value.replace(/\\/g, "/");
  return stripLeadingDotSlash ? normalized.replace(/^\.\/+/, "") : normalized;
}

export function globToRegExp(pattern: string, options: GlobMatchOptions = {}): RegExp {
  const normalized = normalizeGlobPath(pattern, options);
  let out = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      out += ".*";
      index += 1;
    } else if (char === "*") {
      out += "[^/]*";
    } else {
      out += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

export function matchesPattern(value: string, pattern: string, options: GlobMatchOptions = {}): boolean {
  const normalizedValue = normalizeGlobPath(value, options);
  const normalizedPattern = normalizeGlobPath(pattern, options);
  if (normalizedPattern.includes("*")) return globToRegExp(normalizedPattern, { stripLeadingDotSlash: false }).test(normalizedValue);
  const withoutSlash = normalizedPattern.replace(/\/+$/, "");
  return normalizedValue === withoutSlash || normalizedValue.startsWith(`${withoutSlash}/`);
}

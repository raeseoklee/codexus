export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags: ParsedArgs["flags"] = {};
  const booleanFlags = new Set([
    "json",
    "help",
    "omx",
    "force",
    "with-docs",
    "with-model-replay",
    "allow-live-model-replay",
    "dry-run",
    "stale-only",
    "live",
    "record",
    "approve",
    "probe-process",
    "supervise-fake",
  ]);

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleanFlags.has(key)) {
      flags[key] = true;
      continue;
    }
    const next = rest[index + 1];
    const value = next && !next.startsWith("--") ? next : true;
    if (value !== true) index += 1;

    if (key === "verify") {
      const existing = flags[key];
      flags[key] = Array.isArray(existing)
        ? [...existing, String(value)]
        : existing
          ? [String(existing), String(value)]
          : [String(value)];
    } else {
      flags[key] = value;
    }
  }

  return { command, positionals, flags };
}

export function flagString(flags: ParsedArgs["flags"], key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: ParsedArgs["flags"], key: string): boolean {
  return flags[key] === true;
}

export function flagArray(flags: ParsedArgs["flags"], key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export function assertAllowedFlags(args: ParsedArgs, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(args.flags)) {
    if (!allowedSet.has(key)) {
      throw new Error(`unexpected_argument:--${key}`);
    }
  }
}

export function assertMaxPositionals(args: ParsedArgs, max: number): void {
  if (args.positionals.length > max) {
    throw new Error(`unexpected_argument:${args.positionals[max]}`);
  }
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED:possible-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{16,}/g, "[REDACTED:possible-github-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{16,}/g, "[REDACTED:possible-slack-token]");
}

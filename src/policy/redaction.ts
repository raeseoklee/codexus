export function redactSensitiveText(text: string): string {
  const secretKey = [
    "aws_secret_access_key",
    "aws_session_token",
    "password",
    "passwd",
    "pwd",
    "secret",
    "token",
    "api[_-]?key",
    "access[_-]?token",
    "refresh[_-]?token",
    "client[_-]?secret",
    "private[_-]?key",
    "database_url",
    "db_password",
  ].join("|");
  const quotedAssignment = new RegExp(`((?:["']?)(?:${secretKey})(?:["']?)\\s*[:=]\\s*)(["'])([^"'\\r\\n]*)(\\2)`, "gi");
  const bareAssignment = new RegExp(`((?:["']?)(?:${secretKey})(?:["']?)\\s*[:=]\\s*)([^\\s,"'}\\r\\n]+)`, "gi");

  return text
    .replace(/-----BEGIN [A-Z ]*(?:PRIVATE KEY|SECRET KEY)-----[\s\S]*?-----END [A-Z ]*(?:PRIVATE KEY|SECRET KEY)-----/g, "[REDACTED:possible-private-key-block]")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED:possible-aws-access-key]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED:possible-jwt]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED:possible-api-key]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}\b/g, "[REDACTED:possible-github-token]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:possible-github-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{16,}/g, "[REDACTED:possible-slack-token]")
    .replace(/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g, "[REDACTED:possible-stripe-token]")
    .replace(/\bnpm_[A-Za-z0-9]{16,}\b/g, "[REDACTED:possible-npm-token]")
    .replace(quotedAssignment, "$1$2[REDACTED:possible-secret]$2")
    .replace(bareAssignment, "$1[REDACTED:possible-secret]");
}

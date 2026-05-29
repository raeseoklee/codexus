import type { HarnessConfig } from "../config/schema.ts";
import type { HarnessDriver } from "./contract.ts";
import { MockDriver } from "./mock.ts";

export async function createDriver(config: HarnessConfig): Promise<HarnessDriver> {
  if (config.driver === "mock") return new MockDriver();
  const { CodexExecDriver } = await import("./codex-exec.ts");
  if (config.driver === "codex-exec") return new CodexExecDriver();
  const { CodexAppServerDriver } = await import("./codex-app-server.ts");
  return new CodexAppServerDriver();
}

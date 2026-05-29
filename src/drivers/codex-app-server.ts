import type { DriverProbe, DriverRequest, DriverResult, HarnessDriver } from "./contract.ts";
import { readAppServerSchemaFixture } from "../validation/schemas.ts";

export class CodexAppServerDriver implements HarnessDriver {
  readonly name = "codex-app-server";

  async probe(): Promise<DriverProbe> {
    const schemaFixture = await readAppServerSchemaFixture();
    return {
      available: false,
      summary: "codex app-server driver is designed but intentionally disabled for MVP",
      capabilities: {
        supportsJsonl: false,
        supportsSandboxFlag: false,
        supportsApprovalFlag: false,
        supportsModelFlag: false,
        supportsOutputLastMessage: false,
        stderrMayContainWarningsOnSuccess: false,
        finalMessageShapes: [],
      },
      details: {
        enabled: false,
        schemaFixture,
      },
    };
  }

  async run(_request: DriverRequest): Promise<DriverResult> {
    return {
      status: "failed",
      error: "unsupported_feature: codex app-server driver is disabled for MVP",
    };
  }
}

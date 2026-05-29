import type { DriverProbe, DriverRequest, DriverResult, HarnessDriver } from "./contract.ts";

export class MockDriver implements HarnessDriver {
  readonly name = "mock";

  async probe(): Promise<DriverProbe> {
    return {
      available: true,
      summary: "mock driver available",
      capabilities: {
        supportsJsonl: false,
        supportsSandboxFlag: false,
        supportsApprovalFlag: false,
        supportsModelFlag: false,
        supportsOutputLastMessage: false,
        stderrMayContainWarningsOnSuccess: false,
        finalMessageShapes: ["mock.finalMessage"],
      },
    };
  }

  async run(request: DriverRequest, emit: Parameters<HarnessDriver["run"]>[1]): Promise<DriverResult> {
    await emit({
      type: "driver.mock.message",
      source: this.name,
      payload: { prompt: request.prompt },
    });
    if (request.prompt.includes("MOCK_BLOCK")) {
      return {
        status: "blocked",
        finalMessage: "mock blocked",
        exitCode: 2,
        error: "mock blocked by test fixture",
      };
    }
    if (request.prompt.includes("MOCK_CANCEL")) {
      return {
        status: "cancelled",
        finalMessage: "mock cancelled",
        exitCode: 130,
        error: "mock cancelled by test fixture",
      };
    }
    return {
      status: request.prompt.includes("MOCK_FAIL") ? "failed" : "succeeded",
      finalMessage: request.prompt.includes("MOCK_FAIL") ? "mock failure" : "mock complete",
      exitCode: request.prompt.includes("MOCK_FAIL") ? 1 : 0,
    };
  }
}

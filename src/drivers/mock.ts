import { writeFile } from "node:fs/promises";
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

  async run(request: DriverRequest, emit: Parameters<HarnessDriver["run"]>[1], signal?: AbortSignal): Promise<DriverResult> {
    const rawStdoutPath = typeof request.context?.rawStdoutPath === "string" ? request.context.rawStdoutPath : null;
    const rawStderrPath = typeof request.context?.rawStderrPath === "string" ? request.context.rawStderrPath : null;
    await emit({
      type: "driver.mock.message",
      source: this.name,
      payload: { prompt: request.prompt },
    });
    const writeRaw = async (stdout: string, stderr = ""): Promise<void> => {
      await Promise.all([
        rawStdoutPath ? writeFile(rawStdoutPath, stdout) : Promise.resolve(),
        rawStderrPath ? writeFile(rawStderrPath, stderr) : Promise.resolve(),
      ]);
    };
    if (request.prompt.includes("MOCK_BLOCK")) {
      await writeRaw("mock blocked\n", "mock blocked by test fixture\n");
      return {
        status: "blocked",
        finalMessage: "mock blocked",
        exitCode: 2,
        error: "mock blocked by test fixture",
      };
    }
    if (request.prompt.includes("MOCK_CANCEL")) {
      await writeRaw("mock cancelled\n", "mock cancelled by test fixture\n");
      return {
        status: "cancelled",
        finalMessage: "mock cancelled",
        exitCode: 130,
        error: "mock cancelled by test fixture",
      };
    }
    if (request.prompt.includes("MOCK_DRIVER_REPAIR")) {
      const repairAttempt = request.prompt.includes("Driver failure repair attempt");
      await writeRaw(
        repairAttempt ? "mock driver repair complete\n" : "mock repairable driver failure\n",
        repairAttempt ? "" : "mock repairable driver failure\n",
      );
      return {
        status: repairAttempt ? "succeeded" : "failed",
        finalMessage: repairAttempt ? "mock driver repair complete" : "mock repairable driver failure",
        exitCode: repairAttempt ? 0 : 1,
        ...(repairAttempt ? {} : { error: "mock repairable driver failure" }),
      };
    }
    if (request.prompt.includes("MOCK_SLEEP")) {
      const aborted = await new Promise<boolean>((resolve) => {
        if (signal?.aborted) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => resolve(false), 10_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve(true);
        }, { once: true });
      });
      await writeRaw(aborted ? "mock aborted\n" : "mock slept\n");
      if (aborted) {
        return {
          status: "cancelled",
          finalMessage: "mock aborted",
          exitCode: 130,
          error: "mock aborted by signal",
        };
      }
    }
    await writeRaw(request.prompt.includes("MOCK_FAIL") ? "mock failure\n" : "mock complete\n");
    return {
      status: request.prompt.includes("MOCK_FAIL") ? "failed" : "succeeded",
      finalMessage: request.prompt.includes("MOCK_FAIL") ? "mock failure" : "mock complete",
      exitCode: request.prompt.includes("MOCK_FAIL") ? 1 : 0,
    };
  }
}

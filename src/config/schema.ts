export interface HarnessConfig {
  driver: "codex-exec" | "mock" | "codex-app-server";
  codex: {
    command: string;
    model: string | null;
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    approval: "untrusted" | "on-request" | "never";
    runTimeoutMs: number | null;
  };
  verification: {
    commands: string[];
    timeoutMs: number;
  };
  repair: {
    maxIterations: number;
    maxDriverFailureIterations: number;
  };
  evolution: {
    enabled: boolean;
    autoPromote: boolean;
    redactBeforeMemory: boolean;
  };
  automation: {
    cronEnabled: boolean;
    gatewayEnabled: boolean;
  };
}

export const defaultConfig: HarnessConfig = {
  driver: "codex-exec",
  codex: {
    command: "codex",
    model: null,
    sandbox: "workspace-write",
    approval: "on-request",
    runTimeoutMs: 1_800_000,
  },
  verification: {
    commands: [],
    timeoutMs: 120_000,
  },
  repair: {
    maxIterations: 1,
    maxDriverFailureIterations: 0,
  },
  evolution: {
    enabled: true,
    autoPromote: false,
    redactBeforeMemory: true,
  },
  automation: {
    cronEnabled: false,
    gatewayEnabled: false,
  },
};

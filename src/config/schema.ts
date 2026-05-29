export interface HarnessConfig {
  driver: "codex-exec" | "mock" | "codex-app-server";
  codex: {
    command: string;
    model: string | null;
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    approval: "untrusted" | "on-request" | "never";
  };
  verification: {
    commands: string[];
    timeoutMs: number;
  };
  repair: {
    maxIterations: number;
  };
  evolution: {
    enabled: boolean;
    autoPromote: boolean;
    redactBeforeMemory: boolean;
  };
  omx: {
    enabled: "auto" | boolean;
    preferSparkshellForVerification: boolean;
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
  },
  verification: {
    commands: [],
    timeoutMs: 120_000,
  },
  repair: {
    maxIterations: 1,
  },
  evolution: {
    enabled: true,
    autoPromote: false,
    redactBeforeMemory: true,
  },
  omx: {
    enabled: "auto",
    preferSparkshellForVerification: true,
  },
  automation: {
    cronEnabled: false,
    gatewayEnabled: false,
  },
};

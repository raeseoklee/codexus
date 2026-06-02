import type { HarnessConfig } from "../config/schema.ts";

export type GuardedFeature = "cron" | "gateway";

export function featureEnabled(config: HarnessConfig, feature: GuardedFeature): boolean {
  return feature === "cron" ? config.automation.cronEnabled : config.automation.gatewayEnabled;
}

export function featureStatus(config: HarnessConfig, feature: GuardedFeature): {
  schemaVersion: 1;
  stability: "experimental";
  feature: GuardedFeature;
  enabled: boolean;
  status: "enabled" | "disabled";
  reason: string;
} {
  const enabled = featureEnabled(config, feature);
  return {
    schemaVersion: 1,
    stability: "experimental",
    feature,
    enabled,
    status: enabled ? "enabled" : "disabled",
    reason: enabled
      ? "feature gate enabled in config; explicit approval and dispatcher policy still apply"
      : "feature is disabled until enabled in config for experimental automation dispatch",
  };
}

export function assertFeatureEnabled(config: HarnessConfig, feature: GuardedFeature): void {
  if (!featureEnabled(config, feature)) throw new Error(`unsupported_feature:${feature}`);
}

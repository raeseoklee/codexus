import type { HarnessConfig } from "../config/schema.ts";

export type GuardedFeature = "cron" | "gateway";

export function featureEnabled(config: HarnessConfig, feature: GuardedFeature): boolean {
  return feature === "cron" ? config.automation.cronEnabled : config.automation.gatewayEnabled;
}

export function featureStatus(config: HarnessConfig, feature: GuardedFeature): {
  feature: GuardedFeature;
  enabled: boolean;
  status: "enabled" | "disabled";
  reason: string;
} {
  const enabled = featureEnabled(config, feature);
  return {
    feature,
    enabled,
    status: enabled ? "enabled" : "disabled",
    reason: enabled
      ? "feature gate enabled in config; command implementation may still require explicit support"
      : "feature is disabled until ledger events, locks, schema migration, and explicit user policy are complete",
  };
}

export function assertFeatureEnabled(config: HarnessConfig, feature: GuardedFeature): void {
  if (!featureEnabled(config, feature)) throw new Error(`unsupported_feature:${feature}`);
}

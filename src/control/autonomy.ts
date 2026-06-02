export type AutonomyPresetName = "manual" | "guided" | "contracted" | "gated-auto" | "extended-auto";

export interface AutonomyPresetDescriptor {
  name: AutonomyPresetName;
  description: string;
  requiresApprovedContract: true;
  completionAuthority: "verification";
}

export const DEFAULT_AUTONOMY_PRESET: AutonomyPresetName = "contracted";

export const AUTONOMY_PRESETS: readonly AutonomyPresetDescriptor[] = [
  {
    name: "manual",
    description: "Produce plans, evidence, and status only. Do not execute unattended change steps.",
    requiresApprovedContract: true,
    completionAuthority: "verification",
  },
  {
    name: "guided",
    description: "Execute one approved stage, then stop at the next decision boundary.",
    requiresApprovedContract: true,
    completionAuthority: "verification",
  },
  {
    name: "contracted",
    description: "Execute within an approved autopilot contract until a verification or scope boundary is reached.",
    requiresApprovedContract: true,
    completionAuthority: "verification",
  },
  {
    name: "gated-auto",
    description: "Run bounded repair loops while scope, capability, and verification gates remain satisfied.",
    requiresApprovedContract: true,
    completionAuthority: "verification",
  },
  {
    name: "extended-auto",
    description: "Continue through multiple stages only when every policy field is enforceable or observable and checkpoints stay fresh.",
    requiresApprovedContract: true,
    completionAuthority: "verification",
  },
] as const;

export function isAutonomyPresetName(value: unknown): value is AutonomyPresetName {
  return typeof value === "string" && AUTONOMY_PRESETS.some((preset) => preset.name === value);
}

export function listAutonomyPresets(): AutonomyPresetDescriptor[] {
  return [...AUTONOMY_PRESETS];
}


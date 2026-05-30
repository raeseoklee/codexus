export const jsonSchemaSubsetEngine = "local-json-schema-subset" as const;

export interface JsonSchemaSubsetInspection {
  engine: typeof jsonSchemaSubsetEngine;
  valid: boolean;
  errors: string[];
  unsupportedKeywords: string[];
}

export interface JsonSchemaSubsetValidation extends JsonSchemaSubsetInspection {
  valid: boolean;
}

export interface JsonSchemaEngineStatus {
  schemaVersion: 1;
  activeEngine: typeof jsonSchemaSubsetEngine;
  fullJsonSchemaEngine: {
    available: false;
    dependency: null;
    reason: string;
  };
  migrationFixtureBoundary: true;
}

export function schemaEngineStatus(): JsonSchemaEngineStatus {
  return {
    schemaVersion: 1,
    activeEngine: jsonSchemaSubsetEngine,
    fullJsonSchemaEngine: {
      available: false,
      dependency: null,
      reason: "No full JSON Schema dependency is installed; Codexus keeps the local subset engine until dependency policy explicitly allows a replacement.",
    },
    migrationFixtureBoundary: true,
  };
}

const supportedKeywords = new Set([
  "$schema",
  "$id",
  "title",
  "type",
  "required",
  "properties",
  "items",
  "enum",
  "const",
  "minLength",
  "minimum",
  "exclusiveMinimum",
  "pattern",
]);

const supportedTypes = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function typeMatches(expected: string, value: unknown): boolean {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return isRecord(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return Number.isFinite(value);
  return typeof value === expected;
}

function normalizeTypes(type: unknown): string[] | null {
  if (typeof type === "string") return [type];
  if (Array.isArray(type) && type.every((item) => typeof item === "string")) return type;
  return null;
}

function checkSchemaShape(schema: unknown, path: string, errors: string[], unsupportedKeywords: Set<string>): void {
  if (typeof schema === "boolean") return;
  if (!isRecord(schema)) {
    errors.push(`${path}:schema_not_object`);
    return;
  }

  for (const key of Object.keys(schema)) {
    if (!supportedKeywords.has(key)) unsupportedKeywords.add(`${path}:${key}`);
  }

  if (schema.type !== undefined) {
    const types = normalizeTypes(schema.type);
    if (!types || types.some((type) => !supportedTypes.has(type))) errors.push(`${path}.type:invalid`);
  }

  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string"))) {
    errors.push(`${path}.required:invalid`);
  }

  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      errors.push(`${path}.properties:invalid`);
    } else {
      for (const [name, child] of Object.entries(schema.properties)) checkSchemaShape(child, `${path}.properties.${name}`, errors, unsupportedKeywords);
    }
  }

  if (schema.items !== undefined) checkSchemaShape(schema.items, `${path}.items`, errors, unsupportedKeywords);

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) errors.push(`${path}.enum:invalid`);
  if (schema.minLength !== undefined && (!Number.isInteger(schema.minLength) || schema.minLength < 0)) errors.push(`${path}.minLength:invalid`);
  if (schema.minimum !== undefined && !Number.isFinite(schema.minimum)) errors.push(`${path}.minimum:invalid`);
  if (schema.exclusiveMinimum !== undefined && !Number.isFinite(schema.exclusiveMinimum)) errors.push(`${path}.exclusiveMinimum:invalid`);
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string") {
      errors.push(`${path}.pattern:invalid`);
    } else {
      try {
        new RegExp(schema.pattern);
      } catch {
        errors.push(`${path}.pattern:invalid_regex`);
      }
    }
  }
}

export function inspectJsonSchemaSubset(schema: unknown): JsonSchemaSubsetInspection {
  const errors: string[] = [];
  const unsupported = new Set<string>();
  checkSchemaShape(schema, "$", errors, unsupported);
  const unsupportedKeywords = [...unsupported].sort();
  return {
    engine: jsonSchemaSubsetEngine,
    valid: errors.length === 0 && unsupportedKeywords.length === 0,
    errors,
    unsupportedKeywords,
  };
}

function validateValue(schema: unknown, value: unknown, path: string, errors: string[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}:schema_false`);
    return;
  }
  if (!isRecord(schema)) {
    errors.push(`${path}:schema_not_object`);
    return;
  }

  if (schema.const !== undefined && stableJson(value) !== stableJson(schema.const)) errors.push(`${path}:const`);
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => stableJson(item) === stableJson(value))) errors.push(`${path}:enum`);

  if (schema.type !== undefined) {
    const types = normalizeTypes(schema.type);
    if (!types || !types.some((type) => typeMatches(type, value))) {
      errors.push(`${path}:type`);
      return;
    }
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${path}:minLength`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errors.push(`${path}:pattern`);
  }

  if (typeof value === "number") {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path}:minimum`);
    if (Number.isFinite(schema.exclusiveMinimum) && value <= schema.exclusiveMinimum) errors.push(`${path}:exclusiveMinimum`);
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (const [index, item] of value.entries()) validateValue(schema.items, item, `${path}[${index}]`, errors);
  }

  if (isRecord(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in value)) errors.push(`${path}.${key}:required`);
      }
    }
    if (isRecord(schema.properties)) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (key in value) validateValue(childSchema, value[key], `${path}.${key}`, errors);
      }
    }
  }
}

export function validateJsonSchemaSubset(schema: unknown, value: unknown): JsonSchemaSubsetValidation {
  const inspection = inspectJsonSchemaSubset(schema);
  if (!inspection.valid) return inspection;
  const errors: string[] = [];
  validateValue(schema, value, "$", errors);
  return {
    ...inspection,
    valid: errors.length === 0,
    errors,
  };
}

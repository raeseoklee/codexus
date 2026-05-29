import { resolve } from "node:path";
import { readAppServerSchemaFixture, readSchemaArtifactStatus } from "../../validation/schemas.ts";
import { flagBool, flagString, type ParsedArgs } from "../args.ts";

export async function schemaCommand(args: ParsedArgs): Promise<void> {
  const subcommand = args.positionals[0] ?? "check";
  const root = resolve(flagString(args.flags, "schema-root") ?? "schemas");
  const json = flagBool(args.flags, "json");

  if (subcommand === "check" || subcommand === "list") {
    const schemas = await readSchemaArtifactStatus(root);
    const appServerFixture = await readAppServerSchemaFixture();
    const ok = schemas.every((schema) => schema.valid) && appServerFixture.valid;
    const result = { ok, schemas, appServerFixture };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = ok ? 0 : 1;
      return;
    }
    for (const schema of schemas) console.log(`${schema.valid ? "OK" : "FAIL"} ${schema.name}`);
    console.log(`${appServerFixture.valid ? "OK" : "FAIL"} app-server fixture`);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  throw new Error(`unsupported_schema_command:${subcommand}`);
}

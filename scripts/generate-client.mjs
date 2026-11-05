import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// Prisma CLI eagerly downloads native engines even with engineType="client".
// In restricted environments, explicitly point both unused native engine selectors
// to a guard which fails if executed. Schema parsing and client generation use the
// official npm-distributed WASM. No artifact checksum or TLS checks are disabled.
const guard = fileURLToPath(
  new URL("./native-engine-not-used.cjs", import.meta.url),
);
const env = {
  ...process.env,
  PRISMA_SCHEMA_ENGINE_BINARY: guard,
  PRISMA_QUERY_ENGINE_LIBRARY: guard,
};
delete env.PRISMA_GENERATE_NO_ENGINE;
const r = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "generate"],
  { env, stdio: "inherit" },
);
process.exit(r.status ?? 1);

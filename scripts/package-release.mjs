import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

const platform = process.env.RELEASE_PLATFORM ?? process.platform;
const arch = process.env.RELEASE_ARCH ?? process.arch;
const version = (process.env.RELEASE_VERSION ?? packageJson.version).replace(/^v/, "");
const releaseName = `scbdata-v${version}-${platform}-${arch}`;
const stagingDir = path.join(repoRoot, "artifacts", releaseName);

await fs.rm(stagingDir, { recursive: true, force: true });
await fs.mkdir(path.join(stagingDir, "bin"), { recursive: true });

await copyPath(path.join(repoRoot, "dist"), path.join(stagingDir, "dist"));
await copyPath(path.join(repoRoot, "node_modules"), path.join(stagingDir, "node_modules"));
await copyPath(path.join(repoRoot, "package.json"), path.join(stagingDir, "package.json"));
await copyPath(path.join(repoRoot, "README.md"), path.join(stagingDir, "README.md"));
await copyPath(path.join(repoRoot, "LICENSE"), path.join(stagingDir, "LICENSE"));

const launcher = `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$SCRIPT_DIR/dist/index.js" "$@"
`;

await fs.writeFile(path.join(stagingDir, "bin", "scbdata"), launcher, { mode: 0o755 });

console.log(stagingDir);

async function copyPath(source, destination) {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyPath(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

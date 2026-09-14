import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tag = process.env.GITHUB_REF_NAME;
assert.ok(tag, "GITHUB_REF_NAME is required");

const [manifest, packageJson, versions] = await Promise.all(
  ["manifest.json", "package.json", "versions.json"].map(async (path) =>
    JSON.parse(await readFile(path, "utf8")),
  ),
);

assert.equal(tag, manifest.version, "Git tag must equal manifest version");
assert.equal(
  packageJson.version,
  manifest.version,
  "Package and manifest versions must match",
);
assert.equal(
  versions[manifest.version],
  manifest.minAppVersion,
  "versions.json must contain the release minimum app version",
);

console.log(`Release metadata verified for ${tag}`);

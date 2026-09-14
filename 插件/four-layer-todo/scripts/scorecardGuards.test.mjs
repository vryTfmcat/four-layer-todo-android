import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sourceCss = readFileSync("src/ui/globals.css", "utf8");
const releaseCss = readFileSync("styles.css", "utf8");
const pluginSource = readFileSync("src/main.tsx", "utf8");

test("release and source CSS avoid scorecard compatibility warnings", () => {
  for (const css of [sourceCss, releaseCss]) {
    assert.doesNotMatch(css, /!important/);
    assert.doesNotMatch(css, /(^|[{;\s])columns\s*:/m);
    assert.doesNotMatch(css, /(^|[{;\s])column-gap\s*:/m);
    assert.doesNotMatch(css, /(^|[{;\s])break-inside\s*:/m);
    assert.doesNotMatch(css, /-apple-system|BlinkMacSystemFont|ui-sans-serif/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  }
});

test("task cards cap long titles and details", () => {
  for (const css of [sourceCss, releaseCss]) {
    assert.match(css, /\.workbench-card h3[^}]*-webkit-line-clamp:\s*2/s);
    assert.match(css, /\.workbench-card p[^}]*-webkit-line-clamp:\s*3/s);
  }
});

test("mobile layouts keep a vertical touch scroll path", () => {
  for (const css of [sourceCss, releaseCss]) {
    const mobileCss = css.match(/@media \(max-width: 700px\) \{([\s\S]*?)\n\}/)?.[1];
    assert.ok(mobileCss, "mobile breakpoint must exist");
    assert.match(mobileCss, /\.app-shell\s*\{[^}]*height:\s*auto/s);
    assert.match(mobileCss, /\.app-shell\s*\{[^}]*overflow:\s*visible/s);
    assert.match(mobileCss, /\.app-shell\s*\{[^}]*touch-action:\s*pan-y/s);
    assert.match(mobileCss, /\.storage-layout\s*\{[^}]*height:\s*auto/s);
  }

  assert.match(
    releaseCss,
    /\.workspace-leaf-content\[data-type="four-layer-todo-workspace"\] \.view-content\s*\{[^}]*overflow-y:\s*auto/s,
  );
});

test("deprecated and unused compatibility code stays removed", () => {
  assert.doesNotMatch(pluginSource, /\bdisplay\(\): void/);
  assert.doesNotMatch(pluginSource, /detachLeavesOfType/);
  assert.equal(existsSync("src/react-shim.ts"), false);
  assert.equal(existsSync("src/react-dom-shim.ts"), false);
});

test("release metadata versions agree", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));

  assert.equal(manifest.version, packageJson.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

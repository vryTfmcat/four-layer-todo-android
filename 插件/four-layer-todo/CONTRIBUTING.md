# Contributing to Four Layer Todo

Thanks for helping improve Four Layer Todo.

## Report a bug

Open a GitHub issue and include:

- Your Obsidian and plugin versions.
- Your operating system and whether Obsidian Sync is enabled.
- The smallest sequence of steps that reproduces the problem.
- Relevant console errors with private vault paths and note contents removed.

For synchronization bugs, also describe the original file name, the resulting
file name, and whether another copy of the file already existed.

## Develop locally

```bash
npm ci
npm run lint
npm test
npm run build
```

To install the development build into the current vault:

```bash
npm run install:local
```

Reload the plugin in Obsidian, check the developer console for errors, and test
both Markdown synchronization modes before submitting a pull request.

## Pull requests

- Keep each pull request focused on one change.
- Add or update tests for synchronization and file-name handling changes.
- Do not commit vault data, credentials, generated trash, or private note
  contents.
- Confirm that `npm run lint`, `npm test`, and `npm run build` all pass.

By contributing, you agree that your contribution is licensed under this
repository's MIT License.

## Releases

Maintainers release by pushing a version tag that exactly matches
`manifest.json` and `package.json`. The release workflow rebuilds and tests the
plugin, creates provenance attestations for `main.js`, `manifest.json`, and
`styles.css`, then uploads those exact files to the GitHub release.

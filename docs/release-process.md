# Release process

How to cut and publish a StudyKit release. The npm package is **`studykit`** (lowercase — npm forbids capitals); the project / GitHub repo is **StudyKit**.

What ships in the npm tarball (verify with `npm pack --dry-run`): `skills/` **minus** `skills/_engine/test/`, `bin/`, `README.md`, `LICENSE` — nothing else. The trim is a `files` negation glob in `package.json` (`"!skills/_engine/test"`); `.npmignore` cannot subtract from the `files` whitelist, so do not rely on it.

## 1. Versioning (semver)

Version lives in `package.json` (`version`). Use [semantic versioning](https://semver.org/) `MAJOR.MINOR.PATCH`:

| Bump | When | Example |
|------|------|---------|
| **PATCH** (`0.2.0 → 0.2.1`) | Bug fix, doc fix, internal change — no behavior change for users | fix a stats edge case |
| **MINOR** (`0.2.0 → 0.3.0`) | New backward-compatible feature | add a new `sk-*` skill or engine command |
| **MAJOR** (`0.2.0 → 1.0.0`) | Breaking change, OR declaring the API stable/complete | `STATE_VERSION` bump, removed/renamed skill or command, first "stable" release |

Pre-1.0 (`0.x`): the API is allowed to move; minor bumps may include larger changes. Bump to `1.0.0` when you consider the surface stable.

Set it either by hand in `package.json`, or with npm (this also creates the git tag — see step 4):

```bash
npm version patch   # or: minor | major | 0.3.0
```

## 2. Pre-publish audit (must be clean)

```bash
npm test                 # node --test skills/_engine/test/  -> all green
npm pack --dry-run       # inspect the file list
```

Confirm the dry-run shows: **0 files under `skills/_engine/test/`**, no `release-manifest.json`, no `study/` / `plans/` / `docs/` leakage, `LICENSE` present, and every `sk-*/SKILL.md`. `prepublishOnly` re-runs the test suite at publish time, so a red build cannot publish.

## 3. Commit the version bump

Keep git in sync with what you publish (npm reads `package.json` directly, but the history + tag should match):

```bash
git add package.json
git commit -m "chore(release): bump version to X.Y.Z"
```

## 4. Tag the release

```bash
git tag vX.Y.Z           # e.g. v0.2.0   (npm version does this for you)
```

The tag marks the exact commit that was published.

## 5. Merge to the default branch

Releases come from `main`. If you developed on a branch, bring `main` up to date:

```bash
git checkout main
git merge --ff-only <your-branch>     # fast-forward when main is an ancestor
git checkout <your-branch>            # optional: return to the working branch
```

## 6. Push to GitHub

**First time only — create the remote.** The repo name is `StudyKit` (capitals are fine on GitHub):

```bash
# with the GitHub CLI (recommended) — creates the repo and pushes in one step:
gh repo create StudyKit --public --source=. --remote=origin --push

# or manually, if the repo already exists on github.com:
git remote add origin https://github.com/<user>/StudyKit.git
git push -u origin main
```

Choose `--public` or `--private` deliberately — a public repo is hard to fully un-publish.

**Every release after that:**

```bash
git push origin main          # push the merged release commit
git push origin vX.Y.Z        # push the tag (or: git push --tags)
```

## 7. Publish to npm

The npm account has **2FA enforced for publishing**, so `npm publish` alone fails with `E403 ... Two-factor authentication ... required`. Pass a one-time code from your authenticator app:

```bash
npm whoami                          # confirm you're logged in (else: npm login)
npm publish --otp=<6-digit code>    # add --access public only if using a scoped name
```

For CI / automation, replace the interactive OTP with a **granular access token** that has *bypass 2FA* enabled (npmjs.com → Access Tokens), stored in `~/.npmrc` or `NPM_TOKEN`.

## 8. Verify from a clean environment

```bash
cd /tmp && npx studykit@latest init /tmp/sk-verify
ls /tmp/sk-verify/.claude/skills/
# expect: _engine sk-init sk-learn sk-stats sk-summary sk-judge sk-certs
```

Also confirm the registry: `npm view studykit version dist-tags.latest`.

## Quick checklist

```text
[ ] version bumped in package.json (semver)
[ ] npm test green
[ ] npm pack --dry-run audited (no test files, LICENSE present)
[ ] commit: chore(release): bump version to X.Y.Z
[ ] git tag vX.Y.Z
[ ] merge to main (ff-only)
[ ] push main + tag to GitHub
[ ] npm publish --otp=<code>
[ ] verify via npx from /tmp
```

## Troubleshooting

- **`E403 ... Two-factor authentication ... required`** — you're authenticated but didn't supply 2FA. Use `npm publish --otp=<code>`.
- **`404 ... name can no longer contain capital letters`** — the npm package name must be lowercase. Use `studykit`, not `StudyKit`.
- **Name already taken** — fall back to a scoped name in `package.json` (`@<user>/studykit`) plus `"publishConfig": { "access": "public" }`, and publish with `--access public`.
- **Test files shipped in the tarball** — the `files` whitelist must contain the negation glob `"!skills/_engine/test"`; `.npmignore` will not exclude a path already included by `files`.
- **`npm version` fails on a dirty tree** — commit or stash other changes first; `npm version` requires a clean working tree.

# CI change for the Convex migration (needs to be applied manually)

The GitHub App used by this session is not permitted to modify files under
`.github/workflows/`, so the workflow update is provided here as a patch
instead of being committed directly.

## What it does

Adds a **Deploy Convex Functions** step to `android-build.yml` that runs
`npx convex deploy -y` before the APK is built, so the deployment always has
the functions the shipped app calls. The step is skipped when the
`CONVEX_DEPLOY_KEY` secret is absent, so the APK build never fails on a
missing key. It also adds an optional step that rewrites
`www/convex-config.js` from a `CONVEX_URL` repository variable, for pointing a
build at a different deployment.

## Apply it

```bash
git apply ci/android-build.workflow.patch
git commit -am "ci: deploy Convex functions before building the APK"
```

## Then add the secret

Repository → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `CONVEX_DEPLOY_KEY`
- Value: the deploy key for `dev:determined-dotterel-142`

Without the secret the workflow still builds the APK; it just skips the deploy
step, and you would push functions yourself with `npx convex deploy` locally.

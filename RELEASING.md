# Releasing `@vercel/fun`

Releases are created from `main` by semantic-release in `.github/workflows/release.yml`. Pull requests are tested separately by `.github/workflows/test.yml`, which has read-only repository access and no OIDC permission. The release workflow only runs after code reaches `main`; its release job waits for the complete Node.js and operating-system test matrix before publishing.

## npm trusted publisher configuration

An npm organization or package administrator must configure the trusted publisher for [`@vercel/fun`](https://www.npmjs.com/package/@vercel/fun) with these exact values:

| npm setting                 | Value          |
| --------------------------- | -------------- |
| CI/CD provider              | GitHub Actions |
| GitHub organization or user | `vercel`       |
| Repository                  | `fun`          |
| Workflow filename           | `release.yml`  |
| Environment name            | Leave blank    |
| Allowed action              | `npm publish`  |

Enter only `release.yml` for the workflow filename, not `.github/workflows/release.yml`.

The workflow runs on GitHub-hosted runners and grants `id-token: write` only to the release job. It intentionally does not set `NPM_TOKEN` or configure `registry-url`; npm exchanges the GitHub OIDC identity for short-lived publishing credentials. Successful trusted publishes from GitHub Actions automatically include npm provenance attestations.

## Release requirements

- Commits merged to `main` must follow Conventional Commits. For example, `fix:` creates a patch release and `feat:` creates a minor release.
- The release job uses Node.js 22.14.0, semantic-release 25.0.9, and an npm CLI version bundled by `@semantic-release/npm` that supports trusted publishing.
- The release workflow must remain at `.github/workflows/release.yml`. Renaming it requires updating the npm trusted publisher first.
- If a GitHub environment is added to the release job, the same exact environment name must also be added to the npm trusted publisher configuration.

## Verification

After a release, verify all three outputs:

1. The new version appears on [npm](https://www.npmjs.com/package/@vercel/fun).
2. The matching Git tag and GitHub release exist.
3. The npm package version shows a provenance attestation linked to `vercel/fun` and `.github/workflows/release.yml`.

See npm's [trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for npm-side administration details.

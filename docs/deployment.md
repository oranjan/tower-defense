# Deployment

## Live URLs

| Build | URL | Vercel project | Source |
|---|---|---|---|
| Naive baseline | https://td-naive.vercel.app | `td-naive` (prj_GY8RX26LcivDmV6MgWGIStv2xQeH) | tag `v0-naive` |
| Final | _not deployed yet_ | `td-final` (to create) | `main` |

Both are static builds, with no server or external services. The game runs entirely in the browser.

## Accounts

- **Vercel:** the personal `oranjan` account, team scope `ranjanmehta17s-projects` (`team_Uq28qt16AbJa7U4F5oX1uJTv`). Run `vercel whoami` before every deploy. If it isn't `oranjan`, stop and have the user run `vercel login`.
- **Git:** commit as `oranjan <rnjnmhta@gmail.com>` with no AI attribution (see [AGENTS.md](../AGENTS.md#rules)).

## Deploying a build

Vercel CLI 50.17.1 ignores `--scope` in non-interactive mode (`"reason": "missing_scope"`), so deploy with explicit IDs:

```bash
# 1. Build the exact commit/tag in a clean copy
git archive <tag-or-branch> | tar -x -C /tmp/td-build && cd /tmp/td-build
npm ci && npm run build

# 2. Put the static output in a folder named after the project
mkdir -p /tmp/deploy/<project> && cp -R dist/. /tmp/deploy/<project>/ && cd /tmp/deploy/<project>

# 3. First time only: create the project
vercel project add <project> --scope ranjanmehta17s-projects

# 4. Deploy to production
VERCEL_ORG_ID=team_Uq28qt16AbJa7U4F5oX1uJTv VERCEL_PROJECT_ID=<prj_…> vercel deploy --prod --yes
```

Get a project's ID with `vercel api "/v9/projects/<project>?teamId=team_Uq28qt16AbJa7U4F5oX1uJTv"`.

## Check after deploy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<project>.vercel.app/   # 200
npm run bench -- https://<project>.vercel.app/ 2000,50,500 5000,100,1000
```

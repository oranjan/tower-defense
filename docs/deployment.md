# Deployment

## Live URLs

| Build | URL | Vercel project | Source |
|---|---|---|---|
| **Final** (optimised, live toggles) | **https://td-final-eight.vercel.app** | `td-final` (prj_iHK7NBpAXXwwwFeRZ1Waaiobz8V1) | `main`, `npm run build` → `dist/` |
| Naive baseline (same deploy) | https://td-final-eight.vercel.app/naive/ | `td-final` | `naive/` folder |
| Naive baseline (own project) | https://td-naive.vercel.app | `td-naive` (prj_GY8RX26LcivDmV6MgWGIStv2xQeH) | `naive/` folder built standalone |

Source: https://github.com/oranjan/tower-defense (public; `main` + tag `v0-naive`). Vercel projects are not git-connected; deploys are manual static uploads (below).

Note: `td-final.vercel.app` belongs to someone else, which is why Vercel assigned `td-final-eight`. A custom `*.vercel.app` alias set by hand came up behind Vercel deployment protection (302 to login), so it was removed. Use the URLs above.

Handy links for the demo:
- `https://td-final-eight.vercel.app/?stress=5000,100,1000`: the required scenario, all optimisations on
- `https://td-final-eight.vercel.app/?stress=5000,100,1000&naive=1`: same build, all optimisations off
- `https://td-naive.vercel.app/?stress=5000,100,1000`: frozen v0

Both builds are static, with no server or external services.

## Accounts

- **Vercel:** the personal `oranjan` account, team scope `ranjanmehta17s-projects` (`team_Uq28qt16AbJa7U4F5oX1uJTv`). Run `vercel whoami` before every deploy.
- **Git:** commit as `oranjan <rnjnmhta@gmail.com>` with no AI attribution (see [AGENTS.md](../AGENTS.md#rules)).

## Deploying

Vercel CLI 50.17.1 ignores `--scope` in non-interactive mode (`"reason": "missing_scope"`), so deploy prebuilt static files with explicit IDs.

```bash
ORG=team_Uq28qt16AbJa7U4F5oX1uJTv

# Final (includes /naive/)
npm run build
rm -rf /tmp/deploy/td-final && mkdir -p /tmp/deploy/td-final && cp -R dist/. /tmp/deploy/td-final/
cd /tmp/deploy/td-final && VERCEL_ORG_ID=$ORG VERCEL_PROJECT_ID=prj_iHK7NBpAXXwwwFeRZ1Waaiobz8V1 vercel deploy --prod --yes

# Naive on its own project (build the naive/ folder as a standalone site; run from inside it so the root vite.config isn't used)
cd naive && npx vite build --outDir /tmp/deploy/td-naive --emptyOutDir
cd /tmp/deploy/td-naive && VERCEL_ORG_ID=$ORG VERCEL_PROJECT_ID=prj_GY8RX26LcivDmV6MgWGIStv2xQeH vercel deploy --prod --yes
```

**New project:** create it with `vercel project add <name> --scope ranjanmehta17s-projects`, then read its ID with `vercel api "/v9/projects/<name>?teamId=$ORG"`.

## Check after deploy

```bash
curl -s https://td-final-eight.vercel.app/ | grep -o '<title>[^<]*'          # Tower Defense
curl -s https://td-final-eight.vercel.app/naive/ | grep -o '<title>[^<]*'    # Tower Defense (naive v0)
npm run bench -- https://td-final-eight.vercel.app/ 5000,100,1000
```

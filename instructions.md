# Deploying with Vercel + Render

This branch includes the Vercel frontend configuration, a Render provider
Blueprint and a configurable Node listener. Account-specific URLs and the
Gemini key are supplied in the hosting dashboards.

```text
Browser -> Vercel frontend
        -> Vercel /api/* proxy -> Render provider -> Gemini
```

## 1. Verify and publish the deployment branch

Use Node.js 24.13.1 (the version configured on Render), then run:

```sh
npm ci
npm run build
npm run test:provider
npx playwright install chromium
npm test
```

The frontend build includes TypeScript checking and produces `dist/`.
Make changes on a non-main branch, as required by `AGENTS.md`. Commit and push
`deploy/vercel-render` to GitHub before selecting it in either hosting dashboard.
Keep `.env` private.

## 2. Create the Vercel frontend

1. In Vercel, choose **Add New > Project** and import
   `NoelVarghese2006/hci_project` from GitHub.
2. To deploy this branch directly, set the project's production branch to
   `deploy/vercel-render`. If you later merge it into `main`, update that setting
   to match the branch you intend to deploy.
3. The root `vercel.json` supplies these settings:

   | Setting | Value |
   | --- | --- |
   | Framework Preset | Vite |
   | Root Directory | Repository root (`./`) |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

4. Use Node.js 24.x and check the actual version in build logs. The broad
   `engines.node` range allows newer versions, so recheck runtime compatibility
   before changing the selected major.
5. Record the stable frontend origin, such as
   `https://your-project.vercel.app`. Render needs this value in `APP_ORIGIN`.

The frontend can load before Render is connected. AI suggestions require
steps 3 and 4. Every sequence includes low and high conditions, so a working
frontend alone is insufficient for a complete pilot.

The app opens at `/`; `src/app/experiment/page.tsx` is a component, not an
`/experiment` URL. Navigation uses internal state, so no SPA catch-all is needed.
See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) and
[Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 3. Create the Render provider

In Render, choose **New > Blueprint**, connect the GitHub repository, select
`deploy/vercel-render` and use the root `render.yaml`.

The Blueprint defines one Node web service with:

| Setting | Value |
| --- | --- |
| Service name | `hci-planning-provider` |
| Branch | `deploy/vercel-render` |
| Root Directory | Repository root |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm run provider` |
| Health Check Path | `/api/interventions/config` |
| Instance plan | `0.5c-512mb` (paid, stays running) |
| `NODE_VERSION` | `24.13.1` |
| `HOST` | `0.0.0.0` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GENERATION_TIMEOUT_MS` | `15000` |

Review the plan and displayed cost before creating the service. You can change
the service name if necessary; always use the actual assigned URL in step 4.
Render supplies `PORT`; the listener uses it instead of hardcoding a production
port. Local defaults remain `HOST=127.0.0.1` and `PORT=8787`.

When the Blueprint prompts for these unsynchronized values, enter:

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your private Gemini API key. |
| `APP_ORIGIN` | Exact frontend origin, such as `https://your-project.vercel.app`, without a path or trailing slash. |

Verify model access with your key before the pilot. Leave `GEMINI_BASE_URL`
unset for the normal Google endpoint. Legacy `LLM_*` aliases remain documented
in [provider setup](docs/provider.md). Never prefix the key with `VITE_` or put
it in frontend code, Vercel settings or Git.

For an existing Render service, apply the same settings manually; Blueprint
`sync: false` values prompt only during initial creation. Save and redeploy
when changing environment variables. If you switch deployment branches later,
update `render.yaml` and the service's branch consistently.

Record the assigned HTTPS service origin, for example
`https://your-provider.onrender.com`. Its `/` path returns 404 by design; open
`/api/interventions/config` instead. This route verifies server responsiveness,
not API-key validity, and does not call Gemini.

The backend uses Node built-ins and needs no frontend build or persistent disk.
See [Render web services](https://render.com/docs/web-services),
[Blueprint settings](https://render.com/docs/blueprint-spec),
[Node versions](https://render.com/docs/node-version) and
[health checks](https://render.com/docs/health-checks).

Free web services sleep after 15 minutes without inbound traffic and can take
about one minute to restart. That exceeds the browser's 5-second configuration
timeout and the default 15-second generation timeout. Use an instance that
stays running for timed pilot sessions. See
[Render free-service limits](https://render.com/docs/free#spinning-down-on-idle).

## 4. Connect Vercel to Render

In Vercel project settings, add this environment variable for Production:

| Variable | Value |
| --- | --- |
| `PROVIDER_URL` | Actual Render HTTPS origin, such as `https://your-provider.onrender.com`, without a path or trailing slash. |

Redeploy Vercel after setting it. No code or placeholder hostname needs editing.
The root `vercel.json` uses a route destination of
`${PROVIDER_URL}/api/$1`, with `PROVIDER_URL` explicitly allowed in the route's
`env` list. Vercel expands it at request time. If unset, routing cannot reach
the provider. See [environment variables in Vercel routes](https://vercel.com/docs/project-configuration/vercel-json#using-environment-variables-in-routes).

The browser continues to call `/api/interventions/config` and
`/api/interventions` on Vercel, which proxies them to Render. No Vercel Function
or frontend API-base setting is required. Local Vite dev/preview still proxy
to the local provider.

The provider compares the browser's `Origin` with `APP_ORIGIN`. Verify an actual
browser POST through Vercel; a config GET alone does not exercise that check.
Keep browser API calls relative so separate CORS handling is unnecessary.

For previews, use a separate Render service with `APP_ORIGIN` matching a stable
Vercel preview branch alias. Set Vercel's Preview `PROVIDER_URL` to that service
and redeploy. Open the alias for testing; other preview URLs will not match.
The production and preview provider settings stay independent without editing
`vercel.json` per branch. When adding a custom frontend domain, update Render's
`APP_ORIGIN`, redeploy it and use that frontend domain consistently.

## 5. Verify before the pilot

Use disposable participant IDs on the final frontend URL.

- Fetch `/api/interventions/config` through Vercel. Expect intended public
  configuration as JSON, with no key and no HTML fallback.
- Complete setup, consent, instructions, task editing/submission and surveys.
- Use the first trial of sequences 1, 13 and 25 to check baseline behavior in
  each task. Baseline should make no generation requests. Later trials in
  these sequences still use AI conditions.
- Use sequences 5, 17 and 29 for a high-eagerness first trial in each task.
  Keep the task visible and allow an unresolved issue to qualify. Confirm a
  successful POST, a suggestion popup and working acknowledgement/dismissal.
- Reload a disposable trial and verify recovery and elapsed time. Export
  session JSON through supervisor tools and inspect generation/display records.
- Repeat on production after changing deployment branches or domains.

Concurrency and rate limits are process-local; multiple Render instances do
not share counters. The supervisor code protects local controls, not the public
API. Keep access appropriate for the supervised pilot; origin validation is not
authentication.

Study records remain in browser local storage. Neither hosting service adds
central collection. Export before clearing browser data or changing origins,
and keep the participant URL stable throughout the pilot.

## Troubleshooting and rollback

| Symptom | Check |
| --- | --- |
| Vercel build fails | Repository root, Node version, lockfile and TypeScript errors in build logs. |
| Render cannot detect an open port | `HOST=0.0.0.0`, Render's `PORT` and deployment of the updated listener. |
| Render health check fails | `/api/interventions/config`, not `/`; inspect startup logs. |
| Vercel `/api` returns 404, HTML or proxy errors | `PROVIDER_URL` in the correct Vercel environment, redeployment and Render readiness. |
| POST returns 403 | Exact browser origin versus Render's `APP_ORIGIN`, including preview/custom domains. |
| `provider-unconfigured` / 503 | Gemini key on Render; redeploy after updating it. |
| Provider error / 502 | Sanitized diagnostics, model access, quota and response compatibility. |
| Cold-start failure or timeout | Render instance sleep/readiness and Gemini latency. |
| No popup with a working API | Condition, issue eligibility, unanswered suggestions and cooldowns; use supervisor issue scores. |

Use Vercel logs for frontend builds and proxy failures, and Render logs for
provider startup/runtime failures. Avoid logging keys or raw participant records.

Restore the last verified deployment on the affected service and repeat the
smoke checks after a bad release. Vercel rollback does not roll back Render;
keep their API contracts compatible. Neither rollback undoes browser storage
changes, so preserve exports before changing study versions.

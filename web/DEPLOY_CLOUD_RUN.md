# Deploy DockCast to Google Cloud Run

Everything runs in **Cloud Shell**, a terminal inside the Google Cloud website. Nothing to install.
First time: about 20 minutes (most of it is billing setup and the first build). Later updates: one command, about 4 minutes.

The app gets its own address like `https://dockcast-xxxxx.us-east4.run.app`. It has no connection to birdsandroses.ai or Vercel.

---

## Before you start (have these ready)

From Databricks:
1. **Host**: your workspace URL up to `.com`, e.g. `https://dbc-a1b2c3d4-e5f6.cloud.databricks.com`
2. **Warehouse ID**: SQL Warehouses → your warehouse → **Connection details** → HTTP path `/sql/1.0/warehouses/<THIS PART>`
3. **Token**: avatar (top right) → **Settings → Developer → Access tokens → Generate new token**, lifetime 30 days. Copy it now; it is shown once.

Check that both Databricks jobs (`citibike_collect`, `citibank_live`) are running, so there is fresh data.

---

## Step 1 · Google Cloud project and billing (5 min, one time)

1. Go to **console.cloud.google.com** and sign in.
2. Top bar → project picker → **New project** → name `dockcast` → **Create**. Make sure it is selected.
3. Left menu → **Billing** → link a billing account. Cloud Run needs one even when usage stays inside the free allowance.
4. Billing → **Budgets & alerts** → **Create budget** → amount **$5** → alerts at 50 %, 90 %, 100 %. You get an email long before any real charge.

## Step 2 · Open Cloud Shell

Click the **>_** icon at the top right of the console. A terminal opens at the bottom. Click **Authorize** if asked.

## Step 3 · Get the code (copy-paste)

```bash
gcloud config set project dockcast
git clone https://github.com/Aicoaching2025/citibike-forecast.git
cd citibike-forecast/web
```

If your project ID isn't exactly `dockcast` (Google sometimes adds numbers), use the ID shown in the project picker.

## Step 4 · Deploy (copy-paste, then answer three prompts)

```bash
bash deploy/cloudrun.sh
```

It asks for the **host**, the **warehouse ID** and the **token** (typing is hidden; paste and press Enter). Then it:
1. turns on the Google services it needs,
2. creates a dedicated account the app runs as,
3. stores the token in **Secret Manager** (encrypted; never in code, logs or GitHub),
4. builds the container (runs the 15 unit tests first) and deploys it.

If it asks *"Deploying from source requires an Artifact Registry Docker repository… Do you want to continue?"* type **Y**.

The last line prints your link: `DockCast is live: https://dockcast-....run.app`

## Step 5 · Check it

1. Open `<your link>/status`. Green freshness tiles = live data is flowing.
2. Open `<your link>/` and `<your link>/performance`.
3. The first visit after the app has been idle takes a few seconds to start; the first query after the Databricks warehouse has been idle takes 10–20 s. Open the link a minute before presenting.

---

## Backup: demo mode (no Databricks needed)

```bash
DEMO_MODE=1 SERVICE=dockcast-demo bash deploy/cloudrun.sh
```

A second, separate link that always works. Keep it open as a fallback during the presentation.

## Updating the app later

```bash
cd ~/citibike-forecast && git pull && cd web && bash deploy/cloudrun.sh
```

It will not ask for the token again. New token (e.g. after 30 days): `ROTATE_TOKEN=1 bash deploy/cloudrun.sh`.

## Undo a bad release

Console → **Cloud Run → dockcast → Revisions** → pick the previous revision → **Manage traffic** → 100 %.

---

## If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `No Google Cloud project selected` | Step 3 skipped | `gcloud config set project <ID>` |
| `Billing account ... not found` / `requires billing` | Step 1.3 not done | Link billing, re-run the script |
| Build fails with `PERMISSION_DENIED` on storage or artifact registry | New-project permissions still propagating | Wait 2 minutes, re-run the script |
| Build fails in `npm test` or `npm run build` | Code problem | Send me the last 30 lines of the log |
| `/status` says *Databricks is not configured* | Ran in demo mode, or env missing | Re-run without `DEMO_MODE=1` |
| Page says data could not be loaded (502) | Wrong token/host/warehouse, or warehouse stopped | Check the three values; `ROTATE_TOKEN=1 bash deploy/cloudrun.sh` for a new token |
| 504 / very slow first load | Warehouse waking up | Refresh after 20 s |
| `Host must look like https://...` | Host pasted with `/` path or `?o=` | Paste only up to `.com` |

Logs: Console → **Cloud Run → dockcast → Logs**.

## What it costs

Settings used: scales to zero when nobody visits, max 3 instances, 1 CPU / 512 MB. A class demo and normal portfolio traffic stay inside Cloud Run's free monthly allowance; the $5 budget alert catches anything unexpected. Secret Manager and Artifact Registry storage are cents per month.

## Shut it down after grading

```bash
gcloud run services delete dockcast --region us-east4
gcloud secrets delete databricks-token
```
Then delete the Databricks token in Databricks (Settings → Developer → Access tokens).

## Why this setup is production-grade

- Multi-stage container, minimal runtime image, runs as a non-root user.
- Unit tests gate every build.
- Token in Secret Manager, read only by a dedicated least-privilege service account.
- Autoscaling to zero, capped instances, request timeout matching the Databricks query deadline.
- Immutable revisions with one-click rollback.

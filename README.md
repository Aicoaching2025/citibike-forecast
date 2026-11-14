# Citi Bike 15-minute forecast app

Three screens on the project's live tables:

1. **Find a bike or dock**: pick *a bike* or *an open dock*, a starting station and a walking distance; nearby stations are ranked by the model's chance the need is met in 15 minutes.
2. **Test the model**: model vs. "nothing changes" (persistence) on live outcomes; replay any past forecast on a map (caught / missed / false alarm / correct quiet); follow one station's predicted chance against what it actually reported.
3. **Is it working?**: freshness, collector runs, live Brier by hour (model vs persistence), calibration, and the automated checks.

Reads only: `predictions`, `live_outcomes`, `live_station_status`, `live_station_info`, `collector_runs`, `monitoring_log` in `workspace.citibike`. Writes nothing.

## Deploy as a Databricks App (Free Edition)

1. **Upload the files.** Workspace → your folder → Create → Folder `citibike_app` → Import `app.py`, `data.py`, `metrics.py`, `app.yaml`, `requirements.txt` (all in the same folder; `.streamlit/` is optional, `app.yaml` already sets what it sets).
2. **Create the app.** Left sidebar → **Compute** → **Apps** → **Create app** → **Create a custom app** → name `citibike-forecast` → **Next: Configure**.
3. **Add the SQL warehouse as a resource:** *App resources* → **+ Add resource** → **SQL warehouse** → pick your Serverless Starter Warehouse → permission **Can use** → resource key **`sql-warehouse`** (must match `app.yaml`) → **Create app**.
4. **Grant the app read access to the tables.** Open the app's **Authorization** tab (or its overview) and copy its **service principal application ID**. Then in a SQL editor or notebook run (replace the ID):
   ```sql
   GRANT USE CATALOG ON CATALOG workspace TO `00000000-0000-0000-0000-000000000000`;
   GRANT USE SCHEMA  ON SCHEMA  workspace.citibike TO `00000000-0000-0000-0000-000000000000`;
   GRANT SELECT      ON SCHEMA  workspace.citibike TO `00000000-0000-0000-0000-000000000000`;
   ```
5. **Deploy.** On the app page → **Deploy** → choose the `citibike_app` workspace folder → **Deploy**. First deploy installs `requirements.txt` (a few minutes). Open the app URL.
6. **Before a demo:** Free Edition stops apps 24 hours after they start. Open the app page and click **Start** (or **Deploy** again) on the morning of the demo.

### If it fails
| Symptom | Fix |
|---|---|
| "DATABRICKS_WAREHOUSE_ID is not set" | Resource key isn't `sql-warehouse`; edit the app's resources. |
| `PERMISSION_DENIED` / table not found | Re-run the three GRANTs with the app's service principal ID. |
| "App creation failed unexpectedly" | Known Free Edition provisioning issue; retry later or use the fallback below. |
| Map shows dots but no streets | The viewer's network blocks `basemaps.cartocdn.com`; the data is still correct. |

## Run locally / offline fallback

```bash
pip install -r requirements.txt
CITIBIKE_DEMO=1 streamlit run app.py          # synthetic data, clearly labelled as demo
```

To run locally against Databricks instead, set `DATABRICKS_HOST`, `DATABRICKS_TOKEN` (a personal access token) and `DATABRICKS_WAREHOUSE_ID`, then `streamlit run app.py`.

## Notes
- Covers the 100 study stations only; the map shows only those.
- Forecasts are for 15 minutes after the prediction time, not for the rider's arrival; stations more than a 15-minute walk away are marked as such.
- Every number on screen comes from `metrics.py`, which is unit-tested.

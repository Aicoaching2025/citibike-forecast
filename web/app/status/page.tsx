import { getHealth, getOutcomes } from "@/lib/data";
import { hourlyBrier } from "@/lib/metrics";
import { StatusClient } from "@/components/StatusClient";
import { DemoBanner, ErrorState } from "@/components/ui";

export const dynamic = "force-dynamic"; // render per request; data itself is cached 60–120 s in lib/data.ts
export const metadata = { title: "System status" };

export default async function Page() {
  try {
    const [health, outcomes] = await Promise.all([getHealth(), getOutcomes()]);
    return (
      <>
        {health.source === "demo" && <DemoBanner />}
        <StatusClient
          kpis={health.data.kpis}
          log={health.data.log}
          hourly={{ empty: hourlyBrier(outcomes.data, "empty"), full: hourlyBrier(outcomes.data, "full") }}
        />
      </>
    );
  } catch (e) {
    return <ErrorState message={e instanceof Error && e.name === "ConfigError" ? e.message : "System status could not be loaded. Please try again shortly."} />;
  }
}

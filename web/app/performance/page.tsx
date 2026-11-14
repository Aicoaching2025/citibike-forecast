import { getOutcomes } from "@/lib/data";
import { summarize } from "@/lib/performance";
import { PerformanceClient } from "@/components/PerformanceClient";
import { DemoBanner, ErrorState } from "@/components/ui";

export const dynamic = "force-dynamic"; // render per request; data itself is cached 60–120 s in lib/data.ts
export const metadata = { title: "Model performance" };

export default async function Page() {
  try {
    const { source, data } = await getOutcomes();
    if (data.length === 0) return <ErrorState message="No forecasts with known outcomes yet. Outcomes appear 15 minutes after each forecast." />;
    return (
      <>
        {source === "demo" && <DemoBanner />}
        <PerformanceClient initial={{ empty: summarize(data, "empty"), full: summarize(data, "full") }} />
      </>
    );
  } catch (e) {
    return <ErrorState message={e instanceof Error && e.name === "ConfigError" ? e.message : "Performance data could not be loaded. Please try again shortly."} />;
  }
}

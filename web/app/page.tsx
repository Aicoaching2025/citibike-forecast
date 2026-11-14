import { getLatest } from "@/lib/data";
import { FindClient } from "@/components/FindClient";
import { DemoBanner, ErrorState } from "@/components/ui";

export const dynamic = "force-dynamic"; // render per request; data itself is cached 60–120 s in lib/data.ts

export default async function Page() {
  try {
    const { source, data } = await getLatest();
    return (
      <>
        {source === "demo" && <DemoBanner />}
        <FindClient predictions={data} />
      </>
    );
  } catch (e) {
    return <ErrorState message={e instanceof Error && e.name === "ConfigError" ? e.message : "Forecasts could not be loaded. Please try again shortly."} />;
  }
}

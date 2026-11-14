import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "DockCast · 15-minute bike and dock forecasts", template: "%s · DockCast" },
  description: "Know before you go: live 15-minute forecasts of empty and full bike-share stations in New York City.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2a78d6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-[12px] text-muted sm:px-6">
          Station data: Citi Bike GBFS feed (Lyft). Forecasts by DockCast. Not affiliated with Citi Bike or Lyft. Map © OpenStreetMap contributors, OpenFreeMap.
        </footer>
      </body>
    </html>
  );
}

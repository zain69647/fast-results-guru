import { createFileRoute } from "@tanstack/react-router";
import { fetchAndClean } from "@/lib/proxy.server";

export const Route = createFileRoute("/api/proxy/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url).searchParams.get("url");
        if (!u) return new Response("Missing url", { status: 400 });
        try {
          return await fetchAndClean(u);
        } catch (e) {
          return new Response("Fetch failed: " + (e as Error).message, { status: 502 });
        }
      },
    },
  },
});

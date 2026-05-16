import { createFileRoute } from "@tanstack/react-router";
import { fetchAndClean } from "@/lib/proxy.server";

export const Route = createFileRoute("/api/proxy/submit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) return new Response("Missing url", { status: 400 });
        // append form params to target
        const t = new URL(target);
        for (const [k, v] of url.searchParams) {
          if (k !== "url") t.searchParams.append(k, v);
        }
        return fetchAndClean(t.toString());
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get("url");
        if (!target) return new Response("Missing url", { status: 400 });
        const form = await request.formData();
        const body = new URLSearchParams();
        for (const [k, v] of form) body.append(k, String(v));
        return fetchAndClean(target, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      },
    },
  },
});

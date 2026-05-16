import { createFileRoute } from "@tanstack/react-router";
import * as cheerio from "cheerio";

const ALLOWED_HOSTS = new Set([
  "pu.edu.pk",
  "www.pu.edu.pk",
  "result.pu.edu.pk",
]);

function isAllowed(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return ALLOWED_HOSTS.has(url.hostname);
}

function sanitize(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);

  // Remove heavy / useless tags
  $(
    "script, noscript, iframe, video, audio, object, embed, svg, canvas, link[rel='stylesheet'], style, meta[http-equiv='refresh']",
  ).remove();

  // Strip inline styles, classes, event handlers, animations
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attribs = (el as { attribs: Record<string, string> }).attribs;
    for (const name of Object.keys(attribs)) {
      if (
        name.startsWith("on") ||
        name === "style" ||
        name === "class" ||
        name === "id" ||
        name === "background" ||
        name === "bgcolor" ||
        name === "color" ||
        name === "align" ||
        name === "width" ||
        name === "height" ||
        name === "cellpadding" ||
        name === "cellspacing" ||
        name === "border" ||
        name === "valign"
      ) {
        $(el).removeAttr(name);
      }
    }
  });

  // Remove images (heavy on slow internet)
  $("img").remove();

  // Make links/forms absolute and route through proxy
  const base = new URL(baseUrl);
  const proxify = (href: string) => {
    try {
      const abs = new URL(href, base).toString();
      const u = new URL(abs);
      if (!isAllowed(u)) return abs;
      return `/?url=${encodeURIComponent(abs)}`;
    } catch {
      return href;
    }
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      $(el).removeAttr("href");
      return;
    }
    $(el).attr("href", proxify(href));
  });

  $("form").each((_, el) => {
    const action = $(el).attr("action") || baseUrl;
    try {
      const abs = new URL(action, base).toString();
      $(el).attr("action", `/api/proxy/submit?url=${encodeURIComponent(abs)}`);
      $(el).attr("method", ($(el).attr("method") || "GET").toUpperCase());
    } catch {}
  });

  // Remove empty containers
  $("div, span, table").each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && $el.children().length === 0) $el.remove();
  });

  const bodyHtml = $("body").html() || $.html();
  const title = $("title").text() || "Result";

  return `<!doctype html><meta charset="utf-8"><title>${title}</title>${bodyHtml}`;
}

async function fetchAndClean(targetUrl: string, init?: RequestInit) {
  const url = new URL(targetUrl);
  if (!isAllowed(url)) {
    return new Response("Host not allowed. Only pu.edu.pk domains are proxied.", {
      status: 403,
    });
  }
  const upstream = await fetch(url.toString(), {
    ...init,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LightResultViewer/1.0; +https://lovable.dev)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const text = await upstream.text();
  const cleaned = sanitize(text, url.toString());
  return new Response(cleaned, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url).searchParams.get("url");
        if (!u) return new Response("Missing url", { status: 400 });
        try {
          return await fetchAndClean(u);
        } catch (e) {
          return new Response("Fetch failed: " + (e as Error).message, {
            status: 502,
          });
        }
      },
    },
  },
});

export { fetchAndClean };

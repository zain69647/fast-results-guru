import * as cheerio from "cheerio";

const ALLOWED_HOSTS = new Set([
  "pu.edu.pk",
  "www.pu.edu.pk",
  "result.pu.edu.pk",
]);

export function isAllowed(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return ALLOWED_HOSTS.has(url.hostname);
}

function sanitize(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);

  $(
    "script, noscript, iframe, video, audio, object, embed, svg, canvas, link[rel='stylesheet'], style, meta[http-equiv='refresh']",
  ).remove();

  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attribs = (el as { attribs: Record<string, string> }).attribs;
    for (const name of Object.keys(attribs)) {
      if (
        name.startsWith("on") ||
        ["style","class","id","background","bgcolor","color","align","width","height","cellpadding","cellspacing","border","valign"].includes(name)
      ) {
        delete attribs[name];
      }
    }
  });

  $("img").remove();

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

  $("div, span, table").each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && $el.children().length === 0) $el.remove();
  });

  const bodyHtml = $("body").html() || $.html();
  const title = $("title").text() || "Result";

  return `<!doctype html><meta charset="utf-8"><title>${title}</title>${bodyHtml}`;
}

export async function fetchAndClean(targetUrl: string, init?: RequestInit) {
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
        "Mozilla/5.0 (compatible; LightResultViewer/1.0)",
      Accept: "text/html,application/xhtml+xml",
      ...(init?.headers || {}),
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

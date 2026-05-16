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

  // Try to isolate the main content area (form + results). Fall back to body.
  let mainHtml = "";
  const formEl = $("form").first();
  if (formEl.length) {
    // climb up to a reasonable container
    let container = formEl.parent();
    for (let i = 0; i < 6 && container.length; i++) {
      const txtLen = container.text().trim().length;
      if (txtLen > 200) break;
      container = container.parent();
    }
    mainHtml = (container.length ? container : formEl).parent().html() || formEl.toString();
  }
  if (!mainHtml) {
    mainHtml =
      $("article").first().html() ||
      $("main").first().html() ||
      $("body").html() ||
      $.html();
  }

  const title = $("title").text() || "Result";

  const css = `
    body{font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;margin:0;padding:0;background:#fff}
    table{border-collapse:collapse;margin:8px 0;width:100%;max-width:100%}
    td,th{border:1px solid #d4d4d4;padding:6px 8px;vertical-align:top;text-align:left}
    th{background:#f4f4f5}
    strong{font-weight:600}
    input,select,textarea{font:inherit;padding:6px 8px;border:1px solid #aaa;border-radius:4px;max-width:100%}
    input[type=submit],button{background:#0f172a;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600}
    input[type=submit]:hover,button:hover{background:#1e293b}
    a{color:#2563eb}
    br + br + br{display:none}
  `;

  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${css}</style>${mainHtml}`;
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

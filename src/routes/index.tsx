import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

const DEFAULT_URL = "https://pu.edu.pk/home/results_show/";
const PRESETS = [
  { label: "PU Results", url: "https://pu.edu.pk/home/results_show/" },
  { label: "PU Home", url: "https://pu.edu.pk/" },
];

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "PU Light Result Viewer" },
      { name: "description", content: "Fast, lightweight proxy for Punjab University results — optimized for slow connections." },
    ],
  }),
});

function Index() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Read ?url=… so proxified links keep working in-app
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get("url");
    if (u) {
      setUrl(u);
      load(u);
    }
  }, []);

  async function load(target: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      setHtml(text);
      setLoadedUrl(target);
      const next = new URL(window.location.href);
      next.searchParams.set("url", target);
      window.history.replaceState({}, "", next.toString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Intercept clicks/forms inside rendered content to load in-app
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/?url=")) {
        e.preventDefault();
        const target = decodeURIComponent(href.slice("/?url=".length));
        setUrl(target);
        load(target);
      }
    };

    const onSubmit = async (e: Event) => {
      const form = e.target as HTMLFormElement;
      const action = form.getAttribute("action") || "";
      if (!action.startsWith("/api/proxy/submit")) return;
      e.preventDefault();
      setLoading(true);
      setError(null);
      try {
        const method = (form.getAttribute("method") || "GET").toUpperCase();
        const fd = new FormData(form);
        let res: Response;
        if (method === "POST") {
          const body = new URLSearchParams();
          fd.forEach((v, k) => body.append(k, String(v)));
          res = await fetch(action, { method: "POST", body });
        } else {
          const qs = new URLSearchParams();
          fd.forEach((v, k) => qs.append(k, String(v)));
          const sep = action.includes("?") ? "&" : "?";
          res = await fetch(action + sep + qs.toString());
        }
        const text = await res.text();
        if (!res.ok) throw new Error(text);
        setHtml(text);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
    };
  }, [html]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3">
          <h1 className="text-base font-semibold">PU Light Result Viewer</h1>
          <p className="text-xs text-muted-foreground">
            Lightweight proxy. Strips scripts, ads & images for fast loading.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(url);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://pu.edu.pk/..."
              className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? "…" : "Go"}
            </button>
            <button
              type="button"
              onClick={() => loadedUrl && load(loadedUrl)}
              disabled={!loadedUrl || loading}
              className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-50"
              title="Reload"
            >
              ↻
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.url}
                onClick={() => {
                  setUrl(p.url);
                  load(p.url);
                }}
                className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {error && (
          <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && !html && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!html && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            Enter a Punjab University URL above or pick a preset to begin.
          </p>
        )}
        <div
          ref={contentRef}
          className="proxy-content text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}

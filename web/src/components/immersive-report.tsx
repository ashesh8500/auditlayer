"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";

/**
 * ImmersiveReport — full-width reading experience.
 *
 * Fetches the report HTML from an API endpoint and renders it inside a shadow
 * DOM wrapper for complete CSS isolation. The report's <style> and <body>
 * content inject into the shadow root so it renders exactly as designed,
 * without any leakage from the app shell's Tailwind styles.
 */
export function ImmersiveReport({
  reportUrl,
  backHref,
  backLabel = "Back",
}: {
  reportUrl: string;
  backHref: string;
  backLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(reportUrl);
        if (!res.ok) {
          throw new Error(`Failed to load report (${res.status})`);
        }
        const html = await res.text();
        if (cancelled) return;

        // Parse HTML to extract style and body
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const styleEls = doc.querySelectorAll("style");
        let styles = "";
        styleEls.forEach((el) => {
          styles += el.textContent ?? "";
        });

        // Get body content
        const bodyHtml = doc.body.innerHTML;

        // If there's a google fonts link, include it in the shadow
        const fontLinks = doc.querySelectorAll(
          'link[rel="stylesheet"], link[href*="fonts.googleapis"]'
        );
        let fontHtml = "";
        fontLinks.forEach((link) => {
          fontHtml += link.outerHTML;
        });

        // Create shadow root and inject
        if (containerRef.current && !shadowRootRef.current) {
          const shadow = containerRef.current.attachShadow({ mode: "open" });
          shadowRootRef.current = shadow;

          shadow.innerHTML = `
            ${fontHtml}
            <style>
              /* Reset within shadow */
              :host { display: block; }
              /* Report's own styles */
              ${styles}
            </style>
            ${bodyHtml}
          `;
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reportUrl]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      {/* Minimal top bar */}
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-4 border-b border-[var(--line)] bg-[color:var(--forest)] px-4 py-2 text-white backdrop-blur-sm sm:px-6">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-white/70 transition-colors hover:text-white alm-focus"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </a>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-xs font-medium uppercase tracking-[0.1em] text-[color:var(--teal-on-forest)] sm:inline">Focused report reader</span>
          <Brand inverse showName={false} />
        </div>
      </header>

      {/* Report content */}
      <main className="flex-1">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div role="status" className="text-sm text-muted-foreground animate-pulse">Preparing the report reader…</div>
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-lg px-6 py-32 text-center">
            <p className="text-sm text-[color:var(--red)]">{error}</p>
            <a
              href={backHref}
              className="mt-4 inline-block text-xs text-[color:var(--accent)] hover:underline"
            >
              ← Go back
            </a>
          </div>
        )}

        <div
          ref={containerRef}
          className={loading || error ? "hidden" : ""}
        />
      </main>
    </div>
  );
}

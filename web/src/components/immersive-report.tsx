"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { indexReport, readerHashTarget, type ReaderChapter } from "@/lib/report-reader";

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
  reportHtml,
  backHref,
  backLabel = "Back",
}: {
  reportUrl: string;
  reportHtml?: string;
  backHref: string;
  backLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [active, setActive] = useState("");
  const contentsRef = useRef<HTMLDetailsElement>(null);
  function navigate(id: string, updateHash = true) {
    const target = shadowRootRef.current?.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
    setActive(id);
    if (contentsRef.current) contentsRef.current.open = false;
    if (updateHash) history.replaceState(null, "", `#report:${encodeURIComponent(id)}`);
  }
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const [result, setResult] = useState<{ url: string; html?: string; error: string | null } | null>(null);
  const current = result?.url === reportUrl && result?.html === reportHtml;
  const loading = !current;
  const error = current ? result?.error : null;

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    const onHash = () => { const id = readerHashTarget(location.hash); if (id) navigate(id, false); };
    window.addEventListener("hashchange", onHash);
    const controller = new AbortController();
    if (shadowRootRef.current) shadowRootRef.current.innerHTML = "";

    async function load() {
      try {
        let html = reportHtml;
        if (html === undefined) {
          const res = await fetch(reportUrl, { signal: controller.signal, cache: "no-store" });
          if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
          html = await res.text();
        }
        if (cancelled) return;

        // Parse HTML to extract style and body
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const styleEls = doc.querySelectorAll("style");
        let styles = "";
        styleEls.forEach((el) => {
          styles += el.textContent ?? "";
        });

        // Retain a real body inside the shadow root: body typography selectors
        // otherwise match nothing. :root variables belong on the shadow host.
        styles = styles.replace(/:root\b/g, ":host");

        // If there's a google fonts link, include it in the shadow
        const fontLinks = doc.querySelectorAll(
          'link[rel="stylesheet"], link[href*="fonts.googleapis"]'
        );
        let fontHtml = "";
        fontLinks.forEach((link) => {
          fontHtml += link.outerHTML;
        });

        // Create shadow root and inject
        if (containerRef.current) {
          const shadow = shadowRootRef.current ?? containerRef.current.attachShadow({ mode: "open" });
          shadowRootRef.current = shadow;

          shadow.innerHTML = `
            ${fontHtml}
            <style>
              :host { display: block; min-width: 0; max-width: 100%; }
              ${styles}
            </style>
          `;
          shadow.appendChild(doc.body);
          const indexed = indexReport(shadow);
          setChapters(indexed);
          setActive(indexed[0]?.id ?? "");
          const enhancement = document.createElement("style");
          enhancement.textContent = "section, h2 { scroll-margin-top: 90px; } :focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }";
          shadow.appendChild(enhancement);
          observer = new IntersectionObserver(entries => {
            const visible = entries.filter(entry => entry.isIntersecting);
            if (visible.length) setActive(visible[0].target.id);
          }, { rootMargin: "-80px 0px -55% 0px" });
          indexed.forEach(chapter => { const el = shadow.getElementById(chapter.id); if (el) observer?.observe(el); });
        }

        setResult({ url: reportUrl, html: reportHtml, error: null });
        requestAnimationFrame(() => { if (!cancelled) onHash(); });
      } catch (err) {
        if (!cancelled) {
          setResult({ url: reportUrl, html: reportHtml, error: err instanceof Error ? err.message : "Failed to load" });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
      observer?.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, [reportUrl, reportHtml]);

  return (
    <div className="alm-reader flex min-h-screen flex-col bg-[var(--bg)]">
      <style>{`
        .alm-reader { min-width:0; color:var(--text); }
        .reader-layout {display:grid;grid-template-columns:minmax(0,1fr);min-width:0}
        .reader-rail {display:none}
        .reader-tools {padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface);overflow-wrap:anywhere}
        .reader-tools summary,.reader-chapter {min-height:44px;display:flex;align-items:center}
        .reader-tools summary {cursor:pointer}
        .reader-chapter {text-align:left;width:100%;padding:8px;border:0;background:transparent;color:inherit;overflow-wrap:anywhere}
        .reader-chapter[aria-current=true] {font-weight:700;background:var(--accent-muted);border-left:3px solid var(--accent)}
        .alm-reader button:focus-visible,.alm-reader summary:focus-visible {outline:3px solid var(--accent);outline-offset:2px}
        .reader-unavailable {font-size:12px;line-height:1.6;color:var(--muted);margin-top:8px}
        .reader-unavailable button {padding:8px;margin:2px;min-height:44px}
        @media(min-width:1024px) {.reader-layout {grid-template-columns:240px minmax(0,1fr)}.reader-rail {display:block;position:sticky;top:72px;align-self:start;max-height:calc(100vh - 80px);overflow:auto;padding:16px}.reader-mobile-contents {display:none}}
      `}</style>
      {/* Minimal top bar */}
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-4 py-2 text-foreground backdrop-blur-sm sm:px-6">
        <Link prefetch={false}
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground alm-focus"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground sm:inline">Focused report reader</span>
          <Brand showName={false} />
        </div>
      </header>

      {/* Report content */}
      {!loading && !error && <div className="reader-tools">
        <details ref={contentsRef} className="reader-mobile-contents">
          <summary>Contents · {chapters.find(c => c.id === active)?.label || "Report"}</summary>
          <nav aria-label="Report contents">{chapters.map(chapter => <button type="button" className="reader-chapter alm-focus min-h-11" key={chapter.id} aria-current={active === chapter.id} onClick={() => navigate(chapter.id)}>{chapter.label}</button>)}</nav>
        </details>
        <div className="reader-unavailable">
          <button type="button" className="alm-focus min-h-11" disabled>Actions only — unavailable</button>
          <button type="button" className="alm-focus min-h-11" disabled>Why this score — unavailable</button>
          <button type="button" className="alm-focus min-h-11" disabled>Evidence panel — unavailable</button>
          <p>This artifact does not include verified action, score or evidence mappings. Read its original analysis and citations below. Missing scores are not zero.</p>
          {chapters.some(c => !c.stable) && <p>Section links apply to this exact report version; original section IDs were not recorded.</p>}
        </div>
      </div>}
      <div className="reader-layout">
      {!loading && !error && <nav className="reader-rail" aria-label="Report chapters"><strong>In this report</strong>{chapters.map(chapter => <button type="button" className="reader-chapter alm-focus min-h-11" key={chapter.id} aria-current={active === chapter.id} onClick={() => navigate(chapter.id)}>{chapter.label}</button>)}</nav>}
      <main className="min-w-0 flex-1">
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
    </div>
  );
}

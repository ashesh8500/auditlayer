"use client";

import type { IframeHTMLAttributes } from "react";

/** Host-owned navigation bridge for one allowlisted route. The report keeps its
 * existing sandbox: no scripts, forms, or arbitrary top navigation are granted. */
export function ReportFrame(props: IframeHTMLAttributes<HTMLIFrameElement>) {
  return <iframe {...props} onLoad={(event) => {
    props.onLoad?.(event);
    const doc = event.currentTarget.contentDocument;
    doc?.addEventListener("click", click => {
      if (!click.isTrusted || click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
      const target = click.target as Element | null;
      const link = target?.closest?.("a[href]");
      if (!link) return;
      let url: URL;
      try { url = new URL(link.getAttribute("href")!, window.location.origin); }
      catch { return; } // Broken artifact links must not crash the host bridge.
      if (url.origin !== window.location.origin || url.pathname !== "/pricing") return;
      const plan = url.searchParams.get("plan");
      click.preventDefault();
      window.location.assign(`/pricing${plan === "pro" || plan === "starter" ? `?plan=${plan}` : ""}`);
    });
  }} />;
}

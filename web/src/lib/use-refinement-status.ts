"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceResources } from "@/components/workspace-resources";
import type { RefinementRow } from "@/components/report-viewer";
const pending = (r: RefinementRow) => r.status === "queued" || r.status === "running";

export function useRefinementStatus(auditId: string, initialRows: RefinementRow[], initialVersion: number, queuedId?: string) {
  const [snapshot, setSnapshot] = useState<{ auditId: string; rows: RefinementRow[]; version: number }>({ auditId, rows: initialRows, version: initialVersion });
  const [error, setError] = useState("");
  const router = useRouter(); const workspace = useWorkspaceResources();
  const callbacks = useRef({ router, workspace });
  useEffect(() => { callbacks.current = { router, workspace }; }, [router, workspace]);
  // Primitive identity: responses/rerenders cannot restart the observation loop.
  const ids = [...new Set([...initialRows.filter(pending).map(r => r.id), ...(queuedId ? [queuedId] : [])])].sort().join(",");
  useEffect(() => {
    if (!ids) return;
    let stopped = false; let disposed = false; let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined; let failures = 0; let reads = 0;
    const remaining = new Set(ids.split(","));
    async function poll() {
      if (stopped || disposed || document.hidden || !navigator.onLine) return;
      controller = new AbortController(); const signal = controller.signal;
      try {
        const response = await fetch(`/api/audits/${auditId}/refinements?ids=${encodeURIComponent([...remaining].join(","))}`, { signal, cache: "no-store" });
        if (signal.aborted || disposed) return;
        if ([401,403,404].includes(response.status)) { stopped = true; setError("Status access ended. Refresh or sign in again."); return; }
        if (!response.ok) throw new Error("status unavailable");
        const data = await response.json();
        if (signal.aborted || disposed) return;
        const rows = data.refinements as RefinementRow[];
        if (!Array.isArray(rows) || !Number.isInteger(data.reportVersion)) throw new Error("invalid status");
        let completed = false;
        for (const row of rows) if (!pending(row) && remaining.delete(row.id)) completed = true;
        setSnapshot(old => {
          const base = old.auditId === auditId ? old.rows : initialRows;
          return { auditId, version:data.reportVersion, rows:[...rows, ...base.filter(r => !rows.some(n => n.id === r.id))] };
        });
        setError(""); failures = 0;
        if (completed) { void callbacks.current.workspace?.invalidate("reports"); callbacks.current.router.refresh(); }
        if (!remaining.size) stopped = true;
        // Finite observation budget, not an invented worker timeout.
        if (++reads >= 180) { stopped = true; setError("Still pending. Refresh to check again."); }
      } catch {
        if (signal.aborted || disposed) return;
        failures++;
        setError("Couldn't check refinement status. Retrying while this page is visible.");
        if (failures >= 5) { stopped = true; setError("Status is unavailable. Refresh to check again."); }
      } finally {
        if (!stopped && !disposed && !signal.aborted) timer = setTimeout(poll, Math.min(30000, 5000 * 2 ** failures));
      }
    }
    function visibility() {
      clearTimeout(timer); controller?.abort();
      if (!document.hidden && navigator.onLine) void poll();
    }
    void poll();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility); window.addEventListener("offline", visibility);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", visibility); window.removeEventListener("offline", visibility); };
    // initialRows is deliberately excluded: only new pending identities restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, ids]);
  const same = snapshot.auditId === auditId;
  return { refinements: same ? [...snapshot.rows.filter(r => !initialRows.some(i => i.id === r.id && !pending(i))), ...initialRows.filter(r => !pending(r) || !snapshot.rows.some(s => s.id === r.id))] : initialRows,
    reportVersion: same ? Math.max(snapshot.version, initialVersion) : initialVersion, error };
}

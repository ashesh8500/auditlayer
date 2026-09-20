"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceResources } from "./workspace-resources";
import { ImmersiveReport } from "./immersive-report";
import { ResourceStatus } from "./resource-status";
import { fencedJson, metadataOptions, resourceKey } from "@/lib/resources/workspace";
import { parseReaderVersion } from "@/lib/report-reader";
import { reportVersionKey, REPORT_PRESENTATION_REVISION, type ReportDTO } from "@/lib/resources/report";
export function OwnedReportReader({ id }: { id: string }) {
  const scope = useWorkspaceResources();
  const [selected, setSelected] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const parsed = parseReaderVersion(new URL(window.location.href).searchParams.get("version"));
    return parsed === "invalid" ? -1 : parsed;
  });
  if (!scope) throw new Error("Workspace provider missing");
  const query = useQuery({ ...metadataOptions,
    queryKey: resourceKey(scope.ownerId, "reports", scope.revisions.reports, `reader:${id}:${selected ?? "latest"}:${REPORT_PRESENTATION_REVISION}`),
    queryFn: async ({ signal }) => {
      const base = `/api/resources/report/${encodeURIComponent(id)}`;
      const metadata = await fencedJson<Omit<ReportDTO, "html" | "contentHash">>(`${base}?metadata=1${selected ? `&version=${selected}` : ""}`, scope.ownerId, signal);
      if (metadata.reportId !== id || metadata.presentationRevision !== REPORT_PRESENTATION_REVISION || (selected !== null && metadata.version !== selected)) throw new Error("Invalid report identity");
      const immutable = metadata.versions?.some(v => v.version === metadata.version);
      // Only immutable version rows may reuse bytes across metadata refreshes.
      const cached = immutable ? scope.client.getQueriesData<ReportDTO>({ queryKey: ["workspace", scope.ownerId, "report-version", id, metadata.version] })
        .map(([, data]) => data).find(data => data?.presentationRevision === REPORT_PRESENTATION_REVISION) : undefined;
      if (cached) return { ...cached, ...metadata };
      const dto = await fencedJson<ReportDTO>(`${base}${immutable ? `?version=${metadata.version}` : ""}`, scope.ownerId, signal);
      if (dto.reportId !== id || dto.version !== metadata.version || dto.presentationRevision !== REPORT_PRESENTATION_REVISION || !/^[a-f0-9]{64}$/.test(dto.contentHash)) throw new Error("Report changed. Please refresh.");
      signal.throwIfAborted();
      scope.client.setQueryData(reportVersionKey(dto), dto);
      scope.client.setQueryDefaults(reportVersionKey(dto), { staleTime: Infinity, gcTime: metadataOptions.gcTime });
      return dto;
    },
  });
  if (!query.data) return <ResourceStatus query={query} label="Report" />;
  const dto = query.data;
  function choose(value: string) {
    const version = value === "latest" ? null : Number(value);
    setSelected(version);
    const url = new URL(window.location.href);
    if (version === null) url.searchParams.delete("version"); else url.searchParams.set("version", String(version));
    url.hash = "";
    history.replaceState(null, "", url);
  }
  return <><ResourceStatus query={query} label="Report" />
    <section aria-label="Report version" className="border-b border-border bg-card p-4 text-sm" style={{overflowWrap:"anywhere"}}>
      <label htmlFor="reader-version" className="font-semibold">Report version</label>{" "}
      <select id="reader-version" className="min-h-11 max-w-full rounded border border-border bg-background px-2 alm-focus" value={selected ?? "latest"} onChange={e => choose(e.target.value)}>
        <option value="latest">Latest · v{dto.latestVersion ?? dto.version}</option>
        {(dto.versions ?? []).map(v => <option key={v.version} value={v.version}>v{v.version} · {new Date(v.createdAt).toLocaleDateString()}</option>)}
      </select>
      <p className="mt-2">Reading v{dto.version}{dto.version !== dto.latestVersion && dto.latestVersion ? " · Historical version — latest is unchanged" : ""} · Created {dto.createdAt ? new Date(dto.createdAt).toLocaleString() : "unknown"}</p>
      <p>Brand Context {dto.contextVersion ? `v${dto.contextVersion}` : "unknown"} · Method {dto.methodology || "unknown"}</p>
      <p>Evidence snapshot: {dto.evidenceSnapshotId || "unknown — no historical pin recorded"}</p>
      <p>Report-wide observation date: unknown. Individual observation dates remain in the original citations.</p>
      <a className="inline-flex min-h-11 items-center underline alm-focus" href={`/api/audits/${id}/report?${dto.versions?.some(v => v.version === dto.version) ? `version=${dto.version}&` : ""}download=1`}>Download this version</a>
    </section>
    <ImmersiveReport reportUrl={`/api/audits/${id}/read?version=${dto.version}`} reportHtml={dto.html} backHref={`/audits/${id}`} backLabel={`@${dto.handle}`} />
  </>;
}

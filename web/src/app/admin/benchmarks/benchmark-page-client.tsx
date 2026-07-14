"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/supabase/types";

type BenchmarkRow = Database["public"]["Tables"]["wellness_benchmarks"]["Row"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  benchmarks: BenchmarkRow[];
  peerCounts: Record<string, number>;
  filterNiche?: string;
}

const BRACKETS = [
  "1k-10k",
  "10k-50k",
  "50k-100k",
  "100k-500k",
  "500k+",
] as const;

// ---------------------------------------------------------------------------
// Client component: full CRUD table with search, edit modal, delete confirm
// ---------------------------------------------------------------------------

export function BenchmarkPageClient({
  benchmarks,
  peerCounts,
  filterNiche,
}: Props) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{
    mode: "create" | "edit";
    benchmark?: BenchmarkRow;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Compute niche list from actual data
  const niches = useMemo(() => {
    const set = new Set(benchmarks.map((b) => b.niche));
    return Array.from(set).sort();
  }, [benchmarks]);

  // Client-side text search
  const filtered = useMemo(() => {
    if (!search.trim()) return benchmarks;
    const q = search.toLowerCase();
    return benchmarks.filter(
      (b) =>
        b.niche.toLowerCase().includes(q) ||
        b.followers_bracket.toLowerCase().includes(q) ||
        (b.cta ?? "").toLowerCase().includes(q) ||
        (b.post_freq ?? "").toLowerCase().includes(q),
    );
  }, [benchmarks, search]);

  // ── Mutation helpers ──────────────────────────────────────────────

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      setError(null);
      const res = await fetch(`/api/admin/benchmarks${path}`, init);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    [],
  );

  const handleCreate = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSaving(true);
      const fd = new FormData(e.currentTarget);
      try {
        await apiFetch("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niche: fd.get("niche"),
            followers_bracket: fd.get("followers_bracket"),
            avg_engagement: Number(fd.get("avg_engagement")) || 0,
            top_formats: String(fd.get("top_formats") || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            post_freq: String(fd.get("post_freq") || ""),
            cta: String(fd.get("cta") || ""),
          }),
        });
        setModal(null);
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [apiFetch, router],
  );

  const handleUpdate = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!modal?.benchmark) return;
      setSaving(true);
      const fd = new FormData(e.currentTarget);
      try {
        await apiFetch(`?id=${modal.benchmark.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            niche: fd.get("niche"),
            followers_bracket: fd.get("followers_bracket"),
            avg_engagement: Number(fd.get("avg_engagement")) || 0,
            top_formats: String(fd.get("top_formats") || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            post_freq: String(fd.get("post_freq") || ""),
            cta: String(fd.get("cta") || ""),
          }),
        });
        setModal(null);
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [apiFetch, modal, router],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        await apiFetch(`?id=${id}`, { method: "DELETE" });
        setConfirmDelete(null);
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setConfirmDelete(null);
      } finally {
        setSaving(false);
      }
    },
    [apiFetch, router],
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Wellness benchmarks</h1>
        <span className="text-xs text-muted-foreground">
          Admin-only · read/write
        </span>
      </div>

      {/* Niche filter pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/benchmarks"
          className={`rounded-full px-3 py-1 text-xs transition ${
            !filterNiche
              ? "bg-[var(--accent)] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
        </Link>
        {niches.map((n) => (
          <Link
            key={n}
            href={`/admin/benchmarks?niche=${n}`}
            className={`rounded-full px-3 py-1 text-xs transition ${
              filterNiche === n
                ? "bg-[var(--accent)] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {n}
          </Link>
        ))}
      </div>

      {/* Search + create bar */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          placeholder="Search niche, bracket, CTA…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
        <Button
          size="sm"
          onClick={() => setModal({ mode: "create" })}
          className="shrink-0"
        >
          + Add benchmark
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-[color:var(--red)]/30 bg-[color:var(--red)]/5 px-3 py-2 text-xs text-[color:var(--red)]">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Niche</th>
              <th className="px-3 py-2 font-medium">Bracket</th>
              <th className="px-3 py-2 font-medium">Avg Eng</th>
              <th className="px-3 py-2 font-medium">Post Freq</th>
              <th className="px-3 py-2 font-medium">CTA</th>
              <th className="px-3 py-2 font-medium">Peers</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr
                key={b.id}
                className="border-t border-border/50 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-medium">{b.niche}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {b.followers_bracket}
                </td>
                <td className="px-3 py-2 font-mono">
                  {Number(b.avg_engagement).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {b.post_freq}
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">
                  {b.cta}
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {peerCounts[b.id] ?? 0}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setModal({ mode: "edit", benchmark: b })}
                      className="text-xs font-medium text-[color:var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(b.id)}
                      className="text-xs text-[color:var(--red)] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {search.trim()
                    ? `No benchmarks match "${search}".`
                    : filterNiche
                      ? `No benchmarks for niche "${filterNiche}".`
                      : "No benchmarks yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {filtered.length} benchmark row
        {filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
        {filterNiche && (
          <>
            {" "}
            ·{" "}
            <Link
              href="/admin/benchmarks"
              className="text-[var(--accent)] hover:underline"
            >
              clear filter
            </Link>
          </>
        )}
        .
      </p>

      {/* ── Edit / Create Modal ──────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => {
              setModal(null);
              setError(null);
            }}
          />
          {/* Panel */}
          <form
            onSubmit={modal.mode === "create" ? handleCreate : handleUpdate}
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
          >
            <h2 className="mb-4 text-sm font-semibold">
              {modal.mode === "create" ? "Add benchmark" : "Edit benchmark"}
            </h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="bm-niche" className="text-xs">
                  Niche
                </Label>
                <Input
                  id="bm-niche"
                  name="niche"
                  required
                  defaultValue={modal.benchmark?.niche ?? ""}
                  placeholder="e.g. longevity"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bm-bracket" className="text-xs">
                  Followers bracket
                </Label>
                <select
                  id="bm-bracket"
                  name="followers_bracket"
                  required
                  defaultValue={modal.benchmark?.followers_bracket ?? ""}
                  className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                >
                  <option value="" disabled>
                    Select bracket…
                  </option>
                  {BRACKETS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bm-eng" className="text-xs">
                  Avg engagement (%)
                </Label>
                <Input
                  id="bm-eng"
                  name="avg_engagement"
                  type="number"
                  step="0.1"
                  min={0}
                  defaultValue={modal.benchmark?.avg_engagement ?? 0}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bm-formats" className="text-xs">
                  Top formats (comma-separated)
                </Label>
                <Input
                  id="bm-formats"
                  name="top_formats"
                  defaultValue={
                    modal.benchmark?.top_formats
                      ? (
                          modal.benchmark.top_formats as unknown as string[]
                        ).join(", ")
                      : ""
                  }
                  placeholder="reel, carousel, static"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bm-freq" className="text-xs">
                  Post frequency
                </Label>
                <Input
                  id="bm-freq"
                  name="post_freq"
                  defaultValue={modal.benchmark?.post_freq ?? ""}
                  placeholder="3-4x/week"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bm-cta" className="text-xs">
                  CTA
                </Label>
                <Input
                  id="bm-cta"
                  name="cta"
                  defaultValue={modal.benchmark?.cta ?? ""}
                  placeholder="e.g. link in bio → newsletter"
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 text-xs text-[color:var(--red)]">{error}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setModal(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving
                  ? "Saving…"
                  : modal.mode === "create"
                    ? "Create"
                    : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setConfirmDelete(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold">Delete benchmark?</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              This will also delete all associated peer entries. This action
              cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={saving}
                onClick={() => handleDelete(confirmDelete)}
              >
                {saving ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

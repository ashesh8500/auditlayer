"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";

type CostAudit = {
  id: string;
  handle: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  model: string | null;
  created_at: string;
};

function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type ModelBreakdown = {
  model: string;
  count: number;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
};

export function CostDashboard({ audits }: { audits: CostAudit[] }) {
  const {
    totalCost,
    totalTokensIn,
    totalTokensOut,
    modelBreakdown,
    top5,
    monthLabel,
  } = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    if (audits.length === 0) {
      return {
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        modelBreakdown: [] as ModelBreakdown[],
        top5: [] as CostAudit[],
        monthLabel,
      };
    }

    let totalCost = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    const modelMap = new Map<string, ModelBreakdown>();

    for (const a of audits) {
      totalCost += a.cost_usd;
      totalTokensIn += a.tokens_in;
      totalTokensOut += a.tokens_out;

      const key = a.model ?? "unknown";
      const entry = modelMap.get(key);
      if (entry) {
        entry.count++;
        entry.totalCost += a.cost_usd;
        entry.totalTokensIn += a.tokens_in;
        entry.totalTokensOut += a.tokens_out;
      } else {
        modelMap.set(key, {
          model: key,
          count: 1,
          totalCost: a.cost_usd,
          totalTokensIn: a.tokens_in,
          totalTokensOut: a.tokens_out,
        });
      }
    }

    const modelBreakdown = [...modelMap.values()].sort(
      (a, b) => b.totalCost - a.totalCost,
    );

    const top5 = [...audits]
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 5);

    return {
      totalCost,
      totalTokensIn,
      totalTokensOut,
      modelBreakdown,
      top5,
      monthLabel,
    };
  }, [audits]);

  if (audits.length === 0) {
    return null; // silent — no cost data yet
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Cost — {monthLabel}
      </h2>

      {/* Summary cards */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--shadow)]/30 bg-[var(--chassis)] p-4">
          <div className="text-[0.7rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Total cost
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums">
            {fmtUSD(totalCost)}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--shadow)]/30 bg-[var(--chassis)] p-4">
          <div className="text-[0.7rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Tokens in
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums">
            {fmtTokens(totalTokensIn)}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--shadow)]/30 bg-[var(--chassis)] p-4">
          <div className="text-[0.7rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Tokens out
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums">
            {fmtTokens(totalTokensOut)}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--shadow)]/30 bg-[var(--chassis)] p-4">
          <div className="text-[0.7rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Audits
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums">
            {audits.length}
          </div>
        </div>
      </div>

      {/* Model breakdown */}
      <div className="mt-4 flex flex-wrap gap-2">
        {modelBreakdown.map((m) => (
          <Badge key={m.model} tone="info">
            {m.model}: {fmtUSD(m.totalCost)} / {m.count} audit
            {m.count !== 1 ? "s" : ""}
          </Badge>
        ))}
      </div>

      {/* Top 5 most expensive */}
      <div className="mt-3 text-xs text-[var(--text-muted)]">
        <span className="font-semibold uppercase tracking-[0.05em]">
          Top 5 by cost
        </span>
        <ul className="mt-1 space-y-0.5">
          {top5.map((a) => (
            <li key={a.id}>
              @{a.handle} — {fmtUSD(a.cost_usd)} — {a.model ?? "unknown"}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

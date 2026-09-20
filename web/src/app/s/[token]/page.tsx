import { Metadata } from "next";
import { Brand } from "@/components/brand";

import { getAuditForShare } from "@/lib/share-access";
import { ShareReportView } from "./share-report-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared Report — AuditLayerMedia",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getAuditForShare(token);

  if ("error" in result) {
    return <ShareError error={result.error} />;
  }

  return (
    <ShareReportView
      token={token}
      needsVerification={"needsVerification" in result}
    />
  );
}

function ShareError({ error }: { error: string }) {
  const messages: Record<string, { title: string; body: string }> = {
    not_found: {
      title: "Link not found",
      body: "This share link doesn't exist. It may have been deleted.",
    },
    revoked: {
      title: "Link revoked",
      body: "The owner has revoked access to this report.",
    },
    expired: {
      title: "Link expired",
      body: "This share link has expired. Ask the owner for a new one.",
    },
    not_ready: {
      title: "Report not ready",
      body: "The report is still being generated. Check back soon.",
    },
    invalid: {
      title: "Invalid link",
      body: "This link is not valid.",
    },
  };

  const msg = messages[error] ?? {
    title: "Something went wrong",
    body: "This link is not accessible.",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div className="text-center">
        <Brand className="mb-4" />
        <h1 className="text-xl font-bold tracking-tight">{msg.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{msg.body}</p>
        <div className="mt-6 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Powered by AuditLayerMedia
        </div>
      </div>
    </div>
  );
}

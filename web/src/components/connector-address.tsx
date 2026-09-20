"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ConnectorAddress({ url }: { url: string }) {
 const [message, setMessage] = useState("");
 const [pending, setPending] = useState(false);
 async function copy() {
   setPending(true);
   try { await navigator.clipboard.writeText(url); setMessage("Copied connector address."); }
   catch { setMessage("Copy was unavailable. Select and copy the address above."); }
   finally { setPending(false); }
 }
 return <div className="mt-3 space-y-2">
   <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--radius)] bg-muted p-3">
     <code className="min-w-0 flex-1 select-all break-all text-xs">{url}</code>
     <Button variant="outline" disabled={pending} onClick={copy} aria-label="Copy connector address"><Copy className="size-4" />Copy</Button>
   </div>
   <p role="status" className="text-xs text-muted-foreground">{message}</p>
 </div>;
}

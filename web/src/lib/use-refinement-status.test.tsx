// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRefinementStatus } from "./use-refinement-status";
const { refresh, invalidate } = vi.hoisted(() => ({ refresh:vi.fn(), invalidate:vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/components/workspace-resources', () => ({ useWorkspaceResources: () => ({ invalidate }) }));
let root:Root;
const captured:{ current: ReturnType<typeof useRefinementStatus> | null } = { current:null };
const row = { id: 'r', section:'Key Gaps', instruction:'Shorten it', status:'running', error:'', created_at:'' };
// Publish the hook result from an effect, never during render (React purity rule).
function Probe({ rows = [row] }) {
  const value = useRefinementStatus('a', rows, 1);
  React.useEffect(() => { captured.current = value; });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT:true });
  Object.defineProperty(document,'hidden',{ configurable:true,value:false });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('observes pending, refreshes version once and never polls terminal rows', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok:true, json:async () => ({ refinements:[{...row,status:'done'}], reportVersion:2, reportReady:true }) });
  vi.stubGlobal('fetch',fetcher);
  await act(async () => root.render(<Probe />));
  expect(captured.current!.reportVersion).toBe(2);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith('reports');
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('pauses hidden, aborts in-flight reads and ignores late completion', async () => {
  let resolve!: (r: unknown) => void;
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  vi.stubGlobal('fetch', fetcher);
  await act(async () => root.render(<Probe />));
  await act(async () => { Object.defineProperty(document,'hidden',{value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve({ok:true,json:async () => ({refinements:[{...row,status:'done'}],reportVersion:2})}); await vi.advanceTimersByTimeAsync(60000); });
  expect(refresh).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not fetch terminal initial rows', async () => {
  vi.stubGlobal('fetch', vi.fn());
  await act(async () => root.render(<Probe rows={[]} />));
  expect(fetch).not.toHaveBeenCalled();
});

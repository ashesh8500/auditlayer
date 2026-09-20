// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImmersiveReport } from "./immersive-report";
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
let root: Root; let host: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); root = createRoot(host); vi.stubGlobal("fetch", vi.fn()); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const body = () => host.querySelector("main > div:last-child")!.shadowRoot!;
it("renders reused bytes without another fetch and updates content without dropping body typography", async () => {
  const first = '<html><head><style>:root{--c:red}body{color:var(--c)}</style></head><body><h1>Version one</h1></body></html>';
  await act(async () => root.render(<ImmersiveReport reportUrl="/read/a" reportHtml={first} backHref="/dashboard" />));
  expect(fetch).not.toHaveBeenCalled();
  expect(body().querySelector("body h1")?.textContent).toBe("Version one");
  expect(body().querySelector("style")?.textContent).toContain(":host{--c:red}");
  await act(async () => root.render(<ImmersiveReport reportUrl="/read/a" reportHtml={first.replace("Version one", "Version two")} backHref="/dashboard" />));
  expect(body().textContent).not.toContain("Version one"); expect(body().textContent).toContain("Version two");
});
it("cancels a public/shared fetch and ignores its late response after source switch", async () => {
  let resolve!: (r: Response) => void; let signal!: AbortSignal;
  vi.mocked(fetch).mockImplementation((_url, options) => { signal = options!.signal as AbortSignal; return new Promise(r => { resolve = r; }); });
  await act(async () => root.render(<ImmersiveReport reportUrl="/shared/a" backHref="/" />));
  await act(async () => root.render(<ImmersiveReport reportUrl="/read/b" reportHtml="<body>B</body>" backHref="/" />));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ ok: true, text: async () => "<body>Late A</body>" } as Response));
  expect(body().textContent).toContain("B"); expect(body().textContent).not.toContain("Late A");
});

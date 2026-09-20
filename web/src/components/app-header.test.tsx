import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth",()=>({getProfile:async()=>({email:"preview-tester@auditlayermedia.com",role:"user"})}));
vi.mock("@/app/login/actions",()=>({signOut:async()=>{}}));
import { AppHeader } from "./app-header";
afterEach(()=>vi.unstubAllEnvs());
it("fully prefetches only the three bounded primary resource shells", async () => {
 const links: Array<{href: string; prefetch?: boolean}> = [];
 function walk(node: React.ReactNode) {
  if (!React.isValidElement(node)) return;
  const props = node.props as {href?: string; prefetch?: boolean; children?: React.ReactNode};
  if (props.href && props.prefetch === true) links.push({href: props.href, prefetch: props.prefetch});
  React.Children.forEach(props.children, walk);
 }
 walk(await AppHeader());
 expect(links.map(link => link.href).sort()).toEqual(["/dashboard", "/settings/connections", "/subjects"]);
});
it.each(["production","preview"])("Tester navigation respects real %s environment predicate",async env=>{
 vi.stubEnv("VERCEL_ENV",env);vi.stubEnv("AUDITLAYER_ALLOW_PREVIEW_LOGIN","1");vi.stubEnv("PREVIEW_TEST_USER_EMAIL","preview-tester@auditlayermedia.com");
 const html=renderToStaticMarkup(await AppHeader());
 expect(html.includes('href="/preview-setup"')).toBe(env==="preview");
});

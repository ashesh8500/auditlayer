import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth",()=>({getSession:async()=>({id:"owner"})}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`)}}));
vi.mock("@/lib/env",()=>({isPreviewLoginAllowed:()=>false,previewTestUserPassword:()=>""}));
vi.mock("./login-form",()=>({LoginForm:()=>null}));
vi.mock("./trial-claim-form",()=>({TrialClaimForm:({trial,next}:{trial:string,next:string})=><div>Claim {trial} then {next}</div>}));
import LoginPage from "./page";
it("signed-in visitors see an explicit claim instead of losing their invite",async()=>{
 const html=renderToStaticMarkup(await LoginPage({searchParams:Promise.resolve({trial:"invite",next:"/audits/new?subject=abc"})}));
 expect(html).toContain("Claim invite then /audits/new?subject=abc");
});
it("signed-in visitors cannot redirect through slash-backslash",async()=>{
 await expect(LoginPage({searchParams:Promise.resolve({next:"/\\evil.test"})})).rejects.toThrow("redirect:/dashboard");
});

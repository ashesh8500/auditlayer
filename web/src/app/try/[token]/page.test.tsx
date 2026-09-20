import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/trials",()=>({validateTrialToken:async()=>({valid:false,reason:"exhausted"})}));
import TryPage from "./page";
it("an exhausted offer still provides an authenticated recovery path for prior claimants",async()=>{
 const html=renderToStaticMarkup(await TryPage({params:Promise.resolve({token:"invite"})}));
 expect(html).toContain("/login?trial=invite");
 expect(html).toContain("Already claimed");
});

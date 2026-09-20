import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PricingPage from "./page";
vi.mock("@/lib/auth",()=>({getProfile:async()=>null}));
vi.mock("@/lib/actions/billing",()=>({openBillingPortal:vi.fn()}));
it("publishes only approved offers and does not imply enrollment is live", async()=>{
 const html=renderToStaticMarkup(await PricingPage({searchParams:Promise.resolve({plan:"brand"})}));
 for(const text of ["Free","Brand","Studio","Enterprise","$199","$499","5,000","15,000","500","Same evidence standards","Not available for enrollment"]) expect(html).toContain(text);
 for(const text of ["$129","Sign In for Starter","Sign In for Pro","Standard reports with Starter"]) expect(html).not.toContain(text);
 expect(html).toContain("/settings/billing");
});

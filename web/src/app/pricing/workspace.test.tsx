import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PricingPage from "./page";
vi.mock("@/lib/auth",()=>({getProfile:async()=>null}));
vi.mock("@/lib/actions/billing",()=>({openBillingPortal:vi.fn()}));
vi.mock("./actions",()=>({checkoutPlan:vi.fn()}));
it("publishes blocked workspace offer alongside unchanged Starter/Pro intent", async()=>{
 const html=renderToStaticMarkup(await PricingPage({searchParams:Promise.resolve({plan:"starter"})}));
 expect(html).toContain("Not available for enrollment"); expect(html).toContain("$129/month");
 expect(html).toContain("Sign In for Starter"); expect(html).toContain("Sign In for Pro");
 expect(html).toContain("/settings/billing");
});

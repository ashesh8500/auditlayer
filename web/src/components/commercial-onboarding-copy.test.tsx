import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {CommercialOffers} from "./commercial-offers";
vi.mock("@/lib/trials",()=>({validateTrialToken:async()=>({valid:true,auditsGranted:3,offerPlan:"starter",reportTypes:["standard"],accessDays:7})}));
import TryPage from "@/app/try/[token]/page";
it("states explicit Free enrollment instead of an automatic signup grant",()=>{
 const html=renderToStaticMarkup(<CommercialOffers/>);
 expect(html).toContain("once on explicit Free enrollment after email verification");expect(html).not.toContain("once at verified signup");
});
it("distinguishes legacy trial gifts from separately enrolled Free credits and continues to credits",async()=>{
 const html=renderToStaticMarkup(await TryPage({params:Promise.resolve({token:"invite"})}));
 expect(html).toContain("Gifted audits and trial report access expire with the offer window");
 expect(html).toContain("Free credits require separate enrollment");
 expect(html).toContain("next=%2Fcommercial");
 expect(html).not.toContain("Credits and report access expire");
});

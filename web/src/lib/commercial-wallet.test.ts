import { expect, it } from "vitest";
import { parseCommercialWallet } from "./commercial-wallet";
import { freeWallet } from "./commercial-wallet.fixture";
const money = {currency:"USD",microusd:10000000};
it("validates honest Free periods and refuses invented Stripe authority",()=>{
 expect(parseCommercialWallet(freeWallet)).toEqual(freeWallet);
 expect(()=>parseCommercialWallet({...freeWallet, subscription_id:"sub_fake"})).toThrow();
 expect(()=>parseCommercialWallet({...freeWallet, commercial_plan:"studio"})).toThrow();
 expect(()=>parseCommercialWallet({...freeWallet, reserved:{...money,microusd:10000001}})).toThrow();
});

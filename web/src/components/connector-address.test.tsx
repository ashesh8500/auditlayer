// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConnectorAddress } from "./connector-address";
it.each([true,false])("copy reports actual clipboard outcome %s and retains selectable URL",async ok=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const writeText=ok?vi.fn().mockResolvedValue(undefined):vi.fn().mockRejectedValue(new Error("denied"));
 Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
 const el=document.createElement("div");const root=createRoot(el);
 await act(async()=>root.render(<ConnectorAddress url="https://alm.test/mcp"/>));
 await act(async()=>el.querySelector("button")!.click());
 expect(writeText).toHaveBeenCalledWith("https://alm.test/mcp");
 expect(el.textContent).toContain(ok?"Copied":"Select and copy");
 expect(el.textContent).toContain("https://alm.test/mcp");
 await act(async()=>root.unmount());
});

import { validate, type ModelOption } from "@/lib/workspace-contracts";

// Documentation candidates only; matches model_execution/catalog.py handoff.
// Neither credentials nor a published provider price constitutes qualification.
export const modelCatalog: readonly ModelOption[] = [
  validate("ModelOption", {
    id: "deepseek-v4-flash", pin: { provider: "deepseek", model: "deepseek-v4-flash", model_version: "DeepSeek-V4-Flash-0731", data_route: "https://api.deepseek.com" },
    availability: "unavailable", unavailable_reason: "Immutable version dispatch and product qualification are not verified.",
    capabilities: { text: true, vision: false, tools: false, structured_output: false }, allowed_tools: [], rate_card_version: null,
  }),
  validate("ModelOption", {
    id: "gpt-5.6-sol", pin: { provider: "openai", model: "gpt-5.6-sol", model_version: "gpt-5.6-sol", data_route: "https://api.openai.com/v1" },
    availability: "unavailable", unavailable_reason: "Product credentials, tokenizer and behavioral qualification are not verified.",
    capabilities: { text: true, vision: false, tools: false, structured_output: false }, allowed_tools: [], rate_card_version: null,
  }),
];
export const enrollment = {
  available: false as const,
  blockers: ["Final retention, expiry and refund terms are not approved.", "Workspace payment configuration and model qualification are not ready."],
};

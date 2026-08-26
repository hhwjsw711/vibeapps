// Shared LLM caller for the AI judge and the spam check. Requests go to the
// hosted Convex AI gateway, which authenticates with the deployment's own
// service token, so this deployment holds no provider API keys.
//
// Model ids are gateway ids in "<provider>/<model>" form.

import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { generateText } from "ai";

export type LlmResult = {
  text: string;
  provider: string;
  model: string;
};

export const DEFAULT_LLM_MODEL = "anthropic/claude-sonnet-4.5";

// Records written before the gateway migration store a bare provider name,
// so splitting the id prefix keeps new rows using the same vocabulary.
function providerOf(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(0, slash);
}

export async function callLlm(
  systemPrompt: string,
  userMessage: string,
  opts: { maxOutputTokens: number; temperature: number },
): Promise<LlmResult> {
  const model = DEFAULT_LLM_MODEL;
  const { text } = await generateText({
    model: convexGateway(model),
    system: systemPrompt,
    prompt: userMessage,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
  });
  if (!text) throw new Error(`Empty response from ${model}`);
  return { text, provider: providerOf(model), model };
}

import { ANTHROPIC_API_MODEL } from "../llm/headers";
import type { LlmProvider } from "../settings/keys";

/** 标题栏/徽章展示的模型名：各 provider 取各自来源。 */
export function resolveModelName(
  provider: LlmProvider,
  openaiModel: string,
  cloudflareModel: string
): string {
  switch (provider) {
    case "api":
      return ANTHROPIC_API_MODEL;
    case "cli":
      return "Claude CLI";
    case "openai":
      return openaiModel;
    case "cloudflare":
      return cloudflareModel;
  }
}

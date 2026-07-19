/**
 * services/data-api/src/features/assistant/chat-client.ts — keyless Azure OpenAI (Foundry) CHAT client for the AI helper
 * (TKT-060). Mirrors services/orchestration/src/adapters/aoai.ts's managed-identity token mint + the AOAI
 * GA v1 `chat/completions` contract, but for a conversational, tool-calling Q&A surface
 * instead of the structured triage classifier.
 *
 * Auth: Entra token via the API app's managed identity (Cognitive Services audience) — the
 * app-service `IDENTITY_ENDPOINT`/`IDENTITY_HEADER` REST contract. The API app MI holds
 * `Cognitive Services OpenAI User` on the Foundry account (granted 2026-07-05).
 *
 * gpt-5 is a REASONING model — no temperature/top_p/penalty/max_tokens; use
 * `max_completion_tokens` + `reasoning_effort` (verified vs Microsoft Learn "Azure OpenAI
 * reasoning models"). Tools are declared with `tools` + `tool_choice:'auto'`; the CALLER
 * owns tool execution and MUST keep every tool READ-ONLY.
 */

import { getManagedIdentityToken, withRetry } from '@cs/server-runtime';

const COGNITIVE_SERVICES_RESOURCE = 'https://cognitiveservices.azure.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_COMPLETION_TOKENS = 1500;

/** Mint (or return the cached) Entra bearer for the Cognitive Services audience. THROWS on
 *  failure — the route wraps this and returns an honest error, never a 500 stack. The MSI
 *  mechanism, per-audience cache and explicit-opt-in az-CLI dev fallback are the shared
 *  `getManagedIdentityToken` primitive's (@cs/server-runtime). */
export async function mintCognitiveToken(): Promise<string> {
  return getManagedIdentityToken(COGNITIVE_SERVICES_RESOURCE, {
    devTokenFallback: { enabledEnv: 'AOAI_DEV_TOKEN', resource: COGNITIVE_SERVICES_RESOURCE },
  });
}

/* ---------- chat completion (tool-calling) ---------- */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** assistant tool-call requests (role:'assistant'). */
  tool_calls?: ToolCall[];
  /** id of the tool call this message answers (role:'tool'). */
  tool_call_id?: string;
}
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
interface ChatCompletionResponse {
  choices?: Array<{ finish_reason?: string; message?: ChatMessage }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Token usage for one round-trip (TKT-113 capacity ledger). */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/** One AOAI chat/completions round-trip. Throws on non-2xx / timeout (caller wraps).
 *  `onUsage` (optional) receives the response's token usage for the capacity ledger. */
export async function chatCompletion(
  endpoint: string,
  deployment: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  onUsage?: (u: TokenUsage) => void,
): Promise<ChatMessage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await mintCognitiveToken();
    const url = `${endpoint.replace(/\/$/, '')}/openai/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: deployment,
      messages,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: 'low',
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AOAI chat ${res.status}: ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as ChatCompletionResponse;
    if (onUsage && json.usage) {
      onUsage({
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
      });
    }
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error('AOAI chat: no message in response');
    return msg;
  } finally {
    clearTimeout(timer);
  }
}

/** How the route supplies read-only tool execution to the loop. */
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Minimal sink for observability — the route passes InvocationContext (ctx.warn). */
export interface ChatLogger {
  warn: (msg: string) => void;
}

export interface RunChatResult {
  reply: string;
  /** Names of tools the model invoked (for audit — never the results). */
  toolsUsed: string[];
  rounds: number;
  /** How many tool calls ultimately failed (after the one retry). 0 on a clean run.
   *  Surfaced as the `toolErrors` audit-lite dimension (TKT-066). */
  toolErrors: number;
  /** Total token usage across all rounds (TKT-113 capacity ledger). 0 when the model
   *  response carried no usage (e.g. the injected test double). */
  usage: TokenUsage;
}

/**
 * Run the assistant to a final text answer, executing any tool calls it requests.
 * Bounded by `maxRounds` so a misbehaving model can't loop forever. Every tool the
 * executor runs MUST be read-only — this loop imposes no writes of its own.
 */
export async function runChat(
  endpoint: string,
  deployment: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  executeTool: ToolExecutor,
  maxRounds = 4,
  /** Injected for unit tests; defaults to the real AOAI call. */
  complete: typeof chatCompletion = chatCompletion,
  /** Optional observability sink — a failing tool warns here (TKT-066). */
  logger?: ChatLogger,
): Promise<RunChatResult> {
  const convo = [...messages];
  const toolsUsed: string[] = [];
  let toolErrors = 0;
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const onUsage = (u: TokenUsage): void => {
    usage.promptTokens += u.promptTokens;
    usage.completionTokens += u.completionTokens;
  };
  for (let round = 1; round <= maxRounds; round++) {
    const msg = await complete(endpoint, deployment, convo, tools, onUsage);
    convo.push(msg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { reply: (msg.content ?? '').trim(), toolsUsed, rounds: round, toolErrors, usage };
    }
    // Execute each requested tool (read-only) and feed results back.
    for (const call of calls) {
      const name = call.function.name;
      toolsUsed.push(name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* malformed args → pass empty; the tool validates */
      }
      let result: unknown;
      try {
        // One retry through the shared bounded-retry primitive (@cs/server-runtime) with a
        // tool-specific "retry any tool error once" predicate: a transient first-attempt failure
        // (e.g. a Postgres cold-connect inside the pool timeout, which carries NO HTTP status)
        // usually clears on an immediate second try. `sleep` is a no-op to keep that retry
        // immediate. This is the ONLY retry layer over the tool executor — no double-retry.
        result = await withRetry(() => executeTool(name, args), {
          maxAttempts: 2,
          shouldRetry: () => true,
          sleep: async () => {},
        });
      } catch (e2) {
        toolErrors += 1;
        const emsg = e2 instanceof Error ? e2.message : 'tool failed';
        // Visible in App Insights (TKT-066) — the failure was previously swallowed unlogged.
        logger?.warn(`[assistant] tool ${name} failed: ${emsg}`);
        result = { error: emsg };
      }
      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }
  // Ran out of rounds — one last non-tool answer attempt.
  const finalMsg = await complete(endpoint, deployment, convo, [], onUsage);
  return { reply: (finalMsg.content ?? '').trim(), toolsUsed, rounds: maxRounds + 1, toolErrors, usage };
}

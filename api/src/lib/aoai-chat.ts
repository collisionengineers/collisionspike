/**
 * api/src/lib/aoai-chat.ts — keyless Azure OpenAI (Foundry) CHAT client for the AI helper
 * (TKT-060). Mirrors orchestration/src/lib/aoai.ts's managed-identity token mint + the AOAI
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

const COGNITIVE_SERVICES_RESOURCE = 'https://cognitiveservices.azure.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_COMPLETION_TOKENS = 1500;

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Mint (or return the cached) Entra bearer for the Cognitive Services audience. THROWS on
 *  failure — the route wraps this and returns an honest error, never a 500 stack. */
export async function mintCognitiveToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const idEndpoint = process.env.IDENTITY_ENDPOINT;
  const idHeader = process.env.IDENTITY_HEADER;
  if (idEndpoint && idHeader) {
    const url = `${idEndpoint}?resource=${encodeURIComponent(COGNITIVE_SERVICES_RESOURCE)}&api-version=2019-08-01`;
    const res = await fetch(url, { headers: { 'X-IDENTITY-HEADER': idHeader } });
    if (!res.ok) throw new Error(`MSI token (cognitiveservices) ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_on?: string };
    cachedToken = {
      value: json.access_token,
      expiresAt: json.expires_on ? Number(json.expires_on) * 1000 : now + 3_300_000,
    };
    return cachedToken.value;
  }
  // Local dev only, explicit opt-in — the operator's own az session (mirrors aoai.ts).
  if (process.env.AOAI_DEV_TOKEN === '1') {
    const { execFile } = await import('node:child_process');
    const token = await new Promise<string>((resolve, reject) => {
      execFile(
        'az',
        ['account', 'get-access-token', '--resource', COGNITIVE_SERVICES_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
        (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
      );
    });
    if (!token) throw new Error('az account get-access-token returned no token');
    cachedToken = { value: token, expiresAt: now + 3_000_000 };
    return token;
  }
  throw new Error('missing IDENTITY_ENDPOINT/IDENTITY_HEADER for Cognitive Services auth');
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
        result = await executeTool(name, args);
      } catch {
        // One retry — a transient first-attempt failure (e.g. a Postgres cold-connect
        // inside the 5s pool timeout) usually clears on an immediate second try.
        try {
          result = await executeTool(name, args);
        } catch (e2) {
          toolErrors += 1;
          const emsg = e2 instanceof Error ? e2.message : 'tool failed';
          // Visible in App Insights (TKT-066) — the failure was previously swallowed unlogged.
          logger?.warn(`[assistant] tool ${name} failed: ${emsg}`);
          result = { error: emsg };
        }
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

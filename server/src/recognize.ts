import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { INSTRUCTIONS, RecognizedProductSchema, sanitize, type RecognizedProduct } from "./schema.js";
import type { Usage } from "./limits.js";

export type RecognizeConfig = {
  model: string;
  detail: "low" | "high" | "auto";
  reasoningEffort: "none" | "low" | "medium" | "high" | null;
  maxOutputTokens: number;
};

export type RecognizeErrorCode =
  | "refused"
  | "incomplete"
  | "malformed"
  | "timeout"
  | "busy"
  | "unavailable"
  | "rejected"
  | "misconfigured";

export type RecognizeResult =
  | { ok: true; product: RecognizedProduct; usage?: Usage }
  | { ok: false; code: RecognizeErrorCode; usage?: Usage };

type ResponsesClient = { responses: { create: (body: never, options?: { signal?: AbortSignal }) => Promise<unknown> } };

type RawResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

const FORMAT = zodTextFormat(RecognizedProductSchema, "recognized_product");

function usageOf(response: RawResponse): Usage | undefined {
  if (!response.usage) return undefined;
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

export function requestBody(config: RecognizeConfig, dataUrl: string) {
  return {
    model: config.model,
    store: false,
    instructions: INSTRUCTIONS,
    input: [
      {
        role: "user" as const,
        content: [
          { type: "input_text" as const, text: "Welk product staat op deze foto?" },
          { type: "input_image" as const, image_url: dataUrl, detail: config.detail },
        ],
      },
    ],
    text: { format: { type: FORMAT.type, name: FORMAT.name, strict: true, schema: FORMAT.schema } },
    max_output_tokens: config.maxOutputTokens,
    ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
  };
}

export function interpret(response: RawResponse): RecognizeResult {
  const usage = usageOf(response);
  const parts = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === "refusal")) return { ok: false, code: "refused", usage };
  if (response.status === "incomplete") {
    return { ok: false, code: response.incomplete_details?.reason === "content_filter" ? "refused" : "incomplete", usage };
  }
  if (response.status && response.status !== "completed") return { ok: false, code: "unavailable", usage };
  const text = parts.find((part) => part.type === "output_text")?.text;
  if (!text) return { ok: false, code: "malformed", usage };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "malformed", usage };
  }
  const parsed = RecognizedProductSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "malformed", usage };
  return { ok: true, product: sanitize(parsed.data), usage };
}

export function errorCode(error: unknown): RecognizeErrorCode {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof OpenAI.RateLimitError) return "busy";
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError || error instanceof OpenAI.NotFoundError) {
    return "misconfigured";
  }
  if (error instanceof OpenAI.BadRequestError || error instanceof OpenAI.UnprocessableEntityError) return "rejected";
  return "unavailable";
}

export async function recognizePhoto(client: ResponsesClient, config: RecognizeConfig, dataUrl: string): Promise<RecognizeResult> {
  try {
    const response = (await client.responses.create(requestBody(config, dataUrl) as never)) as RawResponse;
    return interpret(response);
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

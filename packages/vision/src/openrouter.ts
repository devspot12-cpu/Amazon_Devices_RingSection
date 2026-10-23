import type { FrameInput } from './index.js';

/**
 * OpenRouter adapter: one screenshot in, one JSON verdict out.
 * One call per captured frame - used first by the video dev flow
 * (`/video`, a stand-in for a Ring feed) and reusable by the Ring
 * capture pipeline, which already produces the same kind of frame.
 *
 * The model is not hardcoded: it comes from the OPENROUTER_VISION_MODEL
 * environment variable. If that model is a mandatory reasoning model, we
 * ask for low effort and a generous token budget - otherwise the reasoning
 * pass can consume the whole completion and leave no JSON behind.
 */
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const OPENROUTER_SPECIES_PROMPT =
  'You are identifying an animal in a single camera screenshot. ' +
  'Reply with ONLY a JSON object: {"species": the common name of the animal in lowercase ' +
  '(e.g. fox, coyote, raccoon, opossum, deer, dog, cat, bear, bird, elephant, or unknown), ' +
  '"confidence": a number from 0 to 1, "peopleOnly": true only when the frame contains people and no animal}. ' +
  'Use "unknown" when no animal is clearly identifiable.';

export interface OpenRouterClassification {
  /** Free-form common name (lowercase), or 'unknown'. Not limited to the Ring predator list. */
  species: string;
  confidence: number;
  model: string;
  peopleOnly: boolean;
  status: 'done';
}

export interface OpenRouterClassifierOptions {
  apiKey: string;
  /** Model ID (e.g. from OPENROUTER_VISION_MODEL). There is no built-in default. */
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletionBody {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning?: unknown;
      reasoning_details?: Array<{ text?: unknown; summary?: unknown }>;
    };
  }>;
  error?: { message?: unknown };
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function firstJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Vision reply contained no JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Vision reply contained no complete JSON object');
}

export function parseOpenRouterReply(text: string, modelId: string): OpenRouterClassification {
  const parsed: unknown = JSON.parse(firstJsonObject(text));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('OpenRouter reply for ' + modelId + ' was not a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const rawSpecies = typeof record.species === 'string' ? record.species.trim().toLowerCase() : '';
  return {
    species: rawSpecies !== '' ? rawSpecies : 'unknown',
    confidence: clampConfidence(record.confidence),
    model: modelId,
    peopleOnly: record.peopleOnly === true,
    status: 'done',
  };
}

function messageText(body: unknown): string {
  const message = (body as ChatCompletionBody | null)?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string' && content.trim() !== '') return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part
          ? String((part as { text: unknown }).text ?? '')
          : '',
      )
      .join('');
    if (joined.trim() !== '') return joined;
  }
  // Some reasoning models put the answer in the reasoning channel when the
  // content channel is empty. Accept it as a last resort.
  if (typeof message?.reasoning === 'string' && message.reasoning.trim() !== '') {
    return message.reasoning;
  }
  if (Array.isArray(message?.reasoning_details)) {
    const joined = message.reasoning_details
      .map((part) => String(part?.text ?? part?.summary ?? ''))
      .join('');
    if (joined.trim() !== '') return joined;
  }
  throw new Error('OpenRouter reply contained no message content');
}

async function describeFailure(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  try {
    const raw = await response.text();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as ChatCompletionBody;
      const message = parsed.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return `${fallback}: ${message}`;
      }
    } catch {
      // Not JSON - fall through to the raw snippet.
    }
    return `${fallback}: ${raw.slice(0, 300)}`;
  } catch {
    return fallback;
  }
}

export class OpenRouterSpeciesClassifier {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OpenRouterClassifierOptions) {
    if (!options.apiKey || options.apiKey.trim() === '') {
      throw new Error('OPENROUTER_API_KEY must be set');
    }
    const model = options.model.trim();
    if (model === '') {
      throw new Error('OPENROUTER_VISION_MODEL must be set to a vision-capable model ID');
    }
    const baseUrl = (options.baseUrl || DEFAULT_OPENROUTER_BASE_URL).trim();
    if (
      !/^https:\/\//i.test(baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl)
    ) {
      throw new Error('OPENROUTER_BASE_URL must start with https://');
    }
    this.apiKey = options.apiKey;
    this.modelId = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    // Reasoning models can take a while on the free tier.
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async classify(frame: FrameInput): Promise<OpenRouterClassification> {
    const base64 = Buffer.from(frame.bytes).toString('base64');
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'x-title': 'Predator Guard',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: OPENROUTER_SPECIES_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${frame.contentType};base64,${base64}` },
              },
            ],
          },
        ],
        max_tokens: 2_048,
        temperature: 0,
        reasoning: { effort: 'low' },
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter vision request failed (${await describeFailure(response)})`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('OpenRouter vision reply was not JSON');
    }
    return parseOpenRouterReply(messageText(body), this.modelId);
  }
}

export function openRouterClassifierFromEnv(
  env: Record<string, string | undefined>,
): OpenRouterSpeciesClassifier {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY must be set');
  const model = env.OPENROUTER_VISION_MODEL?.trim();
  if (!model) throw new Error('OPENROUTER_VISION_MODEL must be set');
  return new OpenRouterSpeciesClassifier({
    apiKey,
    model,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || undefined,
  });
}

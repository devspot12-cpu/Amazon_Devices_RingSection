import type { FrameInput } from './index.js';

/**
 * OpenRouter adapter: one screenshot in, one JSON verdict out.
 * One call per captured frame - used first by the video dev flow
 * (`/video`, a stand-in for a Ring feed) and reusable by the Ring
 * capture pipeline, which already produces the same kind of frame.
 */
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_VISION_MODEL = 'openai/gpt-4o-mini';

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
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: unknown } }>;
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

function replyText(body: unknown): string {
  const choices = (body as ChatCompletionBody | null)?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part
          ? String((part as { text: unknown }).text ?? '')
          : '',
      )
      .join('');
  }
  throw new Error('OpenRouter reply contained no message content');
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
    const baseUrl = (options.baseUrl || DEFAULT_OPENROUTER_BASE_URL).trim();
    if (
      !/^https:\/\//i.test(baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl)
    ) {
      throw new Error('OPENROUTER_BASE_URL must start with https://');
    }
    this.apiKey = options.apiKey;
    this.modelId = options.model || DEFAULT_OPENROUTER_VISION_MODEL;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
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
        max_tokens: 120,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter vision request failed (HTTP ${response.status})`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('OpenRouter vision reply was not JSON');
    }
    return parseOpenRouterReply(replyText(body), this.modelId);
  }
}

export function openRouterClassifierFromEnv(
  env: Record<string, string | undefined>,
): OpenRouterSpeciesClassifier {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY must be set');
  return new OpenRouterSpeciesClassifier({
    apiKey,
    model: env.OPENROUTER_VISION_MODEL?.trim() || undefined,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || undefined,
  });
}

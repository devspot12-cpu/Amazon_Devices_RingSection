import type { Classification } from './index.js';
import { SPECIES, type Species } from '@predator-guard/ring';

/**
 * Shared species prompt + reply parser.
 *
 * Expected reply: {"species":"fox","confidence":0.91,"peopleOnly":false}
 * Both the OpenRouter and OpenCode adapters use this shape.
 */
export const SPECIES_PROMPT =
  'You are the species stage of a farm predator alarm. Look at this Ring camera photo. ' +
  'Reply with ONLY a JSON object: {"species": one of fox|coyote|raccoon|opossum|dog|deer|unknown, ' +
  '"confidence": a number from 0 to 1, "peopleOnly": true only when the frame contains people and no animal}. ' +
  'Use "unknown" when no animal is clearly identifiable.';

const KNOWN_SPECIES: ReadonlySet<string> = new Set(SPECIES);

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

export function parseSpeciesReply(text: string, modelId: string): Classification {
  const parsed: unknown = JSON.parse(firstJsonObject(text));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Vision reply for ' + modelId + ' was not a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const rawSpecies = typeof record.species === 'string' ? record.species.trim().toLowerCase() : '';
  const species = KNOWN_SPECIES.has(rawSpecies) ? (rawSpecies as Species) : 'unknown';
  return {
    species,
    confidence: clampConfidence(record.confidence),
    model: modelId,
    peopleOnly: record.peopleOnly === true,
    status: 'done',
  };
}

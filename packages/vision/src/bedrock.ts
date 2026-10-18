import type { Classification, FrameInput, SpeciesClassifier } from './index.js';
import { SPECIES, type Species } from '@predator-guard/ring';

/**
 * Amazon Bedrock adapter for F5.
 * Model ids come from the environment - BEDROCK_MODEL_ID_FAST (Stage 2) and
 * BEDROCK_MODEL_ID_STRONG (Stage 3) - so fast/strong are swappable without a
 * code change (F5 criterion 4). The AWS call itself is injected as `invoke`,
 * which keeps this package free of an AWS SDK dependency and lets tests drive
 * the exact same parsing code with canned Bedrock replies.
 * Expected model reply: {"species":"fox","confidence":0.91,"peopleOnly":false}
 */

export interface BedrockInvokeInput {
  modelId: string;
  image: Uint8Array;
  contentType: FrameInput['contentType'];
  prompt: string;
}

export type BedrockInvoke = (input: BedrockInvokeInput) => Promise<string>;

export const SPECIES_PROMPT =
  'You are the species stage of a farm predator alarm. Look at this Ring camera photo. ' +
  'Reply with ONLY a JSON object: {"species": one of fox|coyote|raccoon|opossum|dog|deer|unknown, ' +
  '"confidence": a number from 0 to 1, "peopleOnly": true only when the frame contains people and no animal}. ' +
  'Use "unknown" when no animal is clearly identifiable.';

const KNOWN_SPECIES: ReadonlySet<string> = new Set(SPECIES);

export function parseBedrockReply(text: string, modelId: string): Classification {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Bedrock reply for ' + modelId + ' contained no JSON object');
  const parsed: unknown = JSON.parse(match[0]);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Bedrock reply for ' + modelId + ' was not a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const species =
    typeof record.species === 'string' && KNOWN_SPECIES.has(record.species)
      ? (record.species as Species)
      : 'unknown';
  return {
    species,
    confidence: typeof record.confidence === 'number' ? record.confidence : 0,
    model: modelId,
    peopleOnly: record.peopleOnly === true,
    status: 'done',
  };
}

export class BedrockSpeciesClassifier implements SpeciesClassifier {
  constructor(
    readonly modelId: string,
    private readonly invoke: BedrockInvoke,
    private readonly prompt: string = SPECIES_PROMPT,
  ) {}
  async classify(frame: FrameInput): Promise<Classification> {
    const text = await this.invoke({
      modelId: this.modelId,
      image: frame.bytes,
      contentType: frame.contentType,
      prompt: this.prompt,
    });
    return parseBedrockReply(text, this.modelId);
  }
}

export interface BedrockClassifiers {
  fast: BedrockSpeciesClassifier;
  strong: BedrockSpeciesClassifier;
}

export function bedrockClassifiersFromEnv(
  env: Record<string, string | undefined>,
  invoke: BedrockInvoke,
): BedrockClassifiers {
  const fastModel = env.BEDROCK_MODEL_ID_FAST;
  const strongModel = env.BEDROCK_MODEL_ID_STRONG;
  if (!fastModel || !strongModel) {
    throw new Error('BEDROCK_MODEL_ID_FAST and BEDROCK_MODEL_ID_STRONG must both be set');
  }
  return {
    fast: new BedrockSpeciesClassifier(fastModel, invoke),
    strong: new BedrockSpeciesClassifier(strongModel, invoke),
  };
}

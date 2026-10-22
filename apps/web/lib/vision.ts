import type { Classification, FrameInput } from '@predator-guard/vision';
import { OpenRouterSpeciesClassifier } from '@predator-guard/vision/openrouter';

import { loadConfig } from './config';



export interface AnimalVerdict extends Classification {
  reason?: string;
}

interface Provider {
  readonly modelId: string;
  classify(frame: FrameInput): Promise<Classification>;
}

function openRouterProvider(): Provider | null {
  const config = loadConfig();
  if (!config.openRouterApiKey) return null;
  try {
    return new OpenRouterSpeciesClassifier({
      apiKey: config.openRouterApiKey,
      model: config.openRouterModel,
      baseUrl: config.openRouterBaseUrl,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        stage: 'vision.openrouter_invalid',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Identify the animal in one frame. `null` = no model configured. */
export async function classifyAnimal(input: {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
}): Promise<AnimalVerdict | null> {
  const frame: FrameInput = { bytes: input.bytes, contentType: input.contentType };
  const providers: Provider[] = [openRouterProvider()].filter(
    (provider): provider is Provider => provider !== null,
  );
  if (providers.length === 0) return null;

  for (const provider of providers) {
    try {
      const result = await provider.classify(frame);
      const confidence = clamp01(result.confidence);
      console.info(
        JSON.stringify({
          stage: 'vision.done',
          model: result.model,
          species: result.species,
          confidence,
          peopleOnly: result.peopleOnly,
        }),
      );
      return { ...result, confidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        JSON.stringify({ stage: 'vision.provider_failed', model: provider.modelId, error: message }),
      );
    }
  }

  // The provider failed - fail open so the frame is still shown.
  return {
    species: 'unknown',
    confidence: 0,
    model: providers.map((provider) => provider.modelId).join(' -> '),
    peopleOnly: false,
    status: 'fallback',
    reason: 'Animal check failed - please review the frame yourself.',
  };
}

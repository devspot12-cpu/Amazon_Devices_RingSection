import { describe, expect, it } from 'vitest';
import { VisionFunnel, createClassifier, type Classification, type FrameInput, type SpeciesClassifier } from './index.js';
import { BedrockSpeciesClassifier, bedrockClassifiersFromEnv, parseBedrockReply } from './bedrock.js';

const frame: FrameInput = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg', eventId: 'evt-1' };

function fake(modelId: string, result: Partial<Classification> | Error) {
  const classifier = {
    modelId,
    calls: 0,
    async classify(): Promise<Classification> {
      classifier.calls += 1;
      if (result instanceof Error) throw result;
      return { species: 'unknown' as const, confidence: 0, model: modelId, peopleOnly: false, status: 'done' as const, ...result };
    },
  };
  return classifier;
}

describe('VisionFunnel - identifying the animal from a photo', () => {
  it('returns fox with confidence from the fast stage when it is sure', async () => {
    const fast = fake('fast-v1', { species: 'fox', confidence: 0.91 });
    await expect(new VisionFunnel(fast).classify(frame)).resolves.toMatchObject({ species: 'fox', confidence: 0.91, model: 'fast-v1', status: 'done' });
  });
  it('tells the farm dog from a predator: dog stays dog', async () => {
    const fast = fake('fast-v1', { species: 'dog', confidence: 0.88 });
    await expect(createClassifier(fast).classify(frame)).resolves.toMatchObject({ species: 'dog' });
  });
  it('escalates a low-confidence result to the strong model exactly once', async () => {
    const fast = fake('fast-v1', { species: 'unknown', confidence: 0.4 });
    const strong = fake('strong-v1', { species: 'coyote', confidence: 0.93 });
    await expect(new VisionFunnel(fast, strong).classify(frame)).resolves.toMatchObject({ species: 'coyote', confidence: 0.93, model: 'strong-v1' });
    expect(strong.calls).toBe(1);
  });
  it('does not escalate when the fast stage is already confident', async () => {
    const fast = fake('fast-v1', { species: 'raccoon', confidence: 0.95 });
    const strong = fake('strong-v1', { species: 'fox', confidence: 0.99 });
    await new VisionFunnel(fast, strong).classify(frame);
    expect(strong.calls).toBe(0);
  });
  it('drops people-only frames and never escalates them', async () => {
    const fast = fake('fast-v1', { species: 'unknown', confidence: 0.2, peopleOnly: true });
    const strong = fake('strong-v1', { species: 'fox', confidence: 0.99 });
    await expect(new VisionFunnel(fast, strong).classify(frame)).resolves.toMatchObject({ peopleOnly: true });
    expect(strong.calls).toBe(0);
  });
  it('fails open to unknown on a vision error - the event is never dropped', async () => {
    const fast = fake('fast-v1', new Error('bedrock throttled'));
    await expect(new VisionFunnel(fast).classify(frame)).resolves.toMatchObject({ species: 'unknown', confidence: 0, status: 'fallback' });
  });
  it('fails open on a timeout', async () => {
    const slow: SpeciesClassifier = { modelId: 'slow-v1', classify: () => new Promise<Classification>(() => undefined) };
    await expect(new VisionFunnel(slow, undefined, { timeoutMs: 5 }).classify(frame)).resolves.toMatchObject({ species: 'unknown', status: 'fallback' });
  });
  it('clamps out-of-range confidence into [0, 1]', async () => {
    const fast = fake('fast-v1', { species: 'deer', confidence: 7 });
    await expect(new VisionFunnel(fast).classify(frame)).resolves.toMatchObject({ confidence: 1 });
  });
});

describe('Bedrock adapter', () => {
  it('parses a species reply and maps unknown species values to unknown', () => {
    expect(parseBedrockReply('{"species":"fox","confidence":0.91,"peopleOnly":false}', 'm1')).toMatchObject({ species: 'fox', confidence: 0.91 });
    expect(parseBedrockReply('{"species":"bobcat","confidence":0.9}', 'm1').species).toBe('unknown');
    expect(parseBedrockReply('{"species":"dog","confidence":0.8,"peopleOnly":true}', 'm1').peopleOnly).toBe(true);
  });
  it('drives classify() through the injected Bedrock invoke', async () => {
    const classifier = new BedrockSpeciesClassifier('fast-v1', async ({ modelId }) => {
      expect(modelId).toBe('fast-v1');
      return '{"species":"opossum","confidence":0.77,"peopleOnly":false}';
    });
    await expect(classifier.classify(frame)).resolves.toMatchObject({ species: 'opossum', confidence: 0.77 });
  });
  it('builds both stages from env model ids and fails loudly when unset', () => {
    const invoke = async () => '{"species":"unknown","confidence":0,"peopleOnly":false}';
    const built = bedrockClassifiersFromEnv({ BEDROCK_MODEL_ID_FAST: 'fast-v1', BEDROCK_MODEL_ID_STRONG: 'strong-v1' }, invoke);
    expect(built.fast.modelId).toBe('fast-v1');
    expect(built.strong.modelId).toBe('strong-v1');
    expect(() => bedrockClassifiersFromEnv({}, invoke)).toThrow(/BEDROCK_MODEL_ID_FAST/);
  });
});

import type { BedrockInvoke } from '@predator-guard/vision/bedrock';

/**
 * AWS Bedrock invoke for the fallback classifier.
 *
 * The AWS SDK is imported lazily so it only loads when Bedrock is actually
 * configured (`BEDROCK_MODEL_ID`), keeping it out of the OpenRouter-only
 * path. Credentials come from the standard AWS chain (env keys, profile...).
 *
 * The reply text is extracted from both shapes the common models answer
 * with: Anthropic (`{content:[{text}]}`) and Amazon Titan (`{outputText}`).
 * Whatever is returned still has to contain the JSON verdict that
 * `parseBedrockReply` looks for.
 */

export interface PreparedBedrock {
  modelId: string;
  invoke: BedrockInvoke;
}

interface BedrockBody {
  outputText?: unknown;
  content?: Array<{ text?: unknown }>;
}

function extractText(raw: string): string {
  let body: BedrockBody;
  try {
    body = JSON.parse(raw) as BedrockBody;
  } catch {
    return raw;
  }
  if (typeof body.outputText === 'string') return body.outputText;
  const first = Array.isArray(body.content) ? body.content[0] : undefined;
  if (first && typeof first.text === 'string') return first.text;
  return raw;
}

export function bedrockInvokeFromEnv(): PreparedBedrock | null {
  const config = loadBedrockConfig();
  if (!config) return null;
  return {
    modelId: config.modelId,
    invoke: async ({ modelId, image, contentType, prompt }) => {
      const { BedrockRuntimeClient, InvokeModelCommand } = await import(
        '@aws-sdk/client-bedrock-runtime'
      );
      const client = new BedrockRuntimeClient({ region: config.region });
      const response = await client.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            ...(modelId.includes('anthropic')
              ? { anthropic_version: '2023-06-01', max_tokens: 300, temperature: 0 }
              : { inferenceConfig: { maxNewTokens: 300, temperature: 0 } }),
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: contentType,
                      data: Buffer.from(image).toString('base64'),
                    },
                  },
                ],
              },
            ],
          }),
        }),
      );
      const bytes = response.body;
      return extractText(new TextDecoder().decode(bytes));
    },
  };
}

interface BedrockEnvConfig {
  modelId: string;
  region: string;
}

function loadBedrockConfig(): BedrockEnvConfig | null {
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  if (!modelId) return null;
  const region =
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    process.env.BEDROCK_REGION?.trim() ||
    'us-east-1';
  return { modelId, region };
}

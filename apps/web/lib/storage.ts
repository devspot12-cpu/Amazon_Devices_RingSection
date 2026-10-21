import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Object storage for uploaded media and captured frames.
 *
 * Every file is kept in the S3-compatible bucket ("assets" on the configured
 * endpoint by default); the database only holds the object key. The bucket
 * stays private: reads go through a short-lived presigned URL that
 * `app/api/captures/[id]` and `app/api/media/[id]` hand to the browser.
 *
 * Without credentials the app still works - frames are analysed and saved,
 * they are just not kept as pictures, and the dashboard says so.
 */

/** How long a presigned read link stays valid. */
export const READ_URL_TTL_SECONDS = 300;

/**
 * The demo bucket. The name is not a secret, and a mangled dashboard value
 * took the uploads down once already, so it has a default here. The endpoint
 * (`AWS_ENDPOINT_URL_S3`) and the region (`AWS_REGION`) still come from the
 * environment.
 */
const DEMO_BUCKET = 'aws-demo';

const EDGE_QUOTES = /^['"`\u2018\u2019\u201c\u201d]+|['"`\u2018\u2019\u201c\u201d]+$/g;

export interface StorageSettings {
  /** Custom endpoint (S3-compatible provider). Undefined = real AWS S3. */
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  /** Path-style addressing (`host/bucket/key`), the safe default for a custom endpoint. */
  forcePathStyle: boolean;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  if (!raw) return undefined;
  // Values pasted from a .env line keep their quotes on Vercel, because dotenv
  // strips them but the dashboard stores the text verbatim; a copy-paste can
  // also drag in the variable name or a newline. None of these values may
  // contain spaces, so the whitespace is dropped rather than trimmed.
  let value = raw.replace(/\s+/g, '').replace(EDGE_QUOTES, '');
  const prefix = `${name}=`;
  if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
    value = value.slice(prefix.length).replace(EDGE_QUOTES, '');
  }
  return value !== '' ? value : undefined;
}

/** A parsed `https://host` endpoint, or undefined when the value is unusable. */
function readEndpoint(env: NodeJS.ProcessEnv): string | undefined {
  const value = readEnv(env, 'AWS_ENDPOINT_URL_S3') ?? readEnv(env, 'AWS_ENDPOINT_URL');
  if (!value) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

/** The storage settings, read from the environment. */
export function storageSettings(env: NodeJS.ProcessEnv = process.env): StorageSettings {
  return {
    endpoint: readEndpoint(env),
    region: readEnv(env, 'AWS_REGION') ?? 'us-east-1',
    bucket: readEnv(env, 'AWS_S3_BUCKET') ?? DEMO_BUCKET,
    accessKeyId: readEnv(env, 'AWS_ACCESS_KEY_ID'),
    secretAccessKey: readEnv(env, 'AWS_SECRET_ACCESS_KEY'),
    forcePathStyle: readEnv(env, 'AWS_S3_FORCE_PATH_STYLE') !== 'false',
  };
}

/** True when there are enough credentials to talk to the bucket. */
export function storageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const settings = storageSettings(env);
  return Boolean(settings.accessKeyId && settings.secretAccessKey);
}

let cached: { fingerprint: string; client: S3Client } | null = null;

/** One client per configuration; the SDK handles the connection pooling. */
function s3Client(settings: StorageSettings): S3Client {
  const fingerprint = [
    settings.endpoint,
    settings.region,
    settings.accessKeyId,
    settings.secretAccessKey,
    settings.forcePathStyle,
  ].join('|');
  if (cached && cached.fingerprint === fingerprint) return cached.client;
  const client = new S3Client({
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    // The default integrity headers (`x-amz-checksum-crc32` on the upload,
    // `x-amz-checksum-mode` on the download) are an AWS S3 feature; other
    // S3-compatible servers reject them. The bucket is a plain object
    // store, so the checksums are left to the server.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    ...(settings.accessKeyId && settings.secretAccessKey
      ? {
          credentials: {
            accessKeyId: settings.accessKeyId,
            secretAccessKey: settings.secretAccessKey,
          },
        }
      : {}),
  });
  cached = { fingerprint, client };
  return client;
}

/** Put one object into the bucket. */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const settings = storageSettings();
  await s3Client(settings).send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Remove one object - used when the database row cannot be written. */
export async function deleteObject(key: string): Promise<void> {
  const settings = storageSettings();
  await s3Client(settings).send(
    new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }),
  );
}

/** A short-lived link that reads one object back. */
export async function signedObjectUrl(
  key: string,
  expiresInSeconds: number = READ_URL_TTL_SECONDS,
): Promise<string> {
  const settings = storageSettings();
  return getSignedUrl(
    s3Client(settings),
    new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/** The object key of one capture, derived from the detection it belongs to. */
export function captureKey(detectionId: string, contentType: string): string {
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  return `captures/${detectionId}.${extension}`;
}

/** Put one captured frame into the bucket. */
export async function putCapture(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await putObject(key, body, contentType);
}

/** A short-lived link that reads one captured frame. */
export async function signedCaptureUrl(
  key: string,
  expiresInSeconds: number = READ_URL_TTL_SECONDS,
): Promise<string> {
  return signedObjectUrl(key, expiresInSeconds);
}

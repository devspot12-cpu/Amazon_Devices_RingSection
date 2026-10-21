/**
 * Read-only report of what the app stored in Postgres and in the bucket.
 *
 *   npm run storage:inspect
 *
 * It does not upload or delete anything. Use it after a UI test to confirm:
 *   - media_uploads rows point at objects that really exist,
 *   - detections.image_key points at a real frame,
 *   - the bucket is reachable with the configured credentials.
 */

import { HeadBucketCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import postgres from 'postgres';

const REQUIRED = [
  'DATABASE_URL',
  'AWS_ENDPOINT_URL_S3',
  'AWS_S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
];

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing env values: ${missing.join(', ')}`);
  console.error('Run through npm run storage:inspect (it loads .env.local at the repository root).');
  process.exit(1);
}

const bucket = process.env.AWS_S3_BUCKET;
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE !== 'false',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/** All keys under one prefix, following continuation tokens. */
async function listKeys(prefix) {
  const objects = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

function bytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function main() {
  console.log(`Endpoint : ${process.env.AWS_ENDPOINT_URL_S3}`);
  console.log(`Bucket   : ${bucket}`);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('Bucket   : reachable');
  } catch (err) {
    console.log(`Bucket   : NOT reachable (${err.name})`);
  }
  console.log('');

  const migrations = await sql`
    SELECT id FROM "schema_migrations" WHERE id = '0007_media_uploads'`;
  console.log(
    `Migration 0007_media_uploads: ${migrations.length > 0 ? 'applied' : 'MISSING'}`,
  );

  const [counts] = await sql`
    SELECT
      (SELECT count(*)::int FROM "detections") AS detections,
      (SELECT count(*)::int FROM "detections" WHERE "image_key" IS NOT NULL) AS detections_with_frame,
      (SELECT count(*)::int FROM "media_uploads") AS media,
      (SELECT count(*)::int FROM "media_uploads" WHERE "detection_id" IS NOT NULL) AS media_linked`;

  console.log('');
  console.log('Database');
  console.log(`  detections          : ${counts.detections} (${counts.detections_with_frame} with a frame)`);
  console.log(`  media_uploads       : ${counts.media} (${counts.media_linked} linked to a detection)`);

  const media = await sql`
    SELECT id, detection_id, kind, filename, size_bytes, object_key, created_at
    FROM "media_uploads"
    ORDER BY created_at DESC
    LIMIT 20`;
  console.log('');
  console.log('Recent media_uploads');
  if (media.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of media) {
      console.log(
        `  ${iso(row.created_at)}  ${row.kind.padEnd(5)} ${bytes(row.size_bytes).padStart(9)}  ${row.object_key}`,
      );
      console.log(
        `    media=${row.id} detection=${row.detection_id ?? '(unlinked)'} file=${row.filename}`,
      );
    }
  }

  const detections = await sql`
    SELECT id, species, animal_score, danger_type, image_key, captured_at
    FROM "detections"
    ORDER BY captured_at DESC
    LIMIT 20`;
  console.log('');
  console.log('Recent detections');
  if (detections.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of detections) {
      console.log(
        `  ${iso(row.captured_at)}  ${String(row.species).padEnd(14)} score=${String(row.animal_score).padStart(3)}  ${row.danger_type.padEnd(9)}  ${row.image_key ?? '(no frame)'}`,
      );
      console.log(`    detection=${row.id}`);
    }
  }

  const uploads = await listKeys('uploads/');
  const captures = await listKeys('captures/');
  const uploadTotal = uploads.reduce((sum, object) => sum + (object.Size ?? 0), 0);
  const captureTotal = captures.reduce((sum, object) => sum + (object.Size ?? 0), 0);

  console.log('');
  console.log('Bucket objects');
  console.log(`  uploads/ : ${uploads.length} object(s), ${bytes(uploadTotal)}`);
  console.log(`  captures/: ${captures.length} object(s), ${bytes(captureTotal)}`);

  const uploadKeys = new Set(uploads.map((object) => object.Key));
  const captureKeys = new Set(captures.map((object) => object.Key));

  console.log('');
  console.log('Reference check (recent 20 rows)');
  let problems = 0;
  for (const row of media) {
    if (uploadKeys.has(row.object_key)) {
      console.log(`  OK   ${row.object_key}`);
    } else {
      problems += 1;
      console.log(`  MISS ${row.object_key}  (media ${row.id} points at a missing object)`);
    }
  }
  for (const row of detections) {
    if (!row.image_key) continue;
    if (captureKeys.has(row.image_key)) {
      console.log(`  OK   ${row.image_key}`);
    } else {
      problems += 1;
      console.log(`  MISS ${row.image_key}  (detection ${row.id} points at a missing object)`);
    }
  }
  console.log(problems === 0 ? '  All checked keys exist.' : `  ${problems} broken reference(s).`);
}

main()
  .catch((err) => {
    console.error('Inspection failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());

import { REGIONS } from '@predator-guard/rules';

import { siteUrl } from '@/lib/site';

/**
 * /openapi.json - machine-readable description of the JSON API, so AI agents
 * and tools can call it without reading the source. Keep in step with app/api/*.
 */
const error = { $ref: '#/components/schemas/Error' };
const json = (schema: object) => ({ 'application/json': { schema } });
const errors = {
  '400': { description: 'Invalid request', content: json(error) },
  '500': { description: 'Unexpected error', content: json(error) },
};
const uuidParam = (name: string, where: 'path' | 'query') => ({
  name,
  in: where,
  required: true,
  schema: { type: 'string', format: 'uuid' },
});

export function GET(): Response {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Predator Guard API',
      version: '1.0.0',
      description:
        'Identify the animal in a camera frame and rate how dangerous it is for the farm. Animal ID is an estimate - check the frame before acting. Site guide: /llms.txt',
    },
    servers: [{ url: siteUrl() }],
    paths: {
      '/api/health': {
        get: {
          summary: 'Liveness probe',
          responses: { '200': { description: 'Service is up', content: json({ type: 'object', properties: { status: { const: 'ok' }, service: { type: 'string' } } }) } },
        },
      },
      '/api/farm': {
        get: {
          summary: 'Farm profile and the list of supported US regions',
          responses: { '200': { description: 'Farm + regions', content: json({ type: 'object', properties: { farm: { type: ['object', 'null'], properties: { id: { type: 'string' }, region: { type: 'string' }, updatedAt: { type: 'string', format: 'date-time' } } }, regions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, states: { type: 'array', items: { type: 'string' } }, blurb: { type: 'string' } } } } } }) }, ...errors },
        },
        post: {
          summary: 'Set the farm region (tunes the danger rules to local predators)',
          requestBody: { required: true, content: json({ type: 'object', required: ['region'], properties: { region: { type: 'string', enum: REGIONS.map((r) => r.id) } } }) },
          responses: { '200': { description: 'Saved farm', content: json({ type: 'object' }) }, ...errors },
        },
      },
      '/api/cameras': {
        get: {
          summary: 'List cameras of the current region',
          responses: { '200': { description: 'Cameras', content: json({ type: 'object', properties: { cameras: { type: 'array', items: { $ref: '#/components/schemas/Camera' } }, farm: { type: 'object', properties: { region: { type: 'string' } } } } }) }, ...errors },
        },
        post: {
          summary: 'Register (or re-zone) a camera',
          requestBody: { required: true, content: json({ type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, zoneKind: { $ref: '#/components/schemas/ZoneKind' } } }) },
          responses: { '201': { description: 'Created', content: json({ type: 'object', properties: { camera: { $ref: '#/components/schemas/Camera' } } }) }, ...errors },
        },
        delete: {
          summary: 'Remove a camera and all of its history (irreversible)',
          parameters: [uuidParam('id', 'query')],
          responses: { '200': { description: 'Deleted', content: json({ type: 'object', properties: { deleted: { const: true } } }) }, '404': { description: 'camera_not_found', content: json(error) }, ...errors },
        },
      },
      '/api/analyze': {
        post: {
          summary: 'Identify the animal in one frame and rate the danger; the result is saved to history',
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['imageBase64'],
              properties: {
                imageBase64: { type: 'string', description: 'JPEG/PNG as base64 or a data: URL, max 10 MB' },
                cameraId: { type: 'string', format: 'uuid', description: 'Omit for a manual check against the farm region' },
                contentType: { type: 'string', enum: ['image/jpeg', 'image/png'] },
                timeframeSeconds: { type: 'number', minimum: 0 },
              },
            }),
          },
          responses: {
            '200': {
              description: 'Verdict',
              content: json({
                type: 'object',
                properties: {
                  source: { type: 'string', enum: ['camera', 'manual'] },
                  animal: { type: 'object', properties: { species: { type: 'string' }, score: { type: 'integer', minimum: 0, maximum: 100 }, model: { type: 'string' }, peopleOnly: { type: 'boolean' }, status: { type: 'string' }, reason: { type: 'string' } } },
                  danger: { type: 'object', properties: { type: { $ref: '#/components/schemas/DangerType' }, severity: { type: 'string' }, score: { type: 'number' } } },
                  detectionId: { type: 'string', format: 'uuid' },
                  capturedAt: { type: 'string', format: 'date-time' },
                  saved: { type: 'boolean' },
                },
              }),
            },
            '404': { description: 'camera_not_found', content: json(error) },
            '503': { description: 'model_not_configured', content: json(error) },
            ...errors,
          },
        },
      },
      '/api/media': {
        post: {
          summary: 'Store the original photo or video (optionally linked to a detection)',
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'jpeg, png, webp, gif, mp4, webm or mov; max 100 MB' }, detectionId: { type: 'string', format: 'uuid' } } } } } },
          responses: { '201': { description: 'Stored', content: json({ type: 'object' }) }, '413': { description: 'file_too_large', content: json(error) }, '415': { description: 'unsupported_media_type', content: json(error) }, '503': { description: 'storage_not_configured', content: json(error) }, ...errors },
        },
      },
      '/api/media/{id}': {
        get: { summary: 'Redirect to a short-lived signed URL of an uploaded file', parameters: [uuidParam('id', 'path')], responses: { '302': { description: 'Signed URL in Location' }, '404': { description: 'media_not_found', content: json(error) } } },
      },
      '/api/captures/{id}': {
        get: { summary: 'Redirect to a short-lived signed URL of the analysed frame of a detection', parameters: [uuidParam('id', 'path')], responses: { '302': { description: 'Signed URL in Location' }, '404': { description: 'no_frame / capture_not_found', content: json(error) } } },
      },
      '/api/emergency-nearby': {
        get: {
          summary: 'Nearest police stations (OpenStreetMap). In immediate danger call 911.',
          parameters: [
            { name: 'address', in: 'query', schema: { type: 'string', minLength: 3, maxLength: 200 } },
            { name: 'lat', in: 'query', schema: { type: 'number', minimum: -90, maximum: 90 } },
            { name: 'lon', in: 'query', schema: { type: 'number', minimum: -180, maximum: 180 } },
          ],
          responses: { '200': { description: 'Origin + nearest stations', content: json({ type: 'object' }) }, '404': { description: 'Address not found', content: json(error) }, ...errors },
        },
      },
      '/api/ring-docs': {
        get: {
          summary: 'Search or read Ring documentation through the Ring Appstore Knowledge MCP server (live)',
          description: 'Server-side proxy to the gateway configured in mcp.json. Omit params for gateway status; q searches, doc reads a full document.',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string', minLength: 3, maxLength: 300 }, description: 'Natural-language search over Ring docs' },
            { name: 'max', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10 }, description: 'Max results (default 5)' },
            { name: 'doc', in: 'query', schema: { type: 'string', maxLength: 500 }, description: 'File path or ring.com URL from a search result' },
          ],
          responses: {
            '200': {
              description: 'Search results, full document, or gateway status',
              content: json({ type: 'object' }),
            },
            '503': { description: 'mcp_not_configured', content: json(error) },
            ...errors,
          },
        },
      },
      '/api/ring-live': {
        get: {
          summary: 'Live-section status; with a token the real Ring device list (server-side OAuth token)',
          responses: {
            '200': { description: 'Configured=false without a token, otherwise user + devices', content: json({ type: 'object' }) },
            ...errors,
          },
        },
        post: {
          summary: 'The motion hook: snapshot a device at one instant, classify once; S3 + history only when an animal is detected',
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['deviceId'],
              properties: {
                deviceId: { type: 'string', description: 'Ring device id from the device list' },
                cameraName: { type: 'string', description: 'Local camera name to attribute the detection to (defaults to the device id)' },
                timestampMs: { type: 'number', description: 'Epoch ms of the event - omit for the newest snapshot' },
              },
            }),
          },
          responses: {
            '200': { description: 'Hook outcome: animalDetected, snapshot (saved/discarded), verdict, danger, detectionId', content: json({ type: 'object' }) },
            ...errors,
          },
        },
      },
      '/api/ring-live/events': {
        get: {
          summary: 'Ring event history for one device (newest first)',
          parameters: [{ name: 'deviceId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Events', content: json({ type: 'object' }) }, ...errors },
        },
      },
      '/api/ring-live/snapshot': {
        get: {
          summary: 'One on-demand frame, base64; never persisted',
          parameters: [
            { name: 'deviceId', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'timestampMs', in: 'query', schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Frame', content: json({ type: 'object' }) }, ...errors },
        },
      },
    },
    components: {
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' }, detail: { type: 'string' } } },
        ZoneKind: { type: 'string', enum: ['coop', 'pasture', 'shed', 'gate'], default: 'gate' },
        DangerType: { type: 'string', enum: ['CRITICAL', 'DANGER', 'WARNING', 'MONITOR', 'NONE'] },
        Camera: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, zoneKind: { $ref: '#/components/schemas/ZoneKind' }, region: { type: 'string' } } },
      },
    },
  };
  return Response.json(spec, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}

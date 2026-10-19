/**
 * Shared domain vocabulary for Predator Guard.
 *
 * Keep this free of I/O: both the web app and the tests import it.
 */

/** Zones a camera can be assigned to. Drives rule severity. */
export const ZONE_KINDS = ['coop', 'pasture', 'shed', 'gate'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/** Species the vision funnel can return. `unknown` is the fail-open value. */
export const SPECIES = ['fox', 'coyote', 'raccoon', 'opossum', 'dog', 'deer', 'unknown'] as const;
export type Species = (typeof SPECIES)[number];

/** How loudly we shout about a detection. */
export const SEVERITIES = ['high', 'medium', 'low', 'log'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Where a detection came from: a named camera, or a one-off manual upload. */
export const DETECTION_SOURCES = ['camera', 'manual'] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];

export const ALERT_CHANNELS = ['push', 'sms', 'voice', 'console'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const DETECTION_STATUSES = ['pending', 'done', 'fallback'] as const;
export type DetectionStatus = (typeof DETECTION_STATUSES)[number];

/**
 * Subtypes Ring is known to send on `motion_detected`.
 *
 * This is deliberately NOT treated as exhaustive. Ring only classifies when the device
 * has Smart Alerts enabled, and no API reports whether it is on, so an unrecognised
 * value must fall through to the CV stages rather than being dropped.
 *
 * @see docs/ring-api-notes.md
 */
export const KNOWN_MOTION_SUBTYPES = [
  'motion',
  'human',
  'vehicle',
  'package_delivery',
  'other_motion',
] as const;

/** A Ring motion event, normalised out of the raw webhook envelope. */
export interface MotionEvent {
  /** `meta.request_id` - the idempotency key. */
  requestId: string;
  /** `meta.account_id` - links the event to a linked Ring account. */
  accountId: string;
  /** `data.attributes.source` - the Ring device id. */
  deviceId: string;
  /** `data.id` - the event id. */
  eventId: string;
  /** `data.attributes.timestamp` - epoch milliseconds. */
  timestamp: number;
  /** `data.attributes.sub_type`, or `"unknown"` when Ring omits it. */
  subType: string;
  /** `data.attributes.component_ids` - non-empty on multi-camera devices. */
  componentIds: string[];
}

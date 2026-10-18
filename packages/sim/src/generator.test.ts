import { describe, expect, it } from 'vitest';

import { generateSimWindow } from './generator.js';

// Monday 19 Oct 2026, local midnight - the window the hackathon runs on.
const START = new Date(2026, 9, 19, 0, 0, 0, 0);

const events = generateSimWindow({ start: START, days: 14, accountId: 'acct-1' });

function countByStory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.story] = (counts[event.story] ?? 0) + 1;
  return counts;
}

describe('generateSimWindow - 14 days, three stories and one red herring', () => {
  it('plants the exact story mix', () => {
    expect(countByStory()).toEqual({
      'fox-at-coop': 6, // 3 of 5 weeknights, two weeks
      'coyote-at-pasture': 4, // both weekend days of both weekends
      'raccoon-at-shed': 14, // every evening
      'herring-dog-in-yard': 14, // every day at 18:00
    });
  });

  it('keeps the fox to weeknights between 02:00 and 04:00', () => {
    const fox = events.filter((event) => event.story === 'fox-at-coop');
    expect(fox.length).toBeGreaterThan(0);
    for (const event of fox) {
      const weekday = event.occurredAt.getDay();
      expect(weekday).toBeGreaterThanOrEqual(1);
      expect(weekday).toBeLessThanOrEqual(5);
      expect(event.occurredAt.getHours()).toBeGreaterThanOrEqual(2);
      expect(event.occurredAt.getHours()).toBeLessThan(4);
    }
  });

  it('keeps the coyote to the weekend and the pasture fence camera', () => {
    for (const event of events.filter((candidate) => candidate.story === 'coyote-at-pasture')) {
      expect([0, 6]).toContain(event.occurredAt.getDay());
      expect(event.deviceId).toBe('sim-cam-pasture');
    }
  });

  it('walks the dog through the yard at 18:00 and the raccoon to the shed after feeding', () => {
    const dog = events.filter((event) => event.story === 'herring-dog-in-yard');
    const raccoon = events.filter((event) => event.story === 'raccoon-at-shed');
    expect(dog).toHaveLength(14);
    expect(raccoon).toHaveLength(14);
    for (const event of dog) {
      expect(event.occurredAt.getHours()).toBe(18);
      expect(event.deviceId).toBe('sim-cam-yard');
    }
    for (const event of raccoon) {
      expect(event.occurredAt.getHours()).toBe(19);
      expect(event.deviceId).toBe('sim-cam-shed');
    }
  });

  it('emits wire-ready, unique v1.1 motion webhooks for the linked account', () => {
    const eventIds = new Set<string>();
    for (const event of events) {
      const envelope = event.webhook.envelope as {
        meta: { account_id: string; request_id: string };
        data: { id: string; type: string; attributes: { source: string; sub_type: string; timestamp: number } };
      };
      expect(envelope.meta.account_id).toBe('acct-1');
      expect(envelope.data.type).toBe('motion_detected');
      expect(envelope.data.attributes.sub_type).toBe('motion');
      expect(envelope.data.attributes.source).toBe(event.deviceId);
      expect(envelope.data.attributes.timestamp).toBe(event.occurredAt.getTime());
      expect(eventIds.has(envelope.data.id)).toBe(false);
      eventIds.add(envelope.data.id);
    }
    expect(eventIds.size).toBe(events.length);
  });

  it('is deterministic - two runs produce the same schedule', () => {
    const again = generateSimWindow({ start: START, days: 14, accountId: 'acct-1' });
    expect(again.map((event) => event.occurredAt.getTime())).toEqual(
      events.map((event) => event.occurredAt.getTime()),
    );
  });
});

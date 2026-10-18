import { describe, expect, it } from 'vitest';
import { InMemoryDedupeTracker, severity } from './index.js';

const at = (hour: number, minute = 0) => new Date(2026, 9, 18, hour, minute);

describe('severity - the plan default table', () => {
  it('fox/coyote/dog: High in a livestock zone at night, Medium by day, Low elsewhere', () => {
    for (const species of ['fox', 'coyote', 'dog'] as const) {
      expect(severity({ species, zoneKind: 'coop', localTime: at(3) })).toBe('high');
      expect(severity({ species, zoneKind: 'pasture', localTime: at(3) })).toBe('high');
      expect(severity({ species, zoneKind: 'coop', localTime: at(12) })).toBe('medium');
      expect(severity({ species, zoneKind: 'shed', localTime: at(3) })).toBe('low');
      expect(severity({ species, zoneKind: 'gate', localTime: at(12) })).toBe('low');
    }
  });
  it('raccoon/opossum: Medium/Low in livestock zones, log-only elsewhere', () => {
    for (const species of ['raccoon', 'opossum'] as const) {
      expect(severity({ species, zoneKind: 'coop', localTime: at(3) })).toBe('medium');
      expect(severity({ species, zoneKind: 'coop', localTime: at(12) })).toBe('low');
      expect(severity({ species, zoneKind: 'shed', localTime: at(3) })).toBe('log');
    }
  });
  it('deer is log-only everywhere; unknown fails open (Medium/Low/log)', () => {
    expect(severity({ species: 'deer', zoneKind: 'coop', localTime: at(3) })).toBe('log');
    expect(severity({ species: 'deer', zoneKind: 'pasture', localTime: at(12) })).toBe('log');
    expect(severity({ species: 'unknown', zoneKind: 'coop', localTime: at(3) })).toBe('medium');
    expect(severity({ species: 'unknown', zoneKind: 'coop', localTime: at(12) })).toBe('low');
    expect(severity({ species: 'unknown', zoneKind: 'shed', localTime: at(3) })).toBe('log');
  });
  it('simulator gate: fox at the coop at 03:00 is High', () => {
    expect(severity({ species: 'fox', zoneKind: 'coop', localTime: at(3) })).toBe('high');
  });
});

describe('severity - overrides, ignore list, quiet hours', () => {
  it('a farmer override beats the default; a disabled override does not', () => {
    const overrides = [{ species: 'fox' as const, zoneKind: 'shed' as const, severity: 'medium' as const, enabled: true }];
    expect(severity({ species: 'fox', zoneKind: 'shed', localTime: at(3), overrides })).toBe('medium');
    const disabled = [{ species: 'fox' as const, zoneKind: 'shed' as const, severity: 'medium' as const, enabled: false }];
    expect(severity({ species: 'fox', zoneKind: 'shed', localTime: at(3), overrides: disabled })).toBe('low');
  });
  it('an ignore-list entry downgrades to log (red herring: farm dog at 18:00)', () => {
    const ignoreList = [{ species: 'dog' as const, startHour: 17, endHour: 20, label: 'our dog' }];
    expect(severity({ species: 'dog', zoneKind: 'coop', localTime: at(18), ignoreList })).toBe('log');
    expect(severity({ species: 'dog', zoneKind: 'coop', localTime: at(3), ignoreList })).toBe('high');
  });
  it('quiet hours suppress low/medium but never high', () => {
    const quietHours = { startHour: 22, endHour: 5 };
    expect(severity({ species: 'raccoon', zoneKind: 'coop', localTime: at(3), quietHours })).toBe('log');
    expect(severity({ species: 'fox', zoneKind: 'coop', localTime: at(3), quietHours })).toBe('high');
    expect(severity({ species: 'raccoon', zoneKind: 'coop', localTime: at(12), quietHours })).toBe('low');
  });
});

describe('InMemoryDedupeTracker - the 10-minute window', () => {
  it('alerts once per camera+species per window, then counts visits', () => {
    const tracker = new InMemoryDedupeTracker();
    expect(tracker.record('cam-1', 'fox', at(3, 0))).toEqual({ shouldAlert: true, visitCount: 1 });
    expect(tracker.record('cam-1', 'fox', at(3, 5))).toEqual({ shouldAlert: false, visitCount: 2 });
    expect(tracker.record('cam-1', 'fox', at(3, 9))).toEqual({ shouldAlert: false, visitCount: 3 });
    expect(tracker.record('cam-1', 'fox', at(3, 11))).toEqual({ shouldAlert: true, visitCount: 1 });
  });
  it('scopes the window per camera and per species', () => {
    const tracker = new InMemoryDedupeTracker();
    tracker.record('cam-1', 'fox', at(3, 0));
    expect(tracker.record('cam-2', 'fox', at(3, 1)).shouldAlert).toBe(true);
    expect(tracker.record('cam-1', 'coyote', at(3, 1)).shouldAlert).toBe(true);
  });
});

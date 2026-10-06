import { addDays, bangkokClock, dayOfWeekOf } from './bangkok-clock';

describe('bangkokClock', () => {
  it('converts UTC to Thai time (UTC+7)', () => {
    // จันทร์ 18:30 UTC = อังคาร 01:30 เวลาไทย
    expect(bangkokClock(new Date('2026-10-05T18:30:00Z'))).toEqual({
      date: '2026-10-06',
      day: 'TUESDAY',
      minutes: 90,
    });
  });

  it('keeps the same day before 17:00 UTC', () => {
    // พุธ 02:00 UTC = พุธ 09:00 เวลาไทย
    expect(bangkokClock(new Date('2026-10-07T02:00:00Z'))).toEqual({
      date: '2026-10-07',
      day: 'WEDNESDAY',
      minutes: 540,
    });
  });

  it('reports midnight as minute 0', () => {
    // ศุกร์ 17:00 UTC = เสาร์ 00:00 เวลาไทย
    expect(bangkokClock(new Date('2026-10-09T17:00:00Z'))).toEqual({
      date: '2026-10-10',
      day: 'SATURDAY',
      minutes: 0,
    });
  });
});

describe('dayOfWeekOf', () => {
  it('maps a calendar date to its weekday and JS day index', () => {
    expect(dayOfWeekOf('2026-10-06')).toEqual({ day: 'TUESDAY', index: 2 });
    expect(dayOfWeekOf('2026-10-11')).toEqual({ day: 'SUNDAY', index: 0 });
  });
});

describe('addDays', () => {
  it('rolls over month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

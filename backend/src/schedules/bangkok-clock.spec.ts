import { bangkokClock } from './bangkok-clock';

describe('bangkokClock', () => {
  it('converts UTC to Thai time (UTC+7)', () => {
    // จันทร์ 18:30 UTC = อังคาร 01:30 เวลาไทย
    expect(bangkokClock(new Date('2026-10-05T18:30:00Z'))).toEqual({
      day: 'TUESDAY',
      minutes: 90,
    });
  });

  it('keeps the same day before 17:00 UTC', () => {
    // พุธ 02:00 UTC = พุธ 09:00 เวลาไทย
    expect(bangkokClock(new Date('2026-10-07T02:00:00Z'))).toEqual({
      day: 'WEDNESDAY',
      minutes: 540,
    });
  });

  it('reports midnight as minute 0', () => {
    // ศุกร์ 17:00 UTC = เสาร์ 00:00 เวลาไทย
    expect(bangkokClock(new Date('2026-10-09T17:00:00Z'))).toEqual({
      day: 'SATURDAY',
      minutes: 0,
    });
  });
});

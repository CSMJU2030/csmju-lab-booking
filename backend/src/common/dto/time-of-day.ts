import { Matches } from 'class-validator';

/** "HH:MM" or "HH:MM:SS", 24-hour clock. */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const IsTimeOfDay = () =>
  Matches(TIME_OF_DAY, {
    message: 'must be a time of day such as 09:30 or 09:30:00',
  });

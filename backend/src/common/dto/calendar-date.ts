import { Matches } from 'class-validator';

/** "YYYY-MM-DD" */
export const CALENDAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const IsCalendarDate = () =>
  Matches(CALENDAR_DATE, { message: 'must be a date such as 2026-10-06' });

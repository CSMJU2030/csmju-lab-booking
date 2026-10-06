const thaiDate = new Intl.DateTimeFormat("th-TH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const thaiShortDate = new Intl.DateTimeFormat("th-TH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "2026-10-07" → "วันพุธที่ 7 ตุลาคม 2569" */
export const formatThaiDate = (date: string) =>
  thaiDate.format(new Date(`${date}T00:00:00Z`));

/** "2026-10-07" → "พ. 7 ต.ค. 69" */
export const formatThaiShortDate = (date: string) =>
  thaiShortDate.format(new Date(`${date}T00:00:00Z`));

/** "13:00:00" → "13:00" */
export const hhmm = (time: string) => time.slice(0, 5);

/** "13:00:00 - 16:00:00" → "13:00–16:00 น." */
export const timeRange = (range: string) =>
  `${range.split("-").map((t) => hhmm(t.trim())).join("–")} น.`;

/** "13:30" → 810 */
export const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** 810 → "13:30" */
export const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** วันนี้ตามเวลาไทย รูปแบบ YYYY-MM-DD */
export const todayInBangkok = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(),
  );

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const DAY_LABELS: Record<string, string> = {
  MONDAY: "จันทร์",
  TUESDAY: "อังคาร",
  WEDNESDAY: "พุธ",
  THURSDAY: "พฤหัสบดี",
  FRIDAY: "ศุกร์",
  SATURDAY: "เสาร์",
  SUNDAY: "อาทิตย์",
};

/** นาทีนับจากเที่ยงคืนตามเวลาไทย */
export const nowMinutesInBangkok = () =>
  toMinutes(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Bangkok",
    }).format(new Date()),
  );

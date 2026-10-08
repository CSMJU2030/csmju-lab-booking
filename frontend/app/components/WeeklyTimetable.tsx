"use client";

import { DAY_LABELS, hhmm, toMinutes } from "../lib/format";

export type TimetableEntry = {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName?: string;
  day: string;
  startTime: string;
  endTime: string;
};

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const PX_PER_HOUR = 56;

/** ตารางรายสัปดาห์ของห้องเดียว: คอลัมน์ = วัน, แถว = ชั่วโมง */
export default function WeeklyTimetable({
  entries,
  todayKey,
}: {
  entries: TimetableEntry[];
  todayKey?: string;
}) {
  const days = [
    ...WEEKDAYS,
    ...["SATURDAY", "SUNDAY"].filter((d) => entries.some((e) => e.day === d)),
  ];

  const starts = entries.map((e) => toMinutes(e.startTime));
  const ends = entries.map((e) => toMinutes(e.endTime));
  const firstHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(17, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, i) => firstHour + i,
  );
  const height = hours.length * PX_PER_HOUR;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-160 px-6 py-5">
        <div
          className="grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, 1fr)` }}
        >
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={`pb-2 text-center text-label-md font-semibold ${
                d === todayKey ? "text-primary-container" : "text-on-surface-variant"
              }`}
            >
              {DAY_LABELS[d]}
            </div>
          ))}

          <div className="relative" style={{ height }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-label-sm tabular-nums text-on-surface-variant"
                style={{ top: i * PX_PER_HOUR }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d}
              className={`relative border-l border-outline-variant/40 ${
                d === todayKey ? "bg-primary-container/10" : ""
              }`}
              style={{ height }}
            >
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-outline-variant/30"
                  style={{ top: i * PX_PER_HOUR }}
                />
              ))}
              {entries
                .filter((e) => e.day === d)
                .map((e) => {
                  const top =
                    ((toMinutes(e.startTime) - firstHour * 60) / 60) *
                    PX_PER_HOUR;
                  const h =
                    ((toMinutes(e.endTime) - toMinutes(e.startTime)) / 60) *
                    PX_PER_HOUR;
                  return (
                    <div
                      key={e.id}
                      title={`${e.courseCode} ${e.courseName} · ${hhmm(e.startTime)}–${hhmm(e.endTime)} น.`}
                      className="absolute inset-x-1 overflow-hidden rounded-lg border border-primary-container/30 bg-primary-container/10 px-2 py-1 text-label-sm text-on-surface"
                      style={{ top: top + 1, height: h - 2 }}
                    >
                      <p className="font-semibold">{e.courseCode}</p>
                      <p className="truncate text-on-surface-variant">
                        {e.courseName}
                      </p>
                      <p className="tabular-nums text-on-surface-variant">
                        {hhmm(e.startTime)}–{hhmm(e.endTime)}
                      </p>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        {entries.length === 0 && (
          <p className="mt-4 text-center text-body-md text-on-surface-variant">
            ห้องนี้ยังไม่มีคาบเรียนในตาราง
          </p>
        )}
      </div>
    </div>
  );
}

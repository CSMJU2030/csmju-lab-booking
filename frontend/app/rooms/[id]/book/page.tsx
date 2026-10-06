"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowBackIcon,
  PageHeader,
  cardClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/csmju";
import { api } from "../../../lib/api";
import {
  DAY_LABELS,
  addDays,
  formatThaiDate,
  fromMinutes,
  nowMinutesInBangkok,
  todayInBangkok,
  toMinutes,
} from "../../../lib/format";
import { canBook, useSession } from "../../../lib/session";

type Block = { startTime: string; endTime: string };

type Availability = {
  roomId: string;
  roomName: string;
  date: string;
  day: string;
  classes: (Block & { title: string })[];
  bookings: (Block & { peopleCount: number })[];
  rules: {
    open: string;
    close: string;
    maxDaysAhead: number;
    maxPeoplePerBooking: number;
    maxGroupsPerSlot: number;
    maxPeoplePerSlot: number;
  };
};

const STEP = 30; // จองเป็นช่วงละ 30 นาที
const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "20:00";

const overlaps = (a: Block, b: Block) =>
  toMinutes(a.startTime) < toMinutes(b.endTime) &&
  toMinutes(b.startTime) < toMinutes(a.endTime);

/** ช่วงเวลาเริ่มต้นที่สมเหตุสมผล: วันนี้ถ้ายังทัน ไม่งั้นพรุ่งนี้ 09:00 */
function initialSlot() {
  const nextHalfHour = Math.ceil((nowMinutesInBangkok() + 1) / STEP) * STEP;
  const today = todayInBangkok();
  const start = Math.max(nextHalfHour, toMinutes("09:00"));
  if (start + 60 <= toMinutes(DEFAULT_CLOSE)) {
    return {
      date: today,
      start: fromMinutes(start),
      end: fromMinutes(start + 60),
    };
  }
  return { date: addDays(today, 1), start: "09:00", end: "10:00" };
}

export default function BookRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useSession();
  const formId = useId();

  const [slot] = useState(initialSlot);
  const [date, setDate] = useState(slot.date);
  const [startTime, setStartTime] = useState(slot.start);
  const [endTime, setEndTime] = useState(slot.end);
  const [peopleCount, setPeopleCount] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [purposeTouched, setPurposeTouched] = useState(false);

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api<Availability>(`/api/v1/rooms/${id}/availability?date=${date}`).then(
      (result) => {
        if (!current) return;
        if (result.ok) {
          setAvailability(result.data);
          setLoadError(null);
        } else {
          setAvailability(null);
          setLoadError(result.message);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [id, date]);

  const rules = availability?.rules;
  const open = rules?.open ?? DEFAULT_OPEN;
  const close = rules?.close ?? DEFAULT_CLOSE;
  const today = todayInBangkok();
  const lastDay = addDays(today, rules?.maxDaysAhead ?? 30);
  const ready = availability !== null && availability.date === date;

  const startOptions = useMemo(() => {
    const options: string[] = [];
    for (let m = toMinutes(open); m < toMinutes(close); m += STEP)
      options.push(fromMinutes(m));
    return options;
  }, [open, close]);

  const endOptions = useMemo(
    () =>
      startOptions
        .map((t) => fromMinutes(toMinutes(t) + STEP))
        .filter((t) => toMinutes(t) > toMinutes(startTime)),
    [startOptions, startTime],
  );

  const selected: Block = { startTime, endTime };

  // เหตุผลที่ยังจองไม่ได้ (มีสิทธิ์แต่ทำไม่ได้ตอนนี้ = disable + บอกเหตุผล)
  const blockedReason = useMemo(() => {
    if (!ready || !availability || !rules) return null;
    const clash = availability.classes.find((c) => overlaps(c, selected));
    if (clash)
      return `ช่วงเวลานี้ตรงกับคาบเรียน ${clash.title} (${clash.startTime}–${clash.endTime} น.)`;
    const sameSlot = availability.bookings.filter((b) => overlaps(b, selected));
    if (sameSlot.length >= rules.maxGroupsPerSlot) {
      return `ช่วงเวลานี้มีผู้จองครบ ${rules.maxGroupsPerSlot} กลุ่มแล้ว`;
    }
    const people = sameSlot.reduce((sum, b) => sum + b.peopleCount, 0);
    if (people + peopleCount > rules.maxPeoplePerSlot) {
      return `ห้องรับได้อีก ${rules.maxPeoplePerSlot - people} คนในช่วงเวลานี้`;
    }
    if (date === today && toMinutes(startTime) <= nowMinutesInBangkok()) {
      return "เวลาเริ่มต้องอยู่หลังเวลาปัจจุบัน";
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected is derived from startTime/endTime
  }, [
    ready,
    availability,
    rules,
    startTime,
    endTime,
    peopleCount,
    date,
    today,
  ]);

  const purposeError =
    purposeTouched && !purpose.trim()
      ? "กรุณาระบุวัตถุประสงค์การใช้ห้อง"
      : null;

  const onStartChange = (value: string) => {
    setStartTime(value);
    if (toMinutes(endTime) <= toMinutes(value)) {
      setEndTime(
        fromMinutes(Math.min(toMinutes(value) + 60, toMinutes(close))),
      );
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPurposeTouched(true);
    if (!purpose.trim() || blockedReason) return;

    setSubmitting(true);
    setSubmitError(null);
    const result = await api<{ id: string }>("/api/v1/reservations", {
      method: "POST",
      body: {
        roomId: id,
        bookingDate: date,
        startTime,
        endTime,
        peopleCount,
        purpose: purpose.trim(),
      },
    });
    setSubmitting(false);

    if (result.ok) {
      router.push(`/bookings?booked=${result.data.id}`);
    } else {
      setSubmitError(result.message);
    }
  };

  if (me && !canBook(me)) {
    return (
      <div className={`${cardClass} space-y-4 px-6 py-12 text-center`}>
        <p className="text-body-md text-on-surface">
          คุณไม่มีสิทธิ์จองห้อง หากคิดว่าเป็นข้อผิดพลาด
          กรุณาติดต่อผู้ดูแลระบบย่อยนี้
        </p>
        <Link href="/" className={`${secondaryButtonClass} inline-block`}>
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-label-md text-primary-container hover:underline"
        >
          <ArrowBackIcon className="h-4 w-4" />
          ห้องทั้งหมด
        </Link>
        <PageHeader
          title={
            availability ? `จอง ${availability.roomName}` : "จองห้องปฏิบัติการ"
          }
          description="เลือกวัน เวลาเริ่ม เวลาสิ้นสุด และจำนวนคน แถบด้านล่างแสดงช่วงที่ห้องไม่ว่างของวันที่เลือก"
        />
      </div>

      {loadError && !availability ? (
        <div
          role="alert"
          className={`${cardClass} space-y-4 px-6 py-12 text-center`}
        >
          <p className="text-body-md text-on-surface">{loadError}</p>
          <Link href="/" className={`${secondaryButtonClass} inline-block`}>
            กลับไปเลือกห้อง
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 xl:grid-cols-5">
          <form
            id={formId}
            onSubmit={submit}
            noValidate
            className={`${cardClass} space-y-4 p-6 xl:col-span-2`}
            aria-describedby={`${formId}-required`}
          >
            <p
              id={`${formId}-required`}
              className="text-body-md text-on-surface-variant"
            >
              ช่องที่มี * จำเป็นต้องกรอก
            </p>

            {submitError && (
              <p
                role="alert"
                className="rounded-lg bg-error-container px-4 py-3 text-body-md text-on-error-container"
              >
                {submitError}
              </p>
            )}

            <Field label="วันที่" htmlFor="date">
              <input
                id="date"
                type="date"
                required
                aria-required="true"
                min={today}
                max={lastDay}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className={inputClass}
              />
              <p className="text-body-md text-on-surface-variant">
                {formatThaiDate(date)} · จองล่วงหน้าได้ไม่เกิน{" "}
                {rules?.maxDaysAhead ?? 30} วัน
              </p>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="เวลาเริ่ม" htmlFor="start">
                <select
                  id="start"
                  aria-required="true"
                  value={startTime}
                  onChange={(e) => onStartChange(e.target.value)}
                  className={inputClass}
                >
                  {startOptions.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {t} น.
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="เวลาสิ้นสุด" htmlFor="end">
                <select
                  id="end"
                  aria-required="true"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass}
                >
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} น.
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="จำนวนคน" htmlFor="people">
              <input
                id="people"
                type="number"
                inputMode="numeric"
                aria-required="true"
                min={1}
                max={rules?.maxPeoplePerBooking ?? 15}
                value={peopleCount}
                onChange={(e) =>
                  setPeopleCount(
                    Math.min(
                      rules?.maxPeoplePerBooking ?? 15,
                      Math.max(1, Number(e.target.value) || 1),
                    ),
                  )
                }
                className={`${inputClass} tabular-nums`}
              />
              <p className="text-body-md text-on-surface-variant">
                ครั้งละไม่เกิน {rules?.maxPeoplePerBooking ?? 15} คน
              </p>
            </Field>

            <Field label="วัตถุประสงค์" htmlFor="purpose">
              <input
                id="purpose"
                type="text"
                aria-required="true"
                aria-invalid={purposeError ? "true" : undefined}
                aria-describedby={purposeError ? "purpose-error" : undefined}
                maxLength={200}
                value={purpose}
                onBlur={() => setPurposeTouched(true)}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="เช่น ทำโปรเจกต์กลุ่ม, ติวสอบ"
                className={`${inputClass} ${purposeError ? "input-error" : ""}`}
              />
              {purposeError && (
                <p id="purpose-error" className="text-body-md text-error">
                  {purposeError}
                </p>
              )}
            </Field>

            {blockedReason && (
              <p
                role="status"
                className="rounded-lg bg-amber-100 px-4 py-3 text-body-md text-amber-800"
              >
                {blockedReason}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/" className={secondaryButtonClass}>
                ยกเลิก
              </Link>
              <button
                type="submit"
                disabled={!ready || Boolean(blockedReason)}
                aria-busy={submitting}
                className={`${primaryButtonClass} relative disabled:cursor-not-allowed disabled:opacity-40 ${
                  submitting ? "btn-loading" : ""
                }`}
              >
                <span className="btn-text flex items-center gap-2">
                  ยืนยันการจอง
                </span>
                <span className="dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </form>

          <section
            className={`${cardClass} order-first min-w-0 p-6 xl:order-none xl:col-span-3`}
            aria-labelledby="day-heading"
          >
            <h2
              id="day-heading"
              className="font-display text-headline-md text-on-surface"
            >
              วัน{DAY_LABELS[availability?.day ?? ""] ?? ""} ที่ห้องไม่ว่าง
            </h2>
            <p className="mb-6 text-body-md text-on-surface-variant">
              {formatThaiDate(date)}
            </p>

            {ready && availability ? (
              <DayTimeline
                open={open}
                close={close}
                classes={availability.classes}
                bookings={availability.bookings}
                selected={selected}
                selectedOk={!blockedReason}
                maxGroups={availability.rules.maxGroupsPerSlot}
              />
            ) : (
              <div aria-busy="true" className="space-y-3">
                <span className="sr-only">กำลังโหลดข้อมูล...</span>
                <div className="h-24 animate-pulse rounded-lg bg-surface-container" />
                <div className="h-5 w-64 animate-pulse rounded-lg bg-surface-container" />
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-label-md text-on-surface">
        {label}{" "}
        <span aria-hidden className="text-error">
          *
        </span>
      </label>
      {children}
    </div>
  );
}

/**
 * แถบเวลาของวัน: คาบเรียน (ห้องไม่ว่าง) · การจองที่มีอยู่ (จองร่วมได้ถึง N กลุ่ม) · ช่วงที่เลือก
 * ตำแหน่ง/ความกว้างคำนวณจากเวลา จึงใช้ inline style เฉพาะ left/width (ไม่ใช่สี)
 */
function DayTimeline({
  open,
  close,
  classes,
  bookings,
  selected,
  selectedOk,
  maxGroups,
}: {
  open: string;
  close: string;
  classes: (Block & { title: string })[];
  bookings: (Block & { peopleCount: number })[];
  selected: Block;
  selectedOk: boolean;
  maxGroups: number;
}) {
  const from = toMinutes(open);
  const span = toMinutes(close) - from;
  const pos = (b: Block) => {
    const start = Math.max(toMinutes(b.startTime), from);
    const end = Math.min(toMinutes(b.endTime), from + span);
    return {
      left: `${((start - from) / span) * 100}%`,
      width: `${((end - start) / span) * 100}%`,
    };
  };
  const hours: number[] = [];
  for (let m = from; m <= from + span; m += 60) hours.push(m);

  return (
    <div className="space-y-6">
      <div>
        <div className="space-y-2">
          <div className="relative h-5">
            {/* ป้ายเวลาทุก 2 ชั่วโมง ให้เห็นครบทั้งวันโดยไม่ต้องเลื่อน แม้จอแคบ (เส้นแบ่งยังมีทุกชั่วโมง) */}
            {hours.map((m, i) => (
              i % 2 === 1 ? null : (
              <span
                key={m}
                className={`absolute text-label-sm tabular-nums text-on-surface-variant ${
                  i === 0
                    ? ""
                    : i === hours.length - 1
                      ? "-translate-x-full"
                      : "-translate-x-1/2"
                }`}
                style={{ left: `${((m - from) / span) * 100}%` }}
              >
                {fromMinutes(m).slice(0, 2)}
              </span>
              )
            ))}
          </div>

          <div className="relative h-16 rounded-lg border border-outline-variant/40 bg-surface">
            {hours.slice(1, -1).map((m) => (
              <span
                key={m}
                aria-hidden
                className="absolute inset-y-0 border-l border-outline-variant/40"
                style={{ left: `${((m - from) / span) * 100}%` }}
              />
            ))}
            {classes.map((c) => (
              <span
                key={`c-${c.startTime}-${c.endTime}`}
                className="absolute top-1 h-7 overflow-hidden rounded bg-error-container px-2 py-1 text-label-sm text-on-error-container"
                style={pos(c)}
                title={`${c.title} ${c.startTime}–${c.endTime}`}
              >
                คาบเรียน
              </span>
            ))}
            {bookings.map((b, i) => (
              <span
                key={`b-${i}`}
                className="absolute bottom-1 h-6 overflow-hidden rounded bg-primary-container/10 px-2 py-1 text-label-sm text-primary-container"
                style={pos(b)}
                title={`จองแล้ว ${b.peopleCount} คน ${b.startTime}–${b.endTime}`}
              >
                {b.peopleCount} คน
              </span>
            ))}
            <span
              aria-hidden
              className={`absolute inset-y-0 rounded-lg border-2 ${
                selectedOk
                  ? "border-primary-container bg-primary-container/10"
                  : "border-error bg-error/10"
              }`}
              style={pos(selected)}
            />
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-md text-on-surface-variant">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded bg-error-container" />{" "}
          คาบเรียน (จองไม่ได้)
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded bg-primary-container/30"
          />{" "}
          มีผู้จองแล้ว (ร่วมได้ถึง {maxGroups} กลุ่ม)
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded border-2 border-primary-container"
          />{" "}
          ช่วงที่คุณเลือก
        </li>
      </ul>

      <div className="space-y-2">
        <h3 className="text-label-md text-on-surface">รายการในวันนี้</h3>
        {classes.length === 0 && bookings.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            ห้องว่างทั้งวัน ยังไม่มีคาบเรียนหรือการจอง
          </p>
        ) : (
          <ul className="space-y-1 text-body-md text-on-surface-variant">
            {classes.map((c) => (
              <li key={`lc-${c.startTime}`} className="tabular-nums">
                {c.startTime}–{c.endTime} น. · คาบเรียน {c.title}
              </li>
            ))}
            {bookings.map((b, i) => (
              <li key={`lb-${i}`} className="tabular-nums">
                {b.startTime}–{b.endTime} น. · จองแล้ว {b.peopleCount} คน
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

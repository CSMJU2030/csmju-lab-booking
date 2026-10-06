"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DeleteIcon,
  MenuBookIcon,
  Modal,
  PageHeader,
  cardClass,
  dangerButtonClass,
  iconDangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  tdClass,
  thClass,
} from "@/csmju";
import { api } from "../lib/api";
import { DAY_LABELS, hhmm } from "../lib/format";
import { canManageTimetable, useSession } from "../lib/session";

type Room = { id: string; name: string };

type Schedule = {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
};

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: Schedule[]; total: number; totalPages: number };

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const LIMIT = 20;

const TIMES: string[] = [];
for (let m = 7 * 60; m <= 21 * 60; m += 30) {
  TIMES.push(
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
  );
}

const EMPTY_FORM = {
  instructorName: "",
  courseCode: "",
  courseName: "",
  roomName: "",
  day: "MONDAY",
  startTime: "09:00",
  endTime: "12:00",
};

async function fetchSchedules(
  roomName: string,
  day: string,
  page: number,
): Promise<Load> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
  });
  if (roomName) params.set("roomName", roomName);
  if (day) params.set("day", day);
  const result = await api<Schedule[]>(`/api/v1/schedules?${params}`);
  if (!result.ok) return { state: "error", message: result.message };
  return {
    state: "ready",
    items: result.data,
    total: Number(result.meta?.total ?? result.data.length),
    totalPages: Number(result.meta?.totalPages ?? 1),
  };
}

export default function InstructorPage() {
  const me = useSession();

  if (me && !canManageTimetable(me)) {
    return (
      <div className={`${cardClass} space-y-4 px-6 py-12 text-center`}>
        <p className="text-body-md text-on-surface">
          คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากคิดว่าเป็นข้อผิดพลาด
          กรุณาติดต่อผู้ดูแลระบบย่อยนี้
        </p>
        <Link href="/" className={`${secondaryButtonClass} inline-block`}>
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  return <Timetable />;
}

function Timetable() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomFilter, setRoomFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [page, setPage] = useState(1);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Schedule | null>(null);

  useEffect(() => {
    let current = true;
    api<Room[]>("/api/v1/rooms").then((result) => {
      if (current && result.ok) {
        setRooms(result.data);
        setForm((f) =>
          f.roomName ? f : { ...f, roomName: result.data[0]?.name ?? "" },
        );
      }
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    fetchSchedules(roomFilter, dayFilter, page).then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
  }, [roomFilter, dayFilter, page]);

  const reload = useCallback(() => {
    setLoad({ state: "loading" });
    fetchSchedules(roomFilter, dayFilter, page).then(setLoad);
  }, [roomFilter, dayFilter, page]);

  const set =
    (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const missing = (
      ["courseCode", "courseName", "instructorName", "roomName"] as const
    ).filter((field) => !form[field].trim());
    if (missing.length > 0) {
      setFormError("กรุณากรอกช่องที่มี * ให้ครบ");
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
      return;
    }

    setSaving(true);
    setFormError(null);
    const result = await api("/api/v1/schedules", {
      method: "POST",
      body: form,
    });
    setSaving(false);
    if (result.ok) {
      setNotice(
        `เพิ่มคาบ ${form.courseCode} ใน ${form.roomName} เรียบร้อยแล้ว`,
      );
      setForm((f) => ({ ...EMPTY_FORM, roomName: f.roomName, day: f.day }));
      reload();
    } else {
      setFormError(result.message);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    const result = await api(`/api/v1/schedules/${target.id}`, {
      method: "DELETE",
    });
    if (result.ok) {
      setNotice(`ลบคาบ ${target.courseCode} ออกจากตารางเรียนแล้ว`);
      reload();
    } else {
      setLoad({ state: "error", message: result.message });
    }
  };

  return (
    <>
      <PageHeader
        title="จัดการตารางเรียน"
        description="เพิ่มหรือลบคาบเรียนของห้องปฏิบัติการ คาบที่อยู่ในตารางจะกันไม่ให้ผู้อื่นจองห้องช่วงเวลานั้น"
      />

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success/10 px-4 py-3 text-body-md text-emerald-700"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-8 2xl:grid-cols-3">
        <form
          onSubmit={save}
          noValidate
          className={`${cardClass} grid content-start gap-4 p-6 md:grid-cols-2 2xl:grid-cols-1`}
          aria-labelledby="add-heading"
        >
          <div className="md:col-span-2 2xl:col-span-1">
            <h2
              id="add-heading"
              className="font-display text-headline-md text-on-surface"
            >
              เพิ่มคาบเรียน
            </h2>
            <p className="text-body-md text-on-surface-variant">
              ช่องที่มี * จำเป็นต้องกรอก
            </p>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-lg bg-error-container px-4 py-3 text-body-md text-on-error-container md:col-span-2 2xl:col-span-1"
            >
              {formError}
            </p>
          )}

          <Field id="courseCode" label="รหัสวิชา">
            <input
              id="courseCode"
              value={form.courseCode}
              onChange={set("courseCode")}
              maxLength={50}
              aria-required="true"
              placeholder="เช่น 10301111"
              className={inputClass}
            />
          </Field>
          <Field id="courseName" label="ชื่อวิชา">
            <input
              id="courseName"
              value={form.courseName}
              onChange={set("courseName")}
              maxLength={200}
              aria-required="true"
              className={inputClass}
            />
          </Field>
          <Field id="instructorName" label="ผู้สอน">
            <input
              id="instructorName"
              value={form.instructorName}
              onChange={set("instructorName")}
              maxLength={200}
              aria-required="true"
              className={inputClass}
            />
          </Field>
          <Field id="roomName" label="ห้อง">
            <select
              id="roomName"
              value={form.roomName}
              onChange={set("roomName")}
              aria-required="true"
              className={inputClass}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="day" label="วัน">
            <select
              id="day"
              value={form.day}
              onChange={set("day")}
              aria-required="true"
              className={inputClass}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="startTime" label="เวลาเริ่ม">
              <select
                id="startTime"
                value={form.startTime}
                onChange={set("startTime")}
                aria-required="true"
                className={inputClass}
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t} น.
                  </option>
                ))}
              </select>
            </Field>
            <Field id="endTime" label="เวลาสิ้นสุด">
              <select
                id="endTime"
                value={form.endTime}
                onChange={set("endTime")}
                aria-required="true"
                className={inputClass}
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t} น.
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2 md:col-span-2 2xl:col-span-1">
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...EMPTY_FORM, roomName: f.roomName }))
              }
              className={secondaryButtonClass}
            >
              ล้างฟอร์ม
            </button>
            <button
              type="submit"
              aria-busy={saving}
              className={`${primaryButtonClass} relative ${saving ? "btn-loading" : ""}`}
            >
              <span className="btn-text flex items-center gap-2">
                บันทึกคาบเรียน
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
          className={`${cardClass} min-w-0 2xl:col-span-2`}
          aria-labelledby="list-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/40 px-6 py-5">
            <h2
              id="list-heading"
              className="shrink-0 whitespace-nowrap font-display text-headline-md text-on-surface"
            >
              ตารางเรียนทั้งหมด
            </h2>
            <div className="flex flex-wrap gap-3">
              <label htmlFor="filter-room" className="sr-only">
                กรองตามห้อง
              </label>
              <select
                id="filter-room"
                value={roomFilter}
                onChange={(e) => {
                  setRoomFilter(e.target.value);
                  setPage(1);
                }}
                className={`${inputClass} md:w-48`}
              >
                <option value="">ทุกห้อง</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <label htmlFor="filter-day" className="sr-only">
                กรองตามวัน
              </label>
              <select
                id="filter-day"
                value={dayFilter}
                onChange={(e) => {
                  setDayFilter(e.target.value);
                  setPage(1);
                }}
                className={`${inputClass} md:w-40`}
              >
                <option value="">ทุกวัน</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {load.state === "loading" && (
            <div aria-busy="true" className="space-y-3 px-6 py-5">
              <span className="sr-only">กำลังโหลดข้อมูล...</span>
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-surface-container"
                />
              ))}
            </div>
          )}

          {load.state === "error" && (
            <div role="alert" className="space-y-4 px-6 py-12 text-center">
              <p className="text-body-md text-on-surface">{load.message}</p>
              <button
                type="button"
                onClick={reload}
                className={secondaryButtonClass}
              >
                ลองอีกครั้ง
              </button>
            </div>
          )}

          {load.state === "ready" && load.items.length === 0 && (
            <div className="space-y-3 px-6 py-12 text-center">
              <MenuBookIcon className="mx-auto h-10 w-10 text-outline" />
              {roomFilter || dayFilter ? (
                <>
                  <p className="text-body-md text-on-surface-variant">
                    ไม่พบคาบเรียนตามตัวกรองที่เลือก
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomFilter("");
                      setDayFilter("");
                    }}
                    className={secondaryButtonClass}
                  >
                    ล้างตัวกรอง
                  </button>
                </>
              ) : (
                <p className="text-body-md text-on-surface-variant">
                  ยังไม่มีคาบเรียน เริ่มจากเพิ่มคาบแรกด้วยฟอร์มด้านข้าง
                </p>
              )}
            </div>
          )}

          {load.state === "ready" && load.items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-2xl border-collapse text-left">
                  <thead>
                    <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                      <th className={thClass}>วิชา</th>
                      <th className={thClass}>ห้อง</th>
                      <th className={thClass}>วัน</th>
                      <th className={thClass}>เวลา</th>
                      <th className={`${thClass} text-right`}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.items.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-outline-variant/40 text-body-md last:border-0 hover:bg-surface/50"
                      >
                        <td className={tdClass}>
                          <span className="font-medium text-on-surface">
                            {s.courseCode}
                          </span>
                          <span className="block text-on-surface-variant">
                            {s.courseName}
                          </span>
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {s.roomName}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {DAY_LABELS[s.day] ?? s.day}
                        </td>
                        <td
                          className={`${tdClass} whitespace-nowrap tabular-nums text-on-surface-variant`}
                        >
                          {hhmm(s.startTime)}–{hhmm(s.endTime)} น.
                        </td>
                        <td className={`${tdClass} text-right`}>
                          <button
                            type="button"
                            onClick={() => setToDelete(s)}
                            aria-label={`ลบคาบ ${s.courseCode} ${s.roomName}`}
                            className={iconDangerButtonClass}
                          >
                            <DeleteIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {load.totalPages > 1 && (
                <nav
                  aria-label="เปลี่ยนหน้า"
                  className="flex items-center justify-between border-t border-outline-variant/40 px-6 py-4"
                >
                  <span className="text-body-md tabular-nums text-on-surface-variant">
                    หน้า {page} จาก {load.totalPages} · ทั้งหมด {load.total} คาบ
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      ก่อนหน้า
                    </button>
                    <button
                      type="button"
                      disabled={page >= load.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      ถัดไป
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>
      </div>

      {toDelete && (
        <Modal title="ลบคาบเรียน" onClose={() => setToDelete(null)}>
          <p className="text-body-md text-on-surface-variant">
            ลบคาบ{" "}
            <strong className="text-on-surface">
              {toDelete.courseCode} {toDelete.courseName}
            </strong>{" "}
            ({toDelete.roomName} วัน{DAY_LABELS[toDelete.day]}{" "}
            {hhmm(toDelete.startTime)}–{hhmm(toDelete.endTime)} น.)?
            หลังลบแล้วช่วงเวลานี้จะเปิดให้จองห้องได้
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setToDelete(null)}
              className={secondaryButtonClass}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={remove}
              className={dangerButtonClass}
            >
              ลบคาบเรียน
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-label-md text-on-surface">
        {label}{" "}
        <span aria-hidden className="text-error">
          *
        </span>
      </label>
      {children}
    </div>
  );
}

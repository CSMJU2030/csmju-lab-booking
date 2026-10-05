'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

interface CourseSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
}

interface RoomStatusResponse {
  roomName: string;
  allSchedules?: CourseSchedule[];
}

type Msg = { type: 'error' | 'ok'; text: string } | null;
type LoadResult = { ok: true; data: CourseSchedule[] } | { ok: false; message: string };

const DAY_TH: Record<string, string> = {
  MONDAY: 'วันจันทร์',
  TUESDAY: 'วันอังคาร',
  WEDNESDAY: 'วันพุธ',
  THURSDAY: 'วันพฤหัสบดี',
  FRIDAY: 'วันศุกร์',
  SATURDAY: 'วันเสาร์',
  SUNDAY: 'วันอาทิตย์',
};

const EMPTY_FORM = {
  instructorName: '',
  courseCode: '',
  courseName: '',
  roomName: '',
  day: 'MONDAY',
  startTime: '09:00',
  endTime: '12:00',
};

const btnBase =
  'inline-flex min-h-10 items-center justify-center rounded-ctl px-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50';
const input =
  'mt-2 min-h-10 w-full rounded-ctl border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export default function InstructorDashboard() {
  const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [toDelete, setToDelete] = useState<CourseSchedule | null>(null);

  const fetchSchedules = useCallback(async (): Promise<LoadResult> => {
    const result = await api<RoomStatusResponse[]>('/api/v1/schedules/status');
    if (!result.ok) return { ok: false, message: result.message };
    const all: CourseSchedule[] = [];
    if (Array.isArray(result.data)) {
      result.data.forEach((room) =>
        (room.allSchedules ?? []).forEach((sch) => all.push({ ...sch, roomName: room.roomName })),
      );
    }
    return { ok: true, data: all };
  }, []);

  const applyResult = useCallback((res: LoadResult): void => {
    if (res.ok) {
      setError(null);
      setSchedules(res.data);
    } else {
      setError(res.message);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    void fetchSchedules().then((res) => {
      if (!isCurrent) return;
      applyResult(res);
      setLoading(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [fetchSchedules, applyResult]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setMsg(null);
    if (formData.endTime <= formData.startTime) {
      setMsg({ type: 'error', text: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น' });
      return;
    }
    setSubmitting(true);
    const res = await api('/api/v1/schedules', { method: 'POST', body: formData });
    setSubmitting(false);
    if (!res.ok) {
      setMsg({ type: 'error', text: res.message });
      return;
    }
    setMsg({ type: 'ok', text: 'บันทึกตารางสอนเรียบร้อยแล้ว' });
    setFormData(EMPTY_FORM);
    applyResult(await fetchSchedules());
  };

  const handleDelete = async (sch: CourseSchedule): Promise<void> => {
    setToDelete(null);
    setMsg(null);
    const res = await api(`/api/v1/schedules/${sch.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setMsg({ type: 'error', text: `ลบไม่สำเร็จ: ${res.message}` });
      return;
    }
    setMsg({ type: 'ok', text: `ลบตารางสอนวิชา ${sch.courseCode} เรียบร้อยแล้ว` });
    applyResult(await fetchSchedules());
  };

  return (
    <div className="min-h-screen">
      {/* TODO: แทนด้วย <CsmjuAppShell> เมื่อติดตั้ง @csmju2030/design-system */}
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-on-primary">จัดการตารางสอน</h1>
            <p className="text-sm">เพิ่มและลบตารางเรียนห้องปฏิบัติการ (สำหรับบุคลากรและผู้ดูแลระบบ)</p>
          </div>
          <Link href="/" className={`${btnBase} bg-primary-soft text-primary`}>
            กลับหน้าหลัก
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        {msg && (
          <div
            role={msg.type === 'ok' ? 'status' : 'alert'}
            className={`mb-4 rounded-ctl border p-3 text-sm ${
              msg.type === 'ok'
                ? 'border-success-line bg-success-soft text-success'
                : 'border-danger-line bg-danger-soft text-danger'
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section className="h-fit rounded-card border border-line bg-surface p-6">
            <h2 className="mb-1 text-xl font-semibold text-ink">เพิ่มตารางเรียนใหม่</h2>
            <p className="mb-4 text-sm text-muted">ช่องที่มี * จำเป็นต้องกรอก</p>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <label className="block text-sm font-medium text-ink">
                ชื่อผู้สอน *
                <input type="text" required aria-required="true" className={input} value={formData.instructorName}
                  onChange={(e) => setFormData({ ...formData, instructorName: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                รหัสวิชา *
                <input type="text" required aria-required="true" className={input} value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                ชื่อวิชา *
                <input type="text" required aria-required="true" className={input} value={formData.courseName}
                  onChange={(e) => setFormData({ ...formData, courseName: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                ห้องปฏิบัติการ *
                <input type="text" required aria-required="true" className={input} value={formData.roomName}
                  onChange={(e) => setFormData({ ...formData, roomName: e.target.value })} />
              </label>
              <label className="block text-sm font-medium text-ink">
                วันในสัปดาห์ *
                <select className={input} value={formData.day}
                  onChange={(e) => setFormData({ ...formData, day: e.target.value })}>
                  {Object.entries(DAY_TH).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-ink">
                  เวลาเริ่มต้น *
                  <input type="time" required aria-required="true" className={input} value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  เวลาสิ้นสุด *
                  <input type="time" required aria-required="true" className={input} value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} />
                </label>
              </div>
              <button type="submit" disabled={submitting} aria-busy={submitting}
                className={`${btnBase} bg-primary text-on-primary hover:bg-primary-hover`}>
                {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </section>

          <section className="rounded-card border border-line bg-surface p-6">
            <h2 className="mb-4 text-xl font-semibold text-ink">รายการตารางเรียนในระบบ</h2>
            {error && (
              <div role="alert" className="mb-3 rounded-ctl border border-danger-line bg-danger-soft p-3 text-sm text-danger">
                {error}
              </div>
            )}
            {loading ? (
              <ul className="space-y-3" aria-busy="true" aria-label="กำลังโหลดตารางเรียน">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-20 animate-pulse rounded-ctl bg-surface-muted" />
                ))}
              </ul>
            ) : schedules.length === 0 && !error ? (
              <div className="py-8 text-center">
                <p className="font-semibold text-ink">ยังไม่มีตารางเรียนในระบบ</p>
                <p className="mt-1 text-sm text-muted">เริ่มต้นด้วยการเพิ่มตารางเรียนจากแบบฟอร์มด้านข้าง</p>
              </div>
            ) : (
              <ul className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {schedules.map((sch) => (
                  <li key={sch.id} className="flex items-center justify-between gap-3 rounded-ctl bg-surface-muted p-3 text-sm">
                    <div>
                      <p className="font-semibold text-primary">{sch.courseCode} - {sch.courseName}</p>
                      <p>ห้อง {sch.roomName} · ผู้สอน {sch.instructorName}</p>
                      <p className="tabular-nums">
                        {DAY_TH[sch.day] ?? sch.day} {sch.startTime.slice(0, 5)} - {sch.endTime.slice(0, 5)} น.
                      </p>
                    </div>
                    <button onClick={() => setToDelete(sch)}
                      aria-label={`ลบตารางสอนวิชา ${sch.courseCode} ${sch.courseName}`}
                      className={`${btnBase} bg-danger-soft text-danger`}>
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {toDelete && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-ink/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="del-title"
            className="w-full max-w-md rounded-card border border-line bg-surface p-6">
            <h2 id="del-title" className="mb-2 text-xl font-semibold text-ink">
              ลบวิชา &quot;{toDelete.courseCode} {toDelete.courseName}&quot;?
            </h2>
            <p className="mb-6 text-sm text-muted">รายการนี้จะถูกลบถาวรและไม่สามารถย้อนกลับได้</p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button onClick={() => void handleDelete(toDelete)} className={`${btnBase} bg-danger text-on-primary`}>
                ลบตารางสอน
              </button>
              <button onClick={() => setToDelete(null)} className={`${btnBase} text-body hover:bg-surface-muted`}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
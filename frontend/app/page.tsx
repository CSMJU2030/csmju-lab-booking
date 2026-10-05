'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react';
import { api } from './lib/api';

interface CourseSchedule {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  startTime: string;
  endTime: string;
}

interface ClassInfo {
  id: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  time: string;
}

interface RoomStatus {
  roomName: string;
  isOccupied: boolean;
  statusColor: 'red' | 'green';
  currentClass: ClassInfo | null;
  nextClass: (ClassInfo & { startTime: string }) | null;
  allSchedules?: CourseSchedule[];
}

interface Booking {
  id: string;
  roomName: string;
  studentName: string;
  peopleCount: number;
  date: string; // YYYY-MM-DD (ค.ศ.)
  start: string; // HH:MM
  end: string;
}

type FetchRoomsResult = { ok: true; data: RoomStatus[] } | { ok: false; message: string };
type Msg = { type: 'error' | 'ok'; text: string } | null;

const REFRESH_INTERVAL_MS = 60_000;
const MAX_GROUPS = 3;
const MAX_PEOPLE_ROOM = 45;
const MAX_PEOPLE_BOOKING = 15;
const LAB_OPEN = '08:00'; // สมมติ ปรับตามจริงได้
const LAB_CLOSE = '20:00';
const TZ = 'Asia/Bangkok';
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const todayStr = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const nowMin = (): number =>
  toMin(
    new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
  ) % 1440;
const dayOf = (date: string): string => DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
// แสดงผลเป็น พ.ศ. (ข้อ 11.3) เมื่อติดตั้งแพ็กเกจแล้วให้เปลี่ยนเป็น formatDate()
const fmtDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('th-TH-u-ca-buddhist', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const hm = (t: string): string => t.slice(0, 5);
const overlaps = (s1: number, e1: number, s2: number, e2: number): boolean => s1 < e2 && e1 > s2;

const btnBase =
  'inline-flex min-h-10 items-center justify-center rounded-ctl px-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50';
const btnPrimary = `${btnBase} bg-primary text-on-primary hover:bg-primary-hover`;
const btnSecondary = `${btnBase} bg-primary-soft text-primary hover:bg-line`;
const btnGhost = `${btnBase} text-body hover:bg-surface-muted`;
const btnDanger = `${btnBase} bg-danger text-on-primary`;
const input =
  'mt-2 min-h-10 w-full rounded-ctl border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function Alert({ msg }: { msg: NonNullable<Msg> }) {
  const ok = msg.type === 'ok';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`mb-4 rounded-ctl border p-3 text-sm ${
        ok
          ? 'border-success-line bg-success-soft text-success'
          : 'border-danger-line bg-danger-soft text-danger'
      }`}
    >
      <strong>{ok ? 'สำเร็จ: ' : 'ไม่สำเร็จ: '}</strong>
      {msg.text}
    </div>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full overflow-y-auto rounded-card border border-line bg-surface p-6 sm:max-w-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
          <h2 id={titleId} className="text-xl font-semibold text-primary">
            {title}
          </h2>
          <button onClick={onClose} className={btnGhost} aria-label={`ปิดหน้าต่าง ${title}`}>
            ปิด
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomStatus | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [peopleInput, setPeopleInput] = useState<number>(1);
  const [bookDate, setBookDate] = useState<string>(todayStr);
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('15:00');
  const [msg, setMsg] = useState<Msg>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<Booking | null>(null);

  const fetchRooms = useCallback(async (): Promise<FetchRoomsResult> => {
    const result = await api<RoomStatus[]>('/api/v1/schedules/status');
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, data: Array.isArray(result.data) ? result.data : [] };
  }, []);

  const applyRooms = useCallback((res: FetchRoomsResult): void => {
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRooms(res.data);
    setSelectedRoom((prev) => (prev ? (res.data.find((r) => r.roomName === prev.roomName) ?? null) : null));
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const run = (): void => {
      void fetchRooms().then((res) => {
        if (!isCurrent) return;
        applyRooms(res);
        setLoading(false);
      });
    };
    run();
    const timer = setInterval(run, REFRESH_INTERVAL_MS);
    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
  }, [fetchRooms, applyRooms]);

  const handleReload = async (): Promise<void> => {
    setLoading(true);
    applyRooms(await fetchRooms());
    setLoading(false);
  };

  const closeRoom = useCallback((): void => setSelectedRoom(null), []);
  const closeMine = useCallback((): void => setShowMine(false), []);
  const closeConfirm = useCallback((): void => setConfirmCancel(null), []);

  const activeRooms = useMemo(
    () =>
      rooms.filter(
        (r) => (r.allSchedules?.length ?? 0) > 0 || allBookings.some((b) => b.roomName === r.roomName),
      ),
    [rooms, allBookings],
  );

  const myBookings = useMemo(
    () =>
      allBookings
        .filter((b) => b.studentName.includes('คุณ'))
        .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)),
    [allBookings],
  );

  const roomBookings = selectedRoom ? allBookings.filter((b) => b.roomName === selectedRoom.roomName) : [];

  const slotBookings = selectedRoom
    ? roomBookings.filter(
        (b) => b.date === bookDate && overlaps(toMin(startTime), toMin(endTime), toMin(b.start), toMin(b.end)),
      )
    : [];
  const slotGroups = slotBookings.length;
  const slotPeople = slotBookings.reduce((sum, b) => sum + b.peopleCount, 0);
  const isSlotFull = slotGroups >= MAX_GROUPS || slotPeople >= MAX_PEOPLE_ROOM;

  const openRoom = (room: RoomStatus): void => {
    setMsg(null);
    setSelectedRoom(room);
  };

  // หมายเหตุ: การจองยังเก็บฝั่ง client (backend ยังไม่มี endpoint จอง)
  const handleBooking = async (room: RoomStatus): Promise<void> => {
    const fail = (text: string): void => setMsg({ type: 'error', text });
    setMsg(null);

    const s = toMin(startTime);
    const e = toMin(endTime);
    if (!bookDate || !startTime || !endTime) return fail('กรุณาเลือกวันที่และเวลาให้ครบ');
    if (peopleInput < 1 || peopleInput > MAX_PEOPLE_BOOKING)
      return fail(`จองได้ครั้งละ 1 - ${MAX_PEOPLE_BOOKING} คน`);
    if (bookDate < todayStr() || (bookDate === todayStr() && s < nowMin()))
      return fail('ไม่สามารถจองย้อนหลังได้ กรุณาเลือกวันและเวลาใหม่');
    if (e <= s) return fail('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น');
    if (s < toMin(LAB_OPEN) || e > toMin(LAB_CLOSE))
      return fail(`เปิดให้จองเฉพาะเวลา ${LAB_OPEN} - ${LAB_CLOSE} น.`);
    if (slotGroups >= MAX_GROUPS) return fail(`ช่วงเวลานี้มีผู้จองเต็มแล้ว (สูงสุด ${MAX_GROUPS} กลุ่ม)`);
    if (slotPeople + peopleInput > MAX_PEOPLE_ROOM)
      return fail(`เกินโควตาห้อง เหลือรองรับได้อีก ${MAX_PEOPLE_ROOM - slotPeople} คน`);

    setSubmitting(true);
    const res = await api<CourseSchedule[]>(
      `/api/v1/schedules?roomName=${encodeURIComponent(room.roomName)}&day=${dayOf(bookDate)}`,
    );
    setSubmitting(false);
    if (!res.ok) return fail(res.message);
    const clash = (Array.isArray(res.data) ? res.data : []).find((c) =>
      overlaps(s, e, toMin(c.startTime), toMin(c.endTime)),
    );
    if (clash)
      return fail(
        `ช่วงเวลานี้ห้องมีการเรียนวิชา ${clash.courseCode} (${hm(clash.startTime)} - ${hm(clash.endTime)} น.) กรุณาเลือกช่วงเวลาอื่น`,
      );

    setAllBookings((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        roomName: room.roomName,
        studentName: 'คุณ (นักศึกษา)',
        peopleCount: Number(peopleInput),
        date: bookDate,
        start: startTime,
        end: endTime,
      },
    ]);
    setMsg({
      type: 'ok',
      text: `จองห้อง ${room.roomName} วันที่ ${fmtDate(bookDate)} เวลา ${startTime} - ${endTime} น. แล้ว`,
    });
    setPeopleInput(1);
  };

  const handleCancel = (id: string): void => {
    setAllBookings((prev) => prev.filter((b) => b.id !== id));
    setConfirmCancel(null);
  };

  return (
    <div className="min-h-screen">
      {/* TODO: แทนด้วย <CsmjuAppShell> เมื่อติดตั้ง @csmju2030/design-system */}
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div>
            <p className="text-sm">สาขาวิชาวิทยาการคอมพิวเตอร์ คณะวิทยาศาสตร์ มหาวิทยาลัยแม่โจ้</p>
            <h1 className="text-2xl font-bold text-on-primary md:text-3xl">ระบบจองห้องปฏิบัติการ</h1>
            <p className="text-sm">ดูสถานะห้อง (อัปเดตอัตโนมัติทุก 1 นาที) และจองห้องตามวันและเวลาที่ต้องการ</p>
          </div>
          <button onClick={() => setShowMine(true)} className={btnSecondary}>
            การจองของฉัน ({myBookings.length})
          </button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-4 text-xl font-semibold text-ink">รายการห้องปฏิบัติการ</h2>

          {error && (
            <div role="alert" className="mb-4 rounded-ctl border border-danger-line bg-danger-soft p-3 text-sm text-danger">
              {error}{' '}
              <button onClick={() => void handleReload()} className="font-semibold underline">
                ลองอีกครั้ง
              </button>
            </div>
          )}

          {loading ? (
            <ul className="grid gap-3" aria-busy="true" aria-label="กำลังโหลดข้อมูลห้อง">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-20 animate-pulse rounded-card bg-surface-muted" />
              ))}
            </ul>
          ) : activeRooms.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-semibold text-ink">
                {error ? 'ไม่สามารถโหลดข้อมูลห้องได้ในขณะนี้' : 'ยังไม่มีห้องปฏิบัติการที่มีตารางเรียน'}
              </p>
              <p className="mt-1 text-sm text-muted">
                {error
                  ? 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'
                  : 'เมื่อมีการเพิ่มตารางเรียน ห้องจะแสดงที่นี่'}
              </p>
              <button onClick={() => void handleReload()} className={`${btnSecondary} mt-4`}>
                ลองอีกครั้ง
              </button>
            </div>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {activeRooms.map((room) => {
                const n = allBookings.filter((b) => b.roomName === room.roomName).length;
                return (
                  <li key={room.roomName}>
                    <button
                      onClick={() => openRoom(room)}
                      className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={`h-3 w-3 shrink-0 rounded-full ${room.isOccupied ? 'bg-danger' : 'bg-success'}`}
                        />
                        <span>
                          <span className="block font-semibold text-ink">{room.roomName}</span>
                          <span className={`block text-sm ${room.isOccupied ? 'text-danger' : 'text-success'}`}>
                            {room.isOccupied ? 'กำลังมีการเรียนการสอน' : 'ว่างในขณะนี้'}
                          </span>
                          {room.nextClass && !room.isOccupied && (
                            <span className="block text-sm text-muted">
                              มีเรียนต่อเวลา {hm(room.nextClass.startTime)} น.
                            </span>
                          )}
                          {n > 0 && <span className="block text-sm text-primary">มีการจอง {n} รายการ</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-primary">ดูรายละเอียด</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {selectedRoom && (
        <Dialog title={selectedRoom.roomName} onClose={closeRoom}>
          <div className="mb-4 rounded-ctl bg-primary-soft p-3 text-sm text-ink">
            <p className="font-semibold">สถานะขณะนี้: {selectedRoom.isOccupied ? 'มีการเรียนการสอน' : 'ว่าง'}</p>
            {selectedRoom.isOccupied && selectedRoom.currentClass ? (
              <p>
                {selectedRoom.currentClass.courseCode} {selectedRoom.currentClass.courseName} ·{' '}
                {selectedRoom.currentClass.time} น.
              </p>
            ) : selectedRoom.nextClass ? (
              <p>
                มีเรียนต่อเวลา {hm(selectedRoom.nextClass.startTime)} น. (วิชา {selectedRoom.nextClass.courseCode})
              </p>
            ) : (
              <p>ไม่มีการเรียนการสอนต่อในวันนี้</p>
            )}
          </div>

          <fieldset className="mb-4">
            <legend className="mb-2 font-semibold text-ink">เลือกวันและเวลาที่ต้องการจอง</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-ink">
                วันที่ *
                <input type="date" className={input} min={todayStr()} value={bookDate} onChange={(e) => setBookDate(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-ink">
                เวลาเริ่ม *
                <input type="time" className={input} min={LAB_OPEN} max={LAB_CLOSE} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-ink">
                เวลาสิ้นสุด *
                <input type="time" className={input} min={LAB_OPEN} max={LAB_CLOSE} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink">
              จำนวนผู้ใช้ห้อง * (สูงสุด {MAX_PEOPLE_BOOKING} คนต่อการจอง)
              <input
                type="number"
                min={1}
                max={MAX_PEOPLE_BOOKING}
                className={`${input} sm:w-32`}
                value={peopleInput}
                onChange={(e) => setPeopleInput(Math.min(MAX_PEOPLE_BOOKING, Math.max(1, Number(e.target.value))))}
              />
            </label>
            <p className="mt-2 text-sm text-muted">ช่องที่มี * จำเป็นต้องกรอก</p>
          </fieldset>

          <p className="mb-3 text-sm">
            ช่วงเวลาที่เลือก: จองแล้ว {slotGroups}/{MAX_GROUPS} กลุ่ม · รวม {slotPeople}/{MAX_PEOPLE_ROOM} คน
          </p>

          {isSlotFull && (
            <p className="mb-3 text-sm text-danger">ช่วงเวลานี้มีผู้จองเต็มตามโควตาแล้ว กรุณาเลือกช่วงเวลาอื่น</p>
          )}

          {msg && <Alert msg={msg} />}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-start">
            <button
              disabled={isSlotFull || submitting}
              onClick={() => void handleBooking(selectedRoom)}
              className={btnPrimary}
              aria-busy={submitting}
            >
              {submitting ? 'กำลังตรวจสอบ...' : 'ยืนยันการจอง'}
            </button>
            <button onClick={closeRoom} className={btnGhost}>
              ยกเลิก
            </button>
          </div>

          <h3 className="mb-2 border-t border-line pt-4 text-base font-semibold text-ink">
            รายการจองของห้องนี้ ({roomBookings.length})
          </h3>
          {roomBookings.length === 0 ? (
            <p className="text-sm text-muted">ยังไม่มีการจองห้องนี้ เลือกวันและเวลาด้านบนเพื่อจองเป็นรายแรก</p>
          ) : (
            <ul className="space-y-2">
              {roomBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-ctl bg-surface-muted p-3 text-sm">
                  <span>
                    {fmtDate(b.date)} · {b.start} - {b.end} น. · {b.studentName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-primary">{b.peopleCount} คน</span>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {showMine && (
        <Dialog title="การจองของฉัน" onClose={closeMine}>
          {myBookings.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-semibold text-ink">ยังไม่มีรายการจอง</p>
              <p className="mt-1 text-sm text-muted">เลือกห้องจากหน้าหลักเพื่อจองห้องปฏิบัติการ</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {myBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-ctl bg-primary-soft p-3">
                  <div className="text-sm text-ink">
                    <p className="font-semibold">
                      ห้อง {b.roomName} ({b.peopleCount} คน)
                    </p>
                    <p>{fmtDate(b.date)}</p>
                    <p className="tabular-nums">
                      เวลา {b.start} - {b.end} น.
                    </p>
                  </div>
                  <button onClick={() => setConfirmCancel(b)} className={btnDanger}>
                    ยกเลิกการจอง
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {confirmCancel && (
        <Dialog title="ยืนยันการยกเลิกการจอง" onClose={closeConfirm}>
          <p className="mb-1 text-ink">
            ยกเลิกการจองห้อง &quot;{confirmCancel.roomName}&quot; วันที่ {fmtDate(confirmCancel.date)} เวลา{' '}
            {confirmCancel.start} - {confirmCancel.end} น.?
          </p>
          <p className="mb-6 text-sm text-muted">การยกเลิกไม่สามารถย้อนกลับได้</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-start">
            <button onClick={() => handleCancel(confirmCancel.id)} className={btnDanger}>
              ยกเลิกการจอง
            </button>
            <button onClick={closeConfirm} className={btnGhost}>
              ไม่ยกเลิก
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
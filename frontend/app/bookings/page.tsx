"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  EventIcon,
  Modal,
  dangerButtonClass,
  PageHeader,
  StatusBadge,
  Tabs,
  cardClass,
  iconDangerButtonClass,
  DeleteIcon,
  primaryButtonClass,
  secondaryButtonClass,
  tdClass,
  thClass,
} from "@/csmju";
import { api } from "../lib/api";
import { formatThaiShortDate, hhmm, todayInBangkok } from "../lib/format";
import { canBook, canManageTimetable, useSession } from "../lib/session";

type Booking = {
  id: string;
  roomName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  peopleCount: number;
  purpose: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
};

type Page = { items: Booking[]; total: number; totalPages: number };

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; page: Page };

const LIMIT = 20;

async function fetchBookings(
  scope: "mine" | "all",
  page: number,
): Promise<Load> {
  const result = await api<Booking[]>(
    `/api/v1/reservations?scope=${scope}&page=${page}&limit=${LIMIT}`,
  );
  if (!result.ok) return { state: "error", message: result.message };
  return {
    state: "ready",
    page: {
      items: result.data,
      total: Number(result.meta?.total ?? result.data.length),
      totalPages: Number(result.meta?.totalPages ?? 1),
    },
  };
}

export default function BookingsPage() {
  return (
    <Suspense>
      <Bookings />
    </Suspense>
  );
}

function Bookings() {
  const me = useSession();
  const justBooked = useSearchParams().get("booked");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [page, setPage] = useState(1);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<string | null>(
    justBooked ? "จองห้องเรียบร้อยแล้ว" : null,
  );

  const reload = useCallback(() => {
    setLoad({ state: "loading" });
    fetchBookings(scope, page).then(setLoad);
  }, [scope, page]);

  useEffect(() => {
    let current = true;
    fetchBookings(scope, page).then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
  }, [scope, page]);

  const cancel = async () => {
    if (!toCancel) return;
    const result = await api(`/api/v1/reservations/${toCancel.id}`, {
      method: "DELETE",
    });
    setToCancel(null);
    if (result.ok) {
      setNotice(`ยกเลิกการจอง ${toCancel.roomName} เรียบร้อยแล้ว`);
      reload();
    } else {
      setLoad({ state: "error", message: result.message });
    }
  };

  const today = todayInBangkok();
  const staff = canManageTimetable(me);

  return (
    <>
      <PageHeader
        title="การจองของฉัน"
        description="รายการจองห้องปฏิบัติการ ยกเลิกได้หากไม่ใช้ห้องแล้ว เพื่อเปิดที่ให้ผู้อื่น"
      />

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-success/10 px-4 py-3 text-body-md text-emerald-700"
        >
          {notice}
        </p>
      )}

      <section className={cardClass} aria-label="รายการจอง">
        <div className="flex flex-col gap-4 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
          {staff ? (
            <Tabs
              tabs={[
                { id: "mine", label: "ของฉัน" },
                { id: "all", label: "ทุกคน" },
              ]}
              active={scope}
              onChange={(id) => {
                setScope(id);
                setPage(1);
              }}
            />
          ) : (
            <h2 className="font-display text-headline-md text-on-surface">
              รายการจอง
            </h2>
          )}
          {canBook(me) && (
            <Link href="/" className={primaryButtonClass}>
              จองห้อง
            </Link>
          )}
        </div>

        {load.state === "loading" && (
          <div aria-busy="true" className="space-y-3 px-6 py-5">
            <span className="sr-only">กำลังโหลดข้อมูล...</span>
            {Array.from({ length: 3 }, (_, i) => (
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

        {load.state === "ready" && load.page.items.length === 0 && (
          <div className="space-y-3 px-6 py-12 text-center">
            <EventIcon className="mx-auto h-10 w-10 text-outline" />
            <p className="text-body-md text-on-surface">ยังไม่มีการจอง</p>
            <p className="text-body-md text-on-surface-variant">
              เลือกห้องที่ต้องการ แล้วกำหนดวันและเวลาที่จะใช้
            </p>
            {canBook(me) && (
              <Link href="/" className={`${secondaryButtonClass} inline-block`}>
                ไปหน้าเลือกห้อง
              </Link>
            )}
          </div>
        )}

        {load.state === "ready" && load.page.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-surface text-label-md text-on-surface-variant">
                    <th className={thClass}>วันที่</th>
                    <th className={thClass}>เวลา</th>
                    <th className={thClass}>ห้อง</th>
                    <th className={`${thClass} text-right`}>คน</th>
                    <th className={thClass}>วัตถุประสงค์</th>
                    <th className={thClass}>สถานะ</th>
                    <th className={`${thClass} text-right`}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {load.page.items.map((b) => {
                    const past = b.bookingDate < today;
                    return (
                      <tr
                        key={b.id}
                        className={`border-b border-outline-variant/40 text-body-md last:border-0 hover:bg-surface/50 ${
                          past ? "opacity-80" : ""
                        }`}
                      >
                        <td
                          className={`${tdClass} whitespace-nowrap font-medium text-on-surface`}
                        >
                          {formatThaiShortDate(b.bookingDate)}
                        </td>
                        <td
                          className={`${tdClass} whitespace-nowrap tabular-nums text-on-surface-variant`}
                        >
                          {hhmm(b.startTime)}–{hhmm(b.endTime)} น.
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {b.roomName}
                        </td>
                        <td className={`${tdClass} text-right tabular-nums`}>
                          {b.peopleCount}
                        </td>
                        <td className={`${tdClass} text-on-surface-variant`}>
                          {b.purpose}
                        </td>
                        <td className={tdClass}>
                          <StatusBadge
                            tone={past ? "neutral" : "info"}
                            label={past ? "ผ่านไปแล้ว" : "จองแล้ว"}
                          />
                        </td>
                        <td className={`${tdClass} text-right`}>
                          {!past && (
                            <button
                              type="button"
                              onClick={() => setToCancel(b)}
                              aria-label={`ยกเลิกการจอง ${b.roomName} ${formatThaiShortDate(b.bookingDate)}`}
                              className={iconDangerButtonClass}
                            >
                              <DeleteIcon className="h-5 w-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {load.page.totalPages > 1 && (
              <nav
                aria-label="เปลี่ยนหน้า"
                className="flex items-center justify-between border-t border-outline-variant/40 px-6 py-4"
              >
                <span className="text-body-md tabular-nums text-on-surface-variant">
                  หน้า {page} จาก {load.page.totalPages} · ทั้งหมด{" "}
                  {load.page.total} รายการ
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
                    disabled={page >= load.page.totalPages}
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

      {toCancel && (
        <Modal title="ยกเลิกการจอง" onClose={() => setToCancel(null)}>
          <p className="text-body-md text-on-surface-variant">
            ยกเลิกการจอง{" "}
            <strong className="text-on-surface">{toCancel.roomName}</strong>{" "}
            {formatThaiShortDate(toCancel.bookingDate)} เวลา{" "}
            {hhmm(toCancel.startTime)}–{hhmm(toCancel.endTime)} น.?
            ช่วงเวลานี้จะเปิดให้ผู้อื่นจองได้ทันที
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setToCancel(null)}
              className={secondaryButtonClass}
            >
              ไม่ยกเลิก
            </button>
            <button
              type="button"
              onClick={cancel}
              className={dangerButtonClass}
            >
              ยกเลิกการจอง
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

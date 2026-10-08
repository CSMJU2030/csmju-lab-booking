"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MeetingRoomIcon,
  PageHeader,
  SearchIcon,
  StatusBadge,
  cardClass,
  inputClass,
  secondaryButtonClass,
} from "@/csmju";
import { api } from "./lib/api";
import { hhmm, timeRange } from "./lib/format";
import { canBook, useSession } from "./lib/session";
import WeeklyTimetable, {
  type TimetableEntry,
} from "./components/WeeklyTimetable";

type Room = { id: string; name: string; building: string | null };

type ClassInfo = {
  courseCode: string;
  courseName: string;
  time: string;
  startTime?: string;
};

type RoomStatus = {
  roomName: string;
  isOccupied: boolean;
  currentClass: ClassInfo | null;
  nextClass: ClassInfo | null;
  allSchedules?: TimetableEntry[];
};

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      rooms: Room[];
      status: Map<string, RoomStatus>;
      at: Date;
    };

const clock = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

async function loadRooms(): Promise<Load> {
  const [rooms, status] = await Promise.all([
    api<Room[]>("/api/v1/rooms"),
    api<RoomStatus[]>("/api/v1/schedules/status"),
  ]);
  if (!rooms.ok) return { state: "error", message: rooms.message };
  if (!status.ok) return { state: "error", message: status.message };
  return {
    state: "ready",
    rooms: rooms.data,
    status: new Map(status.data.map((s) => [s.roomName, s])),
    at: new Date(),
  };
}

export default function RoomsPage() {
  const me = useSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");

  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    loadRooms().then(setLoad);
  }, []);

  useEffect(() => {
    let current = true;
    loadRooms().then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
  }, []);

  const rooms = useMemo(() => {
    if (load.state !== "ready") return [];
    const q = query.trim().toLowerCase();
    return load.rooms.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.building ?? "").includes(q),
    );
  }, [load, query]);

  return (
    <>
      <PageHeader
        title="ห้องปฏิบัติการ"
        description="ดูว่าห้องไหนว่างตอนนี้ แล้วเลือกวันและเวลาที่ต้องการจอง"
      />

      <section className={cardClass} aria-labelledby="rooms-heading">
        <div className="flex flex-col gap-4 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2
              id="rooms-heading"
              className="font-display text-headline-md text-on-surface"
            >
              ห้องทั้งหมด
            </h2>
            {load.state === "ready" && (
              <p className="text-body-md text-on-surface-variant">
                สถานะ ณ เวลา {clock.format(load.at)} น.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
              <label htmlFor="room-search" className="sr-only">
                ค้นหาห้อง
              </label>
              <input
                id="room-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาห้องหรืออาคาร"
                className={`${inputClass} pl-10`}
              />
            </div>
            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}
            >
              อัปเดตสถานะ
            </button>
          </div>
        </div>

        {load.state === "loading" && <RoomsSkeleton />}

        {load.state === "error" && (
          <div role="alert" className="space-y-4 px-6 py-12 text-center">
            <p className="text-body-md text-on-surface">
              โหลดข้อมูลห้องไม่สำเร็จ
            </p>
            <p className="text-body-md text-on-surface-variant">
              {load.message}
            </p>
            <button
              type="button"
              onClick={refresh}
              className={secondaryButtonClass}
            >
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {load.state === "ready" && rooms.length === 0 && (
          <div className="space-y-3 px-6 py-12 text-center">
            <MeetingRoomIcon className="mx-auto h-10 w-10 text-outline" />
            {load.rooms.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">
                ยังไม่มีห้องในระบบ ผู้ดูแลต้องเพิ่มห้องก่อนจึงจะจองได้
              </p>
            ) : (
              <>
                <p className="text-body-md text-on-surface-variant">
                  ไม่พบห้องที่ตรงกับ “{query}”
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className={secondaryButtonClass}
                >
                  ล้างคำค้นหา
                </button>
              </>
            )}
          </div>
        )}

        {load.state === "ready" && rooms.length > 0 && (
          <ul className="divide-y divide-outline-variant/40">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                status={load.status.get(room.name)}
                bookable={canBook(me)}
              />
            ))}
          </ul>
        )}
      </section>

      {load.state === "ready" && (
        <TimetableSection
          load={load}
          selectedRoom={selectedRoom}
          onSelect={setSelectedRoom}
        />
      )}
    </>
  );
}

const DAY_KEYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function TimetableSection({
  load,
  selectedRoom,
  onSelect,
}: {
  load: Extract<Load, { state: "ready" }>;
  selectedRoom: string;
  onSelect: (name: string) => void;
}) {
  const names = [...load.status.keys()];
  if (names.length === 0) return null;
  const current = names.includes(selectedRoom) ? selectedRoom : names[0];
  const entries = load.status.get(current)?.allSchedules ?? [];
  const todayKey =
    DAY_KEYS[
      new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
      ).getDay()
    ];

  return (
    <section
      className={`${cardClass} mt-6`}
      aria-labelledby="timetable-heading"
    >
      <div className="flex flex-col gap-4 border-b border-outline-variant/40 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2
            id="timetable-heading"
            className="font-display text-headline-md text-on-surface"
          >
            ตารางการใช้ห้อง
          </h2>
          <p className="text-body-md text-on-surface-variant">
            คาบเรียนประจำสัปดาห์ของแต่ละห้อง
          </p>
        </div>
        <div className="sm:w-64">
          <label
            htmlFor="timetable-room"
            className="mb-1 block text-label-md text-on-surface-variant"
          >
            เลือกห้อง
          </label>
          <select
            id="timetable-room"
            value={current}
            onChange={(e) => onSelect(e.target.value)}
            className={inputClass}
          >
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <WeeklyTimetable entries={entries} todayKey={todayKey} />
    </section>
  );
}

function RoomRow({
  room,
  status,
  bookable,
}: {
  room: Room;
  status: RoomStatus | undefined;
  bookable: boolean;
}) {
  const busy = status?.isOccupied ?? false;
  const next = status?.nextClass;

  return (
    <li className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-body-lg font-semibold text-on-surface">
            {room.name}
          </h3>
          <StatusBadge
            tone={busy ? "error" : "success"}
            label={busy ? "มีเรียนอยู่ตอนนี้" : "ว่างตอนนี้"}
          />
        </div>
        {room.building && (
          <p className="text-body-md text-on-surface-variant">
            {room.building}
          </p>
        )}
        {busy && status?.currentClass ? (
          <p className="text-body-md text-on-surface-variant">
            {status.currentClass.courseCode} {status.currentClass.courseName} ·{" "}
            {timeRange(status.currentClass.time)}
          </p>
        ) : next ? (
          <p className="text-body-md text-on-surface-variant">
            คาบถัดไปวันนี้ {hhmm(next.startTime ?? next.time)} น. ·{" "}
            {next.courseCode} {next.courseName}
          </p>
        ) : (
          <p className="text-body-md text-on-surface-variant">
            ไม่มีคาบเรียนเหลือในวันนี้
          </p>
        )}
      </div>

      {bookable && (
        <Link
          href={`/rooms/${room.id}/book`}
          className={`${secondaryButtonClass} inline-flex shrink-0 justify-center`}
        >
          เลือกวันและเวลาจอง
        </Link>
      )}
    </li>
  );
}

function RoomsSkeleton() {
  return (
    <div aria-busy="true" className="divide-y divide-outline-variant/40">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2 px-6 py-5">
          <div className="h-6 w-40 animate-pulse rounded-lg bg-surface-container" />
          <div className="h-5 w-72 animate-pulse rounded-lg bg-surface-container" />
        </div>
      ))}
    </div>
  );
}

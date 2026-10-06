"use client";

import { useEffect, useState } from "react";
import { CsmjuAppShell, TONE_STYLES, type NavItem } from "@/csmju";
import { api } from "../lib/api";
import {
  ROLE_LABELS,
  SessionContext,
  canBook,
  canManageTimetable,
  type Me,
} from "../lib/session";

const DISPLAY_NAME = "ระบบจองห้องปฏิบัติการ";

const ROOMS_NAV: NavItem = {
  label: "ห้องปฏิบัติการ",
  labelEn: "Rooms",
  href: "/",
  icon: "meeting-room",
};

/** เมนูการจอง — แสดงเฉพาะผู้ที่จองห้องได้ (ศิษย์เก่าดูได้อย่างเดียว) */
const BOOKINGS_NAV: NavItem = {
  label: "การจองของฉัน",
  labelEn: "My bookings",
  href: "/bookings",
  icon: "event",
};

/** เมนูสำหรับอาจารย์ — แสดงเฉพาะผู้ที่จัดการตารางเรียนได้ */
const INSTRUCTOR_NAV: NavItem = {
  label: "จัดการตารางเรียน",
  labelEn: "Timetable",
  href: "/instructor",
  icon: "menu-book",
};

const initialsOf = (email: string) => email.slice(0, 2).toUpperCase();

/**
 * ครอบทุกหน้าด้วย CsmjuAppShell (ui-design-system.md ข้อ 5.1) และส่งข้อมูลผู้ใช้
 * จาก GET /api/v1/me ให้ทุกหน้าผ่าน SessionContext
 */
export default function Shell({
  coreHubUrl,
  children,
}: {
  coreHubUrl?: string;
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let current = true;
    api<Me>("/api/v1/me").then((result) => {
      if (current && result.ok) setMe(result.data);
    });
    return () => {
      current = false;
    };
  }, []);

  const isInstructor = canManageTimetable(me);
  // ไม่มีสิทธิ์ = ไม่แสดงเมนู (ui-design-system.md ข้อ 9)
  const nav: NavItem[] = [
    ROOMS_NAV,
    ...(canBook(me) ? [BOOKINGS_NAV] : []),
    ...(isInstructor ? [INSTRUCTOR_NAV] : []),
  ];
  // LOCAL_TEST_ROLE ของ backend: ไม่มี Core Hub จึงใช้อีเมล @localhost
  const isLocalTest = me?.email.endsWith("@localhost") ?? false;

  return (
    <SessionContext.Provider value={me}>
      <CsmjuAppShell
        displayName={DISPLAY_NAME}
        nav={nav}
        primaryAction={
          isInstructor
            ? { label: "เพิ่มคาบเรียน", href: "/instructor" }
            : undefined
        }
        user={{
          initials: me ? initialsOf(me.email) : "··",
          roleLabel: me ? ROLE_LABELS[me.subsystemRole] : "กำลังโหลด",
        }}
        coreHubUrl={coreHubUrl}
      >
        {isLocalTest && (
          <p
            role="status"
            className={`rounded-lg px-4 py-3 text-body-md ${TONE_STYLES.warning.badge}`}
          >
            โหมดทดสอบในเครื่อง (ไม่มี Core Hub) — ทุกคำขอเป็นผู้ใช้ทดสอบบทบาท
            {me ? ` ${ROLE_LABELS[me.subsystemRole]}` : ""}
          </p>
        )}
        {children}
      </CsmjuAppShell>
    </SessionContext.Provider>
  );
}

"use client";

import { createContext, useContext } from "react";

export type SubsystemRole = "STUDENT" | "ALUMNI" | "STAFF" | "ADMIN";

export type Me = { id: string; email: string; subsystemRole: SubsystemRole };

/**
 * ใครกำลังใช้งานอยู่ (จาก GET /api/v1/me) — ใช้แค่ซ่อน/แสดงเมนูและปุ่ม
 * (ui-design-system.md ข้อ 10) การบังคับสิทธิ์จริงอยู่ที่ backend เสมอ
 */
export const SessionContext = createContext<Me | null>(null);

export const useSession = () => useContext(SessionContext);

/** ตรงกับ permission ใน backend/src/auth/permissions.ts */
export const canBook = (me: Me | null) =>
  me !== null && me.subsystemRole !== "ALUMNI";

export const canManageTimetable = (me: Me | null) =>
  me?.subsystemRole === "STAFF" || me?.subsystemRole === "ADMIN";

export const ROLE_LABELS: Record<SubsystemRole, string> = {
  STUDENT: "นักศึกษา",
  ALUMNI: "ศิษย์เก่า",
  STAFF: "อาจารย์/เจ้าหน้าที่",
  ADMIN: "ผู้ดูแลระบบ",
};

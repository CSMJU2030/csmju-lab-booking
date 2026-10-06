import { cardClass } from "@/csmju";

// Skeleton ที่มีรูปร่างเหมือนหน้าจริง (ui-design-system.md §9.1) — ห้ามใช้ spinner กลางจอ
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">กำลังโหลดข้อมูล...</span>
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-container" />
        <div className="h-5 w-72 animate-pulse rounded-lg bg-surface-container" />
      </div>
      <div className={cardClass}>
        <div className="border-b border-outline-variant/40 px-6 py-5">
          <div className="h-11 animate-pulse rounded-lg bg-surface-container" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="border-b border-outline-variant/40 px-6 py-4 last:border-0"
          >
            <div className="h-6 animate-pulse rounded-lg bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  );
}

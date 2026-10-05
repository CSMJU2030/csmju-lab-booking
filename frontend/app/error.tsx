'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-semibold text-ink">ระบบขัดข้องชั่วคราว</h1>
      <p className="mb-6 text-body">
        กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ
        {error.digest ? ` พร้อมรหัสอ้างอิง: ${error.digest}` : ''}
      </p>
      <button
        onClick={reset}
        className="inline-flex min-h-10 items-center justify-center rounded-ctl bg-primary px-4 text-base font-semibold text-on-primary hover:bg-primary-hover"
      >
        ลองอีกครั้ง
      </button>
    </main>
  );
}
import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-semibold text-ink">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mb-6 text-body">หน้านี้อาจถูกลบไปแล้วหรือลิงก์ไม่ถูกต้อง</p>
      <Link
        href="/"
        className="inline-flex min-h-10 items-center justify-center rounded-ctl bg-primary-soft px-4 text-base font-semibold text-primary"
      >
        กลับหน้าหลัก
      </Link>
    </main>
  );
}
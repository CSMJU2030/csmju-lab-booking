import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ระบบจองห้องปฏิบัติการ · CSMJU',
    template: '%s · ระบบจองห้องปฏิบัติการ · CSMJU',
  },
  description: 'ระบบจองห้องปฏิบัติการคอมพิวเตอร์ สาขาวิชาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[600] focus:rounded-ctl focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        {children}
      </body>
    </html>
  );
}
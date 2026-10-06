import type { Metadata } from "next";
import { Noto_Sans_Thai, Plus_Jakarta_Sans } from "next/font/google";
import Shell from "./components/Shell";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
});

const DISPLAY_NAME = "ระบบจองห้องปฏิบัติการ";

export const metadata: Metadata = {
  title: {
    template: `%s · ${DISPLAY_NAME} · CSMJU`,
    default: `${DISPLAY_NAME} · CSMJU`,
  },
  description:
    "ดูสถานะและจองห้องปฏิบัติการคอมพิวเตอร์ สาขาวิชาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้",
};

// ลิงก์ "กลับ CSMJU Portal" — มาจาก .env เท่านั้น ไม่ hardcode
const CORE_HUB_WEB_URL = process.env.CORE_HUB_WEB_URL;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${jakarta.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-on-surface">
        <Shell coreHubUrl={CORE_HUB_WEB_URL}>{children}</Shell>
      </body>
    </html>
  );
}

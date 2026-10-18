import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "إدارة مخزون المواد",
  description: "نظام بسيط لإدارة الوارد والصادر والمخزون",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}

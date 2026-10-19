import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Company Stocks | إدارة المخزون",
    template: "%s | Company Stocks",
  },
  description: "نظام Company Stocks لإدارة الأصناف والمخزون وحركات الوارد والصادر.",
  applicationName: "Company Stocks",
  icons: {
    icon: [{ url: "/company-stocks.svg", type: "image/svg+xml" }],
    shortcut: ["/company-stocks.svg"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B2D5B",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}

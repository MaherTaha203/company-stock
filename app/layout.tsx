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
    icon: [{ url: "/a_clean_high_resolution_modern_app_icon_style_gr.png", type: "image/png" }],
    shortcut: ["/a_clean_high_resolution_modern_app_icon_style_gr.png"],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B2D5B",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}

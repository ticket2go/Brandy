import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brandsystem",
  description: "Brandsystem – Next.js 14 mit Tailwind CSS und App Router",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="font-sans">{children}</body>
    </html>
  );
}

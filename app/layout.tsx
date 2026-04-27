import type { Metadata } from "next";
import { Epilogue } from "next/font/google";

import { SessionProvider } from "@/components/SessionProvider";

import "./globals.css";

const epilogue = Epilogue({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-epilogue",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

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
    <html lang="de" className={epilogue.variable}>
      <body className="font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

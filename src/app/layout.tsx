import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KNCC RFID Attendance System",
  description: "RFID-based student attendance management for KN/Kilinochchi Central College",
  icons: {
    icon: "/school-logo.png",
    apple: "/school-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  );
}

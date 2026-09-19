import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-navy-950 via-navy-900 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-1.5 shadow-lg ring-2 ring-gold-400">
            <Image src="/school-logo.png" alt="KN/Kilinochchi Central College crest" width={56} height={56} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-lg font-semibold text-white">KNCC RFID Attendance System</h1>
          <p className="mt-1 text-sm text-gold-300">KN/Kilinochchi Central College</p>
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

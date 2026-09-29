"use client";

import { useRouter } from "next/navigation";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Image from "next/image";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleCheck() {
    setChecking(true);
    router.refresh();
    setTimeout(() => setChecking(false), 600);
  }

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

        <div className="card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Clock3 className="h-7 w-7" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Awaiting approval</h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Your account request has been received. A Super Admin needs to approve your account and assign a role
            before you can access the dashboard. You&apos;ll be able to sign in normally once that happens.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={handleCheck} disabled={checking} className="btn-secondary w-full">
              <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Check status
            </button>
            <button onClick={handleLogout} className="btn-outline w-full">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

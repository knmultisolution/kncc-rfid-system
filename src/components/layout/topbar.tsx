"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";
import { ROLE_LABELS, type Profile } from "@/types";
import toast from "react-hot-toast";

export function Topbar({ profile, onMenuClick }: { profile: Profile; onMenuClick: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-b-slate-200 border-t-2 border-t-navy-700 bg-white/80 px-4 backdrop-blur dark:border-b-slate-800 dark:bg-slate-900/80 sm:px-6">
      <button onClick={onMenuClick} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden lg:block">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="relative ml-auto">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initials(profile.full_name)}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">{profile.full_name}</p>
            <p className="text-xs leading-tight text-slate-500 dark:text-slate-400">
              {profile.role ? ROLE_LABELS[profile.role] : "—"}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{profile.full_name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

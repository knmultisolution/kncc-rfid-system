"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Users,
  CreditCard,
  GraduationCap,
  Layers,
  BookOpen,
  UserCog,
  ShieldCheck,
  ClipboardList,
  FileBarChart,
  Cpu,
  CloudOff,
  MessageSquare,
  History,
  Settings,
  UserPlus,
  X,
} from "lucide-react";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
      { href: "/live-attendance", label: "Live Attendance", icon: Radio, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
    ],
  },
  {
    title: "Academics",
    items: [
      { href: "/students", label: "Students", icon: Users, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
      { href: "/rfid-cards", label: "RFID Cards", icon: CreditCard, roles: ["super_admin"] },
      { href: "/grades", label: "Grades", icon: GraduationCap, roles: ["super_admin"] },
      { href: "/divisions", label: "Divisions", icon: Layers, roles: ["super_admin"] },
      { href: "/classes", label: "Classes", icon: BookOpen, roles: ["super_admin"] },
    ],
  },
  {
    title: "Attendance",
    items: [
      { href: "/attendance", label: "Attendance", icon: ClipboardList, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
      { href: "/reports", label: "Reports", icon: FileBarChart, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
      { href: "/comments", label: "Comments", icon: MessageSquare, roles: ["super_admin", "principal", "sectional_head", "teacher"] },
    ],
  },
  {
    title: "Devices",
    items: [
      { href: "/rfid-devices", label: "RFID Devices", icon: Cpu, roles: ["super_admin"] },
      { href: "/offline-sync", label: "Offline Sync", icon: CloudOff, roles: ["super_admin"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/users", label: "Users", icon: UserCog, roles: ["super_admin"] },
      { href: "/admin/access-requests", label: "Access Requests", icon: UserPlus, roles: ["super_admin"] },
      { href: "/roles-permissions", label: "Roles & Permissions", icon: ShieldCheck, roles: ["super_admin"] },
      { href: "/audit-logs", label: "Audit Logs", icon: History, roles: ["super_admin"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["super_admin"] },
    ],
  },
];

export function Sidebar({
  role,
  open,
  onClose,
}: {
  role: UserRole;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-navy-950 px-5 py-4 dark:border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1 ring-2 ring-brand-400">
              <Image src="/school-logo.png" alt="KN/Kilinochchi Central College crest" width={32} height={32} className="h-full w-full object-contain" priority />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">KNCC RFID</p>
              <p className="text-[11px] text-brand-300">Kilinochchi Central College</p>
            </div>
          </Link>
          <button onClick={onClose} className="rounded-md p-1 text-navy-300 hover:bg-navy-900 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((i) => i.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div key={section.title}>
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        )}
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

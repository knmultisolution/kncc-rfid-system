import { requireApprovedProfile } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireApprovedProfile();
  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}

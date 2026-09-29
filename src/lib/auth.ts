import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/types";

/**
 * Fetch the signed-in user's profile. Redirects to /login if there is no
 * session. Does NOT enforce approval/role - use requireApprovedProfile()
 * for pages that need an approved, role-assigned user (middleware also
 * enforces this, this is defense-in-depth for Server Components).
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data as Profile | null;
}

export async function requireApprovedProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "approved" || !profile.role) redirect("/pending-approval");
  return profile;
}

export async function requireRole(roles: Profile["role"][]): Promise<Profile> {
  const profile = await requireApprovedProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

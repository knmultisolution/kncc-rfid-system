import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { NAV_ROLES } from "@/types";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (path === "/") {
    return NextResponse.redirect(new URL(user ? "/dashboard" : "/login", request.url));
  }

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user) {
    if (isPublic) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated: fetch profile once to decide status/role gating.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, role")
    .eq("id", user.id)
    .maybeSingle();

  if (path.startsWith("/reset-password")) return response;

  if (isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!profile || profile.status !== "approved" || !profile.role) {
    if (path === "/pending-approval") return response;
    return NextResponse.redirect(new URL("/pending-approval", request.url));
  }

  if (path === "/pending-approval") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Role-based section gating
  const matchedRule = Object.entries(NAV_ROLES).find(([prefix]) => path.startsWith(prefix));
  if (matchedRule) {
    const [, allowedRoles] = matchedRule;
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/device|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$).*)",
  ],
};

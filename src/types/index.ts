export type UserRole = "super_admin" | "principal" | "sectional_head" | "teacher";
export type AccountStatus = "pending" | "approved" | "rejected" | "disabled";
export type StudentStatus = "active" | "inactive" | "transferred" | "graduated";
export type CardStatus = "unregistered" | "active" | "disabled" | "lost" | "replaced";
export type AttendanceStatus = "present" | "late" | "absent";
export type AttendanceType = "entry" | "exit";
export type SyncStatus = "synced" | "pending" | "failed";
export type DeviceStatus = "online" | "offline" | "unknown";
export type Gender = "male" | "female" | "other";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole | null;
  status: AccountStatus;
  is_first_super_admin: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Grade {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export interface Division {
  id: string;
  name: string;
  created_at: string;
}

export interface SchoolClass {
  id: string;
  grade_id: string;
  division_id: string;
  class_teacher_id: string | null;
  room: string | null;
  created_at: string;
  grade?: Grade;
  division?: Division;
}

export interface Student {
  id: string;
  student_code: string;
  index_number: string;
  full_name: string;
  grade_id: string | null;
  division_id: string | null;
  class_id: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  address: string | null;
  status: StudentStatus;
  registration_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  grade?: Grade | null;
  division?: Division | null;
  class?: SchoolClass | null;
  rfid_cards?: RfidCard[];
}

export interface RfidCard {
  id: string;
  rfid_uid: string;
  student_id: string | null;
  status: CardStatus;
  registered_at: string | null;
  disabled_at: string | null;
  replaced_card_id: string | null;
  last_scanned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  student?: Student | null;
}

export interface AttendanceDevice {
  id: string;
  device_code: string;
  device_name: string;
  location: string | null;
  status: DeviceStatus;
  firmware_version: string | null;
  ip_address: string | null;
  last_heartbeat_at: string | null;
  last_scan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  rfid_card_id: string | null;
  device_id: string | null;
  attendance_date: string;
  scan_time: string;
  attendance_type: AttendanceType;
  status: AttendanceStatus;
  sync_status: SyncStatus;
  is_manual_edit: boolean;
  edited_by: string | null;
  edit_reason: string | null;
  created_at: string;
  student?: Student;
  device?: AttendanceDevice | null;
}

export interface Comment {
  id: string;
  student_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  actor?: Profile | null;
}

export interface SchoolSettings {
  id: number;
  school_name: string;
  late_after_time: string;
  school_start_time: string;
  school_end_time: string;
  duplicate_scan_window_seconds: number;
  entry_exit_cutover_time: string;
  updated_by: string | null;
  updated_at: string;
}

export interface AccessRequest {
  id: string;
  profile_id: string;
  requested_role: UserRole | null;
  note: string | null;
  status: AccountStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile?: Profile;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  principal: "Principal",
  sectional_head: "Sectional Head",
  teacher: "Teacher",
};

export const NAV_ROLES: Record<string, UserRole[]> = {
  "/dashboard": ["super_admin", "principal", "sectional_head", "teacher"],
  "/live-attendance": ["super_admin", "principal", "sectional_head", "teacher"],
  "/students": ["super_admin", "principal", "sectional_head", "teacher"],
  "/rfid-cards": ["super_admin"],
  "/grades": ["super_admin"],
  "/divisions": ["super_admin"],
  "/classes": ["super_admin"],
  "/users": ["super_admin"],
  "/roles-permissions": ["super_admin"],
  "/attendance": ["super_admin", "principal", "sectional_head", "teacher"],
  "/reports": ["super_admin", "principal", "sectional_head", "teacher"],
  "/rfid-devices": ["super_admin"],
  "/offline-sync": ["super_admin"],
  "/comments": ["super_admin", "principal", "sectional_head", "teacher"],
  "/audit-logs": ["super_admin"],
  "/settings": ["super_admin"],
  "/admin/access-requests": ["super_admin"],
};

import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  supabase: SupabaseClient,
  params: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  }
) {
  await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    details: params.details ?? null,
  });
}

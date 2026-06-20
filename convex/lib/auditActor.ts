import type { Doc, Id } from "../_generated/dataModel";

export const AUDIT_ACTOR_NAME_KEY = "actorName";
export const AUDIT_ACTOR_EMAIL_KEY = "actorEmail";

export type AuditActorSnapshot = {
  actorName?: string;
  actorEmail?: string;
};

export type ResolvedAuditActor = {
  _id: Id<"users">;
  name: string;
  email: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read name/email snapshotted at write time (survives user deletion). */
export function readActorSnapshotFromMetadata(metadata: unknown): AuditActorSnapshot {
  if (!isPlainObject(metadata)) return {};
  const actorName = metadata[AUDIT_ACTOR_NAME_KEY];
  const actorEmail = metadata[AUDIT_ACTOR_EMAIL_KEY];
  return {
    actorName: typeof actorName === "string" && actorName.trim() ? actorName : undefined,
    actorEmail: typeof actorEmail === "string" ? actorEmail : undefined,
  };
}

/** Merge actor snapshot into metadata without dropping existing fields. */
export function mergeActorSnapshotIntoMetadata(
  metadata: unknown,
  snapshot: AuditActorSnapshot,
): Record<string, unknown> {
  const base = isPlainObject(metadata) ? { ...metadata } : {};
  if (snapshot.actorName) base[AUDIT_ACTOR_NAME_KEY] = snapshot.actorName;
  if (snapshot.actorEmail) base[AUDIT_ACTOR_EMAIL_KEY] = snapshot.actorEmail;
  return base;
}

export function resolveAuditActor(
  actorId: Id<"users"> | undefined,
  user: Doc<"users"> | null | undefined,
  metadata: unknown,
): ResolvedAuditActor | null {
  if (!actorId) return null;

  if (user) {
    return { _id: actorId, name: user.name, email: user.email };
  }

  const snapshot = readActorSnapshotFromMetadata(metadata);
  if (snapshot.actorName) {
    return {
      _id: actorId,
      name: snapshot.actorName,
      email: snapshot.actorEmail ?? "",
    };
  }

  return { _id: actorId, name: "Unknown", email: "" };
}

/** Original surveyor name from a later `survey.draft_reassigned` row on the same survey. */
export function readReassignmentFromMetadata(metadata: unknown): {
  fromSurveyorId?: Id<"users">;
  fromSurveyorName?: string;
} {
  if (!isPlainObject(metadata)) return {};
  const fromSurveyorName = metadata.fromSurveyorName;
  const fromSurveyorId = metadata.fromSurveyorId;
  return {
    fromSurveyorName: typeof fromSurveyorName === "string" && fromSurveyorName.trim() ? fromSurveyorName : undefined,
    fromSurveyorId: typeof fromSurveyorId === "string" ? (fromSurveyorId as Id<"users">) : undefined,
  };
}

/**
 * Survey edit lifecycle — who can write, how rows are resolved, and post-save status.
 *
 * Two independent axes:
 *  - `status`     — surveyor workflow (draft → submitted → approved)
 *  - `qcStatus`   — supervisor decision (pending → approved | rejected)
 *
 * QC rejection sets status back to draft while qcStatus stays rejected so the
 * surveyor can fix and resubmit. While a survey sits in the QC queue
 * (submitted + pending), both the assigned surveyor and supervisors may save
 * corrections without pulling it out of review.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { hasCapability } from "./capabilities";
import { isOwnScopeSurveyor } from "./fieldAccess";
import { clientError } from "./helpers";
import { assertMunicipalityInScope } from "./tenancy";

/** Admin emergency edit — any survey state except when explicitly locked downstream. */
async function canAdminEmergencyEdit(ctx: MutationCtx, user: Doc<"users">): Promise<boolean> {
  if (user.role === "admin") return true;
  return await hasCapability(ctx, user, "surveys.viewAll");
}

/** Gate draft saves — dynamic roles use `surveys.editDraft`; legacy supervisors may only have `qc.review`. */
export async function requireSurveyDraftEdit(ctx: MutationCtx, user: Doc<"users">): Promise<void> {
  const [canEditDraft, canQcReview] = await Promise.all([
    hasCapability(ctx, user, "surveys.editDraft"),
    hasCapability(ctx, user, "qc.review"),
  ]);
  if (canEditDraft || canQcReview) return;
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "You don't have permission for this action.",
  });
}

export async function assertSurveyWritable(ctx: MutationCtx, me: Doc<"users">, survey: Doc<"surveys">): Promise<void> {
  const [isAdmin, canQcReview, canEditDraft] = await Promise.all([
    canAdminEmergencyEdit(ctx, me),
    hasCapability(ctx, me, "qc.review"),
    hasCapability(ctx, me, "surveys.editDraft"),
  ]);

  if (isAdmin) return;

  if (survey.qcStatus === "approved") {
    clientError("LOCKED", "This survey is approved — contact an administrator to re-open it");
  }

  // In QC queue: only QC staff may correct data; field roles cannot edit after submit.
  if (survey.status === "submitted" && survey.qcStatus === "pending") {
    if (canQcReview) return;
    clientError("LOCKED", "Survey is in QC review — only QC staff can edit until a decision is made");
  }

  // Draft / returned for correction — field surveyor or field supervisor & qc.review.
  if (survey.status === "draft") {
    const ownScope = await isOwnScopeSurveyor(ctx, me);
    if (ownScope && survey.surveyorId !== me._id) {
      clientError("FORBIDDEN", "Not your survey");
    }
    if (canEditDraft) return;
    clientError("FORBIDDEN", "You don't have permission to edit this survey");
  }

  clientError("LOCKED", "This survey cannot be edited in its current state");
}

/** Status axes after a successful save — never implicitly resubmit or approve. */
export function resolvePostSaveStatuses(existing: Doc<"surveys">): Pick<Doc<"surveys">, "status" | "qcStatus"> {
  if (existing.qcStatus === "approved") {
    // Supervisor/admin edit re-queues for QC without changing the surveyor assignment.
    return { status: "submitted", qcStatus: "pending" };
  }

  if (existing.status === "submitted" && existing.qcStatus === "pending") {
    return { status: "submitted", qcStatus: "pending" };
  }

  if (existing.status === "draft" && existing.qcStatus === "rejected") {
    return { status: "draft", qcStatus: "rejected" };
  }

  if (existing.status === "submitted") {
    return { status: "submitted", qcStatus: existing.qcStatus };
  }

  if (existing.status === "approved") {
    return { status: "approved", qcStatus: existing.qcStatus };
  }

  return { status: "draft", qcStatus: existing.qcStatus };
}

export function auditActionForSave(existing: Doc<"surveys"> | null, isOwnScope: boolean, isNewDraft: boolean): string {
  if (!existing || isNewDraft) return isNewDraft ? "survey.created" : "survey.draft_saved";
  if (existing.status === "submitted" && existing.qcStatus === "pending") {
    return isOwnScope ? "survey.edited_in_review" : "survey.qc_corrected";
  }
  if (existing.status === "draft" && existing.qcStatus === "rejected") {
    return "survey.corrected";
  }
  if (existing.status === "draft") return "survey.draft_saved";
  return "survey.updated";
}

/**
 * Resolve the survey row being edited.
 *
 * Mobile surveyors sync via `localId`. Web editors (especially supervisors doing
 * QC corrections) must pass `id` so we don't create a duplicate row keyed to
 * the supervisor's surveyorId.
 */
export async function resolveExistingSurveyForSave(
  ctx: MutationCtx,
  me: Doc<"users">,
  args: { id?: Id<"surveys">; localId: string; municipalityId: Id<"municipalities"> },
): Promise<Doc<"surveys"> | null> {
  const ownScope = await isOwnScopeSurveyor(ctx, me);

  if (args.id) {
    const survey = await ctx.db.get(args.id);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    if (ownScope && survey.surveyorId !== me._id) {
      clientError("FORBIDDEN", "Not your survey");
    }
    // Surveyors sync by localId; supervisors resolve by server id for QC corrections.
    if (ownScope && survey.localId !== args.localId) {
      clientError("BAD_REQUEST", "Survey identity mismatch");
    }
    return survey;
  }

  if (ownScope) {
    return await ctx.db
      .query("surveys")
      .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", me._id).eq("localId", args.localId))
      .unique();
  }

  // Supervisor/admin without explicit id — match by localId within the ULB.
  const rows = await ctx.db
    .query("surveys")
    .withIndex("by_municipality_status", (q) => q.eq("municipalityId", args.municipalityId))
    .collect();
  const matches = rows.filter((r) => r.localId === args.localId);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    clientError("BAD_REQUEST", "Multiple surveys share this local id — pass survey id");
  }
  return null;
}

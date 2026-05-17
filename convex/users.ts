/**
 * User provisioning — primary path is the Clerk webhook (`convex/http.ts`).
 * `provisionCurrentUser` is the client fallback when webhooks are delayed or
 * missing (common in local dev before the endpoint is configured).
 */
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx, query } from './_generated/server';
import { clientError, requireIdentity, writeAudit } from './helpers';

/** Current signed-in user's domain row, or null until provisioned. */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const ident = await ctx.auth.getUserIdentity();
    if (!ident) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', ident.subject))
      .unique();

    if (!user) return null;

    let municipality: { code: string; name: string } | null = null;
    let district: { code: string; name: string } | null = null;

    if (user.districtId) {
      const dist = await ctx.db.get(user.districtId);
      if (dist) district = { code: dist.code, name: dist.name };
    }
    if (user.municipalityId) {
      const muni = await ctx.db.get(user.municipalityId);
      if (muni) {
        municipality = { code: muni.code, name: muni.name };
        if (!district) {
          const dist = await ctx.db.get(muni.districtId);
          if (dist) district = { code: dist.code, name: dist.name };
        }
      }
    }

    return { ...user, municipality, district };
  },
});

interface UpsertUserArgs {
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  requestedRole?: string;
  requestedReason?: string;
}

/**
 * Create or update the domain user row. Webhook updates always apply signup
 * metadata; client provisioning only fills `requested*` when still empty.
 */
async function upsertUserRecord(
  ctx: MutationCtx,
  args: UpsertUserArgs,
  opts: { fillSignupMetadataOnlyIfEmpty: boolean },
): Promise<Id<'users'>> {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
    .unique();

  if (existing) {
    const patch: {
      email: string;
      name: string;
      avatarUrl?: string;
      requestedRole?: string;
      requestedReason?: string;
    } = {
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
    };

    if (opts.fillSignupMetadataOnlyIfEmpty) {
      if (args.requestedRole && !existing.requestedRole) {
        patch.requestedRole = args.requestedRole;
      }
      if (args.requestedReason && !existing.requestedReason) {
        patch.requestedReason = args.requestedReason;
      }
    } else {
      if (args.requestedRole !== undefined) patch.requestedRole = args.requestedRole;
      if (args.requestedReason !== undefined) {
        patch.requestedReason = args.requestedReason;
      }
    }

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  const userId = await ctx.db.insert('users', {
    clerkId: args.clerkId,
    email: args.email,
    name: args.name,
    avatarUrl: args.avatarUrl,
    role: 'pending',
    status: 'pending_approval',
    wardAssignments: [],
    requestedRole: args.requestedRole,
    requestedReason: args.requestedReason,
  });

  await writeAudit(ctx, {
    action: 'user.created',
    entity: 'user',
    entityId: userId,
    metadata: { clerkId: args.clerkId, email: args.email, source: 'provision' },
  });

  return userId;
}

/**
 * Idempotent provisioning for the signed-in Clerk user. Called from the
 * setup screen so Convex has a `users` row even when the webhook has not
 * fired yet.
 */
export const provisionCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    requestedRole: v.optional(v.string()),
    requestedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ident = await requireIdentity(ctx);

    const email = (ident.email ?? args.email ?? '').trim();
    if (!email) {
      clientError(
        'PROFILE_INCOMPLETE',
        'An email address is required. Finish sign-up in Clerk or add a primary email.',
      );
    }
    const name = (ident.name ?? args.name ?? email).trim() || email;

    return await upsertUserRecord(
      ctx,
      {
        clerkId: ident.subject,
        email,
        name,
        avatarUrl: ident.pictureUrl ?? args.avatarUrl,
        requestedRole: args.requestedRole,
        requestedReason: args.requestedReason,
      },
      { fillSignupMetadataOnlyIfEmpty: true },
    );
  },
});

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    requestedRole: v.optional(v.string()),
    requestedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertUserRecord(ctx, args, {
      fillSignupMetadataOnlyIfEmpty: false,
    });
  },
});

export const softDeleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerkId', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) return;

    await ctx.db.patch(user._id, {
      status: 'disabled',
      disabledAt: Date.now(),
    });

    await writeAudit(ctx, {
      action: 'user.deleted',
      entity: 'user',
      entityId: user._id,
      metadata: { clerkId: args.clerkId },
    });
  },
});

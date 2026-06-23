/**
 * HTTP routes exposed by Convex.
 *
 * The only public HTTP route is the Clerk webhook receiver. Clerk POSTs
 * user.created / user.updated / user.deleted events here, signed with
 * `CLERK_WEBHOOK_SECRET`. We verify the signature, then upsert/delete the
 * matching row in the `users` table. The mobile setup screen also calls
 * `users.provisionCurrentUser` when webhooks are delayed (typical in dev).
 *
 * Setup:
 *   1. Get the URL: `npx convex env | grep CONVEX_SITE_URL`
 *      Public webhook URL is `<that URL>/clerk-webhook`.
 *   2. Clerk dashboard → Webhooks → add endpoint with the URL.
 *      Select events: user.created, user.updated, user.deleted, session.created.
 *   3. Copy the Signing Secret.
 *   4. `npx convex env set CLERK_WEBHOOK_SECRET whsec_xxx`
 */
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { normalizeSignupMetadata } from "./users";

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
}

interface ClerkUserData {
  id: string;
  email_addresses?: Array<{ email_address: string; id: string; verification?: { status: string } }>;
  primary_email_address_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  public_metadata?: Record<string, unknown>;
  unsafe_metadata?: Record<string, unknown>;
}

const clerkWebhook = httpAction(async (ctx, request) => {
  const payloadText = await request.text();
  const headers: Record<string, string> = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CLERK_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payloadText, headers) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Route the event
  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const data = event.data;
      const primaryEmailId = data.primary_email_address_id;
      const primary = data.email_addresses?.find((e) => e.id === primaryEmailId) ?? data.email_addresses?.[0];
      const email = (primary?.email_address ?? "").trim();
      if (!email) {
        console.error("Clerk webhook: user has no primary email — skipping upsert", data.id);
        break;
      }
      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.username || email;

      const requested = normalizeSignupMetadata(readRequestedMetadata(data));

      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId: data.id,
        email,
        name,
        avatarUrl: data.image_url ?? undefined,
        requestedRole: requested.requestedRole,
        requestedReason: requested.requestedReason,
      });
      break;
    }

    case "user.deleted": {
      await ctx.runMutation(internal.users.softDeleteFromClerk, {
        clerkId: event.data.id,
      });
      break;
    }

    default:
      // Quietly ignore unrelated event types (session.created, etc.) — Clerk
      // delivers a lot of them. Returning 200 prevents needless retries.
      break;
  }

  return new Response(null, { status: 200 });
});

function readRequestedMetadata(d: ClerkUserData): {
  requestedRole?: string;
  requestedReason?: string;
} {
  const meta = (d.unsafe_metadata ?? d.public_metadata ?? {}) as Record<string, unknown>;
  const requestedRole = typeof meta.requestedRole === "string" ? meta.requestedRole : undefined;
  const requestedReason = typeof meta.requestedReason === "string" ? meta.requestedReason : undefined;
  return { requestedRole, requestedReason };
}

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;

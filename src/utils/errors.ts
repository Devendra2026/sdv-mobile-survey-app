/**
 * Convex throws structured `ConvexError`s with our payload shape:
 *   { code: "...", message: "...", details?: { field: ["..."] } }
 *
 * This helper produces a clean user-facing message and (optionally)
 * maps server-side validation errors onto a react-hook-form instance.
 */
import { ConvexError } from 'convex/values';

interface ConvexErrPayload {
  code?: string;
  message?: string;
  details?: Record<string, string[]>;
}

export function toUserMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as ConvexErrPayload | string | undefined;
    if (typeof data === 'string') return data;
    if (data?.details) {
      const first = Object.values(data.details).flat()[0];
      if (first) return first;
    }
    return data?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/** Flatten Convex validation details into user-facing field messages. */
export function convexValidationMessages(err: unknown): string[] {
  if (!(err instanceof ConvexError)) return [];
  const data = err.data as ConvexErrPayload | string | undefined;
  if (typeof data !== 'object' || !data?.details) return [];
  return Object.values(data.details).flat().filter(Boolean);
}

function isCode(err: unknown, code: string): boolean {
  if (!(err instanceof ConvexError)) return false;
  const data = err.data as ConvexErrPayload | string | undefined;
  return typeof data === 'object' && data?.code === code;
}

/** Apply field-level details onto a react-hook-form setError. */
function applyFieldErrors<F extends { setError: (n: never, e: { message: string }) => void }>(
  err: unknown,
  form: F,
): boolean {
  if (!(err instanceof ConvexError)) return false;
  const data = err.data as ConvexErrPayload | undefined;
  if (!data?.details) return false;
  for (const [field, msgs] of Object.entries(data.details)) {
    if (msgs?.[0]) form.setError(field as never, { message: msgs[0] });
  }
  return true;
}

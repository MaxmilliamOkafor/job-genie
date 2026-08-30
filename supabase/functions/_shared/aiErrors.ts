// Shared AI failure contract.
//
// Every AI failure the client can act on is returned with the SAME shape, so a
// billing refusal never looks like a bad CV:
//
//   { error, errorCode, userMessage, provider, providerStatus, retryable }
//
// `userMessage` is written to be displayed verbatim in the UI.

export type AiErrorCode =
  | "ai_key_missing" // profile column is empty
  | "ai_key_lookup_denied" // RLS / permission denied on profiles
  | "ai_key_lookup_no_profile" // zero rows
  | "ai_key_lookup_multiple_profiles" // more than one row
  | "ai_key_lookup_failed" // any other Postgres error
  | "ai_auth" // provider 401
  | "ai_billing" // provider 402 / 403 (out of credit, hard limit)
  | "ai_rate_limit" // provider 429
  | "ai_upstream"; // provider 5xx or unknown

export interface AiErrorPayload {
  error: string;
  errorCode: AiErrorCode;
  userMessage: string;
  provider?: string;
  providerStatus?: number;
  retryable: boolean;
}

export type AiKeyLookup =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; code: AiErrorCode; userMessage: string; detail: string };

/**
 * Reads the caller's AI key columns and reports WHICH of the four failure
 * situations happened, instead of collapsing them all into `null`.
 * The Postgres error is logged rather than discarded.
 */
export async function lookupAiKeyRow(
  supabase: any,
  userId: string,
  columns: string,
): Promise<AiKeyLookup> {
  const { data, error, status } = await supabase
    .from("profiles")
    .select(columns)
    .eq("user_id", userId);

  if (error) {
    // Keep the Postgres error: code, message, details, hint.
    console.error("[ai-key-lookup] Postgres error", {
      userId,
      status,
      pgCode: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const denied =
      status === 401 ||
      status === 403 ||
      error.code === "42501" ||
      /permission denied|row-level security/i.test(error.message || "");

    if (denied) {
      return {
        ok: false,
        code: "ai_key_lookup_denied",
        userMessage:
          "Your profile could not be read (access denied). Sign out and back in, then try again.",
        detail: `${error.code || "no-code"}: ${error.message}`,
      };
    }

    return {
      ok: false,
      code: "ai_key_lookup_failed",
      userMessage: `Your profile could not be read (database error ${error.code || "unknown"}). Try again in a moment.`,
      detail: `${error.code || "no-code"}: ${error.message}`,
    };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];

  if (rows.length === 0) {
    console.error("[ai-key-lookup] zero profile rows", { userId });
    return {
      ok: false,
      code: "ai_key_lookup_no_profile",
      userMessage: "No profile exists for this account yet. Open Profile settings and save it once.",
      detail: "zero rows returned for user_id",
    };
  }

  if (rows.length > 1) {
    console.error("[ai-key-lookup] multiple profile rows", { userId, count: rows.length });
    return {
      ok: false,
      code: "ai_key_lookup_multiple_profiles",
      userMessage:
        "This account has more than one profile record, so the AI key is ambiguous. Contact support to merge them.",
      detail: `${rows.length} rows returned for user_id`,
    };
  }

  return { ok: true, row: rows[0] as Record<string, unknown> };
}

/** Maps a provider HTTP status onto the shared contract. */
export function classifyProviderStatus(
  providerName: string,
  status: number,
  bodyText: string,
): AiErrorPayload {
  const snippet = (bodyText || "").slice(0, 300);

  if (status === 401) {
    return {
      error: `${providerName} rejected the API key (401)`,
      errorCode: "ai_auth",
      userMessage: `${providerName} rejected your API key (401). The key is invalid, revoked, or from another account. Update it in Profile settings.`,
      provider: providerName,
      providerStatus: status,
      retryable: false,
    };
  }

  if (status === 402 || status === 403) {
    return {
      error: `${providerName} refused the request for billing reasons (${status})`,
      errorCode: "ai_billing",
      userMessage: `${providerName} refused the request for billing reasons (${status}). Your credit balance or spend limit is exhausted, so no CV can be generated until you top up or enable auto-reload. Provider said: ${snippet}`,
      provider: providerName,
      providerStatus: status,
      retryable: false,
    };
  }

  if (status === 429) {
    const insufficient = /insufficient_quota|billing|quota/i.test(snippet);
    return {
      error: `${providerName} returned 429`,
      errorCode: insufficient ? "ai_billing" : "ai_rate_limit",
      userMessage: insufficient
        ? `${providerName} returned 429 insufficient_quota. This is a billing problem, not a rate limit: your credit balance is exhausted. Top up or enable auto-reload. Provider said: ${snippet}`
        : `${providerName} is rate limiting your requests (429). Wait a moment and retry. Provider said: ${snippet}`,
      provider: providerName,
      providerStatus: status,
      retryable: !insufficient,
    };
  }

  return {
    error: `${providerName} error ${status}`,
    errorCode: "ai_upstream",
    userMessage: `${providerName} returned an error (${status}) and no CV was generated. Provider said: ${snippet}`,
    provider: providerName,
    providerStatus: status,
    retryable: status >= 500,
  };
}

/**
 * Records the failure so the dashboard can show "the AI is refusing my
 * requests" at a glance. Never throws.
 */
export async function recordAiError(
  supabase: any,
  userId: string,
  functionName: string,
  payload: { errorCode: AiErrorCode; userMessage: string; provider?: string; providerStatus?: number },
  detail?: string,
): Promise<void> {
  try {
    await supabase.from("ai_error_log").insert({
      user_id: userId,
      function_name: functionName,
      error_code: payload.errorCode,
      provider: payload.provider ?? null,
      provider_status: payload.providerStatus ?? null,
      user_message: payload.userMessage,
      detail: detail ?? null,
    });
  } catch (e) {
    console.error("Failed to record AI error:", e);
  }
}

/** Builds the JSON Response for an AI failure, and logs it for the dashboard. */
export async function aiErrorResponse(
  supabase: any,
  userId: string,
  functionName: string,
  payload: AiErrorPayload,
  corsHeaders: Record<string, string>,
  detail?: string,
  httpStatus?: number,
): Promise<Response> {
  await recordAiError(supabase, userId, functionName, payload, detail);
  return new Response(JSON.stringify(payload), {
    status: httpStatus ?? (payload.providerStatus && payload.providerStatus >= 400 ? payload.providerStatus : 400),
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

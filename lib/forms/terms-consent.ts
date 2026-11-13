import 'server-only';

export type ConsentPolicyStatus = 'draft' | 'published';

export type TermsConsentRequest = {
  termsAccepted: boolean;
  termsPolicyVersion: string;
  termsPolicyStatus: ConsentPolicyStatus;
  marketingAccepted: boolean;
  marketingPolicyVersion?: string;
};

export type TermsConsentRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

export type TermsCompletionRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

export type TermsConsentResult =
  | { status: 'accepted'; policy_version: string; accepted_at: string }
  | { status: 'required' | 'unavailable' };

/** The server production flag blocks draft acceptance before the persistence RPC. */
export function isTermsPolicyPersistable(
  status: ConsentPolicyStatus,
  environment = process.env.NODE_ENV,
): boolean {
  return status === 'published' || environment !== 'production';
}

/** Persist only an affirmative Terms Card action; the database owns the timestamp. */
export async function persistTermsConsent(
  client: TermsConsentRpc,
  request: TermsConsentRequest,
): Promise<TermsConsentResult> {
  if (!request.termsAccepted) return { status: 'required' };
  if (
    !request.termsPolicyVersion ||
    !isTermsPolicyPersistable(request.termsPolicyStatus)
  )
    return { status: 'unavailable' };

  try {
    const { data, error } = await client.rpc('client_accept_terms', {
      p_terms_policy_version: request.termsPolicyVersion,
      p_marketing_policy_version: request.marketingAccepted
        ? (request.marketingPolicyVersion ?? null)
        : null,
      p_marketing_opt_in: request.marketingAccepted,
    });
    if (error || !data || typeof data !== 'object')
      return { status: 'unavailable' };
    const result = data as Record<string, unknown>;
    if (
      result.status !== 'accepted' ||
      typeof result.policy_version !== 'string' ||
      typeof result.accepted_at !== 'string'
    )
      return { status: 'unavailable' };
    return {
      status: 'accepted',
      policy_version: result.policy_version,
      accepted_at: result.accepted_at,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Use this server check before exposing an intake-complete state. */
export async function hasAcceptedTermsForIntake(
  client: TermsCompletionRpc,
  policyVersion: string,
): Promise<boolean> {
  if (!policyVersion) return false;
  try {
    const { data, error } = await client.rpc('client_has_accepted_terms', {
      p_policy_version: policyVersion,
    });
    return error === null && data === true;
  } catch {
    return false;
  }
}

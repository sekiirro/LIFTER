export type RegistrationFailure = {
  status: 'not_permitted' | 'invalid_input' | 'stale_terms' | 'unavailable';
};
export type IssueResult =
  { status: 'ok'; linkId: string; link: string } | RegistrationFailure;
export function mapRegistrationError(error: {
  code?: string;
  message?: string;
}): RegistrationFailure {
  if (error.code === '42501') return { status: 'not_permitted' };
  if (error.code === '22023' && error.message === 'stale_terms')
    return { status: 'stale_terms' };
  if (error.code === '22023' && error.message === 'invalid_input')
    return { status: 'invalid_input' };
  return { status: 'unavailable' };
}

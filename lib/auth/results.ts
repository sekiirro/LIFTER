export type SignInResult = {
  status: 'ok' | 'invalid_credentials' | 'unavailable';
};
export type RecoveryResult = {
  status: 'ok' | 'invalid_link' | 'weak_password' | 'mismatch';
};
export type RecoveryLinkResult =
  | { status: 'ok'; link: string }
  | { status: 'denied' | 'rate_limited' | 'unavailable' };

export function mapRpcError(error: {
  code?: string;
  message?: string;
}): 'denied' | 'rate_limited' | 'unavailable' {
  if (error.code === '42501' && error.message === 'not_permitted')
    return 'denied';
  if (error.code === 'P0001' && error.message === 'rate_limited')
    return 'rate_limited';
  return 'unavailable';
}

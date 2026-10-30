export type ApprovalRequestAction = 'approve' | 'reject' | 'reconsider';

export function createApprovalRequestKeyStore(
  generateKey: () => string = () => crypto.randomUUID(),
) {
  const keys = new Map<string, string>();
  return (action: ApprovalRequestAction, submittedDate?: string) => {
    const identity =
      action === 'reject' ? action : `${action}:${submittedDate ?? ''}`;
    let key = keys.get(identity);
    if (!key) {
      key = generateKey();
      keys.set(identity, key);
    }
    return key;
  };
}

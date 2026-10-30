export type PaymentRequestOperation = 'collection' | 'correction';

export function collectionPaymentStateKey(
  revision: number,
  tailEventId: string | null | undefined,
  collectedOn: string,
) {
  return `${revision}:${tailEventId ?? 'none'}:${collectedOn}`;
}

export function createPaymentRequestKeyStore(
  generateKey: () => string = () => crypto.randomUUID(),
) {
  const keys = new Map<string, string>();
  return (
    operation: PaymentRequestOperation,
    obligationId: string,
    stateKey = 'initial',
  ) => {
    const keyId = `${operation}:${obligationId}:${stateKey}`;
    let key = keys.get(keyId);
    if (!key) {
      key = generateKey();
      keys.set(keyId, key);
    }
    return key;
  };
}

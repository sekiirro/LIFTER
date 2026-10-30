export type PaymentRequestOperation = 'collection' | 'correction';

export function createPaymentRequestKeyStore(
  generateKey: () => string = () => crypto.randomUUID(),
) {
  const keys = new Map<string, string>();
  return (operation: PaymentRequestOperation, obligationId: string) => {
    const keyId = `${operation}:${obligationId}`;
    let key = keys.get(keyId);
    if (!key) {
      key = generateKey();
      keys.set(keyId, key);
    }
    return key;
  };
}

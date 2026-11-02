import type { Activation, FirstDeliveryRecord } from './delivery-contract';
import type {
  PlanContentEnvelope,
  PlanRootDto,
  PublishedRevisionDto,
} from './client';

export type ClientDeliveryStatus = 'delivered' | 'not_delivered';
export type ClientActivationStatus = 'pending' | 'complete';

export type ClientDeliveryProjection = {
  planId: string;
  kind: 'workout' | 'nutrition';
  revisionNumber: number;
  publishedAt: string;
  content: PlanContentEnvelope | null;
  delivery: { status: ClientDeliveryStatus };
  activation: { status: ClientActivationStatus };
};

export type ProjectClientDeliveryInput = {
  subscriptionId: string;
  root: PlanRootDto;
  kind: 'workout' | 'nutrition';
  revisions: readonly PublishedRevisionDto[];
  deliveries: readonly FirstDeliveryRecord[];
  activation: Activation | null;
};

/**
 * Project already-authorized records into the client allowlist. The private
 * draft on the root is deliberately ignored. createdAt supplies publishedAt
 * until Plan Core defines a separate publish timestamp.
 */
export function projectClientDelivery(
  input: ProjectClientDeliveryInput,
): ClientDeliveryProjection | null {
  const latest = input.revisions
    .filter(
      (revision) =>
        revision.planId === input.root.planId &&
        revision.content.kind === input.kind,
    )
    .reduce<PublishedRevisionDto | undefined>(
      (current, revision) =>
        !current || revision.revisionNumber > current.revisionNumber
          ? revision
          : current,
      undefined,
    );

  if (!latest) return null;

  const delivered = input.deliveries.some(
    (record) =>
      record.subscriptionId === input.subscriptionId &&
      record.planId === input.root.planId &&
      record.kind === input.kind,
  );
  const activated = input.activation?.subscriptionId === input.subscriptionId;

  return {
    planId: input.root.planId,
    kind: input.kind,
    revisionNumber: latest.revisionNumber,
    publishedAt: latest.createdAt,
    content: delivered ? latest.content : null,
    delivery: { status: delivered ? 'delivered' : 'not_delivered' },
    activation: { status: activated ? 'complete' : 'pending' },
  };
}

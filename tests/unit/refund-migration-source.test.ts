import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261103125000_f13_refund_operations.sql',
  'utf8',
);
const refundWriter = migration.slice(
  migration.indexOf('create function public.record_refund'),
  migration.indexOf('alter function public.record_refund'),
);

describe('F13 refund migration source', () => {
  it('keeps cancellation anti-join alias distinct from the client row variable', () => {
    expect(refundWriter).toContain('c public.clients%rowtype');
    expect(refundWriter).toContain(
      'from public.subscription_obligation_cancellations existing_cancellation',
    );
    expect(refundWriter).toContain(
      'existing_cancellation.workspace_id=i.workspace_id',
    );
    expect(refundWriter).toContain('existing_cancellation.obligation_id=i.id');
    expect(refundWriter).not.toMatch(
      /from public\.subscription_obligation_cancellations c\s+where c\./,
    );
  });

  it('waits for the client financial lock before taking the actor authorization lock', () => {
    const clientLock = refundWriter.indexOf(
      'from public.clients x where x.workspace_id=ws and x.id=cid for update',
    );
    const ledgerLock = refundWriter.indexOf(
      'from public.payment_events e\n    where e.workspace_id=ws and e.subscription_id=sid',
    );
    const firstActorCheck = refundWriter.indexOf(
      "app_private.f12_actor_allowed(ws,'record_refund',true)",
    );

    expect(clientLock).toBeGreaterThan(-1);
    expect(ledgerLock).toBeGreaterThan(clientLock);
    expect(firstActorCheck).toBeGreaterThan(ledgerLock);
  });

  it('accepts an optional expected revision and checks staleness after the ledger lock', () => {
    const ledgerLock = refundWriter.indexOf(
      'from public.payment_events e\n    where e.workspace_id=ws and e.subscription_id=sid',
    );
    const revisionRead = refundWriter.indexOf(
      'select count(*)::integer into revision_count',
    );
    const staleComparison = refundWriter.indexOf(
      'requested_revision<>revision_count',
    );
    const staleStatus = refundWriter.indexOf(
      "jsonb_build_object('status','stale_state')",
      staleComparison,
    );

    expect(refundWriter).toMatch(/jsonb_object_keys\(request\).*6.*7/s);
    expect(refundWriter).toMatch(/'expected_revision'/);
    expect(refundWriter).toMatch(
      /jsonb_typeof\(request->'expected_revision'\)/,
    );
    expect(refundWriter).toMatch(/requested_revision/);
    expect(ledgerLock).toBeGreaterThan(-1);
    expect(revisionRead).toBeGreaterThan(ledgerLock);
    expect(staleComparison).toBeGreaterThan(revisionRead);
    expect(staleStatus).toBeGreaterThan(staleComparison);
    expect(refundWriter).toMatch(/'expected_revision'.*requested_revision/s);
  });
});

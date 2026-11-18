import { expect, it } from 'vitest';
import {
  deriveVolumes,
  PILOT_INPUTS,
  PILOT_TABLE_UNITS,
  projectPilotVolumes,
  UNVERIFIED_INPUTS,
} from '../../scripts/free-tier/lib/pilot-volumes.mjs';

it('derives the S31-PO-4 volumes without inventing staff or plan-kind totals', () => {
  expect(deriveVolumes(PILOT_INPUTS)).toEqual({
    workspaces: 2,
    clients: 300,
    staffMemberships: 4,
    plans: 600,
    newPlanVersionsPerMonth: 600,
  });
});

it('maps every pilot unit to a schema-sourced relation, never an assumed table', () => {
  for (const entry of PILOT_TABLE_UNITS) {
    expect(entry.source).toMatch(
      /^supabase\/migrations\/\d+_[a-z0-9_]+\.sql:\d+(-\d+)?$/,
    );
    expect(entry.basis.length).toBeGreaterThan(0);
  }
  expect(PILOT_TABLE_UNITS.map((e) => e.table)).toEqual([
    'public.workspaces',
    'public.clients',
    'public.workspace_memberships',
    'public.plan_roots',
    'public.plan_drafts',
    'public.plan_revisions',
  ]);
});

it('projects one verified row volume per mapped relation', () => {
  const report = projectPilotVolumes();
  expect(report.tables.map((t) => [t.table, t.expectedRows, t.status])).toEqual(
    [
      ['public.workspaces', 2, 'VERIFIED'],
      ['public.clients', 300, 'VERIFIED'],
      ['public.workspace_memberships', 4, 'VERIFIED'],
      ['public.plan_roots', 600, 'VERIFIED'],
      ['public.plan_drafts', 600, 'VERIFIED'],
      ['public.plan_revisions', 600, 'VERIFIED'],
    ],
  );
});

it('records every unverifiable input as UNVERIFIED and never claims a complete projection', () => {
  const report = projectPilotVolumes();
  expect(report.unverified).toHaveLength(UNVERIFIED_INPUTS.length);
  for (const entry of report.unverified) {
    expect(entry.status).toBe('UNVERIFIED');
    expect(entry.reason.length).toBeGreaterThan(0);
  }
  expect(report.complete).toBe(false);
});

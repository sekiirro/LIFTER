import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let actorId: string;
let workspaceId: string;

beforeAll(async () => {
  const fixture = await twoWorkspaceFixture();
  actorId = fixture.trainerA.userId;
  workspaceId = fixture.wsA.id;
});

afterAll(async () => db.end());

const exerciseFields = [
  'name',
  'description',
  'notes',
  'video',
  'alternatives',
  'default_rest_time',
  'default_rir',
  'default_reps',
];

describe('T057 exercise audit field allowlist', () => {
  it('accepts only the eight FR-003 codes for canonical and workspace exercise changes', async () => {
    const canonical = await db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.exercise_versioned', 'exercises', ${randomUUID()}, null,
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: exerciseFields })}
      ) as event_id`;
    const workspace = await db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.exercise_override_versioned', 'exercise_overrides', ${randomUUID()}, ${workspaceId},
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: exerciseFields })}
      ) as event_id`;
    const privateExercise = await db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.workspace_exercise_versioned', 'workspace_exercises', ${randomUUID()}, ${workspaceId},
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: exerciseFields })}
      ) as event_id`;
    expect(canonical[0]?.event_id).toBeDefined();
    expect(workspace[0]?.event_id).toBeDefined();
    expect(privateExercise[0]?.event_id).toBeDefined();
  });

  it('rejects legacy exercise detail codes outside the FR-003 field set', async () => {
    await expect(db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.exercise_versioned', 'exercises', ${randomUUID()}, null,
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: ['name_ar'] })}
      )
    `).rejects.toThrow('catalog_audit_contract_violation');
  });

  it('rejects values, URLs, and free text from the audit payload', async () => {
    await expect(db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.exercise_versioned', 'exercises', ${randomUUID()}, null,
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: ['video'], value: 'secret' })}
      )
    `).rejects.toThrow('catalog_audit_contract_violation');
    await expect(db`
      select app_private.catalog_write_audit(
        ${actorId}, 'catalog.exercise_versioned', 'exercises', ${randomUUID()}, null,
        ${db.json({ identity_id: randomUUID(), version: 2, changed_fields: ['video'], video_url: 'https://youtu.be/abcdefghijk' })}
      )
    `).rejects.toThrow('catalog_audit_contract_violation');
  });
});

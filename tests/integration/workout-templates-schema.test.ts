import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createStaff,
  sql,
  twoWorkspaceFixture,
} from './harness';

let db: ReturnType<typeof sql>;

beforeAll(() => {
  db = sql();
});

afterAll(async () => {
  await db?.end();
});

describe('F17 T013/T016/T017 template identities, immutable versions, RLS and DML denial', () => {
  it('enforces global template identity, (template_id, version) uniqueness, CAS pointer, and immutability', async () => {
    const { po, wsA } = await twoWorkspaceFixture();
    const globalId = randomUUID();
    const docV1 = {
      schema_version: 1,
      days: [{ id: randomUUID(), kind: 'session', items: [] }],
    };
    const docV2 = {
      schema_version: 1,
      notes: 'v2',
      days: [{ id: randomUUID(), kind: 'session', items: [] }],
    };

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_global_templates (id, current_version, created_by)
        values (${globalId}, 1, ${po.userId})
      `;
      await tx`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 1, 'Global Hypertrophy', 1, ${tx.json(docV1)}, ${po.userId})
      `;
    });

    // Duplicate (template_id, version) rejected
    await expect(
      db`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 1, 'Dup', 1, ${db.json(docV1)}, ${po.userId})
      `,
    ).rejects.toThrow();

    // Deferrable current_version FK rejects pointing to non-existent version
    await expect(
      db`
        update public.workout_global_templates
        set current_version = 99
        where id = ${globalId}
      `,
    ).rejects.toThrow();

    // CAS update: append version 2 and advance current_version from 1 -> 2
    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 2, 'Global Hypertrophy v2', 1, ${tx.json(docV2)}, ${po.userId})
      `;
      const updated = await tx`
        update public.workout_global_templates
        set current_version = 2, updated_at = now()
        where id = ${globalId} and current_version = 1
        returning current_version
      `;
      expect(updated).toHaveLength(1);
    });

    // Stale CAS fails to match
    const stale = await db`
      update public.workout_global_templates
      set current_version = 2
      where id = ${globalId} and current_version = 1
      returning id
    `;
    expect(stale).toHaveLength(0);

    // Monotonic current_version: decrement rejected
    await expect(
      db`
        update public.workout_global_templates
        set current_version = 1
        where id = ${globalId}
      `,
    ).rejects.toThrow(/template_version_regression/);

    // Immutable version: UPDATE / DELETE rejected
    await expect(
      db`
        update public.workout_global_template_versions
        set title = 'Mutated'
        where template_id = ${globalId} and version = 1
      `,
    ).rejects.toThrow(/template_version_immutable/);

    await expect(
      db`
        delete from public.workout_global_template_versions
        where template_id = ${globalId} and version = 1
      `,
    ).rejects.toThrow(/template_version_immutable/);

    // Provenance immutability on global identity
    await expect(
      db`
        update public.workout_global_templates
        set origin_workspace_id = ${wsA.id}
        where id = ${globalId}
      `,
    ).rejects.toThrow(/template_provenance_immutable/);

    // Identity cannot be deleted
    await expect(
      db`
        delete from public.workout_global_templates
        where id = ${globalId}
      `,
    ).rejects.toThrow(/template_identity_immutable/);
  });

  it('enforces workspace template composite keys, provenance immutability, single-copy-per-origin, and version immutability', async () => {
    const { po, woA, wsA, wsB } = await twoWorkspaceFixture();
    const globalId = randomUUID();
    const wsTemplateId = randomUUID();
    const doc = {
      schema_version: 1,
      days: [{ id: randomUUID(), kind: 'session', items: [] }],
    };

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_global_templates (id, current_version, created_by)
        values (${globalId}, 1, ${po.userId})
      `;
      await tx`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 1, 'Source Global', 1, ${tx.json(doc)}, ${po.userId})
      `;
      await tx`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 2, 'Source Global v2', 1, ${tx.json(doc)}, ${po.userId})
      `;
      await tx`
        insert into public.workout_workspace_templates (
          workspace_id, id, current_version,
          origin_global_template_id, origin_global_template_version, origin_assignment_id,
          created_by
        )
        values (
          ${wsA.id}, ${wsTemplateId}, 1,
          ${globalId}, 1, ${randomUUID()},
          ${po.userId}
        )
      `;
      await tx`
        insert into public.workout_workspace_template_versions (
          workspace_id, template_id, version, title, schema_version, document, created_by
        )
        values (${wsA.id}, ${wsTemplateId}, 1, 'Copied Template', 1, ${tx.json(doc)}, ${po.userId})
      `;
    });

    // At most one copy per (workspace_id, origin_global_template_id), regardless of source version
    await expect(
      db.begin(async (tx) => {
        const dupId = randomUUID();
        await tx`
          insert into public.workout_workspace_templates (
            workspace_id, id, current_version,
            origin_global_template_id, origin_global_template_version, origin_assignment_id,
            created_by
          )
          values (
            ${wsA.id}, ${dupId}, 1,
            ${globalId}, 2, ${randomUUID()},
            ${po.userId}
          )
        `;
        await tx`
          insert into public.workout_workspace_template_versions (
            workspace_id, template_id, version, title, schema_version, document, created_by
          )
          values (${wsA.id}, ${dupId}, 1, 'Dup Copy', 1, ${tx.json(doc)}, ${po.userId})
        `;
      }),
    ).rejects.toThrow();

    // Composite FK: wsB cannot insert a version referencing wsA's template_id
    await expect(
      db`
        insert into public.workout_workspace_template_versions (
          workspace_id, template_id, version, title, schema_version, document, created_by
        )
        values (${wsB.id}, ${wsTemplateId}, 1, 'Cross Tenant', 1, ${db.json(doc)}, ${woA.userId})
      `,
    ).rejects.toThrow();

    // Provenance immutability
    await expect(
      db`
        update public.workout_workspace_templates
        set origin_global_template_version = 2
        where workspace_id = ${wsA.id} and id = ${wsTemplateId}
      `,
    ).rejects.toThrow(/template_provenance_immutable/);

    // Version immutability
    await expect(
      db`
        update public.workout_workspace_template_versions
        set title = 'Mutated'
        where workspace_id = ${wsA.id} and template_id = ${wsTemplateId} and version = 1
      `,
    ).rejects.toThrow(/template_version_immutable/);
  });

  it('enforces RLS isolation (PO-only global, coaching_work own-workspace, Sales/client/foreign/revoked denied)', async () => {
    const { wsA, wsB, po, woA, trainerA, salesA, trainerB } =
      await twoWorkspaceFixture();
    const clientUser = await createStaff(null, 'client');
    const revokedTrainer = await createStaff('trainer', 'revoked-trainer');
    await db`
      insert into public.workspace_memberships (workspace_id, user_id, granted_by)
      values (${wsA.id}, ${revokedTrainer.userId}, ${po.userId})
    `;
    await db`
      update public.workspace_memberships
      set revoked_at = now() + interval '1 second', revoked_by = ${po.userId}
      where workspace_id = ${wsA.id} and user_id = ${revokedTrainer.userId}
    `;

    const globalId = randomUUID();
    const wsTemplateAId = randomUUID();
    const wsTemplateBId = randomUUID();
    const doc = {
      schema_version: 1,
      days: [{ id: randomUUID(), kind: 'session', items: [] }],
    };

    await db.begin(async (tx) => {
      await tx`
        insert into public.workout_global_templates (id, current_version, created_by)
        values (${globalId}, 1, ${po.userId})
      `;
      await tx`
        insert into public.workout_global_template_versions (template_id, version, title, schema_version, document, created_by)
        values (${globalId}, 1, 'PO Global Only', 1, ${tx.json(doc)}, ${po.userId})
      `;
      await tx`
        insert into public.workout_workspace_templates (
          workspace_id, id, current_version,
          origin_global_template_id, origin_global_template_version, origin_assignment_id,
          created_by
        )
        values (${wsA.id}, ${wsTemplateAId}, 1, ${globalId}, 1, ${randomUUID()}, ${po.userId})
      `;
      await tx`
        insert into public.workout_workspace_template_versions (
          workspace_id, template_id, version, title, schema_version, document, created_by
        )
        values (${wsA.id}, ${wsTemplateAId}, 1, 'WS A Template', 1, ${tx.json(doc)}, ${po.userId})
      `;
      await tx`
        insert into public.workout_workspace_templates (workspace_id, id, current_version, created_by)
        values (${wsB.id}, ${wsTemplateBId}, 1, ${trainerB.userId})
      `;
      await tx`
        insert into public.workout_workspace_template_versions (
          workspace_id, template_id, version, title, schema_version, document, created_by
        )
        values (${wsB.id}, ${wsTemplateBId}, 1, 'WS B Template', 1, ${tx.json(doc)}, ${trainerB.userId})
      `;
    });

    // Global templates: PO sees row; WO, Trainer, Sales, client, anon do not
    const poGlobal = await po.client
      .from('workout_global_templates')
      .select('id')
      .eq('id', globalId);
    expect(poGlobal.error).toBeNull();
    expect(poGlobal.data).toHaveLength(1);

    const poGlobalVer = await po.client
      .from('workout_global_template_versions')
      .select('template_id, version')
      .eq('template_id', globalId);
    expect(poGlobalVer.error).toBeNull();
    expect(poGlobalVer.data).toHaveLength(1);

    for (const actor of [woA, trainerA, salesA, trainerB, clientUser, revokedTrainer]) {
      const res = await actor.client
        .from('workout_global_templates')
        .select('id')
        .eq('id', globalId);
      expect(res.data ?? []).toHaveLength(0);

      const verRes = await actor.client
        .from('workout_global_template_versions')
        .select('template_id')
        .eq('template_id', globalId);
      expect(verRes.data ?? []).toHaveLength(0);
    }

    // Workspace templates: PO, woA, trainerA see wsA (safe columns only); cannot see wsB
    const safeCols =
      'workspace_id, id, lifecycle_state, current_version, created_by, created_at, updated_at';
    for (const allowed of [po, woA, trainerA]) {
      const res = await allowed.client
        .from('workout_workspace_templates')
        .select(safeCols)
        .eq('id', wsTemplateAId);
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(1);

      const verRes = await allowed.client
        .from('workout_workspace_template_versions')
        .select('workspace_id, template_id, version')
        .eq('template_id', wsTemplateAId);
      expect(verRes.error).toBeNull();
      expect(verRes.data).toHaveLength(1);
    }

    // Foreign workspace indistinguishable from nonexistent for woA & trainerA
    for (const actor of [woA, trainerA]) {
      const foreign = await actor.client
        .from('workout_workspace_templates')
        .select(safeCols)
        .eq('id', wsTemplateBId);
      const nonexistent = await actor.client
        .from('workout_workspace_templates')
        .select(safeCols)
        .eq('id', randomUUID());
      expect(foreign.data ?? []).toHaveLength(0);
      expect(nonexistent.data ?? []).toHaveLength(0);
      expect(foreign.error).toEqual(nonexistent.error);
    }

    // Sales, client, foreign trainerB, revokedTrainer see 0 rows in wsA
    for (const denied of [salesA, clientUser, trainerB, revokedTrainer]) {
      const res = await denied.client
        .from('workout_workspace_templates')
        .select(safeCols)
        .eq('id', wsTemplateAId);
      expect(res.data ?? []).toHaveLength(0);

      const verRes = await denied.client
        .from('workout_workspace_template_versions')
        .select('template_id')
        .eq('template_id', wsTemplateAId);
      expect(verRes.data ?? []).toHaveLength(0);
    }

    // Provenance columns on workout_workspace_templates are not selectable by authenticated
    const provenanceRes = await trainerA.client
      .from('workout_workspace_templates')
      .select('origin_global_template_id')
      .eq('id', wsTemplateAId);
    expect(provenanceRes.error).not.toBeNull();

    // Anon denied
    const anonGlobal = await anonClient()
      .from('workout_global_templates')
      .select('id')
      .eq('id', globalId);
    expect(anonGlobal.error).not.toBeNull();
    const anonWs = await anonClient()
      .from('workout_workspace_templates')
      .select(safeCols)
      .eq('id', wsTemplateAId);
    expect(anonWs.error).not.toBeNull();
  });

  it('denies direct DML from client roles on all template tables', async () => {
    const { po, trainerA, wsA } = await twoWorkspaceFixture();

    const gInsert = await po.client.from('workout_global_templates').insert({
      id: randomUUID(),
      current_version: 1,
      created_by: po.userId,
    });
    expect(gInsert.error).not.toBeNull();

    const wInsert = await trainerA.client
      .from('workout_workspace_templates')
      .insert({
        workspace_id: wsA.id,
        id: randomUUID(),
        current_version: 1,
        created_by: trainerA.userId,
      });
    expect(wInsert.error).not.toBeNull();
  });
});

import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';
import { clientContext, pending } from './client-accounts-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

const db = sql();
afterAll(() => db.end());

const rollback = new Error('T006 synthetic fixture rollback');
type JSONObject = { [key: string]: postgres.JSONValue };
type MutableDefinition = JSONObject & { questions: JSONObject[] };

async function expectInvariantFailure(body: () => Promise<void>) {
  let failure: unknown;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  expect(failure, 'the named invariant must kill the mutant').toBeDefined();
}

async function workspace(tx: postgres.TransactionSql) {
  const actor = randomUUID();
  const workspaceId = randomUUID();
  await tx`insert into auth.users(id,email) values
    (${actor},${`f15-builder-${actor}@example.test`})`;
  await tx`insert into public.staff_profiles(user_id,role) values(${actor},'workspace_owner')`;
  await tx`insert into public.workspaces(id,name,slug,created_by)
    values(${workspaceId},'Builder fixture',${`f15-builder-${workspaceId}`},${actor})`;
  await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
    values(${workspaceId},${actor},${actor})`;
  const form = await tx`
    select app_private.ensure_default_onboarding_form(${workspaceId},${actor}) as form_id`;
  return { actor, workspaceId, formId: form[0]!.form_id };
}

function definition(label = 'Editable prompt') {
  return {
    title: { en: 'Your First Step', ar: 'عنوان' },
    sections: [
      { id: 'section-1', title: { en: 'Basics', ar: 'أساسيات' } },
      { id: 'section-2', title: { en: 'Follow up', ar: 'أساسيات' } },
      { id: 'section-3', title: { en: 'More', ar: 'أساسيات' } },
    ],
    questions: [
      {
        id: 'parent',
        sectionId: 'section-1',
        type: 'boolean',
        required: false,
        label: { en: 'Parent prompt', ar: 'سؤال رئيسي' },
      },
      {
        id: 'question-1',
        sectionId: 'section-1',
        type: 'singleChoice',
        required: false,
        label: { en: label, ar: 'سؤال' },
        choices: ['one', 'two'],
        optionLabels: [
          { en: 'One', ar: 'واحد' },
          { en: 'Two', ar: 'اثنان' },
        ],
        when: {
          mode: 'all',
          conditions: [{ questionId: 'parent', operator: 'isAnswered' }],
        },
      },
      {
        id: 'question-2',
        sectionId: 'section-2',
        type: 'shortText',
        required: false,
        charLimit: 150,
        label: { en: 'Additional prompt', ar: 'سؤال' },
      },
    ],
    deadlineDays: 3,
    copyStatus: 'draft',
  };
}

it('accepts bilingual slider labels while preserving legacy scalar labels', async () => {
  const value = definition();
  value.questions.push({
    id: 'N11',
    sectionId: 'section-3',
    type: 'slider',
    required: true,
    label: { en: 'How hungry do you feel?', ar: 'سؤال' },
    validation: { min: 0, max: 10, step: 1 },
    labels: {
      minimum: { en: 'I barely feel hungry', ar: 'مش بجوع تقريبًا' },
      middle: 'Moderate hunger',
      maximum: 'Very hungry',
    },
    feedbackBands: [{ min: 0, max: 10, text: 'Synthetic feedback' }],
  } as never);
  const [accepted] = await db`
    select app_private.f15_valid_builder_definition(${db.json(value)},false) as valid`;
  expect(accepted!.valid).toBe(true);

  const invalid = structuredClone(value);
  const labels = (invalid.questions.at(-1)! as Record<string, unknown>)
    .labels as Record<string, unknown>;
  labels.minimum = { en: 'I barely feel hungry', extra: 'unexpected' };
  const [rejected] = await db`
    select app_private.f15_valid_builder_definition(${db.json(invalid)},false) as valid`;
  expect(rejected!.valid).toBe(false);
});

it('accepts the approved B06 identifier for the N12 series selector', async () => {
  const value = definition();
  value.questions.unshift({
    id: 'B06',
    sectionId: 'section-1',
    type: 'singleChoice',
    required: true,
    privacy: 'personal',
    purpose: 'n12-series',
    label: { en: 'Gender', ar: 'النوع' },
    choices: ['male', 'female'],
    optionLabels: [
      { en: 'Male', ar: 'ذكر' },
      { en: 'Female', ar: 'أنثى' },
    ],
  } as never);
  const [result] = await db`
    select app_private.f15_valid_builder_definition(${db.json(value)},false) as valid`;
  expect(result!.valid).toBe(true);
});

it('provisions the exact approved starter copy for a new workspace', async () => {
  await expect(
    db.begin(async (tx) => {
      const fixture = await workspace(tx);
      const [row] = await tx`
        select definition from public.form_versions
        where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId}
          and version_number=1`;
      const questions = (
        row!.definition as {
          questions: Array<{
            id: string;
            label?: { en?: string };
            optionLabels?: Array<{ en: string }>;
            labels?: { minimum?: { en?: string } };
          }>;
        }
      ).questions;
      expect(
        questions.find((question) => question.id === 'N07.meal_count'),
      ).toMatchObject({
        label: { en: 'How many meals would you like to eat per day?' },
        optionLabels: [
          { en: '2 meals' },
          { en: '3 meals' },
          { en: '4 meals' },
          { en: '5 meals' },
        ],
      });
      expect(
        questions.find((question) => question.id === 'T08.system'),
      ).toMatchObject({
        label: { en: 'What training split would you like to follow?' },
      });
      expect(questions.find((question) => question.id === 'N11')).toMatchObject(
        {
          labels: { minimum: { en: 'I barely feel hungry' } },
        },
      );
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('rejects N12 and derived definitions with absent required selector metadata', async () => {
  const base = definition();
  const selector = {
    id: 'B06',
    sectionId: 'section-1',
    type: 'singleChoice',
    required: true,
    privacy: 'personal',
    purpose: 'n12-series',
    label: { en: 'Gender', ar: 'النوع' },
    choices: ['male', 'female'],
  };
  const derived = {
    id: 'N07.training_timing',
    sectionId: 'section-2',
    type: 'derivedChoice',
    required: false,
    label: { en: 'Training timing', ar: 'وقت التمرين' },
    choices: ['meal-1', 'before-first', 'no-fixed-time'],
    derivedOptions: {
      sourceQuestionId: 'N07.meal_count',
      fixedChoices: ['before-first', 'no-fixed-time'],
    },
  };
  const mealCount = {
    id: 'N07.meal_count',
    sectionId: 'section-2',
    type: 'mealCount',
    required: false,
    label: { en: 'Meal count', ar: 'عدد الوجبات' },
    choices: ['2', '3', '4', '5'],
  };
  const cases = [
    { ...base, questions: [{ ...selector, privacy: undefined }] },
    { ...base, questions: [{ ...selector, choices: undefined }] },
    { ...base, questions: [{ ...derived, derivedOptions: undefined }] },
    {
      ...base,
      questions: [
        mealCount,
        {
          ...derived,
          derivedOptions: { fixedChoices: ['before-first', 'no-fixed-time'] },
        },
      ],
    },
  ];
  for (const invalid of cases) {
    const [result] = await db`
      select app_private.f15_valid_builder_definition(${db.json(invalid)},false) as valid`;
    expect(result!.valid).toBe(false);
  }
});

describe('T006/T009 persisted Builder writes', () => {
  it('rejects whitespace English form names before creating a draft', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const formId = randomUUID();
        const policy = `blank-title-${fixture.workspaceId}`;
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')`;
        const result = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${formId},0,${tx.json(definition())},${randomUUID()},${fixture.actor},'   '
          ) as result`;
        expect(result[0]?.result).toEqual({ status: 'invalid' });
        expect(
          await tx`select id from public.forms where workspace_id=${fixture.workspaceId} and id=${formId}`,
        ).toHaveLength(0);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('creates a new form and version on the first Save with revision zero', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const formId = randomUUID();
        const policy = `first-save-${fixture.workspaceId}`;
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')`;
        const result = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${formId},0,${tx.json(definition())},${randomUUID()},${fixture.actor},'First draft'
          ) as result`;
        expect(result[0]?.result).toMatchObject({
          status: 'ok',
          formId,
          revision: 1,
        });
        const rows = await tx`
          select f.name,v.version_number,v.status from public.forms f
          join public.form_versions v on v.workspace_id=f.workspace_id and v.form_id=f.id
          where f.workspace_id=${fixture.workspaceId} and f.id=${formId}`;
        expect(rows).toEqual([
          { name: 'First draft', version_number: 1, status: 'draft' },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('rejects choices on non-choice types and contains on a non-multiChoice source', async () => {
    await expect(
      db.begin(async (tx) => {
        const invalidChoices = structuredClone(
          definition(),
        ) as unknown as MutableDefinition;
        invalidChoices.questions[0]!.choices = ['unexpected'];
        const choicesResult = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(invalidChoices)},false) as valid`;
        expect(choicesResult[0]?.valid).toBe(false);
        const invalidContains = structuredClone(
          definition(),
        ) as unknown as MutableDefinition;
        invalidContains.questions[1]!.when = {
          mode: 'all',
          conditions: [
            { questionId: 'question-2', operator: 'contains', value: 'x' },
          ],
        };
        const containsResult = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(invalidContains)},false) as valid`;
        expect(containsResult[0]?.valid).toBe(false);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('requires the slider middle label in SQL', async () => {
    await db.begin(async (tx) => {
      const invalid = structuredClone(
        definition(),
      ) as unknown as MutableDefinition;
      invalid.questions[0]!.type = 'slider';
      invalid.questions[0]!.labels = {
        minimum: 'Low',
        maximum: 'High',
      };
      invalid.questions[0]!.validation = { min: 0, max: 10, step: 1 };
      invalid.questions[0]!.feedbackBands = [
        { min: 0, max: 10, text: 'Hunger' },
      ];
      const [row] = await tx`
        select app_private.f15_valid_builder_definition(${tx.json(invalid)},false) as valid`;
      expect(row?.valid).toBe(false);
    });
  });

  it('kills the SQL missing-middle-label mutant', async () => {
    await withCrashSafeFunctionMutant(
      'app_private.f15_valid_builder_definition(jsonb,boolean)',
      (body) =>
        body.replace(
          "btrim(coalesce(question->'labels'->'middle'->>'en',question->'labels'->'middle'->>'ar',question->'labels'->>'middle',''))=''",
          'false',
        ),
      async () =>
        expectInvariantFailure(async () => {
          const invalid = structuredClone(
            definition(),
          ) as unknown as MutableDefinition;
          invalid.questions[0]!.type = 'slider';
          invalid.questions[0]!.labels = { minimum: 'Low', maximum: 'High' };
          invalid.questions[0]!.validation = { min: 0, max: 10, step: 1 };
          invalid.questions[0]!.feedbackBands = [
            { min: 0, max: 10, text: 'Hunger' },
          ];
          const [row] = await db`
          select app_private.f15_valid_builder_definition(${db.json(invalid)},false) as valid`;
          expect(row?.valid).toBe(false);
        }),
    );
  });

  it('kills SQL validator parity mutants for choices and contains', async () => {
    const identity = 'app_private.f15_valid_builder_definition(jsonb,boolean)';
    await withCrashSafeFunctionMutant(
      identity,
      (body) =>
        body.replace(
          /\n\s*if question \? 'choices' and answer_type not in \('singleChoice','multiChoice','imageChoice','mealCount','derivedChoice'\) then return false; end if;/,
          '\n    -- killed mutant',
        ),
      async () =>
        expectInvariantFailure(async () => {
          const invalid = structuredClone(
            definition(),
          ) as unknown as MutableDefinition;
          invalid.questions[0]!.choices = ['unexpected'];
          const [row] =
            await db`select app_private.f15_valid_builder_definition(${db.json(invalid)},false) as valid`;
          expect(row?.valid).toBe(false);
        }),
    );
    await withCrashSafeFunctionMutant(
      identity,
      (body) =>
        body.replace(
          /\s*if exists\(select 1 from jsonb_array_elements\(question->'when'->'conditions'\) c\s*join jsonb_array_elements\(p_definition->'questions'\) parent\s*on parent\.value->>'id'=c\.value->>'questionId'\s*where c\.value->>'operator'='contains' and \(parent\.value->>'type'<>'multiChoice'\s*or not \(parent\.value->'choices' @> jsonb_build_array\(c\.value->'value'\)\)\)\) then return false; end if;/,
          '\n    -- killed mutant',
        ),
      async () =>
        expectInvariantFailure(async () => {
          const invalid = definition() as unknown as MutableDefinition;
          invalid.questions[1]!.when = {
            mode: 'all',
            conditions: [
              { questionId: 'question-2', operator: 'contains', value: 'x' },
            ],
          };
          const [row] =
            await db`select app_private.f15_valid_builder_definition(${db.json(invalid)},false) as valid`;
          expect(row?.valid).toBe(false);
        }),
    );
  });

  it('kills the first-save missing-row RPC mutant', async () => {
    await withCrashSafeFunctionMutant(
      'app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)',
      (body) =>
        body.replace(
          "if p_expected_revision<>0 then return jsonb_build_object('status','missing'); end if;",
          "if true then return jsonb_build_object('status','missing'); end if;",
        ),
      async () =>
        expectInvariantFailure(() =>
          db.begin(async (tx) => {
            const fixture = await workspace(tx);
            const policy = `first-save-${fixture.workspaceId}`;
            await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${policy},'terms','published')`;
            const result =
              await tx`select app_private.save_workspace_form_draft(${fixture.workspaceId},${randomUUID()},0,${tx.json(definition())},${randomUUID()},${fixture.actor},'First draft') as result`;
            expect(result[0]?.result.status).toBe('ok');
          }),
        ),
    );
  });

  it('saves a draft with CAS and an idempotent request key, and audits once', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const requestId = randomUUID();
        const payload = definition();
        const first = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(payload)},${requestId},${fixture.actor},'Your First Step'
          ) as result`;
        expect(first[0]?.result).toMatchObject({ status: 'ok', revision: 2 });
        const replay = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(payload)},${requestId},${fixture.actor},'Your First Step'
          ) as result`;
        expect(replay[0]?.result).toEqual(first[0]?.result);
        const changedReplay = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition('Changed'))},${requestId},${fixture.actor},'Your First Step'
          ) as result`;
        expect(changedReplay[0]?.result).toEqual({
          status: 'idempotency_conflict',
        });
        const stale = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(payload)},${randomUUID()},${fixture.actor},'Your First Step'
          ) as result`;
        expect(stale[0]?.result).toEqual({ status: 'conflict' });
        const rows = await tx`
          select version_number,definition,status from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId}
          order by version_number`;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          version_number: 2,
          definition: payload,
          status: 'draft',
        });
        const audits = await tx`
          select details from public.audit_events
          where workspace_id=${fixture.workspaceId} and action='form.draft_saved'`;
        expect(audits).toHaveLength(1);
        expect(audits[0]?.details).toEqual({
          form_id: fixture.formId,
          revision: 2,
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('persists section reorder and question removal through a new draft revision', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const first = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},${fixture.actor},'Your First Step'
          ) as result`;
        expect(first[0]?.result).toMatchObject({ status: 'ok', revision: 2 });
        const edited = definition();
        edited.sections.reverse();
        edited.sections = edited.sections.filter(
          (section) => section.id !== 'section-2',
        );
        edited.questions = edited.questions.filter(
          (question) => question.id !== 'question-2',
        );
        const editedChoice = edited.questions[1]! as {
          label: { en: string; ar: string };
          choices: string[];
        };
        editedChoice.label.en = 'Updated conditional prompt';
        editedChoice.choices = ['updated-one', 'updated-two'];
        const second = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},2,${tx.json(edited)},${randomUUID()},${fixture.actor},'Your First Step'
          ) as result`;
        expect(second[0]?.result).toMatchObject({ status: 'ok', revision: 3 });
        const stored = await tx`
          select definition from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId} and version_number=3`;
        expect(stored[0]?.definition).toEqual(edited);
        expect(edited.sections.map((section) => section.id)).toEqual([
          'section-3',
          'section-1',
        ]);
        expect(edited.questions.map((question) => question.id)).toEqual([
          'parent',
          'question-1',
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('keeps retirement blocked for the selected default and replays a completed retirement', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const blocked = await tx`
          select app_private.retire_workspace_form(
            ${fixture.workspaceId},${fixture.formId},${randomUUID()},${fixture.actor}
          ) as result`;
        expect(blocked[0]?.result).toEqual({ status: 'default_selected' });
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Eligible replacement')`;
        await tx`insert into public.form_versions(
          workspace_id,form_id,version_number,terms_policy_version,definition,status
        ) values(
          ${fixture.workspaceId},${replacement},1,'f15-terms-s14-draft-2026-10-30',
          ${tx.json(definition())},'draft'
        )`;
        await tx`select app_private.set_default_onboarding_form(
          ${fixture.workspaceId},${replacement},${fixture.actor}
        )`;
        const requestId = randomUUID();
        const retired = await tx`
          select app_private.retire_workspace_form(
            ${fixture.workspaceId},${fixture.formId},${requestId},${fixture.actor}
          ) as result`;
        expect(retired[0]?.result).toMatchObject({
          status: 'ok',
          formStatus: 'retired',
        });
        const replay = await tx`
          select app_private.retire_workspace_form(
            ${fixture.workspaceId},${fixture.formId},${requestId},${fixture.actor}
          ) as result`;
        expect(replay[0]?.result).toEqual(retired[0]?.result);
        const count =
          await tx`select count(*)::int as count from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId} and status='retired'`;
        expect(count[0]?.count).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('publishes a new immutable version and copies its options and conditional rules', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const policy = `builder-terms-${fixture.workspaceId}`;
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')`;
        const saved = await tx`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},${fixture.actor},'Your First Step'
          ) as result`;
        expect(saved[0]?.result.status).toBe('ok');
        const publishRequest = randomUUID();
        const published = await tx`
          select app_private.publish_workspace_form(${fixture.workspaceId},${fixture.formId},${publishRequest},${fixture.actor}) as result`;
        expect(published[0]?.result).toMatchObject({
          status: 'ok',
          revision: 3,
        });
        const publishReplay = await tx`
          select app_private.publish_workspace_form(${fixture.workspaceId},${fixture.formId},${publishRequest},${fixture.actor}) as result`;
        expect(publishReplay[0]?.result).toEqual(published[0]?.result);
        const version = await tx`
          select status,terms_policy_version,definition from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId} and version_number=3`;
        expect(version[0]).toMatchObject({
          status: 'published',
          terms_policy_version: policy,
          definition: definition(),
        });
        await expect(
          tx.savepoint(
            (sp) => sp`
          update public.form_versions set definition=${sp.json(definition('mutated'))}
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId} and version_number=3
        `,
          ),
        ).rejects.toThrow();
        await expect(
          tx.savepoint(
            (sp) => sp`
              delete from public.form_versions
              where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId} and version_number=3
            `,
          ),
        ).rejects.toThrow();
        const copyRequest = randomUUID();
        const copied = await tx`
          select app_private.copy_workspace_form(${fixture.workspaceId},${fixture.formId},${copyRequest},${fixture.actor}) as result`;
        expect(copied[0]?.result).toMatchObject({ status: 'ok', revision: 1 });
        const copyReplay = await tx`
          select app_private.copy_workspace_form(${fixture.workspaceId},${fixture.formId},${copyRequest},${fixture.actor}) as result`;
        expect(copyReplay[0]?.result).toEqual(copied[0]?.result);
        const copies = await tx`select count(*)::int as count from public.forms
          where workspace_id=${fixture.workspaceId} and id=${copied[0]!.result.formId}`;
        expect(copies[0]?.count).toBe(1);
        const copyVersion = await tx`
          select definition,status from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${copied[0]!.result.formId}`;
        expect(copyVersion[0]).toMatchObject({
          definition: definition(),
          status: 'draft',
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('keeps assignment snapshot bytes unchanged after draft, publish, retire, and copy RPCs', async () => {
    const clientFixture = await clientContext();
    await expect(
      db.begin(async (tx) => {
        const actor = randomUUID();
        const workspaceId = clientFixture.wsA.id;
        const formId = randomUUID();
        const policy = `builder-snapshot-${workspaceId}`;
        await tx`insert into auth.users(id,email) values(${actor},${`f15-builder-snapshot-${actor}@example.test`})`;
        await tx`insert into public.staff_profiles(user_id,role) values(${actor},'workspace_owner')`;
        await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
          values(${workspaceId},${actor},${actor})`;
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')`;
        const original = definition();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${formId},${workspaceId},'Snapshot source')`;
        await tx`insert into public.form_versions(
          workspace_id,form_id,version_number,terms_policy_version,definition,status,published_at
        ) values(
          ${workspaceId},${formId},1,${policy},${tx.json(original)},'published',clock_timestamp()
        )`;
        const client = await pending(tx, clientFixture);
        await tx`insert into public.form_assignments(
          workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot
        ) values(
          ${workspaceId},${client.id},${formId},1,${policy},${tx.json(original)}
        )`;
        const before = await tx`select terms_policy_version,version_snapshot
          from public.form_assignments
          where workspace_id=${workspaceId} and client_id=${client.id} and form_id=${formId}`;

        const saved = await tx`select app_private.save_workspace_form_draft(
          ${workspaceId},${formId},1,${tx.json(definition('Later draft'))},${randomUUID()},${actor},'Snapshot source'
        ) as result`;
        expect(saved[0]?.result.status).toBe('ok');
        const published = await tx`select app_private.publish_workspace_form(
          ${workspaceId},${formId},${randomUUID()},${actor}
        ) as result`;
        expect(published[0]?.result.status).toBe('ok');
        const copied = await tx`select app_private.copy_workspace_form(
          ${workspaceId},${formId},${randomUUID()},${actor}
        ) as result`;
        expect(copied[0]?.result.status).toBe('ok');
        const retired = await tx`select app_private.retire_workspace_form(
          ${workspaceId},${formId},${randomUUID()},${actor}
        ) as result`;
        expect(retired[0]?.result.status).toBe('ok');

        const after = await tx`select terms_policy_version,version_snapshot
          from public.form_assignments
          where workspace_id=${workspaceId} and client_id=${client.id} and form_id=${formId}`;
        expect(after).toEqual(before);
        const originalVersion = await tx`select status,definition
          from public.form_versions where workspace_id=${workspaceId}
            and form_id=${formId} and version_number=1`;
        expect(originalVersion).toEqual([
          { status: 'published', definition: original },
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('rejects invalid authoring bounds and rolls back a write if its audit append fails', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const invalidCharLimit = definition();
        (invalidCharLimit.questions[2]! as { charLimit?: number }).charLimit =
          151;
        const validLongTextLimit = definition();
        validLongTextLimit.questions[2]!.type = 'longText';
        (validLongTextLimit.questions[2]! as { charLimit?: number }).charLimit =
          1000;
        const invalidLongTextLimit = definition();
        invalidLongTextLimit.questions[2]!.type = 'longText';
        (
          invalidLongTextLimit.questions[2]! as { charLimit?: number }
        ).charLimit = 1001;
        const acceptedBounds = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(validLongTextLimit)},false) as valid`;
        expect(acceptedBounds[0]?.valid).toBe(true);
        const tooManyPerSection = definition();
        tooManyPerSection.questions = Array.from(
          { length: 21 },
          (_, index) => ({
            id: `bounded-${index}`,
            sectionId: 'section-1',
            type: 'shortText',
            required: false,
            charLimit: 150,
            label: { en: `Prompt ${index}`, ar: 'سؤال' },
          }),
        );
        const tooManyTotal = definition();
        const cyclic = definition();
        (cyclic.questions[1]! as { when?: unknown }).when = {
          mode: 'all',
          conditions: [{ questionId: 'question-1', operator: 'isAnswered' }],
        };
        const executableExtension = definition() as ReturnType<
          typeof definition
        > & {
          script?: string;
        };
        executableExtension.script = 'javascript:alert(1)';
        const unapprovedCopy = definition();
        unapprovedCopy.copyStatus = 'approved';
        const oversizedTitle = definition();
        oversizedTitle.title.en = 'x'.repeat(4097);
        tooManyTotal.sections = Array.from({ length: 4 }, (_, index) => ({
          id: `cap-section-${index}`,
          title: { en: `Section ${index}`, ar: 'أساسيات' },
        }));
        tooManyTotal.questions = Array.from({ length: 61 }, (_, index) => ({
          id: `cap-question-${index}`,
          sectionId: `cap-section-${Math.floor(index / 16)}`,
          type: 'shortText',
          required: false,
          charLimit: 150,
          label: { en: `Prompt ${index}`, ar: 'سؤال' },
        }));
        for (const invalid of [
          invalidCharLimit,
          invalidLongTextLimit,
          tooManyPerSection,
          tooManyTotal,
          cyclic,
          executableExtension,
          unapprovedCopy,
          oversizedTitle,
        ]) {
          const rejected = await tx`
            select app_private.save_workspace_form_draft(
              ${fixture.workspaceId},${fixture.formId},1,${tx.json(invalid)},${randomUUID()},${fixture.actor},'Your First Step'
            ) as result`;
          expect(rejected[0]?.result).toEqual({ status: 'invalid' });
        }
        await tx.unsafe(`create function app_private.f15_test_reject_builder_audit() returns trigger
          language plpgsql set search_path='' as $$ begin
            if new.action='form.draft_saved' then raise exception 'synthetic audit failure'; end if;
            return new;
          end $$`);
        await tx.unsafe(`create trigger f15_test_reject_builder_audit before insert on public.audit_events
          for each row execute function app_private.f15_test_reject_builder_audit()`);
        await expect(
          tx.savepoint(
            (sp) => sp`
          select app_private.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},${fixture.actor},'Your First Step'
          )
        `,
          ),
        ).rejects.toThrow();
        const versions = await tx`
          select version_number from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${fixture.formId}`;
        expect(versions.map((row) => row.version_number)).toEqual([1]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it.each(['workspace_owner', 'platform_owner', 'trainer'] as const)(
    'allows %s to call the author_forms Builder RPC (pending T049)',
    async (role) => {
      await db
        .begin(async (tx) => {
          const fixture = await workspace(tx);
          if (role !== 'workspace_owner') {
            const userId = randomUUID();
            await tx`insert into auth.users(id,email) values(${userId},${`f15-builder-${role}-${userId}@example.test`})`;
            await tx`insert into public.staff_profiles(user_id,role) values(${userId},${role})`;
            await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
            values(${fixture.workspaceId},${userId},${fixture.actor})`;
            fixture.actor = userId;
          }
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
          await tx`set local role authenticated`;
          const result = await tx`
          select public.save_workspace_form_draft(
            ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},'Your First Step'
          ) as result`;
          expect(result[0]?.result).toMatchObject({ status: 'ok' });
          throw rollback;
        })
        .catch((error) => {
          if (error !== rollback) throw error;
        });
    },
  );

  it('does not copy a form across workspaces', async () => {
    await expect(
      db.begin(async (tx) => {
        const target = await workspace(tx);
        const foreign = await workspace(tx);
        const result = await tx`
          select app_private.copy_workspace_form(
            ${target.workspaceId},${foreign.formId},${randomUUID()},${target.actor}
          ) as result`;
        expect(result[0]?.result).toEqual({ status: 'missing' });
        const created = await tx`
          select count(*)::int as count from public.forms where workspace_id=${target.workspaceId}`;
        expect(created[0]?.count).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('denies Sales and unknown callers across every Builder RPC without revealing a form', async () => {
    await db
      .begin(async (tx) => {
        const fixture = await workspace(tx);
        await tx`update public.staff_profiles set role='sales' where user_id=${fixture.actor}`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const sales = await tx`
        select public.save_workspace_form_draft(
          ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},'Your First Step'
        ) as result`;
        expect(sales[0]?.result).toBeNull();
        const salesPublish = await tx`select public.publish_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        const salesRetire = await tx`select public.retire_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        const salesCopy = await tx`select public.copy_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        expect([
          salesPublish[0]?.result,
          salesRetire[0]?.result,
          salesCopy[0]?.result,
        ]).toEqual([null, null, null]);
        const unknown = randomUUID();
        await tx`reset role`;
        await tx`insert into auth.users(id,email) values(${unknown},${`f15-builder-unknown-${unknown}@example.test`})`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: unknown, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const unknownResult = await tx`
        select public.save_workspace_form_draft(
          ${fixture.workspaceId},${fixture.formId},1,${tx.json(definition())},${randomUUID()},'Your First Step'
        ) as result`;
        expect(unknownResult[0]?.result).toBeNull();
        const unknownPublish = await tx`select public.publish_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        const unknownRetire = await tx`select public.retire_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        const unknownCopy = await tx`select public.copy_workspace_form(
          ${fixture.workspaceId},${fixture.formId},${randomUUID()}
        ) as result`;
        expect([
          unknownPublish[0]?.result,
          unknownRetire[0]?.result,
          unknownCopy[0]?.result,
        ]).toEqual([null, null, null]);
        await tx`reset role`;
        const forms = await tx`select count(*)::int as count from public.forms
          where workspace_id=${fixture.workspaceId}`;
        expect(forms[0]?.count).toBe(1);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });
});

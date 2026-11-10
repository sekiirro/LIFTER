import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const lifecycleStates = ['active', 'removed', 'merged'];
const hasValue = (object, key) => Object.hasOwn(object ?? {}, key) && object[key] !== null && object[key] !== undefined;
const objectOrEmpty = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const isInteger = value => Number.isInteger(value);

function videoHostClass(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
    if (host === 'drive.google.com' || host.endsWith('.drive.google.com')) return 'googleDrive';
    if (host === 'docs.google.com' || host.endsWith('.docs.google.com')) return 'docsGoogle';
  } catch {
    return 'other';
  }
  return 'other';
}

function defaultsFor(payload) {
  const defaults = objectOrEmpty(payload?.defaults);
  return {
    rest: defaults.default_rest_time ?? defaults.rest_time_seconds ?? defaults.rest_seconds ?? defaults.rest,
    rir: defaults.default_rir ?? defaults.rir,
    reps: defaults.default_reps ?? defaults.reps,
  };
}

function validReps(value) {
  if (isInteger(value)) return value >= 1 && value <= 100;
  if (typeof value === 'string') {
    const match = value.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    return Boolean(match && Number(match[1]) >= 1 && Number(match[2]) <= 100 && Number(match[1]) <= Number(match[2]));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const min = value.min ?? value.from;
    const max = value.max ?? value.to;
    return Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 100 && min <= max;
  }
  return false;
}

function alternativesFor(payload) {
  if (Array.isArray(payload?.alternatives)) return payload.alternatives;
  if (Array.isArray(payload?.defaults?.alternative_exercise_ids)) return payload.defaults.alternative_exercise_ids;
  if (Array.isArray(payload?.alternative_exercise_ids)) return payload.alternative_exercise_ids;
  return null;
}

function targetReference(target) {
  if (typeof target === 'string') return { globalId: target, workspaceId: null, privateId: null };
  const item = objectOrEmpty(target);
  return {
    globalId: item.exercise_id ?? item.global_exercise_id ?? item.target_id ?? null,
    workspaceId: item.workspace_id ?? null,
    privateId: item.workspace_exercise_id ?? item.private_exercise_id ?? null,
  };
}

function defaultCounts(versions) {
  const counts = { restTimeOutOfBounds: 0, rirOutOfBounds: 0, repsOutOfBounds: 0 };
  for (const { payload } of versions) {
    const values = defaultsFor(payload);
    if (values.rest !== undefined && values.rest !== null && (!isInteger(values.rest) || values.rest < 0 || values.rest > 600 || values.rest % 15 !== 0)) counts.restTimeOutOfBounds++;
    if (values.rir !== undefined && values.rir !== null && (!isInteger(values.rir) || values.rir < 0 || values.rir > 5)) counts.rirOutOfBounds++;
    if (values.reps !== undefined && values.reps !== null && !validReps(values.reps)) counts.repsOutOfBounds++;
  }
  return counts;
}

function payloadFamily(versions) {
  const taxonomyKeysPresent = row => hasValue(row.payload, 'primary_muscle_code') && Array.isArray(row.payload?.equipment_codes) && row.payload.equipment_codes.length > 0;
  return {
    versionRows: versions.length,
    rowsWithInstructions: versions.filter(row => hasValue(row.payload, 'instructions_ar') || hasValue(row.payload, 'instructions_en')).length,
    rowsWithNotes: versions.filter(row => hasValue(row.payload, 'notes') || hasValue(row.payload, 'note')).length,
    rowsWithTaxonomy: versions.filter(taxonomyKeysPresent).length,
    rowsMissingRequiredCanonicalFields: versions.filter(row => !hasValue(row.payload, 'name_en') || !hasValue(row.payload, 'primary_muscle_code') || !Array.isArray(row.payload?.equipment_codes) || row.payload.equipment_codes.length === 0).length,
    defaultsOutsideBounds: defaultCounts(versions),
  };
}

function alternativesViolations(versions, targetExists) {
  const result = { versionsWithLists: 0, duplicateTargets: 0, moreThanThree: 0, missingOrInactiveTargets: 0 };
  for (const row of versions) {
    const list = alternativesFor(row.payload);
    if (!list) continue;
    result.versionsWithLists++;
    const targets = list.map(targetReference);
    const keys = targets.map(target => `${target.workspaceId ?? ''}:${target.privateId ?? target.globalId ?? ''}`);
    if (new Set(keys).size !== keys.length) result.duplicateTargets++;
    if (targets.length > 3) result.moreThanThree++;
    if (targets.some(target => !targetExists(target, row))) result.missingOrInactiveTargets++;
  }
  return result;
}

/** Summarize database rows to aggregate counts only. Raw payloads never enter the report object. */
export function summarizeInventory(data) {
  const workspaces = data.workspaces ?? [];
  const variations = data.variations ?? [];
  const variationVersions = data.variationVersions ?? [];
  const exercises = data.exercises ?? [];
  const workspaceExercises = data.workspaceExercises ?? [];
  const exerciseVersions = data.exerciseVersions ?? [];
  const workspaceExerciseVersions = data.workspaceExerciseVersions ?? [];
  const exerciseById = new Map(exercises.map(row => [row.id, row]));
  const privateExerciseByKey = new Map(workspaceExercises.map(row => [`${row.workspace_id}:${row.id}`, row]));
  const variationVersionByKey = new Map(variationVersions.map(row => [`${row.workspace_id}:${row.exercise_id}:${row.version}`, row]));
  const versionMetrics = (rows, payloadOf) => {
    const metrics = { notePresent: 0, videoUrlPresent: 0, videoUrlByHost: { youtube: 0, googleDrive: 0, docsGoogle: 0, other: 0 } };
    for (const row of rows) {
      const payload = payloadOf(row) ?? {};
      if (hasValue(payload, 'note')) metrics.notePresent++;
      if (hasValue(payload, 'video_url')) {
        metrics.videoUrlPresent++;
        const host = videoHostClass(payload.video_url);
        if (host) metrics.videoUrlByHost[host]++;
      }
    }
    return metrics;
  };
  const workspaceMap = new Map(workspaces.map(row => [row.id, []]));
  for (const row of variations) {
    if (!workspaceMap.has(row.workspace_id)) workspaceMap.set(row.workspace_id, []);
    workspaceMap.get(row.workspace_id).push(row);
  }
  const sortedWorkspaces = [...workspaceMap.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
  const variationRowsByWorkspace = {};
  for (const [workspaceId, rows] of sortedWorkspaces) {
    const lifecycle = Object.fromEntries(lifecycleStates.map(state => [state, rows.filter(row => row.lifecycle_state === state).length]));
    const currentPayloadRows = rows.map(row => variationVersionByKey.get(`${row.workspace_id}:${row.exercise_id}:${row.current_version}`)).filter(Boolean);
    variationRowsByWorkspace[`workspace_${String(Object.keys(variationRowsByWorkspace).length + 1).padStart(3, '0')}`] = {
      rowCount: rows.length,
      lifecycle,
      currentPayload: versionMetrics(currentPayloadRows, row => row.payload),
      historyVersionRows: variationVersions.filter(row => row.workspace_id === workspaceId).length,
    };
  }
  const missingOrInactiveGlobal = target => {
    const exercise = target.globalId ? exerciseById.get(target.globalId) : null;
    return Boolean(!exercise || exercise.lifecycle_state !== 'active');
  };
  const missingOrInactivePrivate = (target, source) => {
    const workspaceId = target.workspaceId ?? source.workspace_id;
    const exercise = target.privateId ? privateExerciseByKey.get(`${workspaceId}:${target.privateId}`) : null;
    return Boolean(!exercise || exercise.lifecycle_state !== 'active');
  };
  const targetIsValid = (target, source) => target.privateId
    ? !missingOrInactivePrivate(target, source)
    : !missingOrInactiveGlobal(target);
  const legacyAlternativeVersions = [...exerciseVersions, ...workspaceExerciseVersions, ...variationVersions];

  return {
    generatedAtUtc: new Date().toISOString(),
    stack: 'A',
    legacy: {
      workspaceCount: workspaces.length,
      variationRowCount: variations.length,
      variationVersionRowCount: variationVersions.length,
      lifecycle: Object.fromEntries(lifecycleStates.map(state => [state, variations.filter(row => row.lifecycle_state === state).length])),
      workspacesWithoutExplicitRow: workspaces.filter(workspace => !variations.some(row => row.workspace_id === workspace.id)).length,
      variationRowsByWorkspace,
      currentPayloadTotals: versionMetrics(variations.map(row => variationVersionByKey.get(`${row.workspace_id}:${row.exercise_id}:${row.current_version}`)).filter(Boolean), row => row.payload),
      historyPayloadTotals: versionMetrics(variationVersions, row => row.payload),
      alternativeLists: alternativesViolations(legacyAlternativeVersions, targetIsValid),
    },
    canonical: {
      exerciseIdentities: { total: exercises.length, lifecycle: Object.fromEntries(lifecycleStates.map(state => [state, exercises.filter(row => row.lifecycle_state === state).length])) },
      exerciseVersions: {
        ...payloadFamily(exerciseVersions),
        alternativeLists: alternativesViolations(exerciseVersions, targetIsValid),
      },
      workspaceExerciseIdentities: { total: workspaceExercises.length, lifecycle: Object.fromEntries(lifecycleStates.map(state => [state, workspaceExercises.filter(row => row.lifecycle_state === state).length])) },
      workspaceExerciseVersions: {
        ...payloadFamily(workspaceExerciseVersions),
        alternativeLists: alternativesViolations(workspaceExerciseVersions, targetIsValid),
      },
    },
  };
}

export function serializeInventoryReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function readInventory(db) {
  return db.begin(async tx => {
    await tx`set transaction read only`;
    const [workspaces, variations, variationVersions, exercises, workspaceExercises, exerciseVersions, workspaceExerciseVersions] = await Promise.all([
      tx`select id from public.workspaces order by id`,
      tx`select workspace_id, exercise_id, current_version, lifecycle_state from public.exercise_variations order by workspace_id, exercise_id`,
      tx`select workspace_id, exercise_id, version, payload from public.exercise_variation_versions order by workspace_id, exercise_id, version`,
      tx`select id, lifecycle_state from public.exercises order by id`,
      tx`select workspace_id, id, lifecycle_state from public.workspace_exercises order by workspace_id, id`,
      tx`select exercise_id, version, payload from public.exercise_versions order by exercise_id, version`,
      tx`select workspace_id, workspace_exercise_id, version, payload from public.workspace_exercise_versions order by workspace_id, workspace_exercise_id, version`,
    ]);
    return summarizeInventory({ workspaces, variations, variationVersions, exercises, workspaceExercises, exerciseVersions, workspaceExerciseVersions });
  });
}

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required; use supabase-safe exec with Stack A.');
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const mainShaIndex = args.indexOf('--main-sha');
  const outputPath = resolve(outputIndex >= 0 ? args[outputIndex + 1] : 'specs/016-exercise-food-catalogs/evidence/t068-stack-a-inventory.json');
  const mainSha = mainShaIndex >= 0 ? args[mainShaIndex + 1] : 'not-provided';
  const db = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
  try {
    const report = await readInventory(db);
    report.mainSha = mainSha;
    await mkdir(dirname(outputPath), { recursive: true });
    const serialized = serializeInventoryReport(report);
    await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(serialized);
  } finally {
    await db.end({ timeout: 5 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    process.stderr.write(`T068 inventory failed (${error?.name ?? 'Error'}). No inventory report was written.\n`);
    process.exitCode = 1;
  });
}

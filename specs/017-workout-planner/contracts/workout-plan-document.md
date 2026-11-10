# Contract — Workout plan document and exercise references

**Status**: spec-only draft (S42). No implementation.

## 1. Document shape (schema v1)

```
WorkoutDocument {
  schema_version: 1
  notes?: string
  days: Day[]                       // ordered, stable ids
}

Day {
  id: uuid
  kind: 'session' | 'rest'
  title?: string
  notes?: string
  items: Item[]                     // ordered, stable ids; empty allowed for rest days
}

Item {
  id: uuid
  exercise: ExerciseRef
  reps?: { value: int } | { min: int, max: int }   // 1..100; entry-level prescription
  restSec?: int                     // 0..600, step 15; entry-level prescription
  rir?: int                         // 0..5; entry-level prescription
  notes?: string
  alternatives: ExerciseRef[]       // max 3 unique targets (F16 FR-025)
  sets: Set[]                       // ordered
}

ExerciseRef {
  source: 'global' | 'workspace_private'
  identity_id: uuid
  version: integer                  // immutable version in the identity's source catalog
  overrideVersion?: integer | null  // global exercises only; source-workspace override version
  overrideWorkspaceId?: uuid       // required when overrideVersion is non-null; never infer from destination workspace
  workspace_id?: uuid               // required only for workspace_private; identifies its source workspace
  // no `variation` field (F16 FR-031 / F16 FR-038)
}

Set {
  id: uuid
  type: 'warmup' | 'working'
  load:
    | { mode: 'bodyweight' }
    | { mode: 'added_weight', value: decimal_string, unit: 'kg' | 'lb' }
    | { mode: 'assisted', value: decimal_string, unit: 'kg' | 'lb' }
}
```

`value` is a positive exact decimal string, never a float. Bodyweight carries no value/unit. Added Weight and Assisted are distinct modes.

## 2. Invariants

1. Ids are unique within a document; unchanged items keep their ids across revisions; deliberate duplicates get new ids for the item and every descendant set (and a duplicated day remaps the day id and all descendants).
2. Reorder, cross-day move and duplicate preserve every entry prescription and set type/load field-for-field and never corrupt reps/load/rest/RIR/notes.
3. Each plan exercise entry stores editable prescription fields (Rest, RIR, Reps, Notes, Alternatives) independently of its set rows. These fields are on the item shape, not the set shape. A fresh entry may have zero set rows and still retains these values. Adding sets later does not reread library defaults; entry prescriptions remain editable at plan-entry level. Set rows contain only their id, warm-up/working type, and load prescription. At add time, the reference captures immutable identity-source version metadata and, for a global exercise, the applicable override version and source workspace (null override means none); the entry copies effective non-video values. Draft save/reload preserves these pins and copied values, while subsequent trainer edits to the entry remain editable. Later catalog/override edits do not change the draft entry. At publication, freeze the entry's current trainer-edited non-video values and notes/alternatives together with the original add-time version pins into `ExerciseSnapshotV2`; do not reread the catalog or override. Video remains live (S44-PO-2; architect mapping (S44-R2)).
4. Alternatives reference at most three unique targets, validated active at selection, resolved through F16 FR-026. Removed/merged targets are shown unavailable in the draft and never substituted.
5. Fresh authoring of a global Workout Template resolves exercises canonical-only (F16 FR-026); workspace overrides and workspace-private exercises cannot be newly added. A promoted template may retain existing workspace-private exercise references; unresolved references are flagged RED and block loading until fixed (S42-PO-8). Promotion is not fresh global authoring.
6. A workspace-private reference carries its source `workspace_id` and uses the composite `(workspace_id, identity_id, version)` for lookup and authorization; its version is a `workspace_exercise_versions` version and it has no override reference. A global exercise's override pin carries the source workspace identity separately from the destination workspace and is never resolved as a destination-local override. Promotion preserves the source workspace and authorized captured values/pins; it does not grant access to source workspace data. A missing source workspace, unresolved reference or foreign-workspace reference is invalid; loading is blocked for unresolved or foreign references, and denials are generic.

## 3. Add-time defaults (PO A1)

- On add, copy the current F16 `Default Rest Time`, `Default RIR` and `Default Reps` into the entry's ordinary `restSec`, `rir` and `reps` fields.
- Missing default → leave the field absent/blank; never substitute another exercise, another workspace or a platform-wide value.
- Copy happens once at add. Later library edits never change existing entries; loading never re-defaults; a new add uses the defaults current at that moment.
- No catalog field is added. A newly added plan exercise starts with zero set rows (S42-PO-8), while its entry-level prescription fields persist independently of sets.

## 4. Publication snapshot

At publication the revision embeds `ExerciseSnapshotV2` per referenced exercise with its source-specific immutable identity/version pins, the applicable global-exercise override version and source workspace (or null), and the entry's current trainer-edited non-video values (name, description, notes, alternatives, copied/edited defaults). Add-time pins remain unchanged; edits made to the plan entry before publication are included. Do not resolve current catalog/override values at publication. Video is excluded and resolved live per authorized read/export. Later library, override, Remove or Merge operations never rewrite the draft entry or snapshot.

## 5. Validation and versioning

- `schema_version` is checked against a registry of immutable parsers. Unknown version → generic failure, no write. A new version is added by forward migration before any write uses it.
- Older retained versions remain renderable and exportable.
- Document size is bounded; the historical 512 KB figure is provisional only (spec SC-014) until re-benchmarked.
- Validation rejects: duplicate/missing ids, empty session at publish, reps out of bounds or inverted range, negative/zero load, disallowed unit/mode, rest/RIR out of bounds, fourth alternative, duplicate alternative target, foreign private reference, unknown exercise version.

## 6. Operations (logical, no SQL)

| Operation             | Effect                                                                             | Concurrency                              |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| create plan           | creates the F19 root via Plan Core; F17 supplies an empty or copied document       | F19 creation lock + operation key        |
| save draft / autosave | writes draft content at expected revision                                          | CAS on draft revision + operation key    |
| save as draft         | same write, explicitly confirmed                                                   | CAS                                      |
| ready & publish       | validates, gates intake + current subscription, appends one revision with snapshot | CAS on draft/revision + F19 publish path |
| copy plan             | copies latest published revision values                                            | new root, no source mutation             |
| load template         | copies template version content with id remap                                      | no template mutation                     |

Errors are generic (`not_permitted`, `not_found`, `stale_version`, `key_conflict`, `invalid_document`); `not_permitted` and `not_found` are indistinguishable to the caller.

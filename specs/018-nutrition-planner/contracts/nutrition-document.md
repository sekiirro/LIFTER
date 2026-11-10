# Contract — Nutrition Document v1

**Owner**: F18. **Consumers**: F18 editor, publisher, exports, F19 (opaque revision content), P4 (client projection).
**Status**: Spec-only. No code, schema or fixture is created by this document.

## 1. Document envelope

The document is the value stored in `nutrition_plan_version_contents.document` (immutable) and in the private draft's nutrition content (mutable). All ids are strings unique within the document. All numeric inputs/outputs are decimal strings (`"4.5658"`, never a JavaScript number).

```json
{
  "schemaVersion": 1,
  "structure": "single_day" | "seven_day",
  "implicitDayTypeId": "dt-1",            // ALWAYS required for single_day; absent for seven_day
  "dayTypes": [
    { "id": "dt-1", "name": { "ar": "...", "en": "..." },
      "trainingDay": true,
      "targets": { "kcal": "2200", "protein": "180", "carbs": "220", "fat": "70" } | null }
  ],
  "days": [                                 // seven_day only: exactly 7 entries, dayIndex 0..6 each once
    { "dayIndex": 0, "dayTypeId": "dt-1", "meals": [ /* Meal */ ] }
  ],
  "meals": [ /* single_day only: the one implicit day's meals */ ],
  "title": { "ar": "...", "en": "..." } | null,
  "notes": "free text" | null
}
```

`days` and the top-level `meals` are mutually exclusive: `seven_day` has `days` and no top-level `meals`; `single_day` has the top-level `meals` and no `days`. There is no other meal container.

### Meal

```json
{
  "id": "m-1",
  "name": { "ar": "...", "en": "..." },
  "conditional": "always" | "training_days_only",
  "note": "free text" | null,
  "recipeUrl": "https://…" | null,
  "items": [ /* Item */ ]
}
```

- `conditional` is derived from the resolved day type's `trainingDay` for `single_day` (a `training_days_only` meal is legal only when the implicit day type is a training day) and evaluated per day for `seven_day`.
- A `training_days_only` meal in a document with no reachable training day is a **draft warning** and a **hard rejection** at Ready and publish.
- `recipeUrl` is the D18-6 optional recipe/preparation link. When `null`, neither the link nor its icon is rendered.

### Item

```json
{
  "id": "i-1",
  "foodId": "uuid",
  "foodVersion": 3,
  "quantity": { "value": "37.5", "unit": "g" | "ml" | "<serving unit_key>" },
  "note": "free text" | null,
  "alternatives": [ /* Alternative, max 3 */ ]
}
```

### Alternative

```json
{
  "id": "a-1",
  "foodId": "uuid",
  "foodVersion": 2,
  "quantity": { "value": "1.5", "unit": "<serving unit_key>" }
}
```

- Alternatives are existing food catalog entries; no free-text alternative, no AI-generated entry.
- At most three per item (`F18-FR-006`).
- Alternative ids and item ids are stable across non-substantive edits and remapped on duplication or food replacement (see `data-model.md` §3).

## 2. Invariants (validator must reject on violation)

1. `single_day` ⇒ exactly one implicit day, no `days` array, `implicitDayTypeId` present and resolvable; `seven_day` ⇒ `days` has exactly indexes 0–6, each once, every `dayTypeId` resolvable, `implicitDayTypeId` absent.
2. Every document, day-type, meal, item and alternative id is unique within its scope; every referenced id resolves; every meal is reachable by at least one day.
3. Every item/alternative references one exact `(foodId, foodVersion)`; no alias or "latest" reference is stored.
4. `quantity.value` is a positive decimal string with ≤ 3 decimal places; no exponent, no locale separators, no Arabic-Indic digits in the stored value (input normalization happens in the UI before storage).
5. `unit` is the food version's basis (`g`/`ml`) or one of its declared serving unit keys; a cross-basis unit is rejected (`F18-FR-004`).
6. Targets, when present, are non-negative decimal strings with ≤ 3 decimals; `targets: null` is valid (D18-2=A) and totals are still computed.
7. `recipeUrl`, when present, is an absolute HTTPS URL on YouTube or Google Drive (D18-6). No other host, no credentials in the URL. The exact host allowlist lives in the implementation validator and is contract-tested for both allowed and rejected hosts.
8. No unknown keys are accepted (strict parse); unknown keys fail the save/publish.
9. The document carries no computed values, no client selection and no actor identity.

## 3. Computed values (`computed_values`)

Shape (computed values are exact decimal strings at a scale sufficient for the declared input scales; display converts only):

```json
{
  "schemaVersion": 1,
  "algorithmVersion": 1,
  "items":   { "<itemId>": { "kcal": "…", "protein": "…", "carbs": "…", "fat": "…" } },
  "meals":   { "<mealId>": { "kcal": "…", "protein": "…", "carbs": "…", "fat": "…" } },
  "days":    { "0": { "kcal": "…", … } },
  "totals":  { "kcal": "…", "protein": "…", "carbs": "…", "fat": "…" }
}
```

Rules:

- Persist the exact computed decimal without storage rounding; apply half-up once from the exact value for display.
- Meal/day/document totals derive from full-precision exact item values, not from rounded or stored item values; rounding occurs only at final canonicalization/display.
- Alternative values are not stored here; they are derived on read from the snapshot map (see `data-model.md` §2). If the implementation chooses to store alternative values for export performance, they must be generated by the same database function inside the publish transaction and covered by the same goldens.
- `algorithmVersion` is frozen with the revision; a later algorithm change adds a new version, never rewrites this row.

## 4. Snapshot map (`snapshot_map`)

```json
{
  "food:<food_id>@<version>#<unit_key>": {
    "foodId": "…", "version": 3,
    "names": { "ar": "…", "en": "…" },
    "basis": "g" | "ml",
    "productIdentity": "…", "preparationIdentity": "…", "weighingState": "raw|cooked|not_applicable",
    "kcal": "…", "protein": "…", "carbs": "…", "fat": "…", "fiber": "…|null",
    "serving": { "servingId": "<unit_key>", "labels": { "ar": "…", "en": "…" }, "basisQuantity": "…" }
  }
}
```

- One entry per **distinct (food version, serving unit)** referenced by items and alternatives. This is required because `FoodSnapshotV1` freezes exactly one serving equivalent (`lib/catalog/snapshot.ts:15-37,164-242`).
- For a basis quantity (`g`/`ml`), `serving.basisQuantity` is `"1"` and `servingId` is the basis token; the item's quantity is already in basis units. The basis token is an F18 transport key, **not** an F16 serving row id; validators must not resolve it against `food_serving_units`.
- Values are serialized from the exact F16 columns at their fixed scale (kcal 1 dp, macros 2 dp, basis quantity 3 dp), with no floating-point round-trip.
- Only the database publish path writes this map. A caller-supplied map is ignored (`F18-FR-005`).

## 5. Validator/fixture obligations

- One fixture set with accept/reject pairs for every invariant above, run by the application validator and the SQL/RPC validator; both must produce the same accept/reject decision and the same field code.
- Boundary fixtures: 0.001 g, 9999.999 quantity, three alternatives vs four, a food with one serving vs several, `g` food with an `ml` request, `training_days_only` with/without a training day, missing `implicitDayTypeId`, duplicate `dayIndex`, duplicate ids, unknown key, non-HTTPS or wrong-host recipe URL.
- Golden computed-value fixtures: repeating fractions (1/3), 4-decimal carry (`…5` at the 5th decimal), values below/above 10 g for display, zero-valued foods, aggregates that differ from the sum of rounded items.
- The fixtures are frozen per `schemaVersion`/`algorithmVersion`; a new version adds fixtures and never edits the old expectation set.

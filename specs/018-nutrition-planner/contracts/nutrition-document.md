# Contract — Nutrition Document v1

**Owner**: F18. **Consumers**: F18 editor, publisher, exports, F19 (opaque revision content), P4 (client projection).
**Status**: Spec-only. No code, schema or fixture is created by this document.

## 1. Document envelope

The document is the value stored in `nutrition_plan_version_contents.document` (immutable) and in the private draft's nutrition content (mutable). All ids are strings unique within the document. Quantities, targets, computed values and snapshot nutrition/basis values are decimal strings (`"4.5658"`, never a JavaScript number); structural integers (`schemaVersion`, `dayIndex`, item/alternative `foodVersion`, `algorithmVersion`, snapshot `version`) are JSON numbers, as the examples show.

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
  "note": "free text" | null,
  "recipeUrl": "https://…" | null,
  "items": [ /* Item */ ]
}
```

- Each meal is visible on, and counted only in, the day that contains it: the single implicit day for `single_day`, or its own `days[]` entry for `seven_day`. A meal stored in one `days[]` entry never appears on, and never contributes to, another day, so two days holding different meals have independent totals. "Every day" in F18 wording therefore means "the meal's containing day", never "all seven days". Day type does not filter meal visibility or totals; there is no training/rest-day conditional.
- A meal's `note` is its Meal Notes field. An item's `note` is its separate Food Notes field. Each is independently editable and clearable; changing one preserves the other.
- `recipeUrl` is the D18-6 optional recipe/preparation link. When `null`, neither the link nor its icon is rendered.

### Item

```json
{
  "id": "i-1",
  "foodId": "uuid",
  "foodVersion": 3,
  "quantity": { "value": "37.5", "unit": { "kind": "basis", "value": "g" | "ml" } | { "kind": "serving", "unitKey": "<serving unit_key>" } },
  "note": "free text" | null,             // Food Notes; independent from the meal's note
  "alternatives": [ /* Alternative, max 3 */ ]
}
```

### Alternative

```json
{
  "id": "a-1",
  "foodId": "uuid",
  "foodVersion": 2,
  "quantity": {
    "value": "1.5",
    "unit": { "kind": "serving", "unitKey": "<serving unit_key>" }
  }
}
```

- Alternatives are existing food catalog entries; no free-text alternative, no AI-generated entry.
- At most three per item (`F18-FR-006`).
- Alternative ids and item ids are stable across non-substantive edits and remapped on duplication or food replacement (see `data-model.md` §3).

## 2. Invariants (validator must reject on violation)

1. `single_day` ⇒ exactly one implicit day, no `days` array, `implicitDayTypeId` present and resolvable; `seven_day` ⇒ `days` has exactly indexes 0–6, each once, every `dayTypeId` resolvable, `implicitDayTypeId` absent.
2. Every document, day-type, meal, item and alternative id is unique within its scope; every referenced id resolves; every meal is associated with exactly one document day (the implicit day for `single_day`, its own `days[]` entry for `seven_day`) and is visible and counted only on that day. Day type does not filter meals or totals.
3. Every item/alternative references one exact `(foodId, foodVersion)`; no alias or "latest" reference is stored.
4. `quantity.value` is a positive decimal string with ≤ 3 decimal places; no exponent, no locale separators, no Arabic-Indic digits in the stored value (input normalization happens in the UI before storage).
5. `unit.kind` disambiguates a basis unit (`{kind: "basis", value: "g"|"ml"}`) from a declared catalog serving (`{kind: "serving", unitKey}`). A catalog key may itself be `g` or `ml`, including when it matches the food basis; tagged references keep the two meanings distinct. A basis must match the food version basis and a serving key must resolve to that exact version's declared serving identity `(food_id, food_version, unit_key)`; cross-basis or undeclared units are rejected (`F18-FR-004`).
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
  "food:<food_id>@<version>#basis:<basis_unit>": { "kind": "basis", "foodId": "...", "version": 3, "names": { "ar": "...", "en": "..." }, "basis": "g" | "ml", "productIdentity": "...", "preparationIdentity": "...", "weighingState": "raw|cooked|not_applicable", "per100": { "kcal": "...", "protein": "...", "carbs": "...", "fat": "...", "fiber": "...|null" } },
  "food:<food_id>@<version>#serving:<unit_key>": {
    "kind": "serving",
    "unitKey": "<catalog unit_key>",
    "snapshot": {
      "foodId": "…", "version": 3,
      "names": { "ar": "…", "en": "…" },
      "basis": "g" | "ml",
      "productIdentity": "…", "preparationIdentity": "…", "weighingState": "raw|cooked|not_applicable",
      "kcal": "…", "protein": "…", "carbs": "…", "fat": "…", "fiber": "…|null",
      "serving": { "servingId": "<F16 unit_key for this food version>", "labels": { "ar": "…", "en": "…" }, "basisQuantity": "…" }
    }
  }
}
```

- One entry per distinct `(food version, unit kind, unit identity)` referenced by items and alternatives. The `basis:` and `serving:` key namespaces cannot collide, even when an F16 catalog `unit_key` is `g` or `ml` and matches the food basis.
- Serving identity mapping: F16 has no separate serving row id. `food_serving_units` is keyed by `(food_id, food_version, unit_key)`, so F18's `servingId` is exactly that catalog `unit_key` scoped to the entry's `foodId` and `version`; `(foodId, version, servingId)` round-trips to one existing declared F16 serving, and that is the only serving reference this snapshot may carry. It is never a fabricated token, a positional index or the basis token. The snapshot key `food:<food_id>@<version>#serving:<unit_key>` percent-encodes (RFC 3986) the `unit_key` so `:`, `#` or `%` inside a catalog key cannot change the key structure. A `basis` entry keeps the separate `#basis:<basis_unit>` namespace and never claims a serving.
- A `basis` entry stores frozen food display data and per-100 values but no catalog serving. A `serving` entry carries its exact catalog `unitKey` and wraps the exact F16 `FoodSnapshotV1` for that serving identity, including its `unit_key`, labels and `basisQuantity`; F18 never fabricates a basis token as an F16 serving id. Preserve existing F16 keys `g` and `ml` as catalog-serving references when tagged `kind: "serving"`.
- Values are serialized from the exact F16 columns at their fixed scale (kcal 1 dp, macros 2 dp, basis quantity 3 dp), with no floating-point round-trip.
- Only the database publish path writes this map. A caller-supplied map is ignored (`F18-FR-005`).

## 5. Validator/fixture obligations

- One fixture set with accept/reject pairs for every invariant above, run by the application validator and the SQL/RPC validator; both must produce the same accept/reject decision and the same field code.
- Boundary fixtures: 0.001 basis g, 9999.999 quantity, three alternatives vs four, a food with one serving vs several, `g` food with an `ml` basis request, `g` and `ml` catalog keys (including a key matching the food basis), a serving with `basis_qty = 100`, a `seven_day` fixture whose days hold different meals (each day total counts only its own day's meals, and all-training/all-rest day types filter nothing), separate independently editable Meal Notes and Food Notes, missing `implicitDayTypeId`, duplicate `dayIndex`, duplicate ids, unknown key, non-HTTPS or wrong-host recipe URL.
- Golden computed-value fixtures: finite-decimal precision/carry boundaries, values below/above 10 g for display, zero-valued foods, aggregates that differ from the sum of rounded items. Inputs are finite decimals and the algorithm divides only by 100, so a repeating-fraction output such as 1/3 is not a realizable fixture.
- The fixtures are frozen per `schemaVersion`/`algorithmVersion`; a new version adds fixtures and never edits the old expectation set.

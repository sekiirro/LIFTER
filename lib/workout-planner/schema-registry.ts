// F17 schema version registry fail-closed (T010; FR-022).
//
// Immutable parsers per schema_version; unknown (or missing/non-integer)
// versions fail with one generic code; retained versions stay renderable.
// Registration is append-only: re-registering a version throws and the
// original parser is preserved.

export type SchemaParser = (doc: unknown) => unknown;

export type SchemaParseResult =
  | { ok: true; value: unknown }
  | { ok: false; code: 'unknown_schema' };

export type SchemaRegistry = {
  register: (version: number, parser: SchemaParser) => void;
  parse: (doc: unknown) => SchemaParseResult;
};

export function createSchemaRegistry(): SchemaRegistry {
  const parsers = new Map<number, SchemaParser>();
  return {
    register(version: number, parser: SchemaParser): void {
      if (!Number.isInteger(version)) throw new Error('version must be an integer');
      if (parsers.has(version)) throw new Error(`schema version ${version} already registered`);
      parsers.set(version, parser);
    },
    parse(doc: unknown): SchemaParseResult {
      const version =
        doc !== null && typeof doc === 'object' && !Array.isArray(doc)
          ? (doc as Record<string, unknown>).schema_version
          : undefined;
      if (typeof version !== 'number' || !Number.isInteger(version)) {
        return { ok: false, code: 'unknown_schema' };
      }
      const parser = parsers.get(version);
      if (!parser) return { ok: false, code: 'unknown_schema' };
      return { ok: true, value: parser(doc) };
    },
  };
}

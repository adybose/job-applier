// Builds the smallest value that satisfies a JSON schema, for the mock's fallback replies.
type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schema[];
  oneOf?: Schema[];
  minimum?: number;
  minItems?: number;
  default?: unknown;
};

export function fakeFromSchema(schema: object): unknown {
  const s = schema as Schema;
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  const variants = s.anyOf ?? s.oneOf;
  if (variants?.length) return fakeFromSchema(variants[0] as object);

  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const key of s.required ?? []) {
        const prop = s.properties?.[key];
        if (prop) out[key] = fakeFromSchema(prop);
      }
      return out;
    }
    case 'array':
      return s.items && s.minItems ? Array.from({ length: s.minItems }, () => fakeFromSchema(s.items as object)) : [];
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return s.minimum ?? 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      return {};
  }
}

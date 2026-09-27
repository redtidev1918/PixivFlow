/**
 * Dependency-free JSON-Schema-subset validator for the vendored Workflow
 * Protocol v1 schema.
 *
 * The repo deliberately gains no JSON-Schema dependency: this covers the subset
 * the protocol actually uses (type/enum/const/required/properties/items/
 * minLength/minItems/minimum/$ref), which is enough to replay every fixture and
 * to validate a REAL produced payload against `$defs`.
 *
 * Shared by `contract.test.ts` (fixtures) and `job-facade.test.ts` (live
 * output), so both are held to the same rules. This is a test helper, not a
 * test: `jest.config.js` only collects `*.test.ts` / `*.spec.ts` /
 * `*.benchmark.ts` under `src/`.
 */
import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export const PROTOCOL_DIR = resolve(__dirname, '../../../protocol/v1');
export const SCHEMA_PATH = join(PROTOCOL_DIR, 'protocol.schema.json');
export const FIXTURE_DIR = join(PROTOCOL_DIR, 'fixtures');
export const ERROR_MAPPING_PATH = join(PROTOCOL_DIR, 'error-mapping.json');

export const ENTRY_POINTS: Record<string, string> = {
  task: 'Task',
  job: 'Job',
  event: 'Event',
  result: 'Result_CandidateSearch',
  capabilities: 'Capabilities',
  jobpage: 'JobPage',
  eventpage: 'EventPage',
  ackresult: 'AckResult',
  asset: 'Asset',
  candidate: 'Candidate',
};

/** Business/consumer vocabulary that must never appear in the protocol. */
export const BUSINESS_TERMS = [
  'refetch',
  'review',
  'slot',
  'telegram',
  'message_id',
  'disposition',
  'submission',
  'moderation',
];

export type Json = any;

export const schema: Json = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

export function resolveRef(root: Json, ref: string): Json {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
  let node: Json = root;
  for (const rawPart of ref.slice(2).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[part];
    if (node === undefined) throw new Error(`broken $ref ${ref}`);
  }
  return node;
}

export function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** Structural validation for the JSON Schema subset the protocol uses. */
export function validate(
  root: Json,
  sub: Json,
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (sub.$ref) {
    validate(root, resolveRef(root, sub.$ref), value, path, errors);
    return;
  }
  if (sub.const !== undefined && value !== sub.const) {
    errors.push(`${path}: expected const ${JSON.stringify(sub.const)}, got ${JSON.stringify(value)}`);
  }
  if (Array.isArray(sub.enum) && !sub.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(sub.enum)}`);
  }
  if (sub.type !== undefined) {
    const types: string[] = Array.isArray(sub.type) ? sub.type : [sub.type];
    const actual = typeOf(value);
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) {
      errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
      return;
    }
  }
  if (typeof value === 'string' && sub.minLength !== undefined && value.length < sub.minLength) {
    errors.push(`${path}: shorter than minLength ${sub.minLength}`);
  }
  if (typeof value === 'number' && sub.minimum !== undefined && value < sub.minimum) {
    errors.push(`${path}: ${value} < minimum ${sub.minimum}`);
  }
  if (Array.isArray(value)) {
    if (sub.minItems !== undefined && value.length < sub.minItems) {
      errors.push(`${path}: fewer than minItems ${sub.minItems}`);
    }
    if (sub.items) {
      value.forEach((item, index) => validate(root, sub.items, item, `${path}[${index}]`, errors));
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of sub.required ?? []) {
      if (!(required in (value as Record<string, unknown>))) {
        errors.push(`${path}: missing required property ${required}`);
      }
    }
    if (sub.properties) {
      for (const [key, subschema] of Object.entries(sub.properties)) {
        if (key in (value as Record<string, unknown>)) {
          validate(root, subschema, (value as Record<string, unknown>)[key], `${path}.${key}`, errors);
        }
      }
    }
    // additionalProperties is intentionally NOT enforced: additive-only protocol.
  }
}

/** Validate one document against a `$defs` entry point. */
export function validateEntry(entry: string, doc: unknown): string[] {
  const errors: string[] = [];
  validate(schema, { $ref: `#/$defs/${entry}` }, doc, entry, errors);
  return errors;
}

export function fixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function hasTerm(name: string, term: string): boolean {
  const haystack = tokens(name);
  const needle = tokens(term);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((part, offset) => haystack[i + offset] === part)) return true;
  }
  return false;
}

/** Every property/enum/definition name the schema declares (for vocabulary checks). */
export function schemaNames(): Array<[string, string]> {
  const names: Array<[string, string]> = [];
  const collect = (node: Json, where: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => collect(item, where));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && value && typeof value === 'object') {
        for (const [prop, sub] of Object.entries(value as Json)) {
          names.push([`${where}.properties.${prop}`, prop]);
          collect(sub, `${where}.${prop}`);
        }
      } else if (key === 'enum' && Array.isArray(value)) {
        value
          .filter((item) => typeof item === 'string')
          .forEach((item) => names.push([`${where}.enum`, item as string]));
      } else if ((key === '$defs' || key === 'additionalProperties') && value && typeof value === 'object') {
        for (const [name, sub] of Object.entries(value as Json)) {
          names.push([`$defs.${name}`, name]);
          collect(sub, `$defs.${name}`);
        }
      } else {
        collect(value, where);
      }
    }
  };
  collect(schema, '');
  return names;
}

/** Recursively list every KEY name in a JSON value (not the values themselves). */
export function jsonKeys(value: unknown, prefix = ''): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...jsonKeys(item, `${prefix}[${index}]`)));
    return found;
  }
  if (value === null || typeof value !== 'object') return found;
  for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
    found.push([`${prefix}.${key}`, key]);
    found.push(...jsonKeys(sub, `${prefix}.${key}`));
  }
  return found;
}

/**
 * Workflow Protocol v1 contract tests (consumer side: PixivFlow).
 *
 * The machine-checkable half of the PixivFlow <-> TelePost protocol is vendored under
 * `protocol/v1/` (schema + fixtures + SOURCES.sha256) by
 * `pixivflow-telepost-deploy/scripts/sync-protocol.sh`. The normative prose lives in
 * `pixivflow-telepost-deploy/docs/architecture/workflow-protocol.md`.
 *
 * This repo deliberately gains no JSON-Schema dependency: the subset of JSON Schema
 * 2020-12 the protocol actually uses is validated below (type/enum/const/required/
 * properties/items/minLength/minItems/minimum/$ref), which is enough to replay every
 * fixture and to keep the schema honest about additive-only evolution.
 */
import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const PROTOCOL_DIR = resolve(__dirname, '../../../protocol/v1');
const SCHEMA_PATH = join(PROTOCOL_DIR, 'protocol.schema.json');
const FIXTURE_DIR = join(PROTOCOL_DIR, 'fixtures');

const ENTRY_POINTS: Record<string, string> = {
  task: 'Task',
  job: 'Job',
  event: 'Event',
  result: 'Result_CandidateSearch',
  capabilities: 'Capabilities',
  asset: 'Asset',
  candidate: 'Candidate',
};

const BUSINESS_TERMS = [
  'refetch',
  'review',
  'slot',
  'telegram',
  'message_id',
  'disposition',
  'submission',
  'moderation',
];

type Json = any;

const schema: Json = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

function resolveRef(root: Json, ref: string): Json {
  expect(ref.startsWith('#/')).toBe(true);
  let node: Json = root;
  for (const rawPart of ref.slice(2).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[part];
    if (node === undefined) throw new Error(`broken $ref ${ref}`);
  }
  return node;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** Structural validation for the JSON Schema subset the protocol uses. */
function validate(root: Json, sub: Json, value: unknown, path: string, errors: string[]): void {
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

function validateEntry(entry: string, doc: unknown): string[] {
  const errors: string[] = [];
  validate(schema, { $ref: `#/$defs/${entry}` }, doc, entry, errors);
  return errors;
}

function fixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasTerm(name: string, term: string): boolean {
  const haystack = tokens(name);
  const needle = tokens(term);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((part, offset) => haystack[i + offset] === part)) return true;
  }
  return false;
}

describe('workflow protocol v1 (PixivFlow consumer side)', () => {
  it('vendors the protocol assets', () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true);
    expect(existsSync(join(PROTOCOL_DIR, 'SOURCES.sha256'))).toBe(true);
    expect(fixtures().length).toBeGreaterThanOrEqual(5);
    expect(schema.$defs && Object.keys(schema.$defs).length).toBeGreaterThan(5);
  });

  it('resolves every internal $ref', () => {
    const refs = new Set<string>();
    const walk = (node: Json): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === 'object') {
        if (typeof node.$ref === 'string') refs.add(node.$ref);
        Object.values(node).forEach(walk);
      }
    };
    walk(schema);
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(() => resolveRef(schema, ref)).not.toThrow();
    }
  });

  it.each(fixtures())('validates fixture %s against its entry point', (name) => {
    const entry = ENTRY_POINTS[name.split('.')[0]];
    expect(entry).toBeDefined();
    const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
    expect(validateEntry(entry, doc)).toEqual([]);
  });

  it('keeps the vendored copy identical to the recorded hashes', () => {
    const manifest = readFileSync(join(PROTOCOL_DIR, 'SOURCES.sha256'), 'utf8');
    const lines = manifest.split('\n').filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(5);
    const mismatches: string[] = [];
    for (const line of lines) {
      const [digest, rel] = line.trim().split(/\s+/);
      const file = join(PROTOCOL_DIR, rel);
      if (!existsSync(file)) {
        mismatches.push(`${rel}: missing`);
        continue;
      }
      const actual = sha256(file);
      if (actual !== digest) mismatches.push(`${rel}: ${actual} != recorded ${digest}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('tolerates unknown fields (additive-only evolution)', () => {
    const base = JSON.parse(readFileSync(join(FIXTURE_DIR, 'job.succeeded.candidate_search.json'), 'utf8'));
    const extended = { ...base, field_from_a_future_minor_version: { nested: [1, 2, 3] } };
    expect(validateEntry('Job', extended)).toEqual([]);
  });

  it('keeps the schema free of either side business concepts', () => {
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
          value.filter((item) => typeof item === 'string').forEach((item) => names.push([`${where}.enum`, item as string]));
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
    const offenders = names
      .flatMap(([where, name]) =>
        BUSINESS_TERMS.filter((term) => hasTerm(name, term)).map((term) => `${where} = ${name} (term ${term})`),
      );
    expect(offenders).toEqual([]);
  });
});

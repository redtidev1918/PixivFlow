/**
 * Workflow Protocol v1 contract tests (producer side: PixivFlow).
 *
 * The machine-checkable half of the PixivFlow <-> TelePost protocol is vendored under
 * `protocol/v1/` (schema + fixtures + SOURCES.sha256) by
 * `pixivflow-telepost-deploy/scripts/sync-protocol.sh`. The normative prose lives in
 * `pixivflow-telepost-deploy/docs/architecture/workflow-protocol.md`.
 *
 * The schema validator is shared with `job-facade.test.ts` (which validates the LIVE
 * producer output, not a fixture) so both are held to exactly the same rules; see
 * `./schema-validator`.
 */
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import {
  BUSINESS_TERMS,
  ENTRY_POINTS,
  ERROR_MAPPING_PATH,
  FIXTURE_DIR,
  Json,
  PROTOCOL_DIR,
  SCHEMA_PATH,
  fixtures,
  hasTerm,
  resolveRef,
  schema,
  schemaNames,
  sha256,
  validateEntry,
} from './schema-validator';

describe('workflow protocol v1 (producer side: PixivFlow)', () => {
  it('vendors the protocol assets', () => {
    expect(existsSync(SCHEMA_PATH)).toBe(true);
    expect(existsSync(join(PROTOCOL_DIR, 'SOURCES.sha256'))).toBe(true);
    expect(existsSync(join(PROTOCOL_DIR, 'error-mapping.json'))).toBe(true);
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

  it('keeps the error vocabulary closed and maps every internal reason code', () => {
    const mapping = JSON.parse(readFileSync(ERROR_MAPPING_PATH, 'utf8'));
    const enumValues: string[] = schema.$defs.Error.properties.code.enum;
    // The tables may carry $comment documentation alongside the codes.
    const producerInternal: Record<string, string> = Object.fromEntries(
      Object.entries(mapping.producer_internal as Record<string, string>).filter(([code]) => !code.startsWith('$')),
    );
    const protocolCodes = Object.keys(mapping.protocol_codes);

    expect(protocolCodes.sort()).toEqual([...enumValues].sort());
    for (const [code, spec] of Object.entries(mapping.protocol_codes as Record<string, Json>)) {
      expect(typeof (spec as { retryable?: unknown }).retryable).toBe('boolean');
      expect(code.length).toBeGreaterThan(0);
    }
    for (const target of Object.values(producerInternal)) {
      expect(enumValues).toContain(target);
    }

    // The producer owns both vocabularies here: a new TerminalReasonCode without a
    // protocol mapping would leak the private vocabulary to the consumer.
    const source = readFileSync(resolve(__dirname, '../../scheduler/TargetOutcome.ts'), 'utf8');
    const union = /export type TerminalReasonCode\s*=\s*([\s\S]*?);/.exec(source);
    expect(union).not.toBeNull();
    const internal = [...(union as RegExpExecArray)[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.filter((code) => !(code in producerInternal))).toEqual([]);
    expect(Object.keys(producerInternal).filter((code) => !internal.includes(code))).toEqual([]);
  });

  it('tolerates unknown fields (additive-only evolution)', () => {
    const base = JSON.parse(readFileSync(join(FIXTURE_DIR, 'job.succeeded.candidate_search.json'), 'utf8'));
    const extended = { ...base, field_from_a_future_minor_version: { nested: [1, 2, 3] } };
    expect(validateEntry('Job', extended)).toEqual([]);
  });

  it('keeps the schema free of either side business concepts', () => {
    const offenders = schemaNames()
      .flatMap(([where, name]) =>
        BUSINESS_TERMS.filter((term) => hasTerm(name, term)).map((term) => `${where} = ${name} (term ${term})`),
      );
    expect(offenders).toEqual([]);
  });
});

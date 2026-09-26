import { describe, it, expect } from '@jest/globals';
import { formatCommandResult } from '../../commands/CommandResultRenderer';

describe('formatCommandResult — a returned result reaches the terminal', () => {
  it('prints the human message for an operator', () => {
    expect(formatCommandResult({ message: 'gateway primary: 1 delivered, 0 failed' })).toBe(
      'gateway primary: 1 delivered, 0 failed'
    );
  });

  it('prints the machine payload when --json is asked for', () => {
    const result = { message: 'a table nobody asked for', data: { counts: { failed: 2 } } };
    expect(formatCommandResult(result, { json: true })).toBe(
      JSON.stringify({ counts: { failed: 2 } }, null, 2)
    );
  });

  it('keeps the message when --json has no payload to print', () => {
    expect(formatCommandResult({ message: 'Nothing to retry.' }, { json: true })).toBe(
      'Nothing to retry.'
    );
  });

  it('prints nothing when there is nothing to say', () => {
    expect(formatCommandResult({})).toBeUndefined();
    expect(formatCommandResult({ data: { hidden: true } })).toBeUndefined();
  });
});

import { describe, it, expect } from '@jest/globals';
import {
  formatCommandResult,
  commandFailureReason,
  formatCommandFailure,
} from '../../commands/CommandResultRenderer';

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

describe('formatCommandFailure — a failing stage stays visible', () => {
  it('uses the reason the command returned', () => {
    expect(commandFailureReason({ message: 'Usage: reconcile --target <name>' }, 'reconcile')).toBe(
      'Usage: reconcile --target <name>'
    );
  });

  it('falls back to the error message for results that predate it', () => {
    expect(commandFailureReason({ error: new Error('db is locked') }, 'reconcile')).toBe('db is locked');
  });

  it('never answers with silence, even with nothing to go on', () => {
    expect(commandFailureReason({}, 'reconcile')).toBe('command "reconcile" failed');
    expect(formatCommandFailure({}, 'reconcile')).toContain('command "reconcile" failed');
  });

  it('renders the reason for stderr with the reason intact', () => {
    expect(formatCommandFailure({ message: 'Usage: reconcile --target <name>' }, 'reconcile')).toBe(
      '\n❌ Usage: reconcile --target <name>\n'
    );
  });
});

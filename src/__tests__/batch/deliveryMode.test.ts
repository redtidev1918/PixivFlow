import { withDeliveryMode } from '../../commands/scheduler-runtime';

/**
 * The batch runner advertises `--mode shadow`. Before this rule the flag only
 * appeared in a log line and the result JSON: a shadow run with a delivery target
 * configured would still publish. Safety must come from the code, not from the
 * config file happening to be empty.
 */
describe('withDeliveryMode', () => {
  const targets = [
    { id: 'bot1-illust', delivery: { target: 'bot1-review' } },
    { id: 'bot1-novel' },
  ];

  it('leaves targets untouched when publishing is live', () => {
    expect(withDeliveryMode(targets, 'live')).toBe(targets);
  });

  it.each(['shadow', 'dry-run'] as const)('detaches every delivery target in %s mode', (mode) => {
    const result = withDeliveryMode(targets, mode);
    expect(result.map((t) => t.delivery)).toEqual([undefined, undefined]);
    expect(result.map((t) => t.id)).toEqual(['bot1-illust', 'bot1-novel']);
  });

  it('treats an unspecified mode as live', () => {
    expect(withDeliveryMode(targets, undefined)).toBe(targets);
  });

  it('does not mutate the input', () => {
    withDeliveryMode(targets, 'shadow');
    expect(targets[0].delivery).toEqual({ target: 'bot1-review' });
  });
});

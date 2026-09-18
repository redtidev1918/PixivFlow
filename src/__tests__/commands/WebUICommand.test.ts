import { WebUICommand } from '../../commands/WebUICommand';

describe('WebUICommand', () => {
  it('exposes pixivflow web as the primary name with webui/w aliases', () => {
    const command = new WebUICommand();
    expect(command.name).toBe('web');
    expect(command.aliases).toContain('webui');
    expect(command.aliases).toContain('w');
  });
});

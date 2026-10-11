import { WebUICommand } from '../../commands/WebUICommand';

describe('WebUICommand', () => {
  it('exposes pixivflow web as the primary name with webui/w aliases', () => {
    const command = new WebUICommand();
    expect(command.name).toBe('web');
    expect(command.aliases).toContain('webui');
    expect(command.aliases).toContain('w');
  });

  it('documents the configuration file it serves', () => {
    const command = new WebUICommand();
    const usage = command.getUsage();
    expect(usage).toMatch(/--config <path>/);
    expect(usage).toMatch(/PIXIV_DOWNLOADER_CONFIG/);
    expect(usage).toMatch(/--config\s+>\s+PIXIV_DOWNLOADER_CONFIG/);
  });
});

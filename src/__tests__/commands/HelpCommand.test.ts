/**
 * Tests for HelpCommand
 */

import { HelpCommand } from '../../commands/HelpCommand';
import { CommandContext, CommandArgs } from '../../commands/types';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';

const createMockContext = (): CommandContext => ({
  config: {} as StandaloneConfig,
  logger,
  configPath: '/test/config.json',
});

const createMockArgs = (): CommandArgs => ({
  options: {},
  positional: [],
});

describe('HelpCommand', () => {
  let command: HelpCommand;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    command = new HelpCommand();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(command.name).toBe('help');
    });

    it('should have correct description', () => {
      expect(command.description).toBe('Show help message');
    });

    it('should have correct aliases', () => {
      expect(command.aliases).toEqual(['-h', '--help']);
    });
  });

  describe('execute', () => {
    it('should display help message and return success', async () => {
      const context = createMockContext();
      const args = createMockArgs();

      const result = await command.execute(context, args);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Help message displayed');
      expect(consoleLogSpy).toHaveBeenCalled();
      
      const helpText = consoleLogSpy.mock.calls[0][0];
      expect(helpText).toContain('PixivFlow');
      expect(helpText).toContain('Commands:');
      expect(helpText).toContain('Options:');
      expect(helpText).toContain('Examples:');
    });

    it('should display help message with all commands', async () => {
      const context = createMockContext();
      const args = createMockArgs();

      await command.execute(context, args);

      const helpText = consoleLogSpy.mock.calls[0][0];
      expect(helpText).toContain('login');
      expect(helpText).toContain('download');
      expect(helpText).toContain('random');
      expect(helpText).toContain('scheduler');
      expect(helpText).toContain('normalize');
    });
  });

  describe('matches', () => {
    it('should match by name', () => {
      expect(command.matches('help')).toBe(true);
    });

    it('should match by alias', () => {
      expect(command.matches('-h')).toBe(true);
      expect(command.matches('--help')).toBe(true);
    });

    it('should not match other names', () => {
      expect(command.matches('login')).toBe(false);
      expect(command.matches('download')).toBe(false);
    });
  });
});















































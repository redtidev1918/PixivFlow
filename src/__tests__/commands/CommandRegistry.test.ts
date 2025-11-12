/**
 * Tests for CommandRegistry
 */

import { CommandRegistry } from '../../commands/CommandRegistry';
import { Command, BaseCommand } from '../../commands/Command';
import { CommandArgs, CommandContext, CommandResult } from '../../commands/types';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';

// Mock command for testing
class TestCommand extends BaseCommand {
  readonly name = 'test';
  readonly description = 'Test command';
  readonly aliases = ['t', 'test-alias'];

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    return this.success('Test executed', { args, context });
  }
}

class AnotherCommand extends BaseCommand {
  readonly name = 'another';
  readonly description = 'Another test command';

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    return this.success('Another executed');
  }
}

class ValidatingCommand extends BaseCommand {
  readonly name = 'validate';
  readonly description = 'Command with validation';

  validate(args: CommandArgs) {
    if (!args.positional.length) {
      return { valid: false, errors: ['Missing required argument'] };
    }
    return { valid: true, errors: [] };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    return this.success('Validated and executed');
  }
}

class ThrowingCommand extends BaseCommand {
  readonly name = 'throw';
  readonly description = 'Command that throws';

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    throw new Error('Command execution failed');
  }
}

const createMockContext = (): CommandContext => ({
  config: {} as StandaloneConfig,
  logger,
  configPath: '/test/config.json',
});

const createMockArgs = (): CommandArgs => ({
  options: {},
  positional: [],
});

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('register', () => {
    it('should register a command by name', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.has('test')).toBe(true);
      expect(registry.get('test')).toBe(command);
    });

    it('should register a command by aliases', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.has('t')).toBe(true);
      expect(registry.has('test-alias')).toBe(true);
      expect(registry.get('t')).toBe(command);
      expect(registry.get('test-alias')).toBe(command);
    });

    it('should throw error when alias conflicts', () => {
      const command1 = new TestCommand();
      const command2 = new AnotherCommand();
      
      registry.register(command1);
      
      // Try to register another command with conflicting alias
      const conflictingCommand = {
        ...command2,
        aliases: ['test'], // Conflicts with command1's name
      } as Command;

      expect(() => registry.register(conflictingCommand)).toThrow(
        'Alias "test" is already registered'
      );
    });
  });

  describe('registerAll', () => {
    it('should register multiple commands', () => {
      const command1 = new TestCommand();
      const command2 = new AnotherCommand();

      registry.registerAll([command1, command2]);

      expect(registry.has('test')).toBe(true);
      expect(registry.has('another')).toBe(true);
      expect(registry.size()).toBe(2);
    });
  });

  describe('get', () => {
    it('should return command by name', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.get('test')).toBe(command);
    });

    it('should return command by alias', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.get('t')).toBe(command);
    });

    it('should return undefined for non-existent command', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('find', () => {
    it('should find command by name', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.find('test')).toBe(command);
    });

    it('should find command by alias', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.find('t')).toBe(command);
    });
  });

  describe('getAll', () => {
    it('should return all unique commands', () => {
      const command1 = new TestCommand();
      const command2 = new AnotherCommand();

      registry.register(command1);
      registry.register(command2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(command1);
      expect(all).toContain(command2);
    });

    it('should not return duplicates when accessed by aliases', () => {
      const command = new TestCommand();
      registry.register(command);

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toBe(command);
    });
  });

  describe('has', () => {
    it('should return true for registered command', () => {
      const command = new TestCommand();
      registry.register(command);

      expect(registry.has('test')).toBe(true);
      expect(registry.has('t')).toBe(true);
    });

    it('should return false for non-registered command', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute a registered command', async () => {
      const command = new TestCommand();
      registry.register(command);

      const context = createMockContext();
      const args = createMockArgs();

      const result = await registry.execute('test', context, args);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Test executed');
    });

    it('should execute command by alias', async () => {
      const command = new TestCommand();
      registry.register(command);

      const context = createMockContext();
      const args = createMockArgs();

      const result = await registry.execute('t', context, args);

      expect(result.success).toBe(true);
    });

    it('should return error for non-existent command', async () => {
      const context = createMockContext();
      const args = createMockArgs();

      const result = await registry.execute('nonexistent', context, args);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('not found');
    });

    it('should validate arguments before execution', async () => {
      const command = new ValidatingCommand();
      registry.register(command);

      const context = createMockContext();
      const args = createMockArgs(); // Empty positional args

      const result = await registry.execute('validate', context, args);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Invalid arguments');
    });

    it('should execute command after successful validation', async () => {
      const command = new ValidatingCommand();
      registry.register(command);

      const context = createMockContext();
      const args: CommandArgs = {
        options: {},
        positional: ['arg1'], // Has required argument
      };

      const result = await registry.execute('validate', context, args);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Validated and executed');
    });

    it('should handle command execution errors', async () => {
      const command = new ThrowingCommand();
      registry.register(command);

      const context = createMockContext();
      const args = createMockArgs();

      const result = await registry.execute('throw', context, args);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Command execution failed');
    });
  });

  describe('size', () => {
    it('should return correct number of unique commands', () => {
      expect(registry.size()).toBe(0);

      registry.register(new TestCommand());
      expect(registry.size()).toBe(1);

      registry.register(new AnotherCommand());
      expect(registry.size()).toBe(2);
    });

    it('should not count aliases separately', () => {
      registry.register(new TestCommand());
      expect(registry.size()).toBe(1); // Only counts unique commands
    });
  });

  describe('clear', () => {
    it('should clear all registered commands', () => {
      registry.register(new TestCommand());
      registry.register(new AnotherCommand());

      expect(registry.size()).toBe(2);

      registry.clear();

      expect(registry.size()).toBe(0);
      expect(registry.has('test')).toBe(false);
      expect(registry.has('another')).toBe(false);
    });
  });
});




























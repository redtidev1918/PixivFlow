/**
 * Tests for RefreshCommand
 */

import { RefreshCommand } from '../../commands/RefreshCommand';
import { CommandContext, CommandArgs } from '../../commands/types';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';
import { TerminalLogin, LoginInfo } from '../../terminal-login';

// Mock TerminalLogin
jest.mock('../../terminal-login', () => ({
  TerminalLogin: {
    refresh: jest.fn(),
  },
  LoginInfo: {},
}));

const createMockContext = (): CommandContext => ({
  config: {} as StandaloneConfig,
  logger,
  configPath: '/test/config.json',
});

describe('RefreshCommand', () => {
  let command: RefreshCommand;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    command = new RefreshCommand();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(command.name).toBe('refresh');
    });

    it('should have correct description', () => {
      expect(command.description).toBe('Refresh access token using refresh token');
    });

    it('should have correct aliases', () => {
      expect(command.aliases).toEqual(['r']);
    });
  });

  describe('validate', () => {
    it('should validate when refresh token is provided in positional args', () => {
      const args: CommandArgs = {
        options: {},
        positional: ['refresh_token_123'],
      };

      const result = command.validate!(args);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate when refresh token is provided in options', () => {
      const args: CommandArgs = {
        options: { token: 'refresh_token_123' },
        positional: [],
      };

      const result = command.validate!(args);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when refresh token is missing', () => {
      const args: CommandArgs = {
        options: {},
        positional: [],
      };

      const result = command.validate!(args);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Refresh token is required');
    });
  });

  describe('execute', () => {
    it('should successfully refresh token with positional argument', async () => {
      const mockLoginInfo: LoginInfo = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'all',
        user: {
          profile_image_urls: {
            px_16x16: '',
            px_50x50: '',
            px_170x170: '',
          },
          id: '12345',
          name: 'Test User',
          account: 'testuser',
          mail_address: 'test@example.com',
          is_premium: false,
          x_restrict: 0,
          is_mail_authorized: true,
          require_policy_agreement: false,
        },
      };

      (TerminalLogin.refresh as jest.Mock).mockResolvedValue(mockLoginInfo);

      const context = createMockContext();
      const args: CommandArgs = {
        options: {},
        positional: ['refresh_token_123'],
      };

      const result = await command.execute(context, args);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Token refresh successful');
      expect(TerminalLogin.refresh).toHaveBeenCalledWith('refresh_token_123');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should successfully refresh token with token option', async () => {
      const mockLoginInfo: LoginInfo = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'all',
        user: {
          profile_image_urls: {
            px_16x16: '',
            px_50x50: '',
            px_170x170: '',
          },
          id: '12345',
          name: 'Test User',
          account: 'testuser',
          mail_address: 'test@example.com',
          is_premium: false,
          x_restrict: 0,
          is_mail_authorized: true,
          require_policy_agreement: false,
        },
      };

      (TerminalLogin.refresh as jest.Mock).mockResolvedValue(mockLoginInfo);

      const context = createMockContext();
      const args: CommandArgs = {
        options: { token: 'refresh_token_123' },
        positional: [],
      };

      const result = await command.execute(context, args);

      expect(result.success).toBe(true);
      expect(TerminalLogin.refresh).toHaveBeenCalledWith('refresh_token_123');
    });

    it('should output JSON when json option is set', async () => {
      const mockLoginInfo: LoginInfo = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'all',
        user: {
          profile_image_urls: {
            px_16x16: '',
            px_50x50: '',
            px_170x170: '',
          },
          id: '12345',
          name: 'Test User',
          account: 'testuser',
          mail_address: 'test@example.com',
          is_premium: false,
          x_restrict: 0,
          is_mail_authorized: true,
          require_policy_agreement: false,
        },
      };

      (TerminalLogin.refresh as jest.Mock).mockResolvedValue(mockLoginInfo);

      const context = createMockContext();
      const args: CommandArgs = {
        options: { json: true },
        positional: ['refresh_token_123'],
      };

      await command.execute(context, args);

      const logCalls = consoleLogSpy.mock.calls;
      expect(logCalls.length).toBeGreaterThan(0);
      // Check if JSON was logged
      const jsonCall = logCalls.find((call) => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
    });

    it('should handle refresh failure', async () => {
      const error = new Error('Invalid refresh token');
      (TerminalLogin.refresh as jest.Mock).mockRejectedValue(error);

      const context = createMockContext();
      const args: CommandArgs = {
        options: {},
        positional: ['invalid_token'],
      };

      const result = await command.execute(context, args);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Invalid refresh token');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return failure when validation fails', async () => {
      const context = createMockContext();
      const args: CommandArgs = {
        options: {},
        positional: [],
      };

      const result = await command.execute(context, args);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Refresh token is required');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(TerminalLogin.refresh).not.toHaveBeenCalled();
    });

    it('should log error to logger on failure', async () => {
      const error = new Error('Network error');
      (TerminalLogin.refresh as jest.Mock).mockRejectedValue(error);

      const context = createMockContext();
      const loggerErrorSpy = jest.spyOn(context.logger, 'error');
      const args: CommandArgs = {
        options: {},
        positional: ['refresh_token_123'],
      };

      await command.execute(context, args);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Token refresh failed',
        expect.objectContaining({
          error: 'Network error',
        })
      );
    });
  });

  describe('getUsage', () => {
    it('should return usage information', () => {
      const usage = command.getUsage!();
      expect(usage).toContain('refresh');
      expect(usage).toContain('refresh_token');
      expect(usage).toContain('--json');
    });
  });

  describe('matches', () => {
    it('should match by name', () => {
      expect(command.matches('refresh')).toBe(true);
    });

    it('should match by alias', () => {
      expect(command.matches('r')).toBe(true);
    });

    it('should not match other names', () => {
      expect(command.matches('login')).toBe(false);
      expect(command.matches('download')).toBe(false);
    });
  });
});


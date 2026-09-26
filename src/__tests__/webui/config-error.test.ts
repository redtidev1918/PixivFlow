import { ConfigValidationError } from '../../config';
import { ConfigError } from '../../utils/errors';
import { ErrorCode } from '../../webui/utils/error-codes';
import {
  buildConfigAwareErrorBody,
  classifyConfigValidationLine,
  configErrorLines,
  stripCliGuidance,
} from '../../webui/utils/config-error';

const REFRESH_TOKEN_LINE =
  'pixiv.refreshToken: No valid refresh token found. Please login to authenticate.';

const CLI_GUIDANCE = [
  'Configuration validation failed in /tmp/config.json:',
  REFRESH_TOKEN_LINE,
  '',
  '💡 You need to login first. Run one of the following commands:',
  '  • pixivflow login',
  '  • pixivflow login-headless',
].join('\n');

function configErrorWith(lines: string[]): ConfigError {
  return new ConfigError('Configuration validation failed', new ConfigValidationError('invalid', lines));
}

describe('config-error helpers', () => {
  it('strips the terminal-only login guidance from a message', () => {
    const stripped = stripCliGuidance(CLI_GUIDANCE);
    expect(stripped).not.toContain('💡');
    expect(stripped).not.toContain('pixivflow login');
    expect(stripped).toBe(
      ['Configuration validation failed in /tmp/config.json:', REFRESH_TOKEN_LINE].join('\n')
    );
  });

  it('leaves a message without guidance untouched', () => {
    expect(stripCliGuidance(REFRESH_TOKEN_LINE)).toBe(REFRESH_TOKEN_LINE);
  });

  it.each([
    [REFRESH_TOKEN_LINE, ErrorCode.CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED],
    ['pixiv.clientId: Required field is missing or empty', ErrorCode.CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED],
    ['pixiv: Required section is missing', ErrorCode.CONFIG_VALIDATION_PIXIV_REQUIRED],
    ['storage: Required section is missing', ErrorCode.CONFIG_VALIDATION_STORAGE_REQUIRED],
    ['download.downloadDirectory: Required field is missing', ErrorCode.CONFIG_VALIDATION_DOWNLOAD_DIRECTORY_REQUIRED],
    ['schedule.cron: Invalid cron expression', ErrorCode.CONFIG_VALIDATION_CRON_INVALID],
    ['targets: Required section is missing', ErrorCode.CONFIG_VALIDATION_TARGETS_REQUIRED],
    ['something else entirely', ErrorCode.CONFIG_INVALID],
  ])('classifies %s', (line, expected) => {
    expect(classifyConfigValidationLine(line)).toBe(expected);
  });

  it('reads validation lines from a ConfigError cause and from a bare ConfigValidationError', () => {
    expect(configErrorLines(configErrorWith([REFRESH_TOKEN_LINE]))).toEqual([REFRESH_TOKEN_LINE]);
    expect(configErrorLines(new ConfigValidationError('invalid', ['a', 'b']))).toEqual(['a', 'b']);
    expect(configErrorLines(new Error('connection refused'))).toBeNull();
    expect(configErrorLines(undefined)).toBeNull();
  });

  it('keeps the legacy body for non-configuration failures', () => {
    const body = buildConfigAwareErrorBody(new Error('database is locked'), ErrorCode.SCHEDULER_LIST_FAILED);
    expect(body).toEqual({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED });
    expect(body.message).toBeUndefined();
    expect(body.details).toBeUndefined();
  });

  it('builds a localisable body for a configuration failure', () => {
    const body = buildConfigAwareErrorBody(
      configErrorWith([
        REFRESH_TOKEN_LINE,
        'storage: Required section is missing',
        'pixiv.clientId: Required field is missing or empty',
      ]),
      ErrorCode.SCHEDULER_LIST_FAILED
    );

    expect(body.errorCode).toBe(ErrorCode.CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED);
    expect(body.message).toBe(REFRESH_TOKEN_LINE);
    expect(body.message).not.toContain('💡');
    expect(body.details).toEqual([
      REFRESH_TOKEN_LINE,
      'storage: Required section is missing',
      'pixiv.clientId: Required field is missing or empty',
    ]);
    expect(body.details).not.toContain(ErrorCode.SCHEDULER_LIST_FAILED);
  });

  it('never forwards the terminal guidance block to a client', () => {
    const body = buildConfigAwareErrorBody(configErrorWith([CLI_GUIDANCE]), ErrorCode.LOGS_GET_FAILED);
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('💡');
    expect(serialised).not.toContain('pixivflow login-headless');
    expect(body.errorCode).toBe(ErrorCode.CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED);
  });

  it('bounds the number of forwarded details', () => {
    const many = Array.from({ length: 20 }, (_, index) => `targets[${index}].id: Duplicate target id`);
    const body = buildConfigAwareErrorBody(configErrorWith(many), ErrorCode.SCHEDULER_LIST_FAILED);
    expect(body.details).toHaveLength(8);
  });
});

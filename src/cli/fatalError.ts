import { logger } from '../logger';
import { AuthenticationError, ConfigError } from '../utils/errors';

/**
 * Handles fatal errors, prints user-friendly messages, and exits the process.
 *
 * Failure Contract (Deploy `AGENTS.md` §25): a startup failure must be both
 * human-readable *and* machine-readable. The human text is printed here; the
 * structured log carries `stage` and the **error object** — never
 * `error.message` alone, because that drops the contract fields a
 * `PixivFlowError` subclass owns (`code`, `statusCode`, `cause`), which is the
 * same class of defect as a log line rendered as `"error":{}`.
 */
export function handleFatalError(
  error: unknown,
  exit: (code: number) => void = (code: number) => process.exit(code)
): void {
  if (error instanceof ConfigError) {
    console.error(`\n❌ Configuration Error: ${error.message}\n`);
    logger.error('Configuration error', { stage: 'application.startup', error });
  } else if (error instanceof AuthenticationError) {
    console.error('\n❌ Authentication Error');
    console.error('════════════════════════════════════════════════════════════════');
    console.error(error.message);
    console.error('');
    console.error('💡 Your refresh token may have expired or is invalid.');
    console.error('   Please login again to get a new refresh token:');
    console.error('');
    console.error('   • Interactive login:  pixivflow login');
    console.error('   • Headless login:     pixivflow login-headless');
    console.error('════════════════════════════════════════════════════════════════\n');
    logger.error('Authentication failed', { stage: 'application.startup', error });
  } else {
    logger.error('Fatal error during application startup', {
      stage: 'application.startup',
      error: error instanceof Error ? error : String(error),
    });
    // Even an unrecognised failure must say something on the console; the log
    // line alone is invisible to the operator who ran the command.
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}\n`);
  }
  exit(1);
}

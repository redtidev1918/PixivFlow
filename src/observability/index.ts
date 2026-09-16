import { IDatabase } from '../interfaces/IDatabase';
import { logger } from '../logger';
import { classifySystemError } from './classify';
import { SystemErrorClassification, SystemErrorInput } from './types';

export { classifySystemError } from './classify';
export * from './types';

/** Record a structured system error with taxonomy; never throws. */
export function recordSystemError(
  database: Pick<IDatabase, 'systemErrors'>,
  input: SystemErrorInput,
  classified: SystemErrorClassification | null = null
): void {
  try {
    const cls = classified ?? classifySystemError(new Error(input.message), input.http_status ?? null, input.stage);
    database.systemErrors.record({ ...input, ...cls });
    logger.error(`system_error recorded`, { error_type: cls.error_type, retryable: cls.retryable, ...input });
  } catch (error) {
    // Observability must never break the business path.
    console.error('Failed to persist system error', error);
  }
}

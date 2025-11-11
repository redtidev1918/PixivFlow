import { Request, Response } from 'express';
import { getConfigPath } from '../../../../config';
import { clearConfigToken } from '../../../../utils/login-helper';
import { logger } from '../../../../logger';
import { ErrorCode } from '../../../utils/error-codes';

/**
 * POST /api/auth/logout
 * Logout (clear token)
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const configPath = getConfigPath();
    
    // Clear the refresh token from config file
    await clearConfigToken(configPath);
    
    logger.info('User logged out successfully');
    res.json({ success: true, errorCode: ErrorCode.AUTH_LOGOUT_SUCCESS });
  } catch (error) {
    logger.error('Logout failed', { error });
    res.status(500).json({ 
      errorCode: ErrorCode.AUTH_LOGOUT_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}














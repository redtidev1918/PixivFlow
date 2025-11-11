import { Router } from 'express';
import * as basicHandlers from './handlers/config-basic-handlers';
import * as backupHandlers from './handlers/config-backup-handlers';
import * as diagnosticHandlers from './handlers/config-diagnostic-handlers';
import * as configHistoryHandlers from './handlers/config-history-handlers';
import * as configFilesHandlers from './handlers/config-files-handlers';

const router = Router();

// Basic config operations
router.get('/', basicHandlers.getConfig);
router.put('/', basicHandlers.updateConfig);
router.post('/validate', basicHandlers.validateConfigHandler);

// Config backup and restore
router.get('/backup', backupHandlers.backupConfig);
router.post('/restore', backupHandlers.restoreConfig);

// Config diagnostic and repair
router.get('/diagnose', diagnosticHandlers.diagnoseConfig);
router.post('/repair', diagnosticHandlers.repairConfig);

// Config history operations
router.get('/history', configHistoryHandlers.getConfigHistory);
router.post('/history', configHistoryHandlers.saveConfigHistory);
router.get('/history/:id', configHistoryHandlers.getConfigHistoryById);
router.delete('/history/:id', configHistoryHandlers.deleteConfigHistory);
router.post('/history/:id/apply', configHistoryHandlers.applyConfigHistory);

// Config files operations
router.get('/files', configFilesHandlers.listConfigFiles);
router.post('/files/switch', configFilesHandlers.switchConfigFile);
router.post('/files/import', configFilesHandlers.importConfigFile);
router.delete('/files/:filename', configFilesHandlers.deleteConfigFile);
router.get('/files/:filename/content', configFilesHandlers.getConfigFileContent);
router.put('/files/:filename/content', configFilesHandlers.updateConfigFileContent);

export default router;

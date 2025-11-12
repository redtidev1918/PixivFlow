/**
 * Project root detection utility
 * Automatically finds the project root directory or falls back to user home directory
 */

import { existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';

/**
 * Get the directory where the main script is located
 * This helps find the project root even when running from different directories
 */
function getMainScriptDir(): string {
  // Try multiple methods to get the main script directory
  // Method 1: require.main?.filename (CommonJS)
  if (require.main?.filename) {
    return dirname(require.main.filename);
  }
  
  // Method 2: process.argv[1] (the script being executed)
  if (process.argv[1]) {
    return dirname(process.argv[1]);
  }
  
  // Fallback to current working directory
  return process.cwd();
}

/**
 * Find project root directory by looking for package.json
 * Priority:
 * 1. Current working directory (if it contains package.json and config directory)
 * 2. Main script location and parent directories (up to 10 levels)
 * 3. If in node_modules (global install), try to find source repo
 * 
 * @param startDir - Starting directory to search from (optional)
 * @returns Project root directory path, or undefined if not found
 */
/**
 * Check if a directory is a development directory (source code repository for development)
 * 
 * Development directories are typically:
 * 1. Located in common development locations (Documents, Desktop, projects, etc.)
 * 2. Have .git directory AND are in development locations
 * 
 * Deployment directories (like ~/pixivflow) are NOT development directories,
 * even if they have .git, because they are used for production deployment.
 * 
 * @param dir - Directory path to check
 * @returns true if this is a development directory, false otherwise
 */
function isDevelopmentDirectory(dir: string): boolean {
  const dirLower = dir.toLowerCase();
  const normalizedDir = dir.replace(/\\/g, '/');
  
  // Check for common development directory patterns in the path
  // These indicate the directory is likely used for development, not deployment
  const developmentLocationIndicators = [
    '/documents/',
    '/desktop/',
    '/downloads/',
    '/projects/',
    '/workspace/',
    '/workspaces/',
    '/dev/',
    '/development/',
    '/code/',
    '/coding/',
    '/repos/',
    '/repositories/',
    '/github/',
    '/gitlab/',
    '/bitbucket/',
  ];
  
  // Check if directory is in a development location
  let isInDevelopmentLocation = false;
  for (const indicator of developmentLocationIndicators) {
    if (normalizedDir.includes(indicator)) {
      isInDevelopmentLocation = true;
      break;
    }
  }
  
  // Check for development-specific directory names
  const developmentDirNames = [
    'pixivbatchdownloader-master',
    'pixivbatchdownloader',
    'pixivflow-master',
  ];
  
  let hasDevelopmentDirName = false;
  for (const name of developmentDirNames) {
    if (dirLower.includes(name)) {
      hasDevelopmentDirName = true;
      break;
    }
  }
  
  // A directory is a development directory if:
  // 1. It's in a development location AND has .git (source code repo in dev location)
  // 2. OR it has a development-specific directory name (like "PixivBatchDownloader-master")
  const gitDirPath = join(dir, '.git');
  const hasGit = existsSync(gitDirPath);
  
  if (hasDevelopmentDirName) {
    return true; // Definitely a development directory
  }
  
  if (isInDevelopmentLocation && hasGit) {
    return true; // Source code repo in development location
  }
  
  // If it's in ~/pixivflow or similar deployment locations, it's NOT a development directory
  // even if it has .git, because users clone there for deployment
  const deploymentLocations = [
    '/pixivflow',  // ~/pixivflow
    '/.pixivflow', // ~/.pixivflow
  ];
  
  for (const location of deploymentLocations) {
    if (normalizedDir.endsWith(location) || normalizedDir.includes(location + '/')) {
      return false; // This is a deployment directory, not development
    }
  }
  
  return false;
}

/**
 * Check if a directory is the project root (deployment/production installation)
 * A project root should have:
 * 1. package.json file
 * 2. config directory (optional - will be created if missing)
 * 3. Either src/ directory or webui-frontend/ directory (to distinguish from dist/)
 * 
 * IMPORTANT: 
 * - Development directories should NOT be considered as project roots for configuration
 * - Deployment directories (like ~/pixivflow) SHOULD be considered as project roots
 */
function isProjectRoot(dir: string): boolean {
  // Skip development directories - they should not be used for production configuration
  if (isDevelopmentDirectory(dir)) {
    return false;
  }
  
  const packageJsonPath = join(dir, 'package.json');
  const configDirPath = join(dir, 'config');
  const srcDirPath = join(dir, 'src');
  const webuiFrontendPath = join(dir, 'webui-frontend');
  
  // Must have package.json
  if (!existsSync(packageJsonPath)) {
    return false;
  }
  
  // Must have either src/ or webui-frontend/ to distinguish from dist/
  // This ensures we find the actual project root, not the dist/ directory
  if (!existsSync(srcDirPath) && !existsSync(webuiFrontendPath)) {
    return false;
  }
  
  // Config directory is optional - if it doesn't exist, we'll create it
  // But if it exists, it should be a directory
  if (existsSync(configDirPath)) {
    const stats = statSync(configDirPath);
    if (!stats.isDirectory()) {
      return false;
    }
  }
  
  return true;
}

export function findProjectRoot(startDir?: string): string | undefined {
  // Priority 1: Check current working directory first
  // This allows users to run commands from the project root
  if (isProjectRoot(process.cwd())) {
    return process.cwd();
  }

  // Priority 2: Try to find from main script location or provided startDir
  const searchStart = startDir ? resolve(startDir) : getMainScriptDir();
  let currentDir = searchStart;
  
  for (let i = 0; i < 10; i++) {
    if (isProjectRoot(currentDir)) {
      return currentDir;
    }
    
    const parent = dirname(currentDir);
    if (parent === currentDir) break; // Reached filesystem root
    currentDir = parent;
  }

  // Priority 3: If in node_modules (global install), try to find source repo
  if (searchStart.includes('node_modules')) {
    const nodeModulesIndex = searchStart.indexOf('node_modules');
    if (nodeModulesIndex !== -1) {
      // Try parent directories of node_modules
      const nodeModulesPath = searchStart.substring(0, nodeModulesIndex);
      let searchDir = nodeModulesPath;
      
      for (let i = 0; i < 5; i++) {
        if (isProjectRoot(searchDir)) {
          return searchDir;
        }
        
        const parent = dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
      }
    }
  }

  return undefined;
}

/**
 * Check if running from a global npm installation
 * Global installs are typically in node_modules in the global npm prefix
 */
function isGlobalInstall(): boolean {
  try {
    const mainScriptDir = getMainScriptDir();
    // Global installs are typically in:
    // - /usr/local/lib/node_modules/pixivflow/... (Linux/Mac)
    // - C:\Users\...\AppData\Roaming\npm\node_modules\pixivflow\... (Windows)
    // - ~/.nvm/versions/node/.../lib/node_modules/pixivflow/... (nvm)
    return mainScriptDir.includes('node_modules') && 
           (mainScriptDir.includes('/lib/node_modules/') || 
            mainScriptDir.includes('\\node_modules\\'));
  } catch {
    return false;
  }
}

/**
 * Get the configuration directory path
 * 
 * Priority (for different scenarios):
 * 
 * 1. **Explicit config directory** (highest priority)
 *    - If user explicitly provides --config-dir, use it
 * 
 * 2. **Deployment directory** (cloned repo for deployment)
 *    - If current working directory is a valid project root (not development), use its config/
 *    - Example: User clones to ~/pixivflow, runs `cd ~/pixivflow && pixivflow webui`
 * 
 * 3. **Global installation** (npm install -g)
 *    - If running from global install, use ~/.pixivflow/config
 *    - Example: User runs `pixivflow webui` from anywhere after global install
 * 
 * 4. **Development directory** (source code for development)
 *    - If in development directory, use ~/.pixivflow/config (or ~/pixivflow/config if exists)
 *    - Example: Developer runs from ~/Documents/PixivBatchDownloader-master
 * 
 * 5. **Fallback**
 *    - Use ~/pixivflow/config if exists, otherwise ~/.pixivflow/config
 * 
 * @param explicitConfigDir - Explicitly provided config directory (highest priority)
 * @returns Resolved configuration directory path
 */
export function getConfigDirectory(explicitConfigDir?: string): string {
  // Priority 1: If explicitly provided, use it
  if (explicitConfigDir) {
    return resolve(explicitConfigDir);
  }

  // Priority 2: Check if current working directory is a valid project root (deployment)
  // This handles the case: git clone ~/pixivflow && cd ~/pixivflow && pixivflow webui
  if (!isDevelopmentDirectory(process.cwd())) {
    const cwdProjectRoot = isProjectRoot(process.cwd()) ? process.cwd() : undefined;
    if (cwdProjectRoot) {
      // Current directory is a valid deployment directory - use its config
      return join(cwdProjectRoot, 'config');
    }
  }

  // Priority 3: Try to find project root from script location (deployment)
  // This handles: running from deployment directory but not from its root
  const projectRoot = findProjectRoot();
  if (projectRoot && !isDevelopmentDirectory(projectRoot)) {
    // Found a valid deployment directory - use its config
    return join(projectRoot, 'config');
  }

  // Priority 4: Check if running from global install
  // Global installs should use user home directory config
  if (isGlobalInstall()) {
    // Try ~/pixivflow/config first (common production directory)
    const pixivflowConfigDir = join(homedir(), 'pixivflow', 'config');
    if (existsSync(join(homedir(), 'pixivflow'))) {
      return pixivflowConfigDir;
    }
    // Fallback to ~/.pixivflow/config
    return join(homedir(), '.pixivflow', 'config');
  }

  // Priority 5: Development directory or fallback
  // If we're in a development directory, use home directory config
  // Otherwise, use home directory config as fallback
  const pixivflowConfigDir = join(homedir(), 'pixivflow', 'config');
  if (existsSync(join(homedir(), 'pixivflow'))) {
    return pixivflowConfigDir;
  }
  // Final fallback: ~/.pixivflow/config
  return join(homedir(), '.pixivflow', 'config');
}

/**
 * Get the default configuration file path
 * Uses the same logic as getConfigDirectory to determine the base directory
 * 
 * @param explicitConfigPath - Explicitly provided config file path (highest priority)
 * @returns Resolved configuration file path
 */
export function getDefaultConfigPath(explicitConfigPath?: string): string {
  // If explicitly provided, use it
  if (explicitConfigPath) {
    return resolve(explicitConfigPath);
  }

  const configDir = getConfigDirectory();
  return join(configDir, 'standalone.config.json');
}


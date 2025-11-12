/**
 * Python Environment Detection
 * 
 * Handles finding and verifying Python executable
 */

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Find Python executable path
 * Supports both regular Node.js and Electron environments
 */
export async function findPythonExecutable(): Promise<string | null> {
  // List of possible Python executable names
  const pythonCommands = ['python3', 'python'];
  
  // In Electron, we might need to check system PATH
  // Try to find Python in common locations
  const commonPaths: string[] = [];
  
  if (process.platform === 'darwin') {
    // macOS common Python paths
    commonPaths.push(
      '/usr/local/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.*/bin/python3'
    );
  } else if (process.platform === 'win32') {
    // Windows common Python paths
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    commonPaths.push(
      path.join(localAppData, 'Programs', 'Python', 'Python3*', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python3*', 'python3.exe'),
      'C:\\Python3*\\python.exe',
      'C:\\Python3*\\python3.exe'
    );
  } else {
    // Linux common Python paths
    commonPaths.push(
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      '/opt/python3/bin/python3'
    );
  }
  
  // First, try commands from PATH
  for (const cmd of pythonCommands) {
    try {
      const result = await runCommand(cmd, ['--version']);
      if (result.success) {
        // Verify it's actually Python 3
        const version = result.stdout || '';
        if (version.includes('Python 3')) {
          return cmd;
        }
      }
    } catch {
      // Continue to next command
    }
  }
  
  // Then try common paths
  for (const pythonPath of commonPaths) {
    // Handle wildcards
    if (pythonPath.includes('*')) {
      // For wildcard paths, we'd need glob, but for now skip
      continue;
    }
    
    try {
      if (fs.existsSync(pythonPath)) {
        const result = await runCommand(pythonPath, ['--version']);
        if (result.success) {
          const version = result.stdout || '';
          if (version.includes('Python 3')) {
            return pythonPath;
          }
        }
      }
    } catch {
      // Continue to next path
    }
  }
  
  // Last resort: try to find Python using 'which' or 'where'
  try {
    let whichCmd: string;
    if (process.platform === 'win32') {
      whichCmd = 'where';
    } else {
      whichCmd = 'which';
    }
    
    for (const cmd of pythonCommands) {
      try {
        const result = execSync(`${whichCmd} ${cmd}`, { encoding: 'utf-8', stdio: 'pipe' });
        const pythonPath = result.trim().split('\n')[0];
        if (pythonPath && fs.existsSync(pythonPath)) {
          return pythonPath;
        }
      } catch {
        // Continue
      }
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

/**
 * Get Python executable path (cached)
 */
let cachedPythonPath: string | null = null;

export async function getPythonExecutable(): Promise<string> {
  if (cachedPythonPath) {
    return cachedPythonPath;
  }
  
  const pythonPath = await findPythonExecutable();
  if (!pythonPath) {
    throw new Error(
      'Python 3 not found. Please install Python 3.9 or later:\n' +
      '  - macOS: brew install python3\n' +
      '  - Windows: Download from https://www.python.org/downloads/\n' +
      '  - Linux: sudo apt-get install python3 (Ubuntu/Debian) or sudo yum install python3 (RHEL/CentOS)'
    );
  }
  
  cachedPythonPath = pythonPath;
  return pythonPath;
}

/**
 * Check if Python and pip-installed gppt module are available
 */
export async function checkPythonGpptAvailable(): Promise<boolean> {
  try {
    // Check Python
    const pythonPath = await getPythonExecutable();
    const pythonCheck = await runCommand(pythonPath, ['--version']);
    if (!pythonCheck.success) {
      return false;
    }

    // Check if gppt module can be imported (from pip installation)
    const importScript = `
try:
    from gppt import GetPixivToken
    print("OK")
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;
    const gpptCheck = await runPythonScript(importScript);
    return gpptCheck.success && gpptCheck.stdout.trim() === 'OK';
  } catch (error) {
    // If Python is not found, return false
    return false;
  }
}

/**
 * Install gppt using pip
 */
export async function installGppt(): Promise<boolean> {
  try {
    console.log('[!]: Installing gppt package via pip...');
    console.log('[i]: This may take a moment...');
    
    // Get Python executable path
    const pythonPath = await getPythonExecutable();
    
    // Try pip3 first, then pip, then python -m pip
    const pipCommands = ['pip3', 'pip'];
    let pipInstalled = false;
    
    for (const pipCmd of pipCommands) {
      const pipCheck = await runCommand(pipCmd, ['--version']);
      if (pipCheck.success) {
        const result = await runCommand(pipCmd, ['install', 'gppt']);
        if (result.success) {
          console.log('[+]: gppt installed successfully');
          pipInstalled = true;
          break;
        } else {
          console.error(`[!]: Failed to install gppt using ${pipCmd}:`, result.error);
        }
      }
    }
    
    // If pip commands failed, try python -m pip
    if (!pipInstalled) {
      try {
        const result = await runCommand(pythonPath, ['-m', 'pip', 'install', 'gppt']);
        if (result.success) {
          console.log('[+]: gppt installed successfully using python -m pip');
          pipInstalled = true;
        } else {
          console.error(`[!]: Failed to install gppt using ${pythonPath} -m pip:`, result.error);
        }
      } catch (error) {
        console.error('[!]: Failed to install gppt using python -m pip:', error);
      }
    }
    
    if (!pipInstalled) {
      console.error('[!]: Failed to install gppt. Please install manually:');
      console.error(`[!]: ${pythonPath} -m pip install gppt`);
      console.error('[!]: or');
      console.error('[!]: pip3 install gppt');
      return false;
    }
    
    // Verify installation
    const available = await checkPythonGpptAvailable();
    if (available) {
      console.log('[+]: gppt is ready to use');
      return true;
    } else {
      console.error('[!]: gppt was installed but cannot be imported');
      return false;
    }
  } catch (error) {
    console.error('[!]: Error installing gppt:', error);
    return false;
  }
}

/**
 * Run a command and return the result
 */
async function runCommand(
  command: string,
  args: string[]
): Promise<{
  success: boolean;
  stdout?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          stdout: stdout.trim(),
        });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });
  });
}

/**
 * Run a Python script and return the result
 */
async function runPythonScript(script: string, timeoutMs: number = 120000): Promise<{
  success: boolean;
  stdout: string;
  stderr?: string;
  error?: string;
}> {
  return new Promise(async (resolve) => {
    // Add import sys at the beginning if not present
    const fullScript = script.includes('import sys') ? script : `import sys\n${script}`;
    
    // Get Python executable path
    let pythonPath: string;
    try {
      pythonPath = await getPythonExecutable();
    } catch (error) {
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    
    const python = spawn(pythonPath, ['-c', fullScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    // Set timeout with improved handling for interactive mode
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const timeoutMinutes = timeoutMs / 60000;
        const isInteractive = timeoutMs >= 300000; // 5 minutes or more
        
        // For interactive mode, use gentler termination to avoid closing browser abruptly
        if (isInteractive) {
          // First, try to gracefully terminate by sending SIGTERM
          // This gives Python script a chance to clean up browser properly
          python.kill('SIGTERM');
          
          // Wait a bit for graceful shutdown before force killing
          setTimeout(() => {
            try {
              // Only force kill if process is still running
              python.kill('SIGKILL');
            } catch (e) {
              // Process already terminated, ignore
            }
          }, 2000); // Give 2 seconds for graceful shutdown
        } else {
          // For non-interactive mode, terminate immediately
          python.kill('SIGTERM');
        }
        
        let errorMsg = `Python script timed out after ${timeoutMinutes} minutes.`;
        
        if (isInteractive) {
          errorMsg += `\n\nThis is interactive mode - you may need more time to complete login in the browser.\n` +
                     `Possible causes:\n` +
                     `  1. You haven't completed login in the browser window yet\n` +
                     `  2. Browser window was closed before login completed\n` +
                     `  3. Network connectivity issues (try setting HTTPS_PROXY)\n` +
                     `  4. Chrome/ChromeDriver not properly installed\n` +
                     `\nPlease try again and make sure to:\n` +
                     `  - Keep the browser window open until login is complete\n` +
                     `  - Complete the login process in the browser\n` +
                     `  - Wait for the "Login successful" message\n` +
                     `  - If browser is still open, you may need to close it manually`;
        } else {
          errorMsg += ` This may indicate:\n` +
                     `  1. Network connectivity issues (try setting HTTPS_PROXY)\n` +
                     `  2. Chrome/ChromeDriver not properly installed\n` +
                     `  3. Pixiv login page is slow to respond\n`;
        }
        
        errorMsg += `\nCheck the stderr output above for more details.`;
        
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
          error: errorMsg,
        });
      }
    }, timeoutMs);

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      
      if (code === 0) {
        resolve({
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
        });
      } else {
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim() || undefined,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });

    python.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        error: error.message,
      });
    });
  });
}

export { runPythonScript };


















































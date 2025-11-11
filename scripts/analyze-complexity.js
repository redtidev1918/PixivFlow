#!/usr/bin/env node

/**
 * Code complexity analysis script
 * Analyzes TypeScript files for cyclomatic complexity and other metrics
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const COMPLEXITY_THRESHOLD = 10;
const MAX_FUNCTION_LINES = 80;
const MAX_FILE_LINES = 500;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Statistics
const stats = {
  totalFiles: 0,
  totalFunctions: 0,
  highComplexity: [],
  longFunctions: [],
  longFiles: [],
  errors: [],
};

/**
 * Get all TypeScript files recursively
 */
function getTypeScriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, and test directories
      if (
        !file.includes('node_modules') &&
        !file.includes('dist') &&
        !file.includes('__tests__') &&
        !file.includes('.git')
      ) {
        getTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Count lines in a file
 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    return 0;
  }
}

/**
 * Simple complexity estimation based on control flow statements
 */
function estimateComplexity(content, functionName, startLine, endLine) {
  const functionContent = content
    .split('\n')
    .slice(startLine - 1, endLine)
    .join('\n');

  // Count control flow statements
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bswitch\s*\(/g,
    /\bcase\s+/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*{/g,
    /\bcatch\s*\(/g,
    /\b\?\s*.*\s*:/g, // ternary operator
    /\b&&\s*\(/g, // logical AND
    /\b\|\|\s*\(/g, // logical OR
  ];

  let complexity = 1; // Base complexity
  patterns.forEach((pattern) => {
    const matches = functionContent.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  });

  return complexity;
}

/**
 * Analyze a TypeScript file
 */
function analyzeFile(filePath) {
  stats.totalFiles++;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Check file length
    if (lineCount > MAX_FILE_LINES) {
      stats.longFiles.push({
        file: path.relative(process.cwd(), filePath),
        lines: lineCount,
      });
    }

    // Simple function detection (this is a basic implementation)
    // In a real scenario, you'd use a TypeScript parser
    const functionRegex = /(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*[=:]\s*(?:async\s*)?\([^)]*\)\s*[=>{])|(\w+)\s*\([^)]*\)\s*[:{]/g;
    let match;
    const functions = [];

    while ((match = functionRegex.exec(content)) !== null) {
      const functionName = match[1] || match[2] || match[3] || 'anonymous';
      const lineNumber = content.substring(0, match.index).split('\n').length;
      functions.push({ name: functionName, line: lineNumber });
    }

    // Analyze each function
    functions.forEach((func, index) => {
      stats.totalFunctions++;
      const nextFunc = functions[index + 1];
      const startLine = func.line;
      const endLine = nextFunc ? nextFunc.line - 1 : lines.length;
      const functionLines = endLine - startLine;

      // Check function length
      if (functionLines > MAX_FUNCTION_LINES) {
        stats.longFunctions.push({
          file: path.relative(process.cwd(), filePath),
          function: func.name,
          lines: functionLines,
          line: startLine,
        });
      }

      // Estimate complexity
      const complexity = estimateComplexity(content, func.name, startLine, endLine);
      if (complexity > COMPLEXITY_THRESHOLD) {
        stats.highComplexity.push({
          file: path.relative(process.cwd(), filePath),
          function: func.name,
          complexity,
          line: startLine,
        });
      }
    });
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
  }
}

/**
 * Generate report
 */
function generateReport() {
  console.log('\n' + colorize('='.repeat(80), 'cyan'));
  console.log(colorize('Code Complexity Analysis Report', 'cyan'));
  console.log(colorize('='.repeat(80), 'cyan') + '\n');

  console.log(colorize('Summary:', 'blue'));
  console.log(`  Total files analyzed: ${stats.totalFiles}`);
  console.log(`  Total functions: ${stats.totalFunctions}`);
  console.log(`  High complexity functions (>${COMPLEXITY_THRESHOLD}): ${stats.highComplexity.length}`);
  console.log(`  Long functions (>${MAX_FUNCTION_LINES} lines): ${stats.longFunctions.length}`);
  console.log(`  Long files (>${MAX_FILE_LINES} lines): ${stats.longFiles.length}`);
  console.log(`  Errors: ${stats.errors.length}\n`);

  // High complexity functions
  if (stats.highComplexity.length > 0) {
    console.log(colorize('High Complexity Functions:', 'yellow'));
    stats.highComplexity
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 20)
      .forEach((item) => {
        console.log(
          `  ${colorize(item.file, 'red')}:${item.line} - ${item.function} (complexity: ${colorize(item.complexity, 'yellow')})`
        );
      });
    console.log();
  }

  // Long functions
  if (stats.longFunctions.length > 0) {
    console.log(colorize('Long Functions:', 'yellow'));
    stats.longFunctions
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 20)
      .forEach((item) => {
        console.log(
          `  ${colorize(item.file, 'red')}:${item.line} - ${item.function} (${colorize(item.lines, 'yellow')} lines)`
        );
      });
    console.log();
  }

  // Long files
  if (stats.longFiles.length > 0) {
    console.log(colorize('Long Files:', 'yellow'));
    stats.longFiles
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 20)
      .forEach((item) => {
        console.log(`  ${colorize(item.file, 'red')} (${colorize(item.lines, 'yellow')} lines)`);
      });
    console.log();
  }

  // Errors
  if (stats.errors.length > 0) {
    console.log(colorize('Errors:', 'red'));
    stats.errors.forEach((error) => {
      console.log(`  ${error.file}: ${error.error}`);
    });
    console.log();
  }

  // Recommendations
  if (
    stats.highComplexity.length === 0 &&
    stats.longFunctions.length === 0 &&
    stats.longFiles.length === 0
  ) {
    console.log(colorize('✓ No issues found! Code quality is good.', 'green'));
  } else {
    console.log(colorize('Recommendations:', 'blue'));
    if (stats.highComplexity.length > 0) {
      console.log(
        `  - Consider refactoring ${stats.highComplexity.length} high complexity function(s)`
      );
    }
    if (stats.longFunctions.length > 0) {
      console.log(`  - Consider splitting ${stats.longFunctions.length} long function(s)`);
    }
    if (stats.longFiles.length > 0) {
      console.log(`  - Consider splitting ${stats.longFiles.length} long file(s)`);
    }
  }

  console.log('\n' + colorize('='.repeat(80), 'cyan') + '\n');

  // Exit with error code if issues found
  const hasIssues =
    stats.highComplexity.length > 0 ||
    stats.longFunctions.length > 0 ||
    stats.longFiles.length > 0 ||
    stats.errors.length > 0;

  process.exit(hasIssues ? 1 : 0);
}

/**
 * Main function
 */
function main() {
  const srcDir = path.join(process.cwd(), 'src');

  if (!fs.existsSync(srcDir)) {
    console.error(colorize(`Error: ${srcDir} does not exist`, 'red'));
    process.exit(1);
  }

  console.log(colorize('Analyzing code complexity...', 'blue'));
  console.log(`Source directory: ${srcDir}\n`);

  const files = getTypeScriptFiles(srcDir);
  console.log(`Found ${files.length} TypeScript files\n`);

  files.forEach((file) => {
    analyzeFile(file);
  });

  generateReport();
}

// Run analysis
main();


import { pathsToModuleNameMapper } from 'ts-jest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read tsconfig.json to get path mappings
let tsconfig;
try {
  const tsconfigContent = readFileSync(resolve(__dirname, 'tsconfig.json'), 'utf-8');
  // Remove comments from JSON (TypeScript config supports comments but JSON.parse doesn't)
  // Use a more sophisticated approach that handles strings correctly
  let cleanedContent = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < tsconfigContent.length; i++) {
    const char = tsconfigContent[i];
    const nextChar = tsconfigContent[i + 1];
    
    if (escapeNext) {
      cleanedContent += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      cleanedContent += char;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      cleanedContent += char;
      continue;
    }
    
    // Only process comments outside of strings
    if (!inString) {
      // Single-line comment
      if (char === '/' && nextChar === '/') {
        // Skip until end of line
        while (i < tsconfigContent.length && tsconfigContent[i] !== '\n') {
          i++;
        }
        continue;
      }
      // Multi-line comment
      if (char === '/' && nextChar === '*') {
        // Skip until */
        i += 2;
        while (i < tsconfigContent.length - 1) {
          if (tsconfigContent[i] === '*' && tsconfigContent[i + 1] === '/') {
            i += 1; // Skip the closing */
            break;
          }
          i++;
        }
        continue;
      }
    }
    
    cleanedContent += char;
  }
  
  tsconfig = JSON.parse(cleanedContent);
} catch (error) {
  console.error('Error reading tsconfig.json:', error);
  tsconfig = { compilerOptions: { paths: {} } };
}

export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/*.{spec,test}.{ts,tsx}'],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(tsconfig.compilerOptions?.paths || {}, {
      prefix: '<rootDir>/',
    }),
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
      },
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};


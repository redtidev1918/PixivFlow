/**
 * Resource management utilities
 * Provides safe resource cleanup and lifecycle management
 */

import { logger } from '../logger';

/**
 * Resource that needs cleanup
 */
export interface Resource {
  /**
   * Cleanup function
   */
  cleanup: () => void | Promise<void>;
  
  /**
   * Resource name for logging
   */
  name?: string;
}

/**
 * Resource manager for tracking and cleaning up resources
 */
export class ResourceManager {
  private resources: Resource[] = [];
  private cleaned = false;

  /**
   * Register a resource for cleanup
   */
  register(resource: Resource): void {
    if (this.cleaned) {
      logger.warn('Attempted to register resource after cleanup', { name: resource.name });
      return;
    }
    this.resources.push(resource);
  }

  /**
   * Unregister a resource (e.g., if it was cleaned up manually)
   */
  unregister(resource: Resource): void {
    const index = this.resources.indexOf(resource);
    if (index !== -1) {
      this.resources.splice(index, 1);
    }
  }

  /**
   * Cleanup all registered resources
   */
  async cleanup(): Promise<void> {
    if (this.cleaned) {
      return;
    }

    this.cleaned = true;
    const errors: Error[] = [];

    // Cleanup in reverse order (LIFO)
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const resource = this.resources[i];
      try {
        await resource.cleanup();
        logger.debug('Resource cleaned up', { name: resource.name });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error cleaning up resource', {
          name: resource.name,
          error: errorMessage,
        });
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.resources = [];

    if (errors.length > 0) {
      throw new Error(
        `Failed to cleanup ${errors.length} resource(s): ${errors.map(e => e.message).join('; ')}`
      );
    }
  }

  /**
   * Get number of registered resources
   */
  getResourceCount(): number {
    return this.resources.length;
  }
}

/**
 * Execute a function with automatic resource cleanup
 */
export async function withResources<T>(
  fn: (manager: ResourceManager) => Promise<T>
): Promise<T> {
  const manager = new ResourceManager();
  try {
    return await fn(manager);
  } finally {
    await manager.cleanup();
  }
}

/**
 * Create a resource from a cleanup function
 */
export function createResource(
  cleanup: () => void | Promise<void>,
  name?: string
): Resource {
  return { cleanup, name };
}

/**
 * Wrap a resource with automatic registration
 */
export function autoCleanup<T extends { close?: () => void | Promise<void> }>(
  resource: T,
  name?: string
): T {
  const manager = new ResourceManager();
  manager.register({
    cleanup: async () => {
      if (resource.close) {
        await resource.close();
      }
    },
    name: name || resource.constructor.name,
  });

  // Note: In a real implementation, you might want to store the manager
  // and provide a way to trigger cleanup. For now, this is a simple wrapper.
  return resource;
}

/**
 * Safe file handle wrapper
 */
export class SafeFileHandle {
  private closed = false;

  constructor(
    private readonly handle: { close?: () => void | Promise<void> },
    private readonly name?: string
  ) {}

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    if (this.handle.close) {
      await this.handle.close();
    }
  }

  isClosed(): boolean {
    return this.closed;
  }

  getHandle(): typeof this.handle {
    if (this.closed) {
      throw new Error(`File handle ${this.name || 'unknown'} is closed`);
    }
    return this.handle;
  }
}

/**
 * Database connection wrapper with automatic cleanup
 */
export class ManagedDatabase {
  private closed = false;

  constructor(
    private readonly database: { close: () => void },
    private readonly name?: string
  ) {}

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    try {
      this.database.close();
      logger.debug('Database closed', { name: this.name });
    } catch (error) {
      logger.error('Error closing database', {
        name: this.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }

  getDatabase(): typeof this.database {
    if (this.closed) {
      throw new Error(`Database ${this.name || 'unknown'} is closed`);
    }
    return this.database;
  }
}
















































/**
 * Simple Dependency Injection Container
 * 
 * Provides a lightweight DI container for managing dependencies
 * and promoting loose coupling between modules.
 */
export class Container {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();
  private singletons = new Map<string, any>();

  /**
   * Register a service instance
   */
  register<T>(key: string, instance: T): void {
    this.services.set(key, instance);
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
  }

  /**
   * Register a singleton factory (creates instance on first access)
   */
  registerSingleton<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory);
    // Mark as singleton
    this.singletons.set(key, null);
  }

  /**
   * Resolve a service
   */
  resolve<T>(key: string): T {
    // Check for direct instance
    if (this.services.has(key)) {
      return this.services.get(key) as T;
    }

    // Check for singleton
    if (this.singletons.has(key)) {
      const cached = this.singletons.get(key);
      if (cached !== null) {
        return cached as T;
      }
      // Create and cache singleton
      const factory = this.factories.get(key);
      if (!factory) {
        throw new Error(`Service ${key} not found`);
      }
      const instance = factory();
      this.singletons.set(key, instance);
      return instance as T;
    }

    // Check for factory
    const factory = this.factories.get(key);
    if (factory) {
      return factory() as T;
    }

    throw new Error(`Service ${key} not found`);
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.services.has(key) || this.factories.has(key);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}

/**
 * Global container instance
 */
export const container = new Container();


import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import type { StandaloneConfig, TargetConfig } from '../config';
import { validateConfig } from '../config/validation';
import type { TagDiscoveryManifest } from './types';

export interface TagPlanApplyOptions {
  targetId: string;
  selectedTags: string[];
  mode?: 'append' | 'replace';
}

export interface TagPlanApplyResult {
  targetId: string;
  previousTag?: string;
  tag: string;
  selectedTags: string[];
  backupPath: string;
}

/** Applies an explicitly selected subset and atomically publishes the config. */
export class TagPlanApplier {
  async apply(
    configPath: string,
    manifest: TagDiscoveryManifest,
    options: TagPlanApplyOptions
  ): Promise<TagPlanApplyResult> {
    const selectedTags = this.resolveSelectedTags(manifest, options.selectedTags);
    if (selectedTags.length === 0) throw new Error('At least one candidate tag must be selected');
    if (selectedTags.some((tag) => /\s/u.test(tag))) {
      throw new Error('Selected Pixiv tags containing whitespace cannot be represented by the current OR-tag config format');
    }

    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw) as StandaloneConfig;
    const target = config.targets.find((item) => item.id === options.targetId);
    if (!target) throw new Error(`Target id not found: ${options.targetId}`);
    if (target.mode === 'ranking' && target.filterTag) {
      throw new Error(`Target ${options.targetId} uses ranking.filterTag; tag discovery apply supports search targets only`);
    }

    const previousTag = target.tag;
    const existing = options.mode === 'replace' ? [] : this.existingTags(target);
    const nextTags = this.unique([...existing, ...selectedTags]);
    target.tag = nextTags.join(' ');
    target.tagRelation = 'or';
    target.searchTarget = target.searchTarget ?? 'partial_match_for_tags';

    validateConfig(config, configPath, config.storage?.databasePath);
    const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
    const backupPath = `${configPath}.tag-apply.bak`;
    const mode = (await fs.stat(configPath)).mode;
    await fs.mkdir(dirname(configPath), { recursive: true });
    await fs.copyFile(configPath, backupPath);
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      await fs.chmod(temporaryPath, mode);
      await fs.rename(temporaryPath, configPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    return {
      targetId: options.targetId,
      previousTag,
      tag: target.tag,
      selectedTags,
      backupPath,
    };
  }

  private resolveSelectedTags(manifest: TagDiscoveryManifest, requested: string[]): string[] {
    const candidates = new Map(
      manifest.candidates.map((candidate) => [this.key(candidate.name), candidate.name])
    );
    return this.unique(requested.map((value) => {
      const candidate = candidates.get(this.key(value));
      if (!candidate) throw new Error(`Tag is not in the discovery manifest: ${value}`);
      return candidate;
    }));
  }

  private existingTags(target: TargetConfig): string[] {
    const current = target.tag?.trim();
    if (!current) return [];
    if (target.tagRelation !== 'or') return [current];
    return current.split(/\s+/u).filter(Boolean);
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = this.key(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private key(value: string): string {
    return value.trim().normalize('NFKC').toLocaleLowerCase();
  }
}

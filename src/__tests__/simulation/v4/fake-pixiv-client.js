/**
 * Fake Pixiv provider for the V4 simulation (CommonJS: loaded inside the daemon).
 *
 * This replaces ONLY the provider boundary (`IPixivClient`), i.e. the network
 * edge to Pixiv. Everything downstream stays real: schedule resolution, slot
 * ledger, candidate planning, history filtering, download orchestration, the
 * outbox and HTTP delivery all run as shipped.
 *
 * Scenario data comes from the JSON file named by V4_SIM_FIXTURE. Every call is
 * appended to V4_SIM_PROVIDER_LOG as NDJSON so the harness can assert exact call
 * counts without parsing daemon logs.
 */
'use strict';

const fs = require('node:fs');

const fixturePath = process.env.V4_SIM_FIXTURE;
const providerLogPath = process.env.V4_SIM_PROVIDER_LOG;

if (!fixturePath) {
  throw new Error('fake-pixiv-client: V4_SIM_FIXTURE is required');
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const media = fixture.mediaPath && fs.existsSync(fixture.mediaPath)
  ? fs.readFileSync(fixture.mediaPath)
  : Buffer.from('v4-sim-media');

function record(method, detail) {
  if (!providerLogPath) return;
  const line = JSON.stringify({ method, detail, at: Date.now() }) + '\n';
  fs.appendFileSync(providerLogPath, line);
}

function notUsed(method) {
  return () => {
    record(method, { unexpected: true });
    throw new Error(
      `fake-pixiv-client: ${method} is not part of this simulation scenario. ` +
      'If production started calling it, extend the fixture instead of widening the fake silently.'
    );
  };
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

class FakePixivClient {
  searchIllustrations(target) {
    record('searchIllustrations', { targetId: target && target.id });
    return Promise.resolve(fixture.illustrations || []);
  }

  getIllustDetailWithTags(illustId) {
    record('getIllustDetailWithTags', { illustId });
    const found = (fixture.illustrations || []).find((i) => i.id === illustId);
    if (!found) {
      return Promise.reject(new Error(`fake-pixiv-client: unknown illustration ${illustId}`));
    }
    return Promise.resolve({ illust: found, tags: fixture.tags || [] });
  }

  downloadImage(originalUrl) {
    record('downloadImage', { originalUrl });
    return Promise.resolve(toArrayBuffer(media));
  }

  getIllustration(id) {
    record('getIllustration', { id });
    const found = (fixture.illustrations || []).find((i) => i.id === id);
    return found
      ? Promise.resolve(found)
      : Promise.reject(new Error(`fake-pixiv-client: unknown illustration ${id}`));
  }

  ugoiraMetadata(illustId) {
    record('ugoiraMetadata', { illustId });
    return Promise.reject(new Error('fake-pixiv-client: ugoira is out of scope for this scenario'));
  }

  searchNovels(target) {
    record('searchNovels', { targetId: target && target.id });
    return Promise.resolve(fixture.novels || []);
  }

  getNovel(id) {
    record('getNovel', { id });
    const found = (fixture.novels || []).find((n) => n.id === id);
    return found
      ? Promise.resolve(found)
      : Promise.reject(new Error(`fake-pixiv-client: unknown novel ${id}`));
  }

  getNovelDetail(id) {
    return this.getNovel(id);
  }

  getNovelDetailWithTags(novelId) {
    record('getNovelDetailWithTags', { novelId });
    const found = (fixture.novels || []).find((n) => n.id === novelId);
    return found
      ? Promise.resolve({ novel: found, tags: fixture.tags || [] })
      : Promise.reject(new Error(`fake-pixiv-client: unknown novel ${novelId}`));
  }

  getNovelText(id) {
    record('getNovelText', { id });
    return Promise.resolve(fixture.novelText || { novel_text: '' });
  }

  getNovelSeries(seriesId) {
    record('getNovelSeries', { seriesId });
    return Promise.resolve([]);
  }

  getUserIllustrations() { return notUsed('getUserIllustrations')(); }
  getUserNovels() { return notUsed('getUserNovels')(); }
  getRankingIllustrations() { return notUsed('getRankingIllustrations')(); }
  getRankingNovels() { return notUsed('getRankingNovels')(); }
}

module.exports = { FakePixivClient, fixture, media };

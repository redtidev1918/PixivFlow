/**
 * Child-process preload for the V4 simulation.
 *
 * Loaded with `node --require preload.js dist/index.js scheduler`, it swaps the
 * Pixiv provider *factory* for the fake before the daemon's module graph is
 * evaluated. This is dependency injection at the module boundary: no production
 * file is modified or copied, and the daemon that runs is the shipped artifact.
 *
 * If the patch does not apply, the process fails loudly — a simulation that
 * silently talks to the real Pixiv API would be worse than no simulation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const distRoot = process.env.V4_SIM_DIST_ROOT;
const providerLogPath = process.env.V4_SIM_PROVIDER_LOG;

if (!distRoot) {
  throw new Error('preload: V4_SIM_DIST_ROOT is required (path to the built dist/)');
}

const factoryPath = path.join(distRoot, 'pixiv-client', 'createPixivFlowClient.js');
const factoryModule = require(factoryPath);

const original = factoryModule.createPixivFlowClient;
if (typeof original !== 'function') {
  throw new Error(
    `preload: ${factoryPath} does not export createPixivFlowClient(); refusing to run against the real provider`
  );
}

const { FakePixivClient } = require('./fake-pixiv-client');
const instances = [];

factoryModule.createPixivFlowClient = function createFakePixivFlowClient(...args) {
  const client = new FakePixivClient();
  instances.push(client);
  return client;
};

// Hard guard: any accidental real-network use inside the child aborts the run.
const realFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input, init) {
  const url = typeof input === 'string' ? input : String(input && input.url);
  if (/pixiv\.(net|jp)|api\.telegram\.org|accounts\.google\.com/i.test(url)) {
    throw new Error(`preload: simulation attempted a real network call to ${url}`);
  }
  return realFetch(input, init);
};

if (providerLogPath) {
  fs.appendFileSync(
    providerLogPath,
    JSON.stringify({ method: '__preload__', detail: { patched: factoryPath, instances: 0 } }) + '\n'
  );
}

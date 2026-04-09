import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, '../../data/tokens.json');

function load() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(STORE_PATH, 'utf-8'))));
  } catch {
    return new Map();
  }
}

function persist(store) {
  try {
    mkdirSync(join(__dirname, '../../data'), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(Object.fromEntries(store), null, 2));
  } catch (err) {
    console.error('tokenStore: failed to persist:', err.message);
  }
}

const store = load();

export function storeTokens(clientToken, spotifyTokens) {
  store.set(clientToken, { ...spotifyTokens });
  persist(store);
}

export function getTokens(clientToken) {
  return store.get(clientToken) ?? null;
}

export function updateTokens(clientToken, spotifyTokens) {
  if (store.has(clientToken)) {
    store.set(clientToken, { ...spotifyTokens });
    persist(store);
  }
}

export function deleteTokens(clientToken) {
  store.delete(clientToken);
  persist(store);
}

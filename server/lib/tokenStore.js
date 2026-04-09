const store = new Map();

export function storeTokens(clientToken, spotifyTokens) {
  store.set(clientToken, { ...spotifyTokens });
}

export function getTokens(clientToken) {
  return store.get(clientToken) ?? null;
}

export function updateTokens(clientToken, spotifyTokens) {
  if (store.has(clientToken)) {
    store.set(clientToken, { ...spotifyTokens });
  }
}

export function deleteTokens(clientToken) {
  store.delete(clientToken);
}

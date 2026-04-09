import Anthropic from '@anthropic-ai/sdk';

let _client;

export function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

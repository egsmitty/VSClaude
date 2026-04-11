import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(__dirname, '../../data/profile.json');

export async function loadProfile() {
  try {
    const raw = await readFile(PROFILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null; // No profile yet
  }
}

export async function saveProfile(profile) {
  await mkdir(join(__dirname, '../../data'), { recursive: true });
  await writeFile(PROFILE_PATH, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }, null, 2));
}

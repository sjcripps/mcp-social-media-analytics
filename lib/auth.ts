import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";

const DATA_DIR = join(import.meta.dir || process.cwd(), "..", "data");
const KEYS_FILE = join(DATA_DIR, "api-keys.json");

export type Tier = "free" | "starter" | "pro" | "business";

export interface ApiKeyData {
  name: string;
  email?: string;
  tier: Tier;
  created: string;
  active: boolean;
  usage: Record<string, number>; // "YYYY-MM" -> count
}

interface KeyStore {
  keys: Record<string, ApiKeyData>;
}

export const TIER_LIMITS: Record<string, number> = {
  free: 10,
  starter: 200,
  pro: 1000,
  business: 5000,
};

export const TIER_PRICES: Record<string, number> = {
  free: 0,
  starter: 19,
  pro: 49,
  business: 99,
};

async function loadKeys(): Promise<KeyStore> {
  try {
    const data = await readFile(KEYS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { keys: {} };
  }
}

async function saveKeys(store: KeyStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(KEYS_FILE, JSON.stringify(store, null, 2));
}

export async function validateApiKey(
  key: string | null
): Promise<{ valid: boolean; error?: string; tier?: string; name?: string }> {
  if (!key) return { valid: false, error: "Missing API key. Pass X-API-Key header." };

  const store = await loadKeys();
  const keyData = store.keys[key];

  if (!keyData) return { valid: false, error: "Invalid API key." };
  if (!keyData.active) return { valid: false, error: "API key is deactivated." };

  const month = new Date().toISOString().slice(0, 7);
  const currentUsage = keyData.usage[month] || 0;
  const limit = TIER_LIMITS[keyData.tier] || 10;

  if (currentUsage >= limit) {
    return {
      valid: false,
      error: `Rate limit exceeded. ${keyData.tier} tier allows ${limit} requests/month. Current: ${currentUsage}. Upgrade at https://social.ezbizservices.com/pricing`,
    };
  }

  return { valid: true, tier: keyData.tier, name: keyData.name };
}

export async function recordUsage(key: string): Promise<void> {
  const store = await loadKeys();
  const keyData = store.keys[key];
  if (!keyData) return;

  const month = new Date().toISOString().slice(0, 7);
  keyData.usage[month] = (keyData.usage[month] || 0) + 1;
  await saveKeys(store);
}

export async function createApiKey(
  name: string,
  tier: Tier = "free",
  email?: string
): Promise<string> {
  const store = await loadKeys();
  const key = `sk_soc_${randomBytes(24).toString("hex")}`;
  store.keys[key] = {
    name,
    email,
    tier,
    created: new Date().toISOString(),
    active: true,
    usage: {},
  };
  await saveKeys(store);
  return key;
}

export async function getKeyByEmail(email: string): Promise<{ key: string; data: ApiKeyData } | null> {
  const store = await loadKeys();
  for (const [key, data] of Object.entries(store.keys)) {
    if (data.email === email && data.active) {
      return { key, data };
    }
  }
  return null;
}

export async function upgradeKey(email: string, newTier: Tier): Promise<string | null> {
  const store = await loadKeys();
  for (const [key, data] of Object.entries(store.keys)) {
    if (data.email === email && data.active) {
      data.tier = newTier;
      await saveKeys(store);
      return key;
    }
  }
  return null;
}

export async function deactivateKey(key: string): Promise<boolean> {
  const store = await loadKeys();
  if (store.keys[key]) {
    store.keys[key].active = false;
    await saveKeys(store);
    return true;
  }
  return false;
}

export async function getKeyUsage(key: string): Promise<{ tier: string; used: number; limit: number; remaining: number } | null> {
  const store = await loadKeys();
  const data = store.keys[key];
  if (!data) return null;
  const month = new Date().toISOString().slice(0, 7);
  const used = data.usage[month] || 0;
  const limit = TIER_LIMITS[data.tier] || 10;
  return { tier: data.tier, used, limit, remaining: Math.max(0, limit - used) };
}

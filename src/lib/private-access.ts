import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const PRIVATE_ACCESS_COOKIE = "wolfcha_private_access";

export type AccessRole = "admin" | "player" | "reserve";

export type AccessProfile = {
  id: string;
  label: string;
  role: AccessRole;
  hash: string;
  active: boolean;
  notes?: string;
};

export type PublicAccessProfile = Pick<AccessProfile, "id" | "label" | "role" | "active">;

export type AccessSession = {
  userId: string;
  name: string;
  role: AccessRole;
  issuedAt: string;
  expiresAt: string;
};

const defaultProfiles: Omit<AccessProfile, "active">[] = [
  { id: "admin-1", label: "Admin 1", role: "admin", hash: "672b718e9bf3ce31c26611e6c6763698672c36c197a53c76a155c2eae431452c", notes: "Compte administrateur principal" },
  { id: "admin-2", label: "Admin 2", role: "admin", hash: "f6e2973bb093f302a2bbec461250753aa7b296c803acde04bcff18f52781daff", notes: "Compte administrateur principal" },
  { id: "player-1", label: "Joueur 1", role: "player", hash: "d79b24fd2f5c572d673665b285fc32b1a86a86894f63b2f8f4514be57d294eea" },
  { id: "player-2", label: "Joueur 2", role: "player", hash: "a050dd3b075b0d5b14dfc433fdc174656ba254039839b5d1cce255c55812faa5" },
  { id: "player-3", label: "Joueur 3", role: "player", hash: "2de5af076657eda7ccdf7204f814756f0e3367517282e6bbc44c3c2049775c80" },
  { id: "player-4", label: "Joueur 4", role: "player", hash: "3969a156e5b6398392851d965ec01184fbf7ab7edd5527cd0b81caf160f01abb" },
  { id: "player-5", label: "Joueur 5", role: "player", hash: "9cc9388ed5ce9790a9913256a700710c246ae579082c0f73451017f9167db563" },
  { id: "player-6", label: "Joueur 6", role: "player", hash: "6bd4bdbca99a7d60a79b1786f61adf94f332e6fa5f668516a95a256026817b17" },
  { id: "player-7", label: "Joueur 7", role: "player", hash: "ff71de51fa6acc96ae1a68795b21fcaca9ac7987f169ef655c121462546ae3ab" },
  { id: "player-8", label: "Joueur 8", role: "player", hash: "0bbfef1420e4e99c8f4edc06ea3c2ae148bcc5a458ba8b0b4e57fb512ed6296c" },
  { id: "reserve-1", label: "Code de secours 1", role: "reserve", hash: "eec016143268aa1f33b409102b684489db711dd00ecfb1f274e64ecc74810d44", notes: "Révoquable et renouvelable par l'administration" },
  { id: "reserve-2", label: "Code de secours 2", role: "reserve", hash: "00d2d28e44be00beee120c5e0e6491a4141d0226a77887c8f348afbed964c41e", notes: "Révoquable et renouvelable par l'administration" },
];

function getStorageDirectory() {
  return process.env.PRIVATE_ACCESS_DATA_DIR || path.join(process.cwd(), ".private-access");
}

function getAccountsPath() {
  return path.join(getStorageDirectory(), "accounts.json");
}

function getSigningKeyPath() {
  return path.join(getStorageDirectory(), "session-signing-key");
}

function getInitialProfiles(): AccessProfile[] {
  const entries = [
    ["admin-1", process.env.PRIVATE_ACCESS_ADMIN_1_HASH],
    ["admin-2", process.env.PRIVATE_ACCESS_ADMIN_2_HASH],
    ["player-1", process.env.PRIVATE_ACCESS_PLAYER_1_HASH],
    ["player-2", process.env.PRIVATE_ACCESS_PLAYER_2_HASH],
    ["player-3", process.env.PRIVATE_ACCESS_PLAYER_3_HASH],
    ["player-4", process.env.PRIVATE_ACCESS_PLAYER_4_HASH],
    ["player-5", process.env.PRIVATE_ACCESS_PLAYER_5_HASH],
    ["player-6", process.env.PRIVATE_ACCESS_PLAYER_6_HASH],
    ["player-7", process.env.PRIVATE_ACCESS_PLAYER_7_HASH],
    ["player-8", process.env.PRIVATE_ACCESS_PLAYER_8_HASH],
    ["reserve-1", process.env.PRIVATE_ACCESS_RESERVE_1_HASH],
    ["reserve-2", process.env.PRIVATE_ACCESS_RESERVE_2_HASH],
  ] as const;
  const configuredHashes = new Map<string, string>();
  for (const [id, hash] of entries) {
    if (hash) configuredHashes.set(id, hash.trim());
  }
  if (
    process.env.NODE_ENV === "production" &&
    (configuredHashes.size !== defaultProfiles.length ||
      [...configuredHashes.values()].some((hash) => !/^[a-f0-9]{64}$/i.test(hash)))
  ) {
    throw new Error("All 12 PRIVATE_ACCESS_*_HASH values must be configured as SHA-256 hashes in production.");
  }
  const useEnvironment = configuredHashes.size === defaultProfiles.length;

  return defaultProfiles.map((profile) => ({
    ...profile,
    hash: useEnvironment ? configuredHashes.get(profile.id)! : profile.hash,
    active: true,
  }));
}

function usesFileAccessStore() {
  return process.env.NODE_ENV !== "production";
}

async function getDatabaseClient() {
  const { ensureAdminClient, supabaseAdmin } = await import("@/lib/supabase-admin");
  ensureAdminClient();
  return supabaseAdmin;
}

async function readDatabaseProfiles(): Promise<AccessProfile[]> {
  const supabase = await getDatabaseClient();
  const { data, error } = await supabase
    .from("private_access_profiles")
    .select("id, label, role, code_hash, active, notes")
    .order("id", { ascending: true });
  if (error) throw error;

  if (!data?.length) {
    const initialProfiles = getInitialProfiles();
    const { error: seedError } = await supabase
      .from("private_access_profiles")
      .upsert(
        initialProfiles.map(({ id, label, role, hash, active, notes }) => ({
          id,
          label,
          role,
          code_hash: hash,
          active,
          notes: notes ?? null,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (seedError) throw seedError;
    return readDatabaseProfiles();
  }

  if (data.length !== defaultProfiles.length) {
    throw new Error(`Private access profile store has ${data.length} profiles; expected ${defaultProfiles.length}.`);
  }
  return data.map(({ id, label, role, code_hash, active, notes }) => ({
    id,
    label,
    role,
    hash: code_hash,
    active,
    notes: notes ?? undefined,
  }));
}

async function writeFileProfiles(profiles: AccessProfile[]) {
  const directory = getStorageDirectory();
  await mkdir(directory, { recursive: true });
  const tempPath = `${getAccountsPath()}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, JSON.stringify(profiles, null, 2), { mode: 0o600 });
  await rename(tempPath, getAccountsPath());
}

async function readFileProfiles(): Promise<AccessProfile[]> {
  await mkdir(getStorageDirectory(), { recursive: true });

  try {
    const raw = await readFile(getAccountsPath(), "utf8");
    const profiles = JSON.parse(raw) as AccessProfile[];
    if (
      !Array.isArray(profiles) ||
      profiles.length !== 12 ||
      profiles.some((profile) =>
        typeof profile.id !== "string" ||
        typeof profile.label !== "string" ||
        !["admin", "player", "reserve"].includes(profile.role) ||
        typeof profile.hash !== "string" ||
        typeof profile.active !== "boolean"
      )
    ) {
      throw new Error("Private access account store has an invalid format");
    }
    return profiles;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const profiles = getInitialProfiles();
    await writeFileProfiles(profiles);
    return profiles;
  }
}

async function readProfiles(): Promise<AccessProfile[]> {
  return usesFileAccessStore() ? readFileProfiles() : readDatabaseProfiles();
}

let writeQueue: Promise<void> = Promise.resolve();

async function updateProfiles(
  update: (profiles: AccessProfile[]) => void
): Promise<AccessProfile[]> {
  let result: AccessProfile[] = [];
  const operation = writeQueue.then(async () => {
    if (!usesFileAccessStore()) {
      throw new Error("Database access profile updates must use the atomic database function.");
    }
    const profiles = await readFileProfiles();
    update(profiles);
    await writeFileProfiles(profiles);
    result = profiles;
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

async function getSigningKey(): Promise<Buffer> {
  if (!usesFileAccessStore()) {
    const signingKey = process.env.PRIVATE_ACCESS_SIGNING_KEY;
    if (!signingKey || Buffer.byteLength(signingKey, "utf8") < 32) {
      throw new Error("PRIVATE_ACCESS_SIGNING_KEY must contain at least 32 characters in production.");
    }
    return Buffer.from(signingKey, "utf8");
  }

  const keyPath = getSigningKeyPath();
  await mkdir(getStorageDirectory(), { recursive: true });
  try {
    return await readFile(keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const key = randomBytes(32);
  try {
    await writeFile(keyPath, key, { flag: "wx", mode: 0o600 });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readFile(keyPath);
  }
}

export async function getPrivateAccessProfiles(): Promise<PublicAccessProfile[]> {
  const profiles = await readProfiles();
  return profiles.map(({ id, label, role, active }) => ({ id, label, role, active }));
}

export async function getAccessCounts() {
  const profiles = await readProfiles();
  return {
    admins: profiles.filter((profile) => profile.role === "admin").length,
    players: profiles.filter((profile) => profile.role === "player").length,
    reserves: profiles.filter((profile) => profile.role === "reserve").length,
    total: profiles.length,
  };
}

export async function hashCode(code: string): Promise<string> {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

export async function verifyPrivateAccessCode(
  code: string,
  displayName?: string
): Promise<AccessSession | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  const digest = Buffer.from(await hashCode(normalized), "hex");
  const profiles = await readProfiles();
  const profile = profiles.find((entry) => {
    if (!entry.active) return false;
    const storedHash = Buffer.from(entry.hash, "hex");
    return storedHash.length === digest.length && timingSafeEqual(storedHash, digest);
  });

  if (!profile) return null;

  const now = new Date();
  return {
    userId: profile.id,
    name: displayName?.trim() || profile.label,
    role: profile.role,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
  };
}

export async function rotatePrivateAccessCode(profileId: string): Promise<string> {
  const code = `WOLF-${randomBytes(18).toString("base64url").toUpperCase()}`;
  const hash = await hashCode(code);
  if (!usesFileAccessStore()) {
    const supabase = await getDatabaseClient();
    const { error } = await supabase.rpc("private_access_update_profile", {
      p_profile_id: profileId,
      p_code_hash: hash,
      p_active: true,
    });
    if (error) throw new Error(error.message);
    return code;
  }
  await updateProfiles((profiles) => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) throw new Error("Compte introuvable");
    profile.hash = hash;
    profile.active = true;
  });
  return code;
}

export async function setPrivateAccessActive(profileId: string, active: boolean): Promise<void> {
  if (!usesFileAccessStore()) {
    const supabase = await getDatabaseClient();
    const { error } = await supabase.rpc("private_access_update_profile", {
      p_profile_id: profileId,
      p_code_hash: null,
      p_active: active,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await updateProfiles((profiles) => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) throw new Error("Compte introuvable");
    if (!active && profile.role === "admin") {
      const activeAdmins = profiles.filter((entry) => entry.role === "admin" && entry.active);
      if (activeAdmins.length <= 1) throw new Error("Impossible de révoquer le dernier administrateur actif");
    }
    profile.active = active;
  });
}

export async function getAccessSessionCookieValue(session: AccessSession): Promise<string> {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = createHmac("sha256", await getSigningKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function parseAccessSessionCookieValue(raw: string | undefined): Promise<AccessSession | null> {
  if (!raw) return null;

  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra) return null;

  const expectedSignature = createHmac("sha256", await getSigningKey()).update(payload).digest();
  const suppliedSignature = Buffer.from(signature, "base64url");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  let session: AccessSession;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessSession;
  } catch {
    return null;
  }

  if (
    typeof session.userId !== "string" ||
    typeof session.name !== "string" ||
    !["admin", "player", "reserve"].includes(session.role) ||
    typeof session.expiresAt !== "string" ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  const profile = (await readProfiles()).find((entry) => entry.id === session.userId);
  if (!profile || !profile.active || profile.role !== session.role) return null;
  return session;
}

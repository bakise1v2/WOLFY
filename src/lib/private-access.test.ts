import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getPrivateAccessProfiles,
  getAccessSessionCookieValue,
  parseAccessSessionCookieValue,
  rotatePrivateAccessCode,
  setPrivateAccessActive,
  verifyPrivateAccessCode,
} from "./private-access";

let storageDirectory: string;

before(async () => {
  storageDirectory = await mkdtemp(path.join(os.tmpdir(), "wolfcha-private-access-"));
  process.env.PRIVATE_ACCESS_DATA_DIR = storageDirectory;
});

after(async () => {
  delete process.env.PRIVATE_ACCESS_DATA_DIR;
  await rm(storageDirectory, { recursive: true, force: true });
});

test("admin access codes rotate, revoke and sign sessions securely", async () => {
  const accounts = await getPrivateAccessProfiles();
  assert.equal(accounts.length, 12);
  assert.equal(accounts.filter((account) => account.role === "admin").length, 2);
  assert.equal(accounts.filter((account) => account.role === "player").length, 8);
  assert.equal(accounts.filter((account) => account.role === "reserve").length, 2);

  const initialCode = await rotatePrivateAccessCode("admin-1");
  assert.equal((await verifyPrivateAccessCode(initialCode))?.role, "admin");
  const session = await verifyPrivateAccessCode(initialCode);
  assert.ok(session);
  const cookie = await getAccessSessionCookieValue(session);
  assert.equal((await parseAccessSessionCookieValue(cookie))?.userId, "admin-1");

  const [payload, signature] = cookie.split(".");
  assert.equal(await parseAccessSessionCookieValue(`${payload.slice(1)}.${signature}`), null);

  const replacementCode = await rotatePrivateAccessCode("admin-1");
  assert.equal(await verifyPrivateAccessCode(initialCode), null);
  assert.equal((await verifyPrivateAccessCode(replacementCode))?.userId, "admin-1");

  const playerCode = await rotatePrivateAccessCode("player-1");
  assert.equal((await verifyPrivateAccessCode(playerCode, "Lou"))?.name, "Lou");
  await setPrivateAccessActive("player-1", false);
  assert.equal(await verifyPrivateAccessCode(playerCode), null);
  await setPrivateAccessActive("admin-2", false);
  await assert.rejects(
    () => setPrivateAccessActive("admin-1", false),
    /dernier administrateur actif/
  );
});

import { createHash, randomBytes } from "node:crypto";

const profiles = [
  ["PRIVATE_ACCESS_ADMIN_1_HASH", "Administrateur 1"],
  ["PRIVATE_ACCESS_ADMIN_2_HASH", "Administrateur 2"],
  ...Array.from({ length: 8 }, (_, index) => [
    `PRIVATE_ACCESS_PLAYER_${index + 1}_HASH`,
    `Joueur ${index + 1}`,
  ]),
  ["PRIVATE_ACCESS_RESERVE_1_HASH", "Code de secours 1"],
  ["PRIVATE_ACCESS_RESERVE_2_HASH", "Code de secours 2"],
];

console.log("Conservez ces codes dans un gestionnaire sécurisé. Ne publiez pas cette sortie.\n");
for (const [variable, label] of profiles) {
  const code = `WOLF-${randomBytes(18).toString("base64url").toUpperCase()}`;
  const hash = createHash("sha256").update(code.trim(), "utf8").digest("hex");
  console.log(`${label}: ${code}`);
  console.log(`${variable}=${hash}\n`);
}

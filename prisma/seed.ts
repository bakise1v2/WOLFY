import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "../src/lib/email";

const prisma = new PrismaClient();

async function main() {
  const configuredAdmins = [
    {
      email: process.env.ADMIN1_EMAIL ?? "louchiematthieu59@gmail.com",
      password: process.env.ADMIN1_PASSWORD,
      displayName: "Administrateur Un",
    },
    {
      email: process.env.ADMIN2_EMAIL ?? "timeoharlay1@gmail.com",
      password: process.env.ADMIN2_PASSWORD,
      displayName: "Administrateur Deux",
    },
  ];

  const admins = configuredAdmins.map((admin, index) => {
    const email = normalizeEmail(admin.email);
    if (!email) {
      throw new Error(`ADMIN${index + 1}_EMAIL must be a valid email address.`);
    }
    const password = admin.password;
    if (!password || password.length < 12) {
      throw new Error(
        `ADMIN${index + 1}_PASSWORD must be set and contain at least 12 characters.`
      );
    }

    return {
      ...admin,
      email,
      password,
    };
  });

  const emails = admins.map(({ email }) => email);
  if (new Set(emails).size !== admins.length) {
    throw new Error("Admin email addresses must be unique.");
  }

  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 12);
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        passwordHash,
        displayName: admin.displayName,
        role: "admin",
        disabled: false,
      },
      create: {
        email: admin.email,
        passwordHash,
        displayName: admin.displayName,
        role: "admin",
      },
    });

    console.log(`Administrator ready: ${admin.email}`);
  }

  console.log("Admin accounts are ready. Passwords are not printed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# Jeux Société 🐺 — Loup-Garou Privé

Site privé de jeu de société Loup-Garou (10 personnes max).

## Stack

- **Next.js 16** + TypeScript + Tailwind
- **NextAuth.js** (connexion e-mail / mot de passe)
- **Prisma** + **PostgreSQL** (Neon)
- **Netlify** avec l’adaptateur Next.js officiel

## Déploiement sur Netlify et Neon

1. Utilisez Node.js 22 (défini dans `.nvmrc`). Dans Netlify, gardez `npm run build` comme commande de build. Netlify détecte Next.js et configure son adaptateur automatiquement.
2. Dans les variables d’environnement Netlify de Production, configurez `DATABASE_URL` (URL Neon pooled), `DATABASE_URL_UNPOOLED` (URL Neon directe), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (URL publique du site), `ADMIN1_EMAIL`, `ADMIN1_PASSWORD`, `ADMIN2_EMAIL` et `ADMIN2_PASSWORD`. Les deux mots de passe administrateur doivent contenir au moins 12 caractères.
3. Le build génère Prisma Client et compile Next.js ; il ne se connecte pas à Neon et ne lance pas de seed. Appliquez séparément les migrations avec `npm run db:migrate` et, à l'initialisation ou pour réinitialiser intentionnellement les comptes, le seed avec `npm run db:seed` depuis un environnement configuré avec les variables Neon et les mots de passe administrateur.

Le seed utilise par défaut `louchiematthieu59@gmail.com` et `timeoharlay1@gmail.com` et définit les mots de passe sur les valeurs fournies. Ne le relancez pas si vous ne souhaitez pas changer ces mots de passe. La connexion ne demande pas de validation par e-mail, mais reste protégée par mot de passe. Gardez les mots de passe, les URL de base de données et `NEXTAUTH_SECRET` dans les variables d’environnement ; ne les publiez jamais et n’utilisez pas les placeholders de `.env.example`.

## Ce qui a été retiré

- Tout Firebase (Auth, Firestore, Admin SDK)

## Structure

- Auth : NextAuth + Credentials
- Base : Prisma + PostgreSQL (Neon)
- Pages : Connexion, Accueil, Salon, Admin, Joueurs, Profil
- API sécurisées pour créer / désactiver des comptes

Le moteur de partie (création de salle, distribution des rôles, votes) est préparé dans les types et peut être branché facilement sur Prisma.

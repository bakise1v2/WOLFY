# Déploiement sur Netlify

## Préparer Supabase

1. Créez un projet Supabase et configurez son URL, sa clé publique et sa clé `service_role` dans les variables d’environnement Netlify.
2. Appliquez toutes les migrations du dossier [`../supabase/migrations`](../supabase/migrations), y compris celles des salons privés et de l’accès membre.
3. Créez une clé de signature d’au moins 32 caractères aléatoires et renseignez-la sous `PRIVATE_ACCESS_SIGNING_KEY`.
4. Générez les 12 codes d’accès depuis votre poste avec `node scripts/generate-private-access-codes.mjs`. Saisissez les douze valeurs `PRIVATE_ACCESS_*_HASH` dans Netlify et partagez les codes correspondants avec les membres. La sortie contient des secrets : ne la commitez pas et ne la partagez pas publiquement.

Les profils sont initialisés dans Supabase au premier accès. Les codes peuvent ensuite être renouvelés ou révoqués depuis l’administration. Ne configurez jamais `SUPABASE_SERVICE_ROLE_KEY` comme variable `NEXT_PUBLIC_*`.

## Déployer

Importez le dépôt dans Netlify. Définissez son répertoire de base sur le dossier contenant `package.json` et [`../netlify.toml`](../netlify.toml). Ce fichier configure Node.js 22, la commande `pnpm build` et le répertoire de publication Next.js. Ajoutez les variables serveur nécessaires dans **Site configuration → Environment variables**, puis lancez le déploiement.

Pour que les parties privées et l’accès membre fonctionnent, les variables essentielles sont :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PRIVATE_ACCESS_SIGNING_KEY`
- Les douze variables `PRIVATE_ACCESS_ADMIN_1_HASH`, `PRIVATE_ACCESS_ADMIN_2_HASH`, `PRIVATE_ACCESS_PLAYER_1_HASH` à `PRIVATE_ACCESS_PLAYER_8_HASH`, et `PRIVATE_ACCESS_RESERVE_1_HASH` / `PRIVATE_ACCESS_RESERVE_2_HASH`

Les fonctions d’IA, de synthèse vocale, d’authentification externe et de paiement nécessitent aussi leurs clés fournisseur respectives décrites dans [`.env.example`](../.env.example). La compilation n’inclut aucune valeur de secret : renseignez les vraies valeurs uniquement dans les paramètres Netlify.

## GitHub

Avant de connecter Netlify, vérifiez que le dépôt GitHub contient le dossier du projet et ses migrations, mais aucun fichier `.env.local`, code d’accès en clair, clé privée ou fichier `.private-access`. Appliquez les migrations au projet Supabase de production avant d’ouvrir le site aux joueurs.

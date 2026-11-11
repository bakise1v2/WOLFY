# Déploiement sur Render

## Web service Docker

Créez un Web Service depuis le dépôt et choisissez **Docker** comme environnement. Le Dockerfile épingle Node.js 22 et pnpm 12.18.0, copie le workspace pnpm complet et installe avec le lockfile gelé.

## Base PostgreSQL

Les salons privés et les accès utilisent PostgreSQL. Sur Render, créez ou associez une base PostgreSQL au service et configurez `DATABASE_URL` avec son URL de connexion interne. Au démarrage, le conteneur applique la migration idempotente des salons et profils avant de lancer Next.js.

Sans `DATABASE_URL`, le conteneur s’arrête en indiquant que la base est requise. Netlify Database n’est disponible que sur Netlify.

Les codes d’accès personnalisés peuvent être configurés avec les variables `PRIVATE_ACCESS_*_HASH`. Les fonctions d’IA, de synthèse vocale, d’authentification externe et de paiement nécessitent également leurs clés fournisseur si elles sont utilisées; voir [`.env.example`](../.env.example).

La connexion e-mail, les crédits et les paiements qui dépendaient de Supabase ne sont pas inclus dans la migration des parties privées.

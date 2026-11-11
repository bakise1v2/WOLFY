# Déploiement sur Netlify

## Base de données intégrée

Les salons, les joueurs, l’état des parties et les profils d’accès utilisent **Netlify Database**, sans URL ni clé de base à copier dans le code. Netlify provisionne la base et applique les migrations du dossier [`../netlify/database/migrations`](../netlify/database/migrations) lors du déploiement.

Netlify Database nécessite un forfait à crédits. Son usage du calcul et du réseau consomme des crédits. Si le déploiement signale que la base n’est pas disponible, activez **Data & Storage → Database** pour le site Netlify et vérifiez que le forfait le permet.

Les profils d’accès sont initialisés à la première utilisation. Pour attribuer des codes personnalisés, générez-les localement avec `pnpm generate:private-access-codes` et configurez les valeurs `PRIVATE_ACCESS_*_HASH` dans les variables Netlify. La sortie contient les codes privés : ne la commitez pas et ne la partagez pas publiquement. Une clé de signature facultative peut être fournie avec `PRIVATE_ACCESS_SIGNING_KEY`; sinon, elle est créée et conservée dans la base.

Le développement local continue d’utiliser le stockage fichier dans `.private-access/`. Les comptes e-mail, crédits et paiements qui dépendaient de Supabase ne sont pas inclus dans cette migration; la connexion e-mail est désactivée sans configuration Supabase.

## Déployer

Importez le dépôt dans Netlify. Définissez son répertoire de base sur le dossier contenant `package.json` et [`../netlify.toml`](../netlify.toml). Ce fichier configure Node.js 22 et `pnpm build`. Les migrations sont appliquées automatiquement avec Netlify Database.

Les fonctions d’IA et de synthèse vocale utilisent toujours les clés fournisseur décrites dans [`.env.example`](../.env.example). Renseignez les vraies valeurs de fournisseur uniquement dans les paramètres Netlify; elles ne sont pas nécessaires pour ouvrir le site ou créer un salon.

## GitHub

Avant de connecter Netlify, vérifiez que le dépôt GitHub contient les migrations, mais aucun fichier `.env.local`, code d’accès en clair, clé privée ou fichier `.private-access`.

# Djesshop

Boutique de demandes d'impression 3D sur mesure, construite avec Next.js et Supabase. Les visiteurs décrivent leur projet, choisissent l'une des sept couleurs et indiquent une quantité. Les demandes sont conservées dans Supabase et consultables dans `/admin`. Il s'agit d'une **demande de devis** : il n'y a pas de paiement ni de panier intégrés.

## Configuration

1. Créer un projet Supabase et appliquer la migration `supabase/migrations/20261030104337_djesshop_initial.sql` (SQL Editor ou Supabase CLI). Les tables sont protégées par RLS et ne sont accessibles qu'au serveur via la clé `service_role`.
2. Dans Supabase, aller dans **Authentication → Users → Add user → Create new user**. Créer le compte administrateur avec l'adresse e-mail choisie et un mot de passe fort ; confirmer l'utilisateur si demandé. Ne pas communiquer ce mot de passe dans le code ou une conversation. Il est conseillé de désactiver les inscriptions publiques dans les paramètres Auth.
3. Copier `.env.example` vers `.env.local` et renseigner les variables. `ADMIN_EMAIL` doit être exactement l'adresse du compte créé. **Ne jamais publier la clé service role, ni l'ajouter avec un préfixe `NEXT_PUBLIC_`.**
4. Installer et démarrer :

```bash
npm install
npm run dev
```

En local, le serveur n'a pas toujours accès à Supabase selon l'environnement. Pour un aperçu uniquement, sans stockage ni envoi réel :

```bash
DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Ce mode fonctionne **uniquement en développement** et l'interface indique clairement qu'aucune demande n'est transmise. Ne pas définir ces variables sur le site publié.

## Déploiement

Déployer comme application Next.js sur Vercel et ajouter `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` et `ADMIN_EMAIL` dans les variables d'environnement serveur, puis redéployer. La clé `service_role` doit être enregistrée comme variable sensible. Les variables système Vercel doivent être activées pour détecter `VERCEL=1`.

Sur Vercel, le serveur utilise l'adresse IP fournie par `x-vercel-forwarded-for`. Sur un autre hébergement, il faut placer l'application derrière un proxy de confiance qui **remplace** `X-Forwarded-For` par l'adresse réelle du visiteur et empêche tout accès direct au serveur, puis définir `TRUSTED_PROXY=forwarded`. Ne jamais activer cette option sur un serveur directement accessible : un visiteur pourrait falsifier son IP. Sans adresse fiable, ou si la vérification Supabase échoue, le service refuse l'accès en production. Les ressources statiques restent accessibles ; les pages publiques et l'API de demandes sont protégées. Les routes d'administration restent accessibles pour pouvoir annuler un blocage accidentel.

## Administration et données

Sur `/admin`, connectez-vous avec le compte Supabase créé ci-dessus. Vous pouvez consulter les 200 demandes les plus récentes, les marquer comme traitées, les supprimer, bloquer une IP depuis une demande ou saisir une adresse IPv4/IPv6 à bloquer ou débloquer. L'interface indique les 500 blocages les plus récents ; tous les blocages sont appliqués par le serveur. Une session expire après une heure au maximum.

Le formulaire informe les visiteurs que les coordonnées et l'IP sont utilisées pour traiter la demande et protéger le site. Prévoyez des mentions légales, une politique de confidentialité, une durée de conservation appropriée et les autres obligations applicables avant l'exploitation commerciale. Aucun e-mail n'est envoyé automatiquement : consultez l'administration et répondez aux clients depuis votre messagerie.

## Vérification

```bash
npm run typecheck
npm test
npm run build
```

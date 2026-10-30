# Djesshop

Boutique de demandes d'impression 3D sur mesure, construite avec Next.js et Supabase. Les visiteurs décrivent leur projet, choisissent l'une des sept couleurs, indiquent une quantité et peuvent joindre une photo facultative. Les demandes sont conservées dans Supabase et consultables dans `/admin`. Il s'agit d'une **demande de devis** : il n'y a pas de paiement ni de panier intégrés.

## Configuration

1. Créer un projet Supabase et appliquer, dans l'ordre, les migrations `supabase/migrations/20261030104337_djesshop_initial.sql`, `supabase/migrations/20261030134917_admin_push_notifications.sql` et `supabase/migrations/20261030163113_request_photos.sql` (SQL Editor ou Supabase CLI). Les tables sont protégées par RLS et ne sont accessibles qu'au serveur via la clé `service_role`.
2. Dans **Storage**, créer un bucket nommé exactement `request-photos`, **privé** (ne pas cocher Public), avec une limite de 3 MiB (3 145 728 octets) et le seul type autorisé `image/webp`. Ne créer aucune politique donnant accès aux rôles `anon` ou `authenticated` : seul le serveur doit utiliser le bucket via la clé `service_role`. Créer et supprimer les fichiers à l'aide de l'API Storage, pas par modification directe des tables Storage.
3. Dans Supabase, aller dans **Authentication → Users → Add user → Create new user**. Créer le compte administrateur avec l'adresse e-mail choisie et un mot de passe fort ; confirmer l'utilisateur si demandé. Ne pas communiquer ce mot de passe dans le code ou une conversation. Il est conseillé de désactiver les inscriptions publiques dans les paramètres Auth.
4. Copier `.env.example` vers `.env.local` et renseigner les variables. `ADMIN_EMAIL` doit être exactement l'adresse du compte créé. **Ne jamais publier la clé service role, ni l'ajouter avec un préfixe `NEXT_PUBLIC_`.**
5. Installer et démarrer :

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

Déployer comme application Next.js sur Vercel et ajouter `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL` et les trois variables VAPID décrites ci-dessous dans les variables d'environnement serveur, puis redéployer. La clé `service_role` et la clé privée VAPID doivent être enregistrées comme variables sensibles. Les variables système Vercel doivent être activées pour détecter `VERCEL=1`.

Sur Vercel, le serveur utilise l'adresse IP fournie par `x-vercel-forwarded-for`. Sur un autre hébergement, il faut placer l'application derrière un proxy de confiance qui **remplace** `X-Forwarded-For` par l'adresse réelle du visiteur et empêche tout accès direct au serveur, puis définir `TRUSTED_PROXY=forwarded`. Ne jamais activer cette option sur un serveur directement accessible : un visiteur pourrait falsifier son IP. Sans adresse fiable, ou si la vérification Supabase échoue, le service refuse l'accès en production. Les ressources statiques restent accessibles ; les pages publiques et l'API de demandes sont protégées. Les routes d'administration restent accessibles pour pouvoir annuler un blocage accidentel.

## Administration et données

Sur `/admin`, connectez-vous avec le compte Supabase créé ci-dessus. Vous pouvez consulter les 200 demandes les plus récentes, les marquer comme traitées, les supprimer, bloquer une IP depuis une demande ou saisir une adresse IPv4/IPv6 à bloquer ou débloquer. L'interface indique les 500 blocages les plus récents ; tous les blocages sont appliqués par le serveur. Une session expire après une heure au maximum. Le nombre de demandes en attente comprend toutes les demandes et s'actualise environ toutes les 30 secondes tant que l'administration est visible ; la liste reste limitée aux 200 plus récentes.

Une photo facultative (JPG, PNG ou WebP, jusqu'à 25 Mo à la sélection) est réduite dans le navigateur ; l'API limite l'envoi à 3 MiB, vérifie et réencode l'image en WebP sans métadonnées EXIF avant de la stocker. Elle n'est accessible que depuis une session administrateur, sans URL publique ni cache. Pour limiter les abus, un contrôle applicatif autorise environ 15 demandes avec photo par heure et par IP ; les envois simultanés ne sont pas synchronisés et les demandes sans photo ne sont pas affectées. Lorsqu'une demande est supprimée dans l'administration, sa photo est supprimée d'abord : si Storage est indisponible, la demande reste présente pour permettre une nouvelle tentative. En cas d'interruption ou d'échec du nettoyage après un envoi incomplet, vérifier occasionnellement les fichiers orphelins dans le bucket privé.

Le formulaire informe les visiteurs que leurs coordonnées, leur éventuelle photo et leur IP sont utilisées pour traiter la demande et protéger le site. Prévoyez des mentions légales, une politique de confidentialité, une durée de conservation appropriée et les autres obligations applicables avant l'exploitation commerciale. Aucun e-mail n'est envoyé automatiquement : consultez l'administration et répondez aux clients depuis votre messagerie.

## Notifications administrateur

Pour activer les notifications sur un nouvel hébergement :

1. Appliquer les migrations Supabase et générer **une seule paire de clés VAPID** avec `npx web-push generate-vapid-keys`.
2. Définir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` (par exemple `mailto:admin@exemple.fr`) côté serveur et redéployer. Ne jamais publier la clé privée, l'ajouter au dépôt ou lui donner un préfixe `NEXT_PUBLIC_`. Conserver la paire : si les clés changent, chaque appareil devra réactiver ses alertes.
3. Ouvrir `/admin` en HTTPS, se connecter et cliquer sur **Activer les alertes**, puis accepter la permission du navigateur. Utiliser **Tester** pour vérifier la réception. Répéter l'opération sur chaque appareil/navigateur souhaité. **Désactiver** retire l'abonnement de cet appareil ; se déconnecter seul ne le désactive pas.

Sur iPhone/iPad, utiliser iOS/iPadOS 16.4 ou ultérieur : dans Safari, ouvrir `/admin`, toucher **Partager → Sur l'écran d'accueil**, puis ouvrir l'icône ajoutée et activer les alertes depuis cette application. Sur les autres appareils, un navigateur compatible Web Push et les autorisations du système sont nécessaires. Si les notifications ont été refusées, les réautoriser dans les réglages du navigateur ou de l'appareil. La livraison dépend du navigateur, de la connexion et des réglages du système ; une notification n'est pas une garantie de réception.

Chaque nouvelle demande enregistrée déclenche une notification générique : aucun nom, e-mail, IP ou détail client n'est affiché sur l'écran verrouillé. Les abonnements techniques sont stockés dans une table privée accessible uniquement au serveur, et les abonnements expirés sont supprimés. Aucun e-mail n'est envoyé par cette fonction.

## Vérification

```bash
npm run typecheck
npm test
npm run build
```

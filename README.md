# Second Cerveau — navigateur à mémoire visuelle et sémantique

Navigateur desktop (Electron + React) qui indexe localement le texte et l'aspect visuel des pages
visitées pour permettre une recherche en langage naturel dans tout l'historique.
Tout reste sur la machine (Local-First AI).

## Installation (utilisateurs)

Téléchargez l'installateur de la dernière version dans
[Releases](https://github.com/evanitoGit/nav_second_cerveau/releases) :

| Système | Fichier | Remarque |
|---|---|---|
| **Windows 10/11** | `Second-Cerveau-Setup-x.y.z.exe` | Installation sans droits administrateur. L'exécutable n'est pas signé : Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*. |
| **Ubuntu / Debian** | `nav-second-cerveau_x.y.z_amd64.deb` | **Recommandé sous Linux.** `sudo apt install ./nav-second-cerveau_*.deb`. Configure automatiquement le bac à sable (AppArmor sur Ubuntu 24.04+). |
| **Autres Linux** | `Second-Cerveau-x.y.z-x86_64.AppImage` | `chmod +x` puis double-clic. Sur Ubuntu 24.04+, préférez le `.deb` (AppArmor bloque le bac à sable des AppImage). |

Le navigateur se met ensuite à jour tout seul (téléchargement en arrière-plan, installation à la fermeture).
Au premier usage de la mémoire, le modèle d'IA (~120 Mo) est téléchargé une fois.

## Développement

```bash
npm install        # télécharge aussi le binaire Electron (postinstall)
npm run dev        # Vite (HMR pour l'UI) + Electron
npm run build      # typecheck + build de production dans out/
npm run dist:linux # installateurs Linux dans release/ (sous Linux)
npm run dist:win   # installateur Windows dans release/ (sous Windows)
```

Les installateurs officiels sont construits par GitHub Actions (`.github/workflows/build.yml`) sur
Windows et Linux à chaque push (onglet *Actions* → run → *Artifacts*).

**Publier une version :** changer `version` dans `package.json` et committer, puis au choix :
- GitHub → *Actions* → *Build* → *Run workflow* → cocher « Publier » ;
- ou `git tag v0.2.0 && git push origin v0.2.0`.

La CI crée un brouillon de Release, y dépose les installateurs Windows et Linux après leur autotest, puis
publie la Release seulement si tout a réussi. Les navigateurs installés se mettent alors à jour.

> Depuis Electron 45, le paquet `electron` ne télécharge plus son binaire tout seul :
> le script `postinstall` du projet appelle `install-electron`. Si tu vois `Error: Electron uninstall`,
> lance `npx install-electron`.

> **Linux (Ubuntu 23.10+ / 24.04+), en développement** : si Electron s'arrête avec
> `The SUID sandbox helper binary was found, but is not configured correctly`, lance une fois
> `npm run setup:linux-sandbox` (demande sudo). Inutile avec le `.deb`.

## Architecture

Trois processus strictement séparés :

| Couche | Rôle | Accès |
|---|---|---|
| **Main** (`src/main`) | Fenêtres, `WebContentsView` (onglets), orchestration capture / mémoire | Node.js complet |
| **Workers** (`src/main/workers`) | `memory.worker` : SQLite + fichiers · `embedding.worker` : IA | worker_threads |
| **Preload** (`src/preload`) | Pont IPC typé exposé via `contextBridge` → `window.api` | sandbox, CJS |
| **Renderer** (`src/renderer`) | UI React (barres, onglets, sidebar Mémoire) | aucun accès Node |

Les pages web tournent dans des `WebContentsView` séparées (sandbox, partition `persist:browsing`,
aucun preload) positionnées par le Main sous l'UI. L'UI mesure sa hauteur (`ResizeObserver`) et
l'envoie au Main, qui recalcule les bornes de la vue — la sidebar utilisera le même mécanisme (`right`).

## Arborescence (✅ = présent, ⏳ = étapes suivantes)

```
.
├── electron.vite.config.ts          ✅ build main / preload / renderer
├── tsconfig.{json,node.json,web.json} ✅
├── electron-builder.yml             ✅ installateurs Windows / Linux, fuses de sécurité
├── build/                           ✅ icône (svg, png, ico)
├── .github/workflows/build.yml      ✅ CI : build + autotest Windows et Linux, releases
└── src/
    ├── shared/                      ✅ code partagé (aucune dépendance Electron)
    │   ├── ipc.ts                   ✅ noms des canaux + interface BrowserApi
    │   ├── types.ts                 ✅ TabState, TabsSnapshot, ChromeInsets
    │   ├── settings.ts              ✅ types et valeurs par défaut des réglages
    │   ├── url.ts                   ✅ saisie barre d'adresse → URL / recherche
    │   └── memory.ts                ✅ statut de capture, statistiques
    ├── main/
    │   ├── index.ts                 ✅ bootstrap, single-instance lock
    │   ├── config.ts                ✅
    │   ├── menu.ts                  ✅ menu natif minimal (Édition sur macOS)
    │   ├── updater.ts               ✅ mises à jour automatiques (releases GitHub)
    │   ├── selfTest.ts              ✅ autotest du binaire (--self-test, utilisé par la CI)
    │   ├── adblock/AdBlocker.ts     ✅ bloqueur (Ghostery) sur les sessions normale et privée
    │   ├── downloads/DownloadManager.ts ✅
    │   ├── permissions/PermissionManager.ts ✅ demandes d'autorisation mémorisées par site
    │   ├── session/SessionStore.ts  ✅ restauration des onglets et de la fenêtre
    │   ├── settings/                ✅ réglages persistants et validés
    │   ├── shortcuts.ts             ✅ raccourcis clavier (before-input-event)
    │   ├── security/hardening.ts    ✅ permissions refusées, <webview> interdit
    │   ├── window/MainWindow.ts     ✅ fenêtre UI + calcul de la zone des onglets
    │   ├── tabs/
    │   │   ├── BrowserTab.ts        ✅ une WebContentsView + son état de navigation
    │   │   ├── TabManager.ts        ✅ multi-onglets, privé, réouverture, ordre
    │   │   └── contextMenu.ts       ✅ menus clic droit (pages et UI)
    │   ├── ipc/
    │   │   ├── registerBrowserIpc.ts ✅ navigation + onglets (expéditeur et arguments validés)
    │   ├── capture/
    │   │   ├── CaptureService.ts    ✅ déclenchement après 5 s sur une page (onglet actif, non privé)
    │   │   ├── extractContent.ts    ✅ Readability injecté dans un monde JS isolé
    │   │   └── screenshot.ts        ✅ capturePage → pixels bruts vers le worker
    │   ├── memory/
    │   │   ├── config.ts            ✅ délais, tailles, modèle, sites exclus
    │   │   ├── schema.ts            ✅ migrations SQLite (pages, visites, chunks, FTS5, vec0)
    │   │   ├── MemoryDatabase.ts    ✅ node:sqlite + sqlite-vec (utilisé dans le worker)
    │   │   ├── chunking.ts          ✅ découpage du texte pour les embeddings
    │   │   ├── MemoryService.ts     ✅ façade Main : relais vers les workers, file d'embeddings
    │   │   ├── queryParser.ts       ✅ périodes en français (« la semaine dernière »…) + requête FTS sûre
    │   │   ├── hybridSearch.ts      ✅ BM25 + cosinus fusionnés par Reciprocal Rank Fusion
    │   │   └── screenshotProtocol.ts ✅ schéma memory:// (miniatures, réservé à l'UI)
    │   └── workers/
    │       ├── rpc.ts               ✅ RPC typé Main ⇄ worker (redémarrage auto)
    │       ├── types.ts             ✅ contrats des workers
    │       ├── memory.worker.ts     ✅ SQLite, encodage WebP (sharp), écriture des fichiers
    │       └── embedding.worker.ts  ✅ Transformers.js (multilingual-e5-small)
    ├── preload/
    │   ├── index.ts                 ✅ window.api
    │   └── index.d.ts               ✅ typage global de window.api
    └── renderer/
        ├── index.html               ✅ CSP stricte
        └── src/
            ├── main.tsx             ✅
            ├── App.tsx              ✅
            ├── index.css            ✅ Tailwind v4
            ├── lib/                 ✅ tabDisplay, relativeTime
            ├── hooks/
            │   ├── useTabs.ts       ✅
            │   ├── useUiCommand.ts  ✅
            │   └── useMemorySearch.ts ✅ recherche avec anti-rebond
            │   ├── useChromeInsets.ts    ✅
            └── components/
                ├── NavigationBar.tsx ✅ précédent / suivant / actualiser-arrêter
                ├── AddressBar.tsx   ✅ (Échap, style navigation privée)
                ├── TabStrip.tsx     ✅ onglets, glisser-déposer, clic molette
                ├── MemoryIndicator.tsx ✅ icône cerveau : état + menu d'actions
                ├── FindBar.tsx · PermissionBar.tsx · ErrorPage.tsx ✅
                ├── DownloadsPanel.tsx · SettingsPanel.tsx ✅
                └── memory/          ✅ MemorySidebar, ResultCard
```

## Raccourcis clavier

Interceptés dans le Main (`before-input-event`), donc actifs même quand la page web a le focus.
Cmd remplace Ctrl sur macOS.

| Action | Raccourci |
|---|---|
| Nouvel onglet / onglet privé | Ctrl+T / Ctrl+Maj+N |
| Fermer / rouvrir le dernier fermé | Ctrl+W / Ctrl+Maj+T |
| Onglet suivant / précédent | Ctrl+Tab, Ctrl+PgSuiv / Ctrl+Maj+Tab, Ctrl+PgPréc |
| Aller à l'onglet 1…8 / dernier | Ctrl+1…8 / Ctrl+9 |
| Barre d'adresse | Ctrl+L, Alt+D, F6 |
| Actualiser / sans cache | Ctrl+R, F5 / Ctrl+Maj+R |
| Précédent / suivant | Alt+← / Alt+→ |
| DevTools de la page | F12, Ctrl+Maj+I |
| Mémoire (barre latérale) | Ctrl+Maj+K |
| Rechercher dans la page | Ctrl+F (Entrée / Maj+Entrée, Échap) |
| Zoom + / − / 100 % | Ctrl+= / Ctrl+− / Ctrl+0, Ctrl+molette |
| Téléchargements | Ctrl+J |
| Réglages | Ctrl+, |
| Imprimer | Ctrl+P |

La navigation privée utilise une session en mémoire, effacée à la fermeture du dernier onglet privé ;
ces onglets ne seront jamais capturés ni indexés.

## Navigateur

- **Onglets** : glisser-déposer, clic molette, onglets privés, réouverture (Ctrl+Maj+T), restauration
  au démarrage (seul l'onglet actif est chargé, les autres à la demande).
- **Clic droit** : ouvrir un lien dans un nouvel onglet / onglet privé, copier le lien, enregistrer ou copier
  une image, rechercher la sélection, couper/copier/coller, inspecter.
- **Téléchargements** : enregistrés directement dans le dossier Téléchargements, panneau avec progression,
  pause, annulation, ouverture.
- **Autorisations** : caméra, micro, notifications, position… demandées dans une barre sous l'adresse,
  mémorisées par site (pas en navigation privée), révocables dans les réglages.
- **Bloqueur de publicités et traqueurs** (moteur Ghostery, listes EasyList / EasyPrivacy, rafraîchies
  chaque semaine) : requêtes bloquées + emplacements masqués ; compteur dans la barre d'adresse.
- **Plein écran** des vidéos, **page d'erreur** réseau, **zoom** mémorisé par site, **impression**.

## Réglages (Ctrl+,)

Mémoire (pause, sites jamais mémorisés, effacement total), moteur de recherche (Google, DuckDuckGo, Qwant,
Bing, Ecosia), page d'accueil, restauration des onglets, bloqueur de publicités, autorisations des sites,
effacement des cookies et du cache, version et mises à jour. L'icône cerveau de la barre d'adresse ouvre
aussi un menu : *Ne plus mémoriser ce site*, *Oublier toutes les pages de ce site*, *Mettre en pause*.

## Mémoire : pipeline de capture

```
onglet actif + fenêtre visible + page http(s) non privée
        │  5 s sans changer d'URL (le compte à rebours repart à chaque navigation / changement d'onglet)
        ▼
Main : Readability (monde JS isolé) → texte propre · capturePage → pixels 800 px
        │  transfert sans copie
        ▼
memory.worker : WebP (sharp) · SQLite (pages, visites, chunks, FTS5) · fichiers
        │  si le texte a changé
        ▼
embedding.worker : multilingual-e5-small → vecteurs 384 d → sqlite-vec (cosinus)
```

- Une page déjà capturée il y a moins de 6 h n'est pas recapturée : seule la visite est notée.
- Pages ignorées : onglets privés, sites de connexion (`memory/config.ts`), pages de moins de 80 caractères.
- L'icône cerveau de la barre d'adresse indique l'état : gris = en attente, bleu = mémorisée.
- Le modèle d'embeddings (~120 Mo) est téléchargé depuis Hugging Face au premier besoin, puis reste en cache.
  Hors ligne, les pages restent « en attente » et sont vectorisées plus tard (nouvel essai toutes les 60 s et au démarrage).
- Pour tester sans télécharger le modèle : `SECOND_CERVEAU_FAKE_EMBEDDINGS=1 npm run dev` (vecteurs factices).

**SQLite :** on utilise `node:sqlite`, le module SQLite intégré à Node 24 (embarqué dans Electron 45),
au lieu de `better-sqlite3` : même API synchrone, mais aucun module natif à recompiler pour Electron.
sqlite-vec est chargé comme extension (binaire précompilé fourni par npm).

## Mémoire : recherche

Bouton cerveau de la barre d'outils ou **Ctrl+Maj+K**. On décrit la page en langage naturel :
« l'article avec un graphique bleu sur l'optimisation SQL lu la semaine dernière ».

1. **Période** : l'expression temporelle est extraite (aujourd'hui, hier, avant-hier, cette semaine,
   la semaine dernière, ce mois-ci, le mois dernier, il y a N jours/semaines/mois, les N derniers jours,
   lundi dernier, en mars…) et filtre les visites.
2. **Mots-clés** : FTS5/BM25 sur titre (×8), URL (×2) et contenu, insensible aux accents, en préfixe.
   Les mots vides (« retrouve », « article », « avec »…) sont ignorés ; la saisie est assainie (aucune syntaxe FTS injectable).
3. **Sens** : la requête est vectorisée par le même modèle (préfixe « query: ») et comparée aux chunks (sqlite-vec).
   Les résultats trop éloignés du meilleur sont écartés (`SEMANTIC_*` dans `memory/config.ts`).
4. **Fusion** : Reciprocal Rank Fusion des deux classements. Si l'IA n'est pas prête en 4 s, mots-clés seuls.

Résultats : miniature, titre, site, date de visite, extrait surligné, badges « mots-clés » / « sens ».
Entrée ou clic : ouvrir (Ctrl/clic molette : en arrière-plan). Icône corbeille : **oublier** la page
(texte, vecteurs, visites et capture supprimés).

Les miniatures sont servies par le schéma privé `memory://`, enregistré uniquement sur la session de l'UI :
les pages web ne peuvent pas y accéder.

## Données locales

Dans le dossier de données (Linux : `~/.config/nav-second-cerveau/`, Windows : `%APPDATA%\nav-second-cerveau`) :

- `memory/memory.db` — base SQLite (WAL)
- `memory/screenshots/<id>.webp` — dernière capture de chaque page
- `models/` — cache du modèle d'embeddings

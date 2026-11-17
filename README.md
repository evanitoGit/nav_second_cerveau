# Second Cerveau — navigateur à mémoire visuelle et sémantique

Navigateur desktop (Electron + React) qui indexe localement le texte et l'aspect visuel des pages
visitées pour permettre une recherche en langage naturel dans tout l'historique.
Tout reste sur la machine (Local-First AI).

## Démarrage

```bash
npm install        # télécharge aussi le binaire Electron (postinstall)
npm run dev        # Vite (HMR pour l'UI) + Electron
npm run build      # typecheck + build de production dans out/
npm run preview    # lance le build de production
```

> Depuis Electron 45, le paquet `electron` ne télécharge plus son binaire tout seul :
> le script `postinstall` du projet appelle `install-electron`. Si tu vois `Error: Electron uninstall`,
> lance `npx install-electron`.

> **Linux (Ubuntu 23.10+ / 24.04+)** : si Electron s'arrête avec
> `The SUID sandbox helper binary was found, but is not configured correctly`, lance une fois
> `npm run setup:linux-sandbox` (demande sudo). Le script ajoute un profil AppArmor pour le binaire
> Electron du projet. On ne désactive **pas** le bac à sable (`--no-sandbox`) : ce navigateur charge
> des pages web non fiables.

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
├── electron-builder.yml             ⏳ packaging
├── resources/                       ⏳ icônes
└── src/
    ├── shared/                      ✅ code partagé (aucune dépendance Electron)
    │   ├── ipc.ts                   ✅ noms des canaux + interface BrowserApi
    │   ├── types.ts                 ✅ TabState, TabsSnapshot, ChromeInsets
    │   ├── url.ts                   ✅ saisie barre d'adresse → URL / recherche Google
    │   └── memory.ts                ✅ statut de capture, statistiques
    ├── main/
    │   ├── index.ts                 ✅ bootstrap, single-instance lock
    │   ├── config.ts                ✅
    │   ├── menu.ts                  ✅ menu natif minimal (Édition sur macOS)
    │   ├── shortcuts.ts             ✅ raccourcis clavier (before-input-event)
    │   ├── security/hardening.ts    ✅ permissions refusées, <webview> interdit
    │   ├── window/MainWindow.ts     ✅ fenêtre UI + calcul de la zone des onglets
    │   ├── tabs/
    │   │   ├── BrowserTab.ts        ✅ une WebContentsView + son état de navigation
    │   │   └── TabManager.ts        ✅ multi-onglets, privé, réouverture, ordre
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
                ├── MemoryIndicator.tsx ✅ icône cerveau : en attente / mémorisée / ignorée
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

La navigation privée utilise une session en mémoire, effacée à la fermeture du dernier onglet privé ;
ces onglets ne seront jamais capturés ni indexés.

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

Dans `app.getPath('userData')` (sous Linux : `~/.config/nav-second-cerveau/`) :

- `memory/memory.db` — base SQLite (WAL)
- `memory/screenshots/<id>.webp` — dernière capture de chaque page
- `models/` — cache du modèle d'embeddings

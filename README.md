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
| **Main** (`src/main`) | Fenêtres, `WebContentsView` (onglets), base SQLite, IA, workers | Node.js complet |
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
    │   └── memory.ts                ⏳ types MemoryEntry, SearchResult
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
    │   │   └── registerMemoryIpc.ts ⏳
    │   ├── capture/                 ⏳ étape 3
    │   │   ├── DwellTracker.ts      ⏳ déclenchement après 5 s sur une page
    │   │   ├── extractContent.ts    ⏳ injection Readability (monde isolé)
    │   │   └── screenshot.ts        ⏳ capturePage → WebP
    │   ├── memory/                  ⏳ étape 4
    │   │   ├── db.ts                ⏳ better-sqlite3 + sqlite-vec + FTS5
    │   │   ├── migrations/          ⏳
    │   │   ├── MemoryRepository.ts  ⏳
    │   │   └── hybridSearch.ts      ⏳ BM25 + cosinus (Reciprocal Rank Fusion)
    │   └── workers/                 ⏳ worker_threads (rien de lourd sur le thread principal)
    │       ├── ingest.worker.ts     ⏳ écriture disque / DB
    │       └── embedding.worker.ts  ⏳ Transformers.js (all-MiniLM-L6-v2)
    ├── preload/
    │   ├── index.ts                 ✅ window.api
    │   └── index.d.ts               ✅ typage global de window.api
    └── renderer/
        ├── index.html               ✅ CSP stricte
        └── src/
            ├── main.tsx             ✅
            ├── App.tsx              ✅
            ├── index.css            ✅ Tailwind v4
            ├── lib/tabDisplay.ts    ✅
            ├── hooks/
            │   ├── useTabs.ts       ✅
            │   ├── useUiCommand.ts  ✅
            │   ├── useChromeInsets.ts    ✅
            └── components/
                ├── NavigationBar.tsx ✅ précédent / suivant / actualiser-arrêter
                ├── AddressBar.tsx   ✅ (Échap, style navigation privée)
                ├── TabStrip.tsx     ✅ onglets, glisser-déposer, clic molette
                └── memory/          ⏳ MemorySidebar, SearchResultCard
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

La navigation privée utilise une session en mémoire, effacée à la fermeture du dernier onglet privé ;
ces onglets ne seront jamais capturés ni indexés.

## Données locales (prévu)

`app.getPath('userData')/` → `memory.db` (SQLite) et `screenshots/<id>.webp`.

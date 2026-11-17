# Second Cerveau — navigateur à mémoire visuelle et sémantique

Navigateur desktop (Electron + React) qui indexe localement le texte et l'aspect visuel des pages
visitées pour permettre une recherche en langage naturel dans tout l'historique.
Tout reste sur la machine (Local-First AI).

## Démarrage

```bash
npm install
npm run dev        # Vite (HMR pour l'UI) + Electron
npm run build      # typecheck + build de production dans out/
npm run preview    # lance le build de production
```

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
    │   ├── types.ts                 ✅ NavigationState, ChromeInsets
    │   ├── url.ts                   ✅ saisie barre d'adresse → URL / recherche Google
    │   └── memory.ts                ⏳ types MemoryEntry, SearchResult
    ├── main/
    │   ├── index.ts                 ✅ bootstrap, single-instance lock
    │   ├── config.ts                ✅
    │   ├── security/hardening.ts    ✅ permissions refusées, <webview> interdit
    │   ├── window/MainWindow.ts     ✅ fenêtre UI + layout de la WebContentsView
    │   ├── tabs/
    │   │   ├── BrowserTab.ts        ✅ une WebContentsView + son état de navigation
    │   │   └── TabManager.ts        ⏳ étape 2 : multi-onglets
    │   ├── ipc/
    │   │   ├── registerNavigationIpc.ts ✅ (validation de l'expéditeur)
    │   │   ├── registerTabsIpc.ts   ⏳
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
            ├── hooks/
            │   ├── useNavigationState.ts ✅
            │   ├── useChromeInsets.ts    ✅
            │   └── useTabs.ts       ⏳
            └── components/
                ├── NavigationBar.tsx ✅ précédent / suivant / actualiser-arrêter
                ├── AddressBar.tsx   ✅ (Ctrl/Cmd+L, Échap)
                ├── TabStrip.tsx     ⏳
                └── memory/          ⏳ MemorySidebar, SearchResultCard
```

## Données locales (prévu)

`app.getPath('userData')/` → `memory.db` (SQLite) et `screenshots/<id>.webp`.

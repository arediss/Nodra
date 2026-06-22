# Strata plugins — dev & publish guide

> **Nouveau ?** Pour le parcours complet pas-à-pas (« créer un plugin de A à Z » :
> scaffold → `register(host)` → build → boucle de dev avec hot-reload automatique →
> publication), suis **[`PLUGIN-AUTHORING.md`](./PLUGIN-AUTHORING.md)**. Ce document-ci
> est l'**aide-mémoire** (anatomie, capacités, commandes, publication).

Strata is a **minimal core + downloadable plugins** app (the SimplyTerm model). The
core ships **empty of pluggable things**: no icon packs, no importers/exporters, no
extra panels — only the canvas, collaboration, sharing, persistence, the generic
node types (group/note/comment/text/icon/erTable + the UnknownNode fallback) and
the native JSON export. Everything else is a plugin loaded **from disk** at startup.

```
                 ┌─ Desktop (Tauri) ─► Rust commands read <app-data>/plugins/
 <app-data>/ ────┤
   plugins/      └─ strata -serve (axum) ─► GET /api/plugins[/:id/*] ─► web clients
                                             (fetch ► blob-URL ► register(host))
```

A plugin reaches the core **only through the host SDK** passed to `register(host)`
— never by importing `../../src`. The build enforces this.

## Anatomy of a plugin

```
plugins/<name>/
  manifest.json     # id (reverse-domain), name, version, api_version, permissions[], main: "index.js"
  index.ts(x)       # exports register(host) — the entry point
  ...               # any helper .ts, .css, .json, assets/
```

`register(host)` registers contributions; each is permission-gated by `manifest.permissions`:

| Capability | Permission | Host call |
|---|---|---|
| Icon/block pack | `blocks` | `host.blocks.register(entries)` |
| Custom node type | `node-types` | `host.nodeTypes.register(type, Component)` |
| Importer | `importers` | `host.importers.register({ id, label, extensions?, detect?, parse })` |
| Exporter | `exporters` | `host.exporters.register({ id, label, ext, serialize })` |
| Right-side panel | `panels` | `host.panels.register({ id, side:'right', component, title?, icon? })` |
| Read the diagram | `flow-read` | `host.flow.getNodes/getEdges/getSelection/toDiagram/subscribe/fitView` |
| Write the diagram | `flow-write` | `host.flow.setNodes/setEdges/loadDiagram/selectEdge` |
| Toasts / open panel | — | `host.ui.openPanel/closePanel/showToast` |
| Stable ids | — | `host.utils.newId()` |
| Asset URL | — | `await host.assetUrl(rel)` (installed → `/api/plugins/<id>/<rel>` ; dev → object URL) |

A minimal reference plugin — a block, a node type and a panel — is walked through in
[PLUGIN-AUTHORING.md](PLUGIN-AUTHORING.md). (The core repo ships no plugins: develop yours in a
folder of your choice and point the app at it via Settings → Developer.)

### Self-contained rules (enforced by the build)
- **No value imports from `../../src`.** Use the host SDK. (`import type` from the core
  is fine — it's erased by the build.)
- **React / @xyflow/react / @iconify/react are provided by the host** (one instance on
  the page) — import them normally; they are not bundled. Subpaths (e.g.
  `react-dom/client`) are rejected.
- Third-party libs (dagre, nanoid…) are inlined. CSS imports are inlined as a
  self-injecting `<style>`.
- A **panel component gets no props** — capture `host` in a closure created inside
  `register(host)`. For live updates, re-render via `host.flow.subscribe`.

## Dev loop (test before publishing)

```bash
# Build one plugin -> plugins/<name>/dist/index.js (+ plugin.zip + sha256)
npm run build:plugin -- plugins/aws-icons          # add --dev for sourcemaps, --no-zip to skip the zip

# Build + install into the app-data plugins dir (what the app reads):
npm run plugins:install -- plugins/aws-icons        # one
npm run plugins:install -- --all                    # every plugins/* with a source entry
npm run plugins:install -- --list                   # show the install dir + installed ids

# Then run the app and RELOAD to activate:
npm run tauri dev                                    # desktop: reads <app-data>/plugins
#   or web:
npm run build && cargo run --manifest-path src-tauri/Cargo.toml -- -serve --port 1420
#   -> open http://localhost:1420  (plugins served over /api/plugins)
```

Install/remove from inside the app (Settings → Plugins) shows a **“redémarre pour
activer”** banner — reload to load the new set. Opening a diagram that needs plugins
you don’t have shows a **missing-plugins banner** (the data is never lost: unknown
nodes render via the UnknownNode fallback until you install).

## Boucle de dev rapide (dossier de dev + watch + hot-reload AUTOMATIQUE)

La boucle la plus rapide : édite la source → `esbuild --watch` reconstruit `dist/` →
l'app **recharge automatiquement** le plugin changé. **Aucun clic, aucun redémarrage,
aucun repackaging, aucune copie.** L'app charge les plugins **directement** depuis un
dossier de dev que tu choisis (chaque sous-dossier contenant un plugin **construit**)
et surveille leur `dist/`.

```bash
# 1) Lance le build en continu pour ton plugin (reconstruit dist/ à chaque changement) :
npm run build:plugin -- plugins/<name> --watch
#    -> logue « rebuilt <id> » à chaque sauvegarde ; le zip est sauté en mode watch.
```

Puis, **une seule fois**, dans l'app : **Réglages → Développeur →
« Choisir le dossier de dev »** et pointe-le sur le dossier qui contient tes plugins
(p. ex. le dossier `plugins/` du dépôt). Chaque sous-dossier avec un build est détecté
via `<sub>/dist/manifest.json` (layout `build:plugin`, préféré) ou un `<sub>/manifest.json`
à plat.

Ensuite, **code** : à chaque sauvegarde, `--watch` reconstruit `dist/`, et le watcher
de l'app (~1,5 s) **recharge automatiquement** ce plugin (toast « `<id>` rechargé ») —
sans toucher aux plugins installés, sans redémarrer l'app et **sans la bannière
« redémarre pour activer »**. Le bouton **« Recharger (manuel) »** reste un secours.

L'onglet **Développeur** liste aussi les **plugins détectés** avec un **interrupteur
activer/désactiver par plugin** (désactivé = déchargé tout de suite + ignoré au
prochain démarrage, l'état est persisté) et leur statut (`chargé` / `en attente` /
`désactivé`).

> **Desktop uniquement** (a besoin du système de fichiers + de la boîte de dialogue
> Tauri). Le chargement est **direct** (rien n'est copié dans `<app-data>/plugins`).
> Note : pour un plugin de dev, `host.assetUrl(rel)` lit l'asset depuis le dossier de
> dev via IPC Tauri et renvoie une **`Promise<string>`** (object URL) — il faut donc
> l'`await` : `const url = await host.assetUrl('icons/foo.svg')`. Pour un plugin
> **installé**, `assetUrl` renvoie directement la chaîne `/api/plugins/<id>/<rel>` ;
> `await` fonctionne dans les deux cas.

## Tester ton plugin sur une instance (dev ou prod)

Deux chemins, selon que tu as le dépôt sous la main ou non.

**(a) Avec le dépôt (dev) — install direct dans le dossier app-data :**

```bash
npm run build:plugin -- plugins/<name>      # -> plugins/<name>/dist/index.js (+ plugin.zip)
npm run plugins:install -- plugins/<name>   # copie dans <app-data>/plugins/<id>
# puis recharge l'app (la bannière « redémarre pour activer » apparaît)
```

**(b) Sur n'importe quelle instance, SANS le dépôt (y compris un build prod) —
install depuis l'app, via le fichier `plugin.zip` :**

```bash
npm run build:plugin -- plugins/<name>      # -> plugins/<name>/plugin.zip
```

Puis dans l'app : **Réglages → Développeur → « Installer depuis un fichier (.zip) »** →
choisis `plugins/<name>/plugin.zip` → la bannière « redémarre pour activer » apparaît →
recharge l'app. (Onglet **Développeur**, visible uniquement sur l'app bureau : l'install
locale a besoin du système de fichiers + de la boîte de dialogue Tauri.)

> C'est exactement ce même `plugin.zip` qui est attaché à une **Release GitHub** pour le
> registre (section suivante) — tu testes donc l'artefact final avant de le publier.

## Publish to the registry (you do this — not automated)

Each plugin becomes its **own git repo** (a `.git` per `plugins/<name>/`, gitignored
from the main repo). To release:

1. `npm run build:plugin -- plugins/<name>` → grab `plugins/<name>/plugin.zip` + the
   printed `sha256`.
2. Create a GitHub repo for the plugin (under `arediss`), push the source, and attach
   `plugin.zip` to a GitHub **Release**.
3. Add the repo to the registry: `github.com/arediss/strata-plugin-registry` →
   `repos.json` (approved repo + permitted capabilities) → PR. The registry’s
   GitHub Action runs `registry/scripts/build-index.mjs` to regenerate `plugins.json`
   (download URL + sha256) after review.
4. Users install it from Settings → Plugins (registry list), checksum-verified.

> Nothing here is pushed automatically — `git`/GitHub steps are intentionally manual
> so plugin code is reviewed before it ships.

## What each diagram records

A saved diagram (`DiagramFile.plugins`) lists the plugins it uses, derived at save
time from the node types and icon refs it contains. Opening it elsewhere compares that
list to what’s installed and offers to install the missing ones.

# Créer un plugin Strata de A à Z

Ce tutoriel pas-à-pas couvre **tout le cycle de vie** d'un plugin Strata : créer le
dossier, écrire `register(host)`, construire, le tester en boucle de dev avec
hot-reload automatique, puis publier sur le registre. Tout est **copiable-collable**.

> Référence rapide : [`PLUGINS-DEV.md`](./PLUGINS-DEV.md) (anatomie, capacités, publication).
> Ce document-ci est le **parcours complet** ; garde l'autre sous la main comme aide-mémoire.

Strata est un **cœur minimal + plugins téléchargeables**. Le cœur n'embarque
**aucune** chose enfichable (pas de packs d'icônes, pas d'imports/exports, pas de
panneaux additionnels) : tout passe par un plugin qui atteint le cœur **uniquement
via le SDK `host`** transmis à `register(host)`. Jamais d'`import ../../src`.

---

## 1. Échafaudage (scaffold)

Un plugin vit dans son propre sous-dossier sous `plugins/` :

```
plugins/mon-plugin/
  manifest.json     # métadonnées + permissions (obligatoire)
  index.tsx         # exporte register(host) — le point d'entrée
  styles.css        # optionnel (inliné dans le bundle)
  assets/           # optionnel (icônes/images, copiées telles quelles)
```

Crée le dossier et le manifeste :

```bash
mkdir -p plugins/mon-plugin
```

### `manifest.json` — champs expliqués

```json
{
  "id": "com.exemple.mon-plugin",
  "name": "Mon Plugin",
  "version": "1.0.0",
  "api_version": "1.0.0",
  "main": "index.js",
  "permissions": ["blocks", "node-types", "panels", "flow-read"],
  "description": "Un pack de blocs + un type de nœud + un panneau.",
  "author": "Toi",
  "category": "exemple",
  "keywords": ["exemple", "demo"]
}
```

| Champ | Rôle |
|---|---|
| `id` | **Reverse-domain**, unique, `[A-Za-z0-9._-]` uniquement (jamais de séparateur de chemin). Nomme le dossier d'installation. |
| `name` | Nom affiché dans le catalogue / la liste. |
| `version` | **semver** (`MAJOR.MINOR.PATCH`). |
| `api_version` | semver du SDK host ciblé. Le **MAJOR** est comparé à celui du cœur (`1.0.0` aujourd'hui) ; un MAJOR différent fait **refuser** le plugin. |
| `main` | Module d'entrée ESM qui exporte `register(host)`. Le build force toujours `index.js` dans le `dist/`. |
| `permissions` | Liste blanche des capacités (voir ci-dessous). Une capacité sans sa permission est un **no-op** et logue un avertissement. |
| `description`, `author`, `category`, `keywords` | Métadonnées facultatives pour le catalogue. |

### Permissions disponibles

| Permission | Débloque |
|---|---|
| `blocks` | `host.blocks.register(entries)` — pack d'icônes/blocs |
| `node-types` | `host.nodeTypes.register(type, Component)` — type de nœud personnalisé |
| `importers` | `host.importers.register({ id, label, extensions?, detect?, parse })` |
| `exporters` | `host.exporters.register({ id, label, ext, icon?, serialize })` |
| `panels` | `host.panels.register({ id, side:'right', component, title?, icon? })` |
| `commands` | `host.commands.register({ id, label, icon?, run })` |
| `flow-read` | `host.flow.getNodes/getEdges/getSelection/toDiagram/subscribe/fitView` |
| `flow-write` | `host.flow.setNodes/setEdges/loadDiagram/selectEdge` |

Non gardés (toujours disponibles) : `host.ui.openPanel/closePanel/showToast`,
`host.utils.newId()`, `host.assetUrl(rel)`, `host.log(...)`.

> Modèle de confiance V1 : les permissions servent à la **clarté** (comme SimplyTerm),
> ce n'est **pas** un bac à sable de sécurité. Un plugin chargé tourne avec l'accès
> applicatif complet ; l'isolation dure est une brique ultérieure.

---

## 2. Écrire `register(host)` — exemple complet

Voici un `index.tsx` qui enregistre **trois** contributions : un **pack de blocs**,
un **type de nœud** (avec des handles @xyflow), et un **panneau** qui lit le flow.
Crée `plugins/mon-plugin/index.tsx` :

```tsx
// Le plugin atteint le cœur UNIQUEMENT via le SDK `host`. Les imports de type
// depuis le cœur sont autorisés (effacés par le build) ; les imports de VALEUR
// depuis ../../src sont interdits.
import { Icon } from '@iconify/react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Host } from '../../src/plugins/types';
import './styles.css'; // inliné comme <style> auto-injecté

// — Un type de nœud personnalisé. @xyflow est fourni par le host (une seule
//   instance sur la page), donc Handle/Position se branchent sur le même
//   provider/store que le canvas.
function MonNode({ data }: NodeProps) {
  const label = (data as { label?: string }).label ?? 'Mon nœud';
  return (
    <div className="mon-node">
      <Handle type="target" position={Position.Top} />
      <Icon icon="mdi:cube-outline" /> {label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function register(host: Host) {
  host.log('mon-plugin chargé');

  // (a) Pack de blocs — chaque entrée est un IconEntry (id, name, provider,
  //     category, source, ref). source:'iconify' => ref = un id Iconify.
  host.blocks.register([
    {
      id: 'mon-plugin:cube',
      name: 'Cube',
      provider: 'exemple',
      category: 'demo',
      source: 'iconify',
      ref: 'mdi:cube-outline',
    },
  ]);

  // (b) Type de nœud — la clé "mon-node" devient le node.type côté diagramme.
  host.nodeTypes.register('mon-node', MonNode as never);

  // (c) Panneau latéral droit — le composant ne reçoit AUCUNE prop : il capture
  //     `host` dans la fermeture. Pour des mises à jour live, réabonne-toi via
  //     host.flow.subscribe (nécessite flow-read).
  const MonPanneau = () => {
    const n = host.flow.getNodes().length;
    return (
      <div style={{ padding: 12, fontSize: 13 }}>
        <Icon icon="mdi:information-outline" /> {n} nœud(s) sur le canvas.
      </div>
    );
  };

  host.panels.register({
    id: 'mon-plugin',
    side: 'right',
    title: 'Mon Plugin',
    icon: 'mdi:cube-outline',
    component: MonPanneau,
  });
}
```

Et `plugins/mon-plugin/styles.css` :

```css
.mon-node {
  padding: 8px;
  border: 1px solid var(--hairline, #ccc);
  border-radius: 8px;
  background: #fff;
}
```

> Ce plugin de référence (un bloc + un type de nœud + un panneau) est entièrement reproduit
> ci-dessus — copie-le comme point de départ. (Le repo core n'embarque aucun plugin : développe
> le tien dans un dossier de ton choix et pointe l'app dessus via Réglages → Développeur.)

### Variante : un exporter

```tsx
host.exporters.register({
  id: 'mon-plugin:txt',
  label: 'Texte (.txt)',
  ext: 'txt',
  icon: 'mdi:file-document-outline',
  serialize(doc) {
    return doc.nodes.map((n) => n.id).join('\n'); // string ou Blob
  },
});
```

### Variante : un importer

```tsx
host.importers.register({
  id: 'mon-plugin:csv',
  label: 'CSV',
  extensions: ['csv'],
  detect: (text) => text.includes(','),
  parse(text) {
    const nodes = text.split('\n').map((line, i) => ({
      id: host.utils.newId(),
      type: 'icon',
      position: { x: 0, y: i * 80 },
      data: { label: line },
    }));
    return { diagram: { version: 1, name: 'CSV', nodes, edges: [] }, note: `Import : ${nodes.length}` };
  },
});
```

---

## 3. Règles d'auto-suffisance (vérifiées par le build)

- **Aucun import de VALEUR depuis `../../src`.** Passe par le SDK `host`. Un
  `import type` du cœur est autorisé (il est effacé avant la résolution).
- **`react`, `@xyflow/react`, `@iconify/react` sont fournis par le host** (une seule
  instance sur la page) — importe-les normalement, ils ne sont **pas** bundlés. Les
  **sous-chemins** (p. ex. `react-dom/client`) sont **rejetés** (sinon une 2e copie
  de React casserait hooks/contexte).
- Les **autres libs** (dagre, nanoid…) sont **inlinées** dans le bundle.
- Les **imports CSS** sont inlinés en un `<style>` auto-injecté — le `dist/index.js`
  porte ses propres styles, rien à servir en plus.
- Un **composant de panneau ne reçoit aucune prop** — capture `host` dans une
  fermeture créée dans `register(host)`. Pour du live, re-render via
  `host.flow.subscribe`.
- Les **assets** : utilise `await host.assetUrl('assets/foo.svg')`. Pour un plugin
  **installé** ça renvoie directement `/api/plugins/<id>/assets/foo.svg` (string) ;
  pour un plugin **de dev** ça lit l'octet via IPC Tauri et renvoie une
  `Promise<string>` (object URL). `await` marche dans les deux cas.

---

## 4. Construire le plugin

```bash
# Construit UN plugin -> plugins/<name>/dist/index.js (+ dist/manifest.json,
# assets whitelisted) + plugin.zip + son sha256.
npm run build:plugin -- plugins/mon-plugin

# Options :
npm run build:plugin -- plugins/mon-plugin --dev      # sourcemaps inline, pas de minification
npm run build:plugin -- plugins/mon-plugin --no-zip   # saute le plugin.zip
npm run build:plugin -- plugins/mon-plugin --watch    # reconstruit dist/ à CHAQUE changement (boucle de dev)
```

Le build (esbuild) :
- bundle en **ESM** un seul fichier,
- marque `react`/`@xyflow/react`/`@iconify/react` **externes** (shimés sur
  `window.__strata`),
- **refuse** à la compilation tout import de valeur du cœur ou tout sous-chemin d'un
  package partagé,
- inline le CSS, copie les assets whitelistés (`.svg/.png/.json/.woff2/...` et le
  dossier `assets/`).

---

## 5. La boucle de dev — hot-reload AUTOMATIQUE

C'est le confort principal : **tu ne cliques jamais « Recharger » pendant le dev
normal.** L'app charge les plugins **construits directement** depuis un dossier de
dev que tu choisis (rien n'est copié dans `<app-data>/plugins`), surveille leur
`dist/` et recharge **automatiquement** le plugin dont le code change.

> **Desktop uniquement** (a besoin du système de fichiers + de la boîte de dialogue
> Tauri).

**Étape 1 — lance le build en continu :**

```bash
npm run build:plugin -- plugins/mon-plugin --watch
#  -> logue « rebuilt <id> » à chaque sauvegarde ; le zip est sauté en mode watch.
```

**Étape 2 — une seule fois, dans l'app :** ouvre **Réglages → Développeur →
« Choisir le dossier de dev »** et pointe-le sur le dossier qui contient tes plugins
(p. ex. le dossier `plugins/` du dépôt). Chaque sous-dossier avec un build est
détecté via `<sub>/dist/manifest.json` (layout `build:plugin`, préféré) ou un
`<sub>/manifest.json` à plat.

**Étape 3 — code.** À chaque sauvegarde : `--watch` reconstruit `dist/`, le watcher
de l'app détecte le changement (~1,5 s) et **recharge ce plugin tout seul** — un
toast « `<id>` rechargé » confirme. Aucun redémarrage, aucune copie, aucune bannière
« redémarre pour activer ».

L'onglet **Développeur** affiche :
- le **dossier de dev** courant + un bouton « Recharger (manuel) » de secours,
- l'indicateur **« Hot-reload actif »** quand un dossier est défini,
- la liste des **plugins détectés**, chacun avec un **interrupteur** activé/désactivé
  et un statut (`chargé` / `en attente` / `désactivé`).

### Activer / désactiver un plugin

Bascule l'interrupteur d'un plugin détecté : désactivé, il est **déchargé**
immédiatement et **ignoré** par le hot-reload et au prochain démarrage (l'état est
persisté). Réactive-le pour le recharger à chaud. Pratique pour isoler un plugin
sans toucher au dossier ni au build.

Comportements du watcher :
- au **boot**, les signatures sont **amorcées sans recharger** (le démarrage les a
  déjà chargés) ; seuls les changements **ultérieurs** déclenchent un reload,
- un plugin **activé qui apparaît** (nouveau `dist/`) est chargé automatiquement,
- un plugin de dev **chargé qui disparaît** de la liste est déchargé,
- un plugin **désactivé** n'est jamais rechargé à chaud.

---

## 6. Tester l'artefact final (`plugin.zip`)

Avant de publier, teste **exactement** le zip qui partira sur la Release :

```bash
npm run build:plugin -- plugins/mon-plugin   # -> plugins/mon-plugin/plugin.zip (+ sha256)
```

Dans l'app : **Réglages → Développeur → « Installer depuis un fichier (.zip) »** →
choisis `plugins/mon-plugin/plugin.zip`. La bannière « redémarre pour activer »
apparaît → recharge l'app. C'est le **même** `plugin.zip` qui sera attaché à la
Release GitHub.

> Alternative avec le dépôt : `npm run plugins:install -- plugins/mon-plugin` copie
> le build dans `<app-data>/plugins/<id>` (puis recharge l'app). `--all` installe
> tous les `plugins/*` ; `--list` montre le dossier d'install + les ids installés.

---

## 7. Publier sur le registre (manuel — pas automatisé)

Chaque plugin devient **son propre dépôt git** (un `.git` par `plugins/<name>/`,
gitignoré du dépôt principal).

1. `npm run build:plugin -- plugins/mon-plugin` → récupère `plugin.zip` + le `sha256`
   imprimé.
2. Crée un dépôt GitHub pour le plugin (sous `arediss`), pousse la source, et attache
   `plugin.zip` à une **Release** GitHub.
3. Ajoute le dépôt au registre : `github.com/arediss/strata-plugin-registry` →
   `repos.json` (dépôt approuvé + capacités permises) → PR. L'Action GitHub du
   registre régénère `plugins.json` (URL de download + sha256) après revue.
4. Les utilisateurs l'installent depuis **Réglages → Plugins** (liste du registre),
   avec **vérification du checksum**.

> Rien n'est poussé automatiquement — les étapes `git`/GitHub sont volontairement
> manuelles pour que le code soit revu avant d'être diffusé.

---

## Récapitulatif du cycle

```
scaffold (manifest + index)  ─►  npm run build:plugin -- … --watch
        │                              │
        ▼                              ▼
  Réglages → Développeur → dossier de dev  ──►  hot-reload AUTO à chaque sauvegarde
        │                              (toggle activer/désactiver par plugin)
        ▼
  test du plugin.zip (install fichier)  ─►  Release GitHub  ─►  registre (PR)
```

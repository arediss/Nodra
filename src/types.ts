import type { Node, Edge } from '@xyflow/react';

/**
 * Shared data contracts for the whole app.
 * NOTE: these MUST be `type` aliases (not `interface`) so they satisfy
 * @xyflow/react's `Record<string, unknown>` generic constraint.
 */

export type IconSource = 'iconify' | 'svg';

/** A node that renders a single provider/service/brand icon. */
export type IconNodeData = {
  label: string;
  /** iconify icon id (e.g. "logos:aws-lambda") OR a url / data-url for svg source */
  iconRef: string;
  iconSource: IconSource;
  /** plugin-defined provider category, purely informative */
  provider?: string;
  /** small secondary line under the label (e.g. an account id) */
  sublabel?: string;
  /** accent / label color, any CSS color */
  accent?: string;
  /** free-form labels (e.g. 'production', 'critical', 'deprecated') */
  tags?: string[];
  /** arbitrary key/value metadata (owner, environment, cost-center…) */
  metadata?: Record<string, string>;
  /** source IaC address when imported (e.g. Terraform 'module.x.aws_instance.web') */
  tfAddr?: string;
  /** true for a user-uploaded picture — rendered filling a resizable frame
   *  (vs. a small AWS/GCP glyph). */
  isImage?: boolean;
  /** show a card background/frame behind an image block (default: none). */
  imageFramed?: boolean;
  /** render the icon WITHOUT the card background — a bare glyph + label, like a
   *  draw.io shape. Default: false (carded). Set on imported icons. */
  frameless?: boolean;
};

/** A resizable container that visually groups child nodes (AWS account, VPC, "Cloud"...). */
export type GroupNodeData = {
  label: string;
  /** border / header accent color */
  color?: string;
  /** optional header icon (iconify ref, e.g. "lucide:server") */
  icon?: string;
  variant?: 'cloud' | 'account' | 'plain';
  /** set when this group is an instance of a reusable component */
  componentId?: string;
  componentVersion?: number;
};

export type ErKeyKind = 'PK' | 'FK' | null;
export type ErColumn = { name: string; type: string; key?: ErKeyKind };

/** A database/entity table for ER (BDD) diagrams. */
export type ErTableNodeData = {
  label: string;
  columns: ErColumn[];
  accent?: string;
};

/** A free-text sticky note (resizable, multi-line). */
export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'gray';
export type NoteNodeData = { text: string; color?: NoteColor };

/** A discussion comment (speech-bubble card with an author line). */
export type CommentNodeData = { text: string; author?: string };

/** Plain free text on the canvas (no background). */
export type TextNodeData = { text: string; fontSize?: number };

export type AppNodeData =
  | IconNodeData
  | GroupNodeData
  | ErTableNodeData
  | NoteNodeData
  | CommentNodeData
  | TextNodeData;

export type IconNodeType = Node<IconNodeData, 'icon'>;
export type GroupNodeType = Node<GroupNodeData, 'group'>;
export type ErTableNodeType = Node<ErTableNodeData, 'erTable'>;
export type NoteNodeType = Node<NoteNodeData, 'note'>;
export type CommentNodeType = Node<CommentNodeData, 'comment'>;
export type TextNodeType = Node<TextNodeData, 'text'>;
export type AppNode =
  | IconNodeType
  | GroupNodeType
  | ErTableNodeType
  | NoteNodeType
  | CommentNodeType
  | TextNodeType;

export type EdgePathType = 'smooth' | 'bezier' | 'straight';
/** Semantic relationship a connection represents — drives its colour/dash. */
export type EdgeKind = 'sync' | 'async' | 'event' | 'error' | 'data';
export type Waypoint = { x: number; y: number };
export type LabeledEdgeData = {
  label?: string;
  /** optional dashed style for "async"/secondary flows */
  dashed?: boolean;
  /** path shape: 'smooth' (rounded steps), 'bezier' (curve), 'straight' */
  pathType?: EdgePathType;
  /** semantic kind — distinct colour/dash (sync/async/event/error/data) */
  edgeKind?: EdgeKind;
  /** manual routing points (flow coords); when present the edge runs through them */
  waypoints?: Waypoint[];
};
export type AppEdge = Edge<LabeledEdgeData>;

/** A plugin a diagram depends on (its nodes/icons came from it). */
export type DiagramPluginDep = { id: string; name?: string; version?: string };

/** On-disk / exported diagram document. */
export type DiagramFile = {
  version: 1;
  name: string;
  nodes: AppNode[];
  edges: AppEdge[];
  viewport?: { x: number; y: number; zoom: number };
  /**
   * Plugins this diagram uses, derived at save time (see derivePlugins). On
   * open, missing ones are offered for install; until then the data renders
   * non-destructively (UnknownNode / icon placeholder), never lost.
   */
  plugins?: DiagramPluginDep[];
};

/**
 * A reusable component: a saved sub-graph (nodes + internal edges) that can be
 * dropped onto the canvas as one block. Node ids inside `nodes` act as stable
 * "slot" ids; an instance gives each child the id `${instanceId}:${slotId}` so
 * external edges survive component updates.
 */
export type ComponentDef = {
  id: string;
  name: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  nodes: AppNode[];
  edges: AppEdge[];
};

/** Type guards used by the Inspector and node components. */
export const isIconNode = (n: AppNode): n is IconNodeType => n.type === 'icon';
export const isGroupNode = (n: AppNode): n is GroupNodeType => n.type === 'group';
export const isErTableNode = (n: AppNode): n is ErTableNodeType =>
  n.type === 'erTable';
export const isNoteNode = (n: AppNode): n is NoteNodeType => n.type === 'note';
export const isCommentNode = (n: AppNode): n is CommentNodeType =>
  n.type === 'comment';
export const isTextNode = (n: AppNode): n is TextNodeType => n.type === 'text';

/** An icon node that's actually a user-uploaded picture (rendered in a resizable
 *  frame, vs. a small glyph). Keyed solely on the explicit `isImage` flag the
 *  upload flow sets — a plugin icon pack may legitimately use svg data-URLs as
 *  glyphs, so the data-URL must NOT imply "image". */
export const isImageNodeData = (d: IconNodeData): boolean => !!d.isImage;

import { toPng, toSvg } from 'html-to-image';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { useFlowStore } from '../store';
import { saveBytes, dataUrlBytes, type SaveResult } from './save';
import { i18n } from '../i18n';

// JSON / draw.io / Mermaid export now go through the exporters registry (pure
// doc -> string). PNG/SVG stay here: they snapshot the live ReactFlow DOM.

const PADDING = 80;
const MIN_SIZE = 512;
const MAX_SIZE = 4096;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : 'diagram';
}

type ExportSetup = {
  viewportEl: HTMLElement;
  width: number;
  height: number;
  style: Record<string, string>;
};

function prepareImage(): ExportSetup | null {
  const nodes = useFlowStore.getState().nodes;
  if (nodes.length === 0) return null;

  const viewportEl = document.querySelector(
    '.react-flow__viewport',
  ) as HTMLElement | null;
  if (!viewportEl) return null;

  const bounds = getNodesBounds(nodes);
  const width = clamp(Math.ceil(bounds.width) + PADDING * 2, MIN_SIZE, MAX_SIZE);
  const height = clamp(Math.ceil(bounds.height) + PADDING * 2, MIN_SIZE, MAX_SIZE);
  const vp = getViewportForBounds(bounds, width, height, 0.3, 3, 0.12);

  return {
    viewportEl,
    width,
    height,
    style: {
      width: String(width),
      height: String(height),
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  };
}

export async function exportPng(fileName: string): Promise<SaveResult> {
  const setup = prepareImage();
  if (!setup) return { saved: false };
  const dataUrl = await toPng(setup.viewportEl, {
    backgroundColor: '#ffffff',
    width: setup.width,
    height: setup.height,
    pixelRatio: 2,
    style: setup.style,
  });
  const bytes = await dataUrlBytes(dataUrl);
  return saveBytes(sanitizeFileName(fileName) + '.png', bytes, [
    { name: i18n.t('export.pngImage'), extensions: ['png'] },
  ]);
}

export async function exportSvg(fileName: string): Promise<SaveResult> {
  const setup = prepareImage();
  if (!setup) return { saved: false };
  const dataUrl = await toSvg(setup.viewportEl, {
    backgroundColor: '#ffffff',
    width: setup.width,
    height: setup.height,
    style: setup.style,
  });
  const bytes = await dataUrlBytes(dataUrl);
  return saveBytes(sanitizeFileName(fileName) + '.svg', bytes, [
    { name: i18n.t('export.svgImage'), extensions: ['svg'] },
  ]);
}


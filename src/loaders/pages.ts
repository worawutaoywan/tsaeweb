/**
 * Static page loader — reads block-based pages from data/cms/pages.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CMS_DIR = path.join(process.cwd(), 'data', 'cms');

export interface PageBlock {
  type: string;
  html?: string;
  text?: string;
  level?: number;
  src?: string;
  alt?: string;
  caption?: string;
  width?: string;
  images?: { src: string; alt?: string }[];
  label?: string;
  href?: string;
  style?: string;
  variant?: string;
  size?: string;
}

export interface CmsPage {
  id: string;
  slug: string;
  lang: 'th' | 'en';
  title: string;
  description?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  enabled?: boolean;
  blocks: PageBlock[];
  updatedAt?: string;
}

export function loadPages(): CmsPage[] {
  try {
    const raw = readFileSync(path.join(CMS_DIR, 'pages.json'), 'utf-8');
    const items = JSON.parse(raw) as CmsPage[];
    return items.filter((p) => p.enabled !== false);
  } catch {
    return [];
  }
}

export function getPageBySlug(slug: string, lang: 'th' | 'en'): CmsPage | undefined {
  return loadPages().find((p) => p.slug === slug && p.lang === lang);
}

export function getStaticPagePaths(): { slug: string; lang: 'th' | 'en' }[] {
  return loadPages().map((p) => ({ slug: p.slug, lang: p.lang }));
}

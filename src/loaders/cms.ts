/**
 * Local CMS loaders — read JSON from data/cms/ (no WordPress dependency).
 */
import type { Loader, LoaderContext } from 'astro:loaders';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const CMS_DIR = path.join(process.cwd(), 'data', 'cms');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(CMS_DIR, file), 'utf-8')) as T;
}

function readJsonCollection<T>(directory: string): T[] {
  const collectionDir = path.join(CMS_DIR, directory);
  return readdirSync(collectionDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => JSON.parse(readFileSync(path.join(collectionDir, entry.name), 'utf-8')) as T);
}

interface CmsNewsItem {
  id: string;
  title: string;
  titleTH?: string;
  date: string;
  category: 'conference' | 'journal' | 'training' | 'announcement' | 'activity';
  excerpt: string;
  excerptTH?: string;
  image?: string;
  featured?: boolean;
  author?: string;
  html: string;
}

interface CmsEventItem {
  id: string;
  title: string;
  titleTH?: string;
  startDate: string;
  endDate?: string;
  location: string;
  locationTH?: string;
  type: 'national' | 'international' | 'training' | 'webinar';
  status: 'upcoming' | 'past' | 'ongoing';
  registrationUrl?: string;
  image?: string;
  excerpt: string;
  excerptTH?: string;
  featured?: boolean;
  html?: string;
}

function eventStatus(start: string, end?: string): 'upcoming' | 'past' | 'ongoing' {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s;
  if (now < s) return 'upcoming';
  if (now > e) return 'past';
  return 'ongoing';
}

export function cmsNewsLoader(): Loader {
  return {
    name: 'cms-news',
    async load(ctx: LoaderContext) {
      let items: CmsNewsItem[];
      try {
        items = readJsonCollection<CmsNewsItem>('news');
      } catch (err) {
        ctx.logger.warn(`CMS news collection missing: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      ctx.store.clear();
      for (const item of items) {
        ctx.store.set({
          id: item.id,
          data: {
            title: item.title,
            titleTH: item.titleTH,
            date: new Date(item.date),
            category: item.category,
            excerpt: item.excerpt,
            excerptTH: item.excerptTH,
            image: item.image,
            featured: item.featured ?? false,
            author: item.author,
          },
          rendered: { html: item.html },
        });
      }
      ctx.logger.info(`Loaded ${items.length} news items from Pages CMS`);
    },
  };
}

export function cmsEventsLoader(): Loader {
  return {
    name: 'cms-events',
    async load(ctx: LoaderContext) {
      let items: CmsEventItem[];
      try {
        items = readJson<CmsEventItem[]>('events.json');
      } catch (err) {
        ctx.logger.warn(`CMS events.json missing: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      ctx.store.clear();
      for (const item of items) {
        const status = item.status === 'upcoming' || item.status === 'past' || item.status === 'ongoing'
          ? item.status
          : eventStatus(item.startDate, item.endDate);
        ctx.store.set({
          id: item.id,
          data: {
            title: item.title,
            titleTH: item.titleTH,
            startDate: new Date(item.startDate),
            endDate: item.endDate ? new Date(item.endDate) : undefined,
            location: item.location,
            locationTH: item.locationTH,
            type: item.type,
            status,
            registrationUrl: item.registrationUrl,
            image: item.image,
            excerpt: item.excerpt,
            excerptTH: item.excerptTH,
            featured: item.featured ?? false,
          },
          rendered: { html: item.html ?? '' },
        });
      }
      ctx.logger.info(`Loaded ${items.length} events from CMS`);
    },
  };
}

/** Unused journal loader — journal uses static journalIssues.ts */
export function cmsJournalLoader(): Loader {
  return {
    name: 'cms-journal',
    async load(ctx: LoaderContext) {
      ctx.store.clear();
      ctx.logger.info('Journal uses static journalIssues.ts — CMS journal skipped');
    },
  };
}

export interface HeroSlide {
  id: string;
  enabled: boolean;
  sortOrder: number;
  badgeTH: string;
  badgeEN: string;
  image: string;
  href: string;
  /** Optional second link — left half = href, right half = href2 (combined poster) */
  href2?: string;
  href2LabelTH?: string;
  href2LabelEN?: string;
  registerHref?: string;
  bg: string;
  overlay: string;
  glow: string;
  /** false = text + poster layout; default true = full-bleed poster */
  fullImage?: boolean;
  titleTH?: string;
  titleEN?: string;
  titleAccentTH?: string;
  titleAccentEN?: string;
  themeTH?: string;
  themeEN?: string;
  dateTH?: string;
  dateEN?: string;
  locationTH?: string;
  locationEN?: string;
  tagTH?: string;
  tagEN?: string;
}

export function loadHeroSlides(): HeroSlide[] {
  try {
    const slides = readJson<HeroSlide[]>('hero.json');
    return slides.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

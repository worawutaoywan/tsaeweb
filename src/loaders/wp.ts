/**
 * WordPress REST API loaders for Astro content collections.
 *
 * Reads WP_API_URL / WP_API_USER / WP_API_APP_PASSWORD from env at build time.
 * Pages through all results and transforms each entry into the shape Astro expects.
 */

import type { Loader, LoaderContext } from 'astro/loaders';

const WP_URL = process.env.WP_API_URL ?? 'https://old.tsae.asia/wp-json';
const WP_USER = process.env.WP_API_USER ?? '';
const WP_PASS = process.env.WP_API_APP_PASSWORD ?? '';

function authHeader(): Record<string, string> {
  if (!WP_USER || !WP_PASS) return {};
  const token = Buffer.from(`${WP_USER}:${WP_PASS.replace(/\s+/g, '')}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchAll<T = any>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const perPage = 100;
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const qs = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const url = `${WP_URL}${path}?${qs}`;
    const res = await fetch(url, { headers: { ...authHeader() } });
    if (res.status === 400 && page > 1) break;
    if (!res.ok) throw new Error(`WP fetch ${url} → ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

interface WPPost {
  id: number;
  slug: string;
  date: string;
  modified: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  tags: number[];
  featured_media: number;
  author: number;
  sticky?: boolean;
  meta?: Record<string, any>;
  [k: string]: any;
}

interface WPCategory {
  id: number;
  name: string;
  slug: string;
}

interface WPMedia {
  id: number;
  source_url: string;
}

interface WPUser {
  id: number;
  name: string;
  slug: string;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"').trim();

// The journal uses the association's abbreviation "สวกท." (วารสาร สวกท. / TSAE
// Journal). Some WordPress titles use the variant "วสกท." — normalize to สวกท.
const fixJournalAbbr = (s: string) => s.replace(/วารสาร\s*วสกท\./g, 'วารสาร สวกท.');

const decodeEntities = (s: string) => s
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;|&#39;/g, "'")
  .replace(/&hellip;/g, '…')
  .replace(/&nbsp;/g, ' ');

async function buildMediaMap(ids: number[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<number, string>();
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const res = await fetch(`${WP_URL}/wp/v2/media?include=${chunk.join(',')}&per_page=100&_fields=id,source_url`, {
      headers: { ...authHeader() },
    });
    if (!res.ok) continue;
    const items = (await res.json()) as WPMedia[];
    for (const m of items) map.set(m.id, m.source_url);
  }
  return map;
}

async function buildAuthorMap(ids: number[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<number, string>();
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    const res = await fetch(`${WP_URL}/wp/v2/users?include=${chunk.join(',')}&per_page=100&_fields=id,name`, {
      headers: { ...authHeader() },
    });
    if (!res.ok) continue;
    const items = (await res.json()) as WPUser[];
    for (const u of items) map.set(u.id, u.name);
  }
  return map;
}

async function getCategories(): Promise<WPCategory[]> {
  return fetchAll<WPCategory>('/wp/v2/categories', { _fields: 'id,name,slug' });
}

// Duplicate posts that exist in the old WordPress and should not be shown
// twice on the new site (kept the canonical copy of each).
const HIDDEN_NEWS_SLUGS = new Set([
  'agri-forum-2018-2',
  'tsae-2025-international-conference-on-zoom-sep-12-2025-2',
]);

// Best-effort parse of "Vol.X No.Y" (EN) or "ปีที่ X ฉบับที่ Y" (TH) from a title.
function parseVolIssue(title: string): { volume: number; issue: number } {
  let m = title.match(/Vol\.?\s*(\d+)\s*No\.?\s*(\d+)/i);
  if (m) return { volume: Number(m[1]), issue: Number(m[2]) };
  m = title.match(/ปีที่\s*(\d+)\s*ฉบับที่\s*(\d+)/);
  if (m) return { volume: Number(m[1]), issue: Number(m[2]) };
  return { volume: 0, issue: 0 };
}

// Map WP category slugs → Astro news category enum
function mapNewsCategory(slugs: string[]): 'conference' | 'journal' | 'training' | 'announcement' | 'activity' {
  if (slugs.some((s) => s.includes('training') || s.includes('อบรม'))) return 'training';
  if (slugs.some((s) => s.includes('journal') || s.includes('e-journal'))) return 'journal';
  if (slugs.some((s) => s.includes('conference') || s.includes('ประชุม'))) return 'conference';
  if (slugs.some((s) => s.includes('activity') || s.includes('กิจกรรม'))) return 'activity';
  return 'announcement';
}

// ---------- NEWS LOADER ----------
export function wpNewsLoader(): Loader {
  return {
    name: 'wp-news',
    async load(ctx: LoaderContext) {
      ctx.logger.info('Fetching news from WordPress REST');
      const cats = await getCategories();
      // Pull both general announcements ("news") and training announcements
      // ("training-news") into the News collection so every news-type post
      // from the old site is shown.
      const newsCatIds = cats
        .filter((c) => c.slug === 'news' || c.slug === 'training-news')
        .map((c) => c.id);
      if (newsCatIds.length === 0) {
        ctx.logger.warn('No "news" category found in WP');
        return;
      }
      const catBySlug = new Map(cats.map((c) => [c.id, c.slug] as const));

      const posts = await fetchAll<WPPost>('/wp/v2/posts', { categories: newsCatIds.join(',') });
      const mediaIds = posts.map((p) => p.featured_media).filter(Boolean);
      const authorIds = posts.map((p) => p.author).filter(Boolean);
      const [mediaMap, authorMap] = await Promise.all([buildMediaMap(mediaIds), buildAuthorMap(authorIds)]);

      ctx.store.clear();
      for (const p of posts) {
        if (HIDDEN_NEWS_SLUGS.has(p.slug)) continue;
        const catSlugs = p.categories.map((id) => catBySlug.get(id) ?? '').filter(Boolean);
        const data = {
          title: fixJournalAbbr(decodeEntities(p.title.rendered)),
          titleTH: p.meta?.title_th ? fixJournalAbbr(p.meta.title_th) : undefined,
          date: new Date(p.date),
          category: mapNewsCategory(catSlugs),
          excerpt: stripHtml(p.excerpt.rendered) || stripHtml(p.content.rendered).slice(0, 200),
          excerptTH: p.meta?.excerpt_th || undefined,
          image: p.featured_media ? mediaMap.get(p.featured_media) : undefined,
          featured: Boolean(p.sticky),
          author: authorMap.get(p.author) ?? undefined,
        };
        ctx.store.set({
          id: decodeURIComponent(p.slug),
          data,
          rendered: { html: p.content.rendered },
        });
      }
      ctx.logger.info(`Loaded ${posts.length} news items`);
    },
  };
}

// ---------- JOURNAL LOADER ----------
export function wpJournalLoader(): Loader {
  return {
    name: 'wp-journal',
    async load(ctx: LoaderContext) {
      ctx.logger.info('Fetching journal from WordPress REST');
      const cats = await getCategories();
      // E-Journal + academic articles / conference proceedings
      const journalCatIds = cats
        .filter((c) => c.slug === 'e-journal' || c.name === 'เอกสารบทความวิชาการ')
        .map((c) => c.id);
      if (journalCatIds.length === 0) {
        ctx.logger.warn('No "e-journal" category found in WP');
        return;
      }
      const posts = await fetchAll<WPPost>('/wp/v2/posts', { categories: journalCatIds.join(',') });
      const mediaIds = posts.map((p) => p.featured_media).filter(Boolean);
      const mediaMap = await buildMediaMap(mediaIds);

      ctx.store.clear();
      for (const p of posts) {
        let articles: any[] | undefined;
        try {
          const raw = p.meta?.journal_articles;
          if (raw) articles = JSON.parse(raw);
        } catch { /* ignore malformed JSON */ }

        const titleText = decodeEntities(p.title.rendered);
        const parsed = parseVolIssue(titleText);
        const volume = Number(p.meta?.journal_volume) || parsed.volume;
        const issue = Number(p.meta?.journal_issue) || parsed.issue;
        const year = Number(p.meta?.journal_year) || new Date(p.date).getFullYear();

        const data = {
          title: fixJournalAbbr(decodeEntities(p.title.rendered)),
          titleTH: p.meta?.title_th ? fixJournalAbbr(p.meta.title_th) : undefined,
          volume,
          issue,
          year,
          publishDate: new Date(p.date),
          coverImage: p.featured_media ? mediaMap.get(p.featured_media) : undefined,
          pdfUrl: p.meta?.journal_pdf || undefined,
          articles,
        };
        ctx.store.set({
          id: decodeURIComponent(p.slug),
          data,
          rendered: { html: p.content.rendered },
        });
      }
      ctx.logger.info(`Loaded ${posts.length} journal entries`);
    },
  };
}

// ---------- EVENTS LOADER ----------
export function wpEventsLoader(): Loader {
  return {
    name: 'wp-events',
    async load(ctx: LoaderContext) {
      ctx.logger.info('Fetching events from WordPress REST');
      let posts: WPPost[];
      try {
        posts = await fetchAll<WPPost>('/wp/v2/events');
      } catch (err) {
        // The `events` custom post type may not be registered in REST yet
        // (returns 404). Don't fail the whole build — just skip events.
        ctx.logger.warn(`Skipping events: ${err instanceof Error ? err.message : String(err)}`);
        ctx.store.clear();
        return;
      }
      const mediaIds = posts.map((p) => p.featured_media).filter(Boolean);
      const mediaMap = await buildMediaMap(mediaIds);

      ctx.store.clear();
      for (const p of posts) {
        const startStr = p.meta?.start_date;
        if (!startStr) {
          ctx.logger.warn(`Event ${p.slug} missing start_date, skipped`);
          continue;
        }
        const data = {
          title: decodeEntities(p.title.rendered),
          titleTH: p.meta?.title_th || undefined,
          startDate: new Date(startStr),
          endDate: p.meta?.end_date ? new Date(p.meta.end_date) : undefined,
          location: p.meta?.location || '',
          locationTH: p.meta?.location_th || undefined,
          type: (p.meta?.event_type || 'national') as 'national' | 'international' | 'training' | 'webinar',
          status: (p.meta?.event_status || 'upcoming') as 'upcoming' | 'past' | 'ongoing',
          registrationUrl: p.meta?.registration_url || undefined,
          image: p.featured_media ? mediaMap.get(p.featured_media) : undefined,
          excerpt: stripHtml(p.excerpt.rendered) || stripHtml(p.content.rendered).slice(0, 200),
          excerptTH: p.meta?.excerpt_th || undefined,
          featured: Boolean(p.meta?.featured),
        };
        ctx.store.set({
          id: decodeURIComponent(p.slug),
          data,
          rendered: { html: p.content.rendered },
        });
      }
      ctx.logger.info(`Loaded ${posts.length} events`);
    },
  };
}

/**
 * Campaign packs loader — poster landing pages from data/cms/campaigns.json
 */
import { readFileSync, existsSync, cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const CMS_DIR = path.join(process.cwd(), 'data', 'cms');
const ASSETS_DIR = path.join(CMS_DIR, 'campaign-assets');
const PUBLIC_C = path.join(process.cwd(), 'public', 'c');

export interface CampaignFact {
  label?: string;
  value?: string;
}

export interface CampaignFee {
  who?: string;
  usd?: string;
  inr?: string;
}

export interface CampaignLink {
  label?: string;
  href?: string;
  style?: string;
}

export interface Campaign {
  id: string;
  slug: string;
  enabled?: boolean;
  sortOrder?: number;
  showOnHome?: boolean;
  showInHero?: boolean;
  createEvent?: boolean;
  titleTH?: string;
  titleEN?: string;
  themeTH?: string;
  themeEN?: string;
  badgeTH?: string;
  badgeEN?: string;
  dateTH?: string;
  dateEN?: string;
  venueTH?: string;
  venueEN?: string;
  target?: string;
  endDate?: string;
  registerUrl?: string;
  contactEmail?: string;
  posterImage?: string;
  posterPdf?: string;
  posterHtmlUrl?: string;
  excerptTH?: string;
  excerptEN?: string;
  descriptionTH?: string;
  descriptionEN?: string;
  facts?: CampaignFact[];
  fees?: CampaignFee[];
  extraLinks?: CampaignLink[];
  /** Optional award / category list for landing pages */
  categories?: string[];
}

/** Copy data/cms/campaign-assets/{slug}/poster → public/c/{slug}/poster before build. */
export function syncCampaignAssetsToPublic(): void {
  if (!existsSync(ASSETS_DIR)) return;
  for (const name of readdirSync(ASSETS_DIR)) {
    const src = path.join(ASSETS_DIR, name, 'poster');
    if (!existsSync(src) || !statSync(src).isDirectory()) continue;
    const dest = path.join(PUBLIC_C, name, 'poster');
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

export function loadCampaigns(): Campaign[] {
  try {
    const raw = readFileSync(path.join(CMS_DIR, 'campaigns.json'), 'utf-8');
    const items = JSON.parse(raw) as Campaign[];
    return items.filter((c) => c.enabled !== false && c.slug);
  } catch {
    return [];
  }
}

export function getCampaignBySlug(slug: string): Campaign | undefined {
  return loadCampaigns().find((c) => c.slug === slug);
}

export function getCampaignStaticPaths(): { slug: string }[] {
  return loadCampaigns().map((c) => ({ slug: c.slug }));
}

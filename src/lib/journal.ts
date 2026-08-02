import type { CollectionEntry } from 'astro:content';

/**
 * The WordPress "เอกสารบทความวิชาการ / e-journal" category is a grab-bag that
 * mixes true TSAE Journal issues (วารสาร สวกท. / TSAE Journal) together with
 * conference proceedings, books of abstracts, single research articles and
 * announcements. The /journal/ pages should list ONLY genuine journal issues.
 *
 * A real journal issue always carries a volume + issue number (parsed from its
 * "ปีที่ X ฉบับที่ Y" / "Vol.X No.Y" title or WP meta). Proceedings, abstract
 * books, articles and news do not, so they resolve to volume/issue = 0.
 */
export function isJournalIssue(entry: CollectionEntry<'journal'>): boolean {
  return entry.data.volume > 0 && entry.data.issue > 0;
}

/** Journal issues sorted newest-first (by volume, then issue, then date). */
export function sortJournalIssues(
  entries: CollectionEntry<'journal'>[],
): CollectionEntry<'journal'>[] {
  return [...entries].sort((a, b) => {
    if (b.data.volume !== a.data.volume) return b.data.volume - a.data.volume;
    if (b.data.issue !== a.data.issue) return b.data.issue - a.data.issue;
    return new Date(b.data.publishDate).getTime() - new Date(a.data.publishDate).getTime();
  });
}

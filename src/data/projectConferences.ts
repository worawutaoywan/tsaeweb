/**
 * บทความการประชุมวิชาการโครงงานวิศวกรรมเกษตรแห่งชาติ
 * (National Agricultural Engineering Project Conference proceedings).
 *
 * Source: https://old.tsae.asia/home/agricultural-engineering-project-document/
 * `edition` = ครั้งที่ (conference number). `url` undefined when no document is
 * published on the legacy site yet. Newest first.
 */
export interface ProjectConference {
  edition: number;
  url?: string;
}

export const projectConferences: ProjectConference[] = [
  { edition: 32, url: '/wp-uploads/2026/02/1E-proceedings_Full.pdf' },
  { edition: 31, url: undefined },
  { edition: 30, url: '/wp-uploads/2026/02/Proceedings-30Th-AE-Con-at-MJU.pdf' },
  { edition: 29, url: '/wp-uploads/2026/02/aep-29.pdf' },
  { edition: 28, url: undefined },
  { edition: 27, url: undefined },
  { edition: 26, url: undefined },
];

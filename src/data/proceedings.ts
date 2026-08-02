/**
 * Authoritative list of TSAE conference proceedings (บทความวิชาการงานประชุมวิชาการสมาคมฯ).
 *
 * Mirrors the archive published on the legacy site:
 *   https://old.tsae.asia/home/เอกสารบทความวิชาการ/tsae_proceeding/
 *
 * `year` is the Gregorian (CE) year. Newest first.
 * `host` controls the icon/label shown on the card:
 *   'drive' = Google Drive folder, 'web' = external web page, 'e3s' = E3S Web of Conferences.
 * `url` is undefined when the source has no link yet.
 */
export type ProceedingHost = 'drive' | 'web' | 'e3s';

export interface Proceeding {
  year: number;
  host: ProceedingHost;
  url?: string;
  /** Optional extra note shown under the title (e.g. published on E3S). */
  note?: string;
}

export const proceedings: Proceeding[] = [
  { year: 2026, host: 'web', url: '/downloads/TSAE2026-national-proceeding.pdf', note: 'National Conference · PDF' },
  { year: 2025, host: 'e3s', url: 'https://www.e3s-conferences.org/articles/e3sconf/abs/2025/61/contents/contents.html', note: 'E3S Web of Conferences' },
  { year: 2024, host: 'drive', url: 'https://drive.google.com/drive/folders/1uy8QEuFXrsFlhHIzWwZiIEwzsxm1HrPA' },
  { year: 2023, host: 'drive', url: 'https://drive.google.com/drive/folders/1XKTFmwsKclup5wCluK8OBS0OvzbA4tQB' },
  { year: 2022, host: 'drive', url: 'https://drive.google.com/drive/folders/1_UPG5neJklzhGDo4wKD8J7Rt1mx-LJVx' },
  { year: 2021, host: 'drive', url: 'https://drive.google.com/drive/folders/1CBqfia7_KGi660UsiAxSX608WmUBLq5v' },
  { year: 2020, host: 'drive', url: 'https://drive.google.com/drive/folders/1skpnVEvlwm8C6j8uBnvivK0nYBWEYFVJ' },
  { year: 2019, host: 'drive', url: 'https://drive.google.com/drive/folders/1LBYaOFAZRb9VH6qY7vBzXbtrZR7xxHzL' },
  { year: 2018, host: 'drive', url: 'https://drive.google.com/drive/folders/1P_gzvbHFC9u37UKocwCjD94YSHQ4dzps' },
  { year: 2017, host: 'drive', url: 'https://drive.google.com/drive/folders/11t1-e41g2ymNTbCnXCCxWnOnR5BIggXs' },
  { year: 2016, host: 'drive', url: undefined },
  { year: 2015, host: 'drive', url: 'https://drive.google.com/drive/folders/1LzkvzW0dnyP_1rmI7ZqdHG_7RWfpOu9c' },
  { year: 2014, host: 'drive', url: undefined },
  { year: 2013, host: 'drive', url: 'https://drive.google.com/drive/folders/1-z8F2hkwOJRtEYUUw6XgxPUYtRbP4cu9' },
  { year: 2012, host: 'web', url: '/data/2012conf/proceedings.html' },
  { year: 2011, host: 'drive', url: 'https://drive.google.com/drive/folders/1CboZuV4tnfIKQO1ka2JYkkILtyf-nS6e' },
];

/**
 * Authoritative list of วารสาร สวกท. (TSAE Journal) issues.
 *
 * Each issue links directly to its page on TCI ThaiJO (the official journal
 * host), matching the archive published at:
 *   https://old.tsae.asia/home/เอกสารบทความวิชาการ/วสทก-tsae-journal/
 *
 * Volume/issue/year were verified against ThaiJO issue titles
 * (li01.tci-thaijo.org/index.php/TSAEJ). `year` is the Gregorian (CE) year.
 * Newest issue first.
 */
export interface JournalIssue {
  volume: number;
  issue: number;
  year: number;
  url: string;
}

const thaijo = (id: number) => `https://li01.tci-thaijo.org/index.php/TSAEJ/issue/view/${id}`;

export const journalIssues: JournalIssue[] = [
  { volume: 32, issue: 1, year: 2026, url: thaijo(17989) },
  { volume: 31, issue: 2, year: 2025, url: thaijo(17984) },
  { volume: 31, issue: 1, year: 2025, url: thaijo(17892) },
  { volume: 30, issue: 2, year: 2024, url: thaijo(17773) },
  { volume: 30, issue: 1, year: 2024, url: thaijo(17692) },
  { volume: 29, issue: 2, year: 2023, url: thaijo(17565) },
  { volume: 29, issue: 1, year: 2023, url: thaijo(17509) },
  { volume: 28, issue: 2, year: 2022, url: thaijo(17362) },
  { volume: 28, issue: 1, year: 2022, url: thaijo(17292) },
  { volume: 27, issue: 2, year: 2021, url: thaijo(17181) },
  { volume: 27, issue: 1, year: 2021, url: thaijo(16974) },
  { volume: 26, issue: 2, year: 2020, url: thaijo(16870) },
  { volume: 26, issue: 1, year: 2020, url: thaijo(15762) },
  { volume: 25, issue: 2, year: 2019, url: thaijo(14056) },
  { volume: 25, issue: 1, year: 2019, url: thaijo(11107) },
  { volume: 24, issue: 2, year: 2018, url: thaijo(9043) },
  { volume: 24, issue: 1, year: 2018, url: thaijo(8764) },
  { volume: 23, issue: 2, year: 2017, url: thaijo(7598) },
  { volume: 23, issue: 1, year: 2017, url: thaijo(6951) },
  { volume: 22, issue: 2, year: 2016, url: thaijo(6692) },
  { volume: 22, issue: 1, year: 2016, url: thaijo(6530) },
  { volume: 21, issue: 2, year: 2015, url: thaijo(6529) },
  { volume: 21, issue: 1, year: 2015, url: thaijo(6525) },
  { volume: 20, issue: 2, year: 2014, url: thaijo(6528) },
  { volume: 19, issue: 1, year: 2013, url: thaijo(6128) },
  { volume: 18, issue: 1, year: 2012, url: thaijo(6089) },
];

/** Newest issue (current issue). */
export const currentIssue = journalIssues[0];

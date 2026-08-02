import type { Lang } from '../i18n/ui';
import videoData from '../../data/cms/home-videos.json';

/** ใส่เฉพาะเมื่อระบุได้ชัดจากชื่อคลิป/ช่อง — คลิปอื่นไม่บังคับหมวด */
export type WatchCategory = 'symposium' | 'exhibition' | 'training' | 'facebook';

export type WatchVideo = {
  id?: string;
  date: string;
  href?: string;
  web?: string;
  category?: WatchCategory;
  pick?: boolean;
  titleTH: string;
  titleEN: string;
  summaryTH: string;
  summaryEN: string;
  metaTH: string;
  metaEN: string;
};

const LEGACY_RAW: WatchVideo[] = [
  {
    id: 'vQr4T4l3G-I',
    date: '2026-05-22',
    category: 'symposium',
    pick: true,
    titleTH: 'AAAE Symposium: การเปลี่ยนแปลงสภาพภูมิอากาศกับเกษตรเอเชีย',
    titleEN: 'AAAE Symposium on Climate Change and Asian Agriculture',
    summaryTH: 'บันทึกงานสัมมนาวิชาการล่าสุด — ภูมิอากาศกับเกษตรเอเชีย ที่ BITEC กรุงเทพฯ',
    summaryEN: 'Latest symposium recording on climate change and Asian agriculture at BITEC Bangkok',
    metaTH: 'ช่องสมาคมฯ · 22 พ.ค. 2569 · BITEC กรุงเทพฯ',
    metaEN: 'TSAE channel · 22 May 2026 · BITEC, Bangkok',
  },
  {
    id: 'DS4tFJIpaeE',
    date: '2025-11-19',
    titleTH: 'เปิดโลกประมงไต้หวัน! ใช้ AI เลี้ยงกุ้ง ด้วยเทคโนโลยี “Smart Fishery” | THE CAPTURE',
    titleEN: 'Taiwan Fisheries: AI Shrimp Farming with “Smart Fishery” | THE CAPTURE',
    summaryTH: 'เทคโนโลยี AI ในการเลี้ยงกุ้งและระบบประมงอัจฉริยะจากไต้หวัน',
    summaryEN: 'AI-powered shrimp farming and smart fishery systems from Taiwan',
    metaTH: 'THE FARMER · 19 พ.ย. 2568',
    metaEN: 'THE FARMER · 19 Nov 2025',
  },
  {
    id: 'hfL-KyxPDiI',
    date: '2025-10-27',
    category: 'exhibition',
    titleTH: 'งาน China International Agricultural Machinery Exhibition 2025 (CIAME2025)',
    titleEN: 'China International Agricultural Machinery Exhibition 2025 (CIAME2025)',
    summaryTH: 'ชมเครื่องจักรกลการเกษตรและนวัตกรรมจากงาน CIAME 2025 ที่เมืองอู่ฮั่น จีน',
    summaryEN: 'Agricultural machinery and innovations from CIAME 2025 in Wuhan, China',
    metaTH: 'THE FARMER · งาน CIAME2025 · 28 ต.ค. 2568',
    metaEN: 'THE FARMER · CIAME2025 · 28 Oct 2025',
  },
  {
    id: 'Lf9AdEiaR-M',
    date: '2025-09-22',
    category: 'exhibition',
    titleTH: 'เปิดโลกเทคโนโลยีเกษตรสุดล้ำจากไต้หวัน กับงาน “TAIWAN SMART AGRI WEEK 2025” | THE CAPTURE',
    titleEN: 'Taiwan Smart Agri Week 2025 — Future Ag Tech | THE CAPTURE',
    summaryTH: 'นิทรรศการเทคโนโลยีเกษตรอัจฉริยะจากไต้หวัน — ไฮไลต์นวัตกรรมและเครื่องจักร',
    summaryEN: 'Smart agriculture expo from Taiwan — innovations and machinery highlights',
    metaTH: 'THE FARMER · Taiwan Smart Agri Week 2025 · 22 ก.ย. 2568',
    metaEN: 'THE FARMER · Taiwan Smart Agri Week 2025 · 22 Sep 2025',
  },
  {
    id: 'nEqTm3P2MWk',
    date: '2025-03-31',
    category: 'exhibition',
    pick: true,
    web: 'https://thefarmerthai.com/?p=3006',
    titleTH: 'เปิดโลกนวัตกรรมการเกษตรแห่งอนาคต ในงาน CIAME Asia 2025 - Thailand | THE CAPTURE',
    titleEN: 'CIAME Asia 2025 Thailand — Future Ag Innovation | THE CAPTURE',
    summaryTH: 'งาน CIAME Asia ครั้งแรกในไทย — เครื่องจักรกลและเทคโนโลยีเกษตรจากจีนและเอเชีย',
    summaryEN: 'First CIAME Asia in Thailand — ag machinery and tech from China and Asia',
    metaTH: 'THE FARMER · CIAME Asia 2025 Thailand · 31 มี.ค. 2568',
    metaEN: 'THE FARMER · CIAME Asia 2025 Thailand · 31 Mar 2025',
  },
  {
    id: 'VQgsH0BIyBg',
    date: '2025-02-07',
    web: 'https://thefarmerthai.com/?p=2918',
    titleTH: 'เครื่องจักรกลทางการเกษตร: โอกาสที่หลากหลายในยุคแห่งความท้าทายรอบด้าน | THE CAPTURE',
    titleEN: 'Agricultural Machinery: Opportunities Amid Challenges | THE CAPTURE',
    summaryTH: 'มุมมองอุตสาหกรรมเครื่องจักรกลเกษตรไทย — โอกาสและความท้าทายในยุคใหม่',
    summaryEN: 'Thai ag machinery industry — opportunities and challenges today',
    metaTH: 'THE FARMER · 7 ก.พ. 2568',
    metaEN: 'THE FARMER · 7 Feb 2025',
  },
  {
    id: 'rPFpeh0Tls0',
    date: '2025-01-20',
    category: 'training',
    pick: true,
    titleTH: 'หลักสูตรการบริหารจัดการน้ำเบื้องต้น จัดโดยสมาคมวิศวกรรมเกษตรแห่งประเทศไทย | THE FARMER ISSUE',
    titleEN: 'Basic Water Management Training by TSAE | THE FARMER ISSUE',
    summaryTH: 'คลิปจากหลักสูตรอบรมของสวกท. — การบริหารจัดการน้ำเบื้องต้นสำหรับเกษตรกร',
    summaryEN: 'TSAE training course on basic water management for farmers',
    metaTH: 'THE FARMER · อบรม · 20 ม.ค. 2568',
    metaEN: 'THE FARMER · Training · 20 Jan 2025',
  },
  {
    id: 'JX0F0lQCMPk',
    date: '2025-01-19',
    titleTH: 'ยกระดับผลไม้ไทยสู่ตลาดโลกด้วยเทคโนโลยีภาพอัจฉริยะเพื่อคัดแยกคุณภาพผลิตผลหลังการเก็บเกี่ยว โดย สวกท.',
    titleEN: 'Smart Vision for Post-Harvest Thai Fruit Sorting by TSAE | THE CAPTURE',
    summaryTH: 'งานวิจัยสวกท. — ระบบคัดแยกคุณภาพผลไม้หลังเก็บเกี่ยวด้วย AI และ Machine Vision',
    summaryEN: 'TSAE research on AI-powered post-harvest fruit sorting',
    metaTH: 'THE FARMER · 19 ม.ค. 2568',
    metaEN: 'THE FARMER · 19 Jan 2025',
  },
  {
    id: '2901QMdKo_c',
    date: '2024-08-16',
    titleTH: 'วิศวกรรมเกษตร จุดเปลี่ยนภาคเกษตรไทย | THE CAPTURE',
    titleEN: 'Agricultural Engineering: A Turning Point for Thai Agriculture | THE CAPTURE',
    summaryTH: 'สัมภาษณ์นายกสวกท. เรื่องบทบาทวิศวกรรมเกษตรและงาน CIAME Asia 2025',
    summaryEN: 'Interview with TSAE President on ag engineering and CIAME Asia 2025',
    metaTH: 'THE FARMER · 16 ส.ค. 2567',
    metaEN: 'THE FARMER · 16 Aug 2024',
  },
  {
    date: '2025-05-01',
    category: 'facebook',
    href: 'https://www.facebook.com/share/p/1Adi4a117H/',
    titleTH: 'อัปเดตนวัตกรรมด้านการเกษตรอัจฉริยะและการเพาะเลี้ยงสัตว์ที่ใหญ่ที่สุดในเอเชีย',
    titleEN: 'Asia’s Largest Smart Agriculture & Livestock Innovation Update',
    summaryTH: 'คลิปจาก Facebook — นวัตกรรมเกษตรอัจฉริยะและปศุสัตว์ในงานใหญ่แห่งเอเชีย',
    summaryEN: 'Facebook clip on smart ag and livestock innovations at a major Asian event',
    metaTH: 'Facebook · THE FARMER',
    metaEN: 'Facebook · THE FARMER',
  },
];

// Editable source of truth: data/cms/home-videos.json (Pages CMS).
const RAW = (videoData.length ? videoData : LEGACY_RAW) as WatchVideo[];

const CATEGORY_LABELS: Record<WatchCategory, { th: string; en: string }> = {
  symposium: { th: 'บันทึกงานสัมมนา', en: 'Symposium recording' },
  exhibition: { th: 'งานนิทรรศการ', en: 'Exhibition' },
  training: { th: 'อบรม', en: 'Training' },
  facebook: { th: 'Facebook', en: 'Facebook' },
};

const FILTER_ORDER: WatchCategory[] = ['symposium', 'exhibition', 'training', 'facebook'];

export function getWatchCategories(lang: Lang) {
  const isTH = lang === 'th';
  const videos = getWatchVideos(lang);
  const counts = videos.reduce<Record<string, number>>((acc, v) => {
    if (v.category) acc[v.category] = (acc[v.category] ?? 0) + 1;
    return acc;
  }, {});
  return [
    { key: 'all', label: isTH ? 'ทั้งหมด' : 'All', count: videos.length },
    ...FILTER_ORDER.filter((k) => counts[k]).map((k) => ({
      key: k,
      label: isTH ? CATEGORY_LABELS[k].th : CATEGORY_LABELS[k].en,
      count: counts[k] ?? 0,
    })),
  ];
}

export function getWatchVideos(lang: Lang) {
  const isTH = lang === 'th';
  return [...RAW]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((v) => ({
      ...v,
      title: isTH ? v.titleTH : v.titleEN,
      summary: isTH ? v.summaryTH : v.summaryEN,
      meta: isTH ? v.metaTH : v.metaEN,
      categoryLabel: v.category
        ? isTH
          ? CATEGORY_LABELS[v.category].th
          : CATEGORY_LABELS[v.category].en
        : '',
      isExternal: !v.id && !!v.href,
    }));
}

export function getWatchPicks(lang: Lang) {
  return getWatchVideos(lang).filter((v) => v.pick);
}

export type MembershipType = {
  key: 'regular' | 'associate' | 'life' | 'corporate';
  type: string;
  typeEN: string;
  fee: string;
  feePeriodTH: string;
  feePeriodEN: string;
  color: string;
  eligibilityTH: string;
  eligibilityEN: string;
  benefitsTH: string[];
  benefitsEN: string[];
  featured: boolean;
};

export const membershipTypes: MembershipType[] = [
  {
    key: 'regular',
    type: 'สมาชิกสามัญ',
    typeEN: 'Regular Member',
    fee: '200',
    feePeriodTH: 'ปี',
    feePeriodEN: 'year',
    color: '#1a6b3a',
    eligibilityTH: 'ผู้ที่กำลังปฏิบัติงานด้านวิศวกรรม สาขาวิศวกรรมเกษตร หรือผู้สนใจกิจการของสมาคม',
    eligibilityEN: "Those working in agricultural engineering, or anyone interested in the Society's activities",
    benefitsTH: ['เข้าร่วมประชุมวิชาการในราคาพิเศษ', 'รับวารสาร สวกท. ฟรีทุกฉบับ', 'เข้าถึงฐานข้อมูลบทความย้อนหลังทั้งหมด', 'ส่วนลดค่าลงทะเบียนอบรม 10-20%', 'สิทธิออกเสียงในที่ประชุมใหญ่', 'ใบรับรองเป็นสมาชิก สามัญ'],
    benefitsEN: ['Discounted registration at national conferences', 'Free TSAE Journal (all issues)', 'Full access to article database', '10-20% discount on training programs', 'Voting rights at general meetings', 'Regular membership certificate'],
    featured: false,
  },
  {
    key: 'associate',
    type: 'สมาชิกภาคี',
    typeEN: 'Associate Member',
    fee: '100',
    feePeriodTH: 'ปี',
    feePeriodEN: 'year',
    color: '#0891b2',
    eligibilityTH: 'นิสิต นักศึกษา',
    eligibilityEN: 'Students (undergraduate and graduate)',
    benefitsTH: ['เข้าร่วมกิจกรรมสมาคมในราคาพิเศษ', 'รับข่าวสารและประกาศจากสมาคม', 'ส่วนลดค่าลงทะเบียนอบรม 10-15%', 'เข้าถึงสรุปบทความ Abstract ฟรี', 'ใบรับรองเป็นสมาชิกภาคี'],
    benefitsEN: ['Discounted access to association activities', 'TSAE news and announcements', '10-15% discount on training programs', 'Free access to article abstracts', 'Associate membership certificate'],
    featured: false,
  },
  {
    key: 'life',
    type: 'สมาชิกสามัญตลอดชีพ',
    typeEN: 'Life Member',
    fee: '2,000',
    feePeriodTH: 'ตลอดชีพ',
    feePeriodEN: 'lifetime',
    color: '#c8a951',
    eligibilityTH: 'สมาชิกสามัญที่ชำระค่าบำรุงแบบตลอดชีพ (คุณสมบัติเช่นเดียวกับสมาชิกสามัญ)',
    eligibilityEN: 'Ordinary members paying the one-time lifetime fee (same eligibility as regular members)',
    benefitsTH: ['สิทธิ์ครบเช่นเดียวกับสมาชิกสามัญ', 'ไม่ต้องต่ออายุสมาชิกรายปี', 'รับวารสาร สวกท. ฟรีตลอดชีพ', 'ส่วนลดพิเศษค่าลงทะเบียนทุกกิจกรรม', 'ชื่อปรากฏใน Directory สมาชิกตลอดชีพ'],
    benefitsEN: ['Full privileges of a regular member', 'No annual renewal required', 'Free TSAE Journal for life', 'Special discounts on all events', 'Listed in lifetime member directory'],
    featured: true,
  },
  {
    key: 'corporate',
    type: 'สมาชิกนิติบุคคล',
    typeEN: 'Corporate Member',
    fee: '1,000',
    feePeriodTH: 'ปี',
    feePeriodEN: 'year',
    color: '#7c3aed',
    eligibilityTH: 'บริษัท ห้างหุ้นส่วนจำกัด สมาคม กลุ่มสหกรณ์ กลุ่มเกษตรกร ฯลฯ',
    eligibilityEN: 'Companies, limited partnerships, associations, cooperatives, farmer groups, etc.',
    benefitsTH: ['โลโก้ปรากฏบนเว็บไซต์สมาคม', 'ประชาสัมพันธ์กิจกรรมองค์กรผ่านช่องทางสมาคม', 'ส่วนลดพิเศษสำหรับบุคลากร 5 คน', 'โอกาสร่วมจัดกิจกรรมกับสมาคม', 'Certificate of Corporate Membership'],
    benefitsEN: ['Logo on TSAE website', 'Promote organizational events through TSAE channels', 'Special discount for up to 5 staff members', 'Co-hosting opportunities with TSAE', 'Certificate of Corporate Membership'],
    featured: false,
  },
];

export const membershipIconPaths: Record<MembershipType['key'], string> = {
  regular:
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  associate:
    'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  life:
    'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  corporate:
    'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
};

export type RegItem = { th: string; en: string; sub?: { th: string; en: string }[] };
export type RegChapter = { num: number; th: string; en: string; items: RegItem[] };

export const regulations: RegChapter[] = [
  {
    num: 1,
    th: 'ชื่อ เครื่องหมาย และสถานที่',
    en: 'Name, Emblem, and Location',
    items: [
      {
        th: 'สมาคมนี้มีชื่อ "สมาคมวิศวกรรมเกษตรแห่งประเทศไทย" ใช้อักษรย่อว่า สวกท. มีชื่อภาษาอังกฤษว่า "Thai Society of Agricultural Engineering" ใช้อักษรย่อว่า TSAE',
        en: 'This association is named "สมาคมวิศวกรรมเกษตรแห่งประเทศไทย", abbreviated "สวกท." in Thai, with the English name "Thai Society of Agricultural Engineering", abbreviated "TSAE".',
      },
      {
        th: 'เครื่องหมายของสมาคมเป็นรูปตราสัญลักษณ์ของสมาคม',
        en: 'The emblem of the association is the official logo of the association.',
      },
      {
        th: 'สำนักงานของสมาคมตั้งอยู่ที่ ภาควิชาวิศวกรรมเกษตร คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเกษตรศาสตร์',
        en: 'The office of the association is located at the Department of Agricultural Engineering, Faculty of Engineering, Kasetsart University.',
      },
    ],
  },
  {
    num: 2,
    th: 'วัตถุประสงค์',
    en: 'Objectives',
    items: [
      {
        th: 'เพื่อการเป็นที่ปรึกษา ส่งเสริมการศึกษา วิจัย และเผยแพร่วิทยาการทางวิศวกรรมเกษตร ชีววิศวกรรม และอุตสาหกรรมที่เกี่ยวข้อง',
        en: 'To act as an advisor and to promote education, research, and dissemination of knowledge in agricultural engineering, bioengineering, and related industries.',
      },
      {
        th: 'เพื่อส่งเสริมสามัคคีธรรม ผดุงเกียรติ และสงเคราะห์ช่วยเหลือระหว่างสมาชิก และให้สวัสดิการแก่สมาชิก',
        en: 'To promote unity, uphold honor, provide mutual assistance among members, and offer welfare to members.',
      },
      {
        th: 'เพื่อส่งเสริมการกุศล การกีฬา และการบันเทิง',
        en: 'To promote charity, sports, and recreation.',
      },
      {
        th: 'เพื่อส่งเสริมเกียรติแห่งวิชาชีพวิศวกรรมเกษตร และสมาชิกผู้ประกอบกิจทางด้านวิศวกรรมเกษตรอันเป็นประโยชน์ต่อส่วนรวม',
        en: 'To promote the honor of the agricultural engineering profession and members engaged in agricultural engineering work for the public benefit.',
      },
      {
        th: 'เพื่อประสานงานระหว่างสถาบันต่างๆ ทั้งภายในและภายนอกประเทศ ที่มีวัตถุประสงค์ทำนองเดียวกัน',
        en: 'To coordinate with institutions both domestic and international that share similar objectives.',
      },
    ],
  },
  {
    num: 3,
    th: 'สมาชิก',
    en: 'Membership',
    items: [
      {
        th: 'สมาชิกมี 4 ประเภท คือ',
        en: 'There are four categories of members:',
        sub: [
          { th: 'สมาชิกสามัญ ได้แก่ ผู้ที่กำลังปฏิบัติงานด้านวิศวกรรม สาขาวิศวกรรมเกษตร หรือผู้สนใจกิจการของสมาคม', en: 'Regular members: those working in engineering, in the field of agricultural engineering, or those interested in the association\u2019s affairs.' },
          { th: 'สมาชิกภาคี ได้แก่ นิสิต นักศึกษา', en: 'Associate members: students.' },
          { th: 'สมาชิกกิตติมศักดิ์ ได้แก่ ผู้ทรงเกียรติ หรือผู้ทรงคุณวุฒิ ที่คณะกรรมการบริหารสมาคมมีมติเป็นเอกฉันท์ให้เชิญเป็นสมาชิกกิตติมศักดิ์', en: 'Honorary members: distinguished or highly qualified persons whom the executive committee unanimously resolves to invite as honorary members.' },
          { th: 'สมาชิกนิติบุคคล เช่น บริษัท ห้างหุ้นส่วนจำกัด สมาคม กลุ่มสหกรณ์ กลุ่มเกษตรกร ฯลฯ', en: 'Corporate members: e.g., companies, limited partnerships, associations, cooperative groups, farmer groups, etc.' },
        ],
      },
      {
        th: 'ผู้ที่ประสงค์จะสมัครเป็นสมาชิกภาคีและสามัญของสมาคม ให้ยื่นใบสมัครตามแบบและวิธีการของสมาคมพร้อมค่าบำรุงต่อเลขาธิการสมาคม',
        en: 'Those wishing to apply as associate or regular members shall submit an application in the form and manner prescribed by the association, together with the membership fee, to the Secretary-General.',
      },
      {
        th: 'ผู้สมัครเข้าเป็นสมาชิกต้องมีคุณสมบัติดังต่อไปนี้: มีความประพฤติเรียบร้อย; ไม่เป็นผู้ต้องรับโทษจำคุกโดยคำพิพากษา เว้นแต่ความผิดลหุโทษหรือความผิดที่ได้กระทำโดยประมาท',
        en: 'Applicants must have the following qualifications: good conduct; and not be subject to imprisonment by a court judgment, except for petty offenses or offenses committed through negligence.',
      },
      {
        th: 'เมื่อคณะกรรมการบริหารสมาคมรับผู้สมัครเข้าเป็นสมาชิกแล้ว ให้เลขาธิการแจ้งผู้สมัครทราบเป็นหนังสือพร้อมหนังสือข้อบังคับ 1 ชุด และแจ้งนายทะเบียนและเหรัญญิกทราบเป็นหนังสือภายใน 7 วัน',
        en: 'Once the executive committee admits an applicant as a member, the Secretary-General shall notify the applicant in writing together with one copy of the regulations, and notify the registrar and treasurer in writing within 7 days.',
      },
      {
        th: 'ให้นายทะเบียนออกเลขที่สมาชิกและบัตรสมาชิก บันทึกชื่อสมาชิกทุกประเภทไว้ในทะเบียน และประกาศชื่อให้ทราบทั่วกันในวารสารและที่สำนักงานของสมาคม',
        en: 'The registrar shall issue membership numbers and cards, record all categories of members in the register, and announce the names in the journal and at the association\u2019s office.',
      },
      {
        th: 'บัตรประจำตัวสมาชิกให้คณะกรรมการบริหารเป็นผู้กำหนดและจัดทำ โดยนายกสมาคมเป็นผู้ลงชื่อในบัตร',
        en: 'Membership cards shall be determined and produced by the executive committee, with the President signing the cards.',
      },
      {
        th: 'หากคณะกรรมการบริหารเห็นว่ารับสมัครไม่ได้ ให้เลขาธิการแจ้งผู้สมัครทราบเป็นหนังสือพร้อมคืนค่าบำรุงภายใน 7 วัน แต่ไม่ตัดสิทธิผู้สมัครที่จะสมัครใหม่เมื่อพ้นระยะ 1 ปี',
        en: 'If the executive committee decides not to admit an applicant, the Secretary-General shall notify the applicant in writing and refund the fee within 7 days, without depriving the applicant of the right to reapply after 1 year.',
      },
      {
        th: 'สมาชิกสามัญอาจได้รับเชิญเป็นสมาชิกกิตติมศักดิ์ได้โดยไม่เสียสิทธิเดิม แต่ต้องปฏิบัติหน้าที่ของสมาชิกเดิมโดยสมบูรณ์',
        en: 'A regular member may be invited to become an honorary member without losing the original rights, but must fully perform the duties of the original membership.',
      },
      {
        th: 'สมาชิกอาจขอเปลี่ยนประเภทได้เมื่อมีคุณสมบัติครบตามข้อกำหนดของสมาชิกประเภทนั้น โดยยื่นหนังสือต่อเลขาธิการสมาคม',
        en: 'A member may request a change of category upon meeting the qualifications of that category by submitting a written request to the Secretary-General.',
      },
    ],
  },
  {
    num: 4,
    th: 'ค่าบำรุงและค่าธรรมเนียมอื่นๆ',
    en: 'Membership Fees and Other Charges',
    items: [
      {
        th: 'สมาชิกภาคีเสียค่าบำรุงคนละ 100 บาทต่อปี, สมาชิกสามัญเสียค่าบำรุงคนละ 200 บาทต่อปี หรือค่าบำรุงตลอดชีพคนละ 2,000 บาท และสมาชิกนิติบุคคลเสียค่าบำรุงรายละ 1,000 บาทต่อปี',
        en: 'Associate members pay 100 baht per year; regular members pay 200 baht per year or a lifetime fee of 2,000 baht; corporate members pay 1,000 baht per year.',
      },
      {
        th: 'ค่าบำรุงสมาคมให้นับจากวันสมัครจนครบรอบ 12 เดือน นับเป็น 1 ปี',
        en: 'Membership fees are counted from the date of application until completing 12 months, counted as one year.',
      },
      {
        th: 'ค่าบำรุงประจำปีให้ชำระภายหลังจากหมดอายุนับจากวันสมัครหรือวันต่ออายุ',
        en: 'Annual fees shall be paid after expiry counted from the date of application or renewal.',
      },
      {
        th: 'ค่าธรรมเนียมหมายถึงค่าใช้จ่ายอื่นๆ นอกเหนือจากค่าบำรุงที่สมาคมจะต้องชำระ',
        en: 'Charges refer to expenses other than membership fees that the association must pay.',
      },
    ],
  },
  {
    num: 5,
    th: 'สิทธิและหน้าที่ของสมาชิก',
    en: 'Rights and Duties of Members',
    items: [
      { th: 'สมาชิกมีสิทธิประดับเครื่องหมายของสมาคมซึ่งสมาคมเป็นผู้จำหน่ายให้', en: 'Members have the right to wear the association\u2019s emblem, which the association provides for sale.' },
      { th: 'สมาชิกมีสิทธิใช้สถานที่ รับวารสารหรือข่าวสารของสมาคม และรับบริการต่างๆ ที่สมาคมจัดให้มีขึ้น', en: 'Members have the right to use the premises, receive the journal or news of the association, and receive the various services provided by the association.' },
      { th: 'สมาชิกมีสิทธิเข้าประชุมในที่ประชุมใหญ่ ซึ่งเลขาธิการสมาคมจะแจ้งให้ทราบล่วงหน้าไม่น้อยกว่า 15 วัน', en: 'Members have the right to attend the general meeting, of which the Secretary-General shall give at least 15 days\u2019 advance notice.' },
      { th: 'สมาชิกมีสิทธิเสนอความคิดเห็นเกี่ยวกับกิจการของสมาคมต่อคณะกรรมการบริหารหรือในที่ประชุมใหญ่', en: 'Members have the right to propose opinions on the association\u2019s affairs to the executive committee or at the general meeting.' },
      { th: 'สมาชิกสามัญเท่านั้นมีสิทธิสมัครเข้ารับเลือกเป็นนายกสมาคม', en: 'Only regular members have the right to stand for election as President of the association.' },
      { th: 'สมาชิกสามัญและสมาชิกนิติบุคคลมีสิทธิออกเสียงลงคะแนนเลือกตั้งนายกสมาคมและการลงมติอื่นๆ โดยถือหลักสมาชิก 1 ราย 1 เสียง โดยสมาชิกนิติบุคคลต้องออกเสียงโดยผู้มีอำนาจลงนามหรือมีหนังสือรับรองจากผู้มีอำนาจลงนามยื่นต่อคณะกรรมการเลือกตั้ง', en: 'Regular and corporate members have the right to vote in the election of the President and other resolutions, on a one-member-one-vote basis; corporate members must vote through an authorized signatory or a certification letter from the authorized signatory submitted to the election committee.' },
      { th: 'สมาชิกมีหน้าที่ร่วมมือส่งเสริมและปฏิบัติตามวัตถุประสงค์ของสมาคม รักษาเกียรติคุณของสมาคม ปฏิบัติตามระเบียบข้อบังคับ และให้ความร่วมมือในการเป็นกรรมการหรืออนุกรรมการช่วยดำเนินงานของสมาคม', en: 'Members have the duty to cooperate in promoting and fulfilling the objectives of the association, uphold its honor, comply with its rules and regulations, and cooperate as committee or subcommittee members to support its operations.' },
      { th: 'ผู้ที่ขาดจากสมาชิกภาพย่อมไม่ได้รับสิทธิและหน้าที่ข้างต้น และไม่มีสิทธิเรียกร้องเกี่ยวกับทรัพย์สินของสมาคม', en: 'Those who lose membership shall not receive the above rights and duties and have no claim to the association\u2019s assets.' },
    ],
  },
  {
    num: 6,
    th: 'การขาดจากสมาชิกภาพ',
    en: 'Loss of Membership',
    items: [
      {
        th: 'สมาชิกขาดจากสมาชิกภาพต่อเมื่อ',
        en: 'Membership is lost when:',
        sub: [
          { th: 'ตาย', en: 'Death.' },
          { th: 'ลาออก', en: 'Resignation.' },
          { th: 'ถูกถอนชื่อออกจากทะเบียน', en: 'Removal from the register.' },
          { th: 'ขาดคุณสมบัติตามหมวด 3 หรือประพฤติตนเสื่อมเสียแก่สมาคมอย่างร้ายแรง และคณะกรรมการบริหารลงมติให้ออกด้วยคะแนนเสียง 3 ใน 4', en: 'Losing qualifications under Chapter 3, or seriously damaging conduct toward the association, with the executive committee resolving for removal by a three-fourths vote.' },
        ],
      },
      { th: 'สมาชิกที่ประสงค์จะลาออกให้แสดงความจำนงเป็นลายลักษณ์อักษรยื่นต่อเลขาธิการสมาคมเพื่อนำเสนอคณะกรรมการบริหารเพื่อทราบ', en: 'A member wishing to resign shall submit a written intention to the Secretary-General for presentation to the executive committee for acknowledgment.' },
      { th: 'สมาชิกที่ไม่ชำระค่าบำรุงหรือมีหนี้สินอื่นกับสมาคม ให้เหรัญญิกส่งหนังสือเตือน 2 ครั้ง ห่างกันไม่น้อยกว่า 30 วัน หากไม่ชำระหรือไม่ชี้แจงเหตุผลจนเป็นที่พอใจภายใน 30 วันหลังการเตือนครั้งสุดท้าย ให้คณะกรรมการบริหารถอนชื่อออกจากทะเบียนได้', en: 'For a member who does not pay fees or has other debts to the association, the treasurer shall send two warning notices at least 30 days apart; if unpaid or unexplained satisfactorily within 30 days after the last warning, the executive committee may remove the name from the register.' },
      { th: 'ผู้ที่ขาดจากสมาชิกภาพแล้วให้เลขาธิการแจ้งต่อเหรัญญิกและนายทะเบียนสมาคมทราบภายใน 7 วัน', en: 'Upon loss of membership, the Secretary-General shall notify the treasurer and registrar within 7 days.' },
    ],
  },
  {
    num: 7,
    th: 'คณะกรรมการบริหารสมาคม',
    en: 'Executive Committee',
    items: [
      {
        th: 'นายกสมาคมเป็นผู้แต่งตั้งคณะกรรมการบริหารสมาคม ซึ่งประกอบด้วยบุคคลจำนวนอย่างน้อย 9 คน โดยมีหน้าที่ต่างๆ ดังนี้',
        en: 'The President appoints the executive committee, comprising at least 9 persons, with the following positions:',
        sub: [
          { th: 'นายก', en: 'President' },
          { th: 'อุปนายก', en: 'Vice President' },
          { th: 'เลขาธิการ', en: 'Secretary-General' },
          { th: 'เหรัญญิก', en: 'Treasurer' },
          { th: 'นายทะเบียน', en: 'Registrar' },
          { th: 'ปฏิคม', en: 'Reception Officer' },
          { th: 'สาราณียกร', en: 'Editor/Publications Officer' },
          { th: 'ประธานฝ่ายวิชาการ', en: 'Chair of Academic Affairs' },
          { th: 'ประธานฝ่ายประชาสัมพันธ์', en: 'Chair of Public Relations' },
          { th: 'ตำแหน่งอื่นๆ ตามความเหมาะสม', en: 'Other positions as appropriate' },
        ],
      },
    ],
  },
  {
    num: 8,
    th: 'การเลือกตั้งนายกสมาคม',
    en: 'Election of the President',
    items: [
      { th: 'ให้ที่ประชุมใหญ่สามัญประจำปีเลือกตั้งนายกสมาคมทุก 2 ปี โดยสมาชิกสามัญและสมาชิกนิติบุคคลลงคะแนน และคัดเลือกด้วยคะแนนเสียงข้างมาก', en: 'The annual general meeting shall elect the President every 2 years, with regular and corporate members voting and selecting by majority vote.' },
      { th: 'ก่อนวันประชุมเลือกตั้ง 30 วัน สมาชิกสามัญที่ประสงค์จะสมัครต้องส่งใบสมัครให้เลขาธิการ หรือให้มีการเสนอชื่อจากสมาชิกในวันเลือกตั้ง', en: 'Thirty days before the election, a regular member wishing to stand must submit an application to the Secretary-General, or may be nominated by members on the election day.' },
      { th: 'ผู้สมัครหรือผู้ถูกเสนอชื่อและสมาชิกที่มีสิทธิลงคะแนนต้องเป็นผู้ที่ไม่ขาดจากสมาชิกภาพตามหมวด 6', en: 'Candidates or nominees and voting members must not have lost membership under Chapter 6.' },
      { th: 'เลขาธิการต้องประกาศเลขที่และชื่อผู้สมัครล่วงหน้าอย่างน้อย 3 วัน ณ ที่ทำการสมาคม', en: 'The Secretary-General must announce the numbers and names of candidates at least 3 days in advance at the association\u2019s office.' },
      { th: 'เลขาธิการต้องประกาศเลขที่และรายชื่อสมาชิกที่มีสิทธิลงคะแนนก่อนการเลือกตั้งอย่างน้อย 15 วัน ณ ที่ทำการสมาคม', en: 'The Secretary-General must announce the numbers and names of eligible voters at least 15 days before the election at the association\u2019s office.' },
      { th: 'ให้คณะกรรมการบริหารที่จะหมดวาระเป็นผู้เตรียมการเลือกตั้ง โดยที่ประชุมใหญ่สามัญเลือกประธานการเลือกตั้งและผู้ช่วยอีก 4 คน เป็นคณะกรรมการเลือกตั้งดำเนินการและควบคุมให้ยุติธรรม โดยไม่ควรเป็นผู้สมัครรับเลือกตั้ง', en: 'The outgoing executive committee shall prepare the election, with the general meeting selecting an election chair and four assistants as the election committee to conduct and supervise it fairly; they should not be candidates.' },
      { th: 'ให้ประธานการเลือกตั้งนับคะแนนและประกาศผลให้ที่ประชุมใหญ่สามัญประจำปีทราบภายในวันเลือกตั้ง', en: 'The election chair shall count the votes and announce the results to the annual general meeting within the election day.' },
      { th: 'นายกสมาคมและคณะกรรมการบริหารอยู่ในตำแหน่งได้คราวละไม่เกิน 2 ปี โดยนับตั้งแต่วันที่ได้รับมอบงานจากคณะชุดเดิม', en: 'The President and executive committee hold office for a term of no more than 2 years, counted from the date of handover from the previous committee.' },
    ],
  },
  {
    num: 9,
    th: 'อำนาจและหน้าที่ของกรรมการบริหารสมาคม',
    en: 'Powers and Duties of the Executive Committee',
    items: [
      { th: 'นายกสมาคมเป็นประธานในที่ประชุมคณะกรรมการบริหารและที่ประชุมใหญ่ เป็นหัวหน้าและรับผิดชอบในการบริหารกิจการของสมาคม และมีอำนาจถอดถอนกรรมการบริหารได้โดยความเห็นชอบจากคณะกรรมการบริหาร', en: 'The President chairs the executive committee and general meetings, leads and is responsible for managing the association\u2019s affairs, and may remove committee members with the committee\u2019s consent.' },
      { th: 'อุปนายกเป็นผู้ช่วยนายกสมาคม และทำหน้าที่บริหารแทนเมื่อนายกไม่สามารถปฏิบัติงานได้', en: 'The Vice President assists the President and acts on his behalf when the President is unable to perform duties.' },
      { th: 'เลขาธิการมีหน้าที่ดำเนินงานของสมาคมตามที่นายกหรืออุปนายกมอบหมาย ติดต่อกับสมาชิกและบุคคลภายนอก รักษาระเบียบข้อบังคับ นัดประชุมโดยแจ้งวาระล่วงหน้าไม่น้อยกว่า 3 วัน จดบันทึกการประชุม และรักษาเอกสารของสมาคม', en: 'The Secretary-General manages the association\u2019s work as assigned by the President or Vice President, liaises with members and outsiders, maintains the rules, convenes meetings with at least 3 days\u2019 agenda notice, records minutes, and keeps the association\u2019s documents.' },
      { th: 'เหรัญญิกมีหน้าที่รับจ่ายและรักษาเงิน ทำบัญชีรับจ่าย หนี้สิน และเอกสารการเงิน ทำบัญชีการเงินรายเดือน งบประมาณและงบดุลประจำปีเสนอคณะกรรมการบริหาร', en: 'The Treasurer receives, disburses, and safeguards funds; keeps accounts of receipts/payments, debts, and financial documents; prepares monthly financial accounts, budgets, and annual balance sheets for the executive committee.' },
      { th: 'นายทะเบียนมีหน้าที่จัดทำทะเบียนและประวัติของสมาชิก', en: 'The Registrar maintains the register and records of members.' },
      { th: 'ปฏิคมมีหน้าที่ติดต่อและต้อนรับ', en: 'The Reception Officer handles liaison and hospitality.' },
      { th: 'สาราณียกรมีหน้าที่รับผิดชอบและดำเนินการเกี่ยวกับการจัดทำเอกสารและวารสารของสมาคม', en: 'The Publications Officer is responsible for producing the association\u2019s documents and journal.' },
      { th: 'ประธานฝ่ายวิชาการมีหน้าที่จัดการสัมมนา นิทรรศการ และรวบรวมเอกสารทางวิชาการ', en: 'The Chair of Academic Affairs organizes seminars and exhibitions and compiles academic documents.' },
      { th: 'ประธานฝ่ายประชาสัมพันธ์มีหน้าที่จัดการถ่ายภาพและเผยแพร่กิจกรรมของสมาคม', en: 'The Chair of Public Relations manages photography and dissemination of the association\u2019s activities.' },
      { th: 'กรรมการตำแหน่งอื่นๆ มีหน้าที่ช่วยเหลือกิจการต่างๆ และปฏิบัติหน้าที่ตามที่นายกสมาคมมอบหมาย', en: 'Other committee members assist in various affairs and perform duties as assigned by the President.' },
    ],
  },
  {
    num: 10,
    th: 'การพ้นจากตำแหน่งของกรรมการบริหารสมาคม',
    en: 'Vacation of Office by Committee Members',
    items: [
      {
        th: 'กรรมการบริหารสมาคมพ้นจากตำแหน่งโดย',
        en: 'A committee member vacates office by:',
        sub: [
          { th: 'ออกตามวาระ', en: 'Completion of term.' },
          { th: 'ลาออก', en: 'Resignation.' },
          { th: 'ตาย', en: 'Death.' },
          { th: 'ขาดจากสมาชิกภาพ', en: 'Loss of membership.' },
          { th: 'คณะกรรมการบริหารมีมติให้พ้นจากตำแหน่ง', en: 'Resolution of the executive committee to remove.' },
          { th: 'ต้องรับโทษจำคุกโดยคำพิพากษา เว้นแต่ความผิดลหุโทษหรือความผิดที่กระทำโดยประมาท', en: 'Imprisonment by court judgment, except for petty offenses or offenses committed through negligence.' },
          { th: 'ก่อความเสียหายร้ายแรงแก่สมาคม และที่ประชุมใหญ่ลงมติไม่ไว้วางใจถอนกรรมการทั้งคณะหรือบางคนด้วยคะแนนเสียง 3 ใน 4 ของสมาชิกที่มาประชุม', en: 'Causing serious damage to the association, with the general meeting passing a vote of no confidence to remove all or some members by a three-fourths vote of members present.' },
        ],
      },
      { th: 'หากกรรมการบริหารพ้นจากตำแหน่ง ให้มีการมอบหมายงานให้แก่กรรมการที่เข้ารับหน้าที่ใหม่ภายใน 30 วัน กรณีพ้นตำแหน่งเพราะเหตุร้ายแรง ให้คณะกรรมการที่เหลืออยู่ทำการมอบหมายงานแทน', en: 'When a committee member vacates office, duties shall be handed over to the incoming member within 30 days; in cases of removal for serious cause, the remaining committee shall carry out the handover.' },
    ],
  },
  {
    num: 11,
    th: 'การดำเนินงานของคณะกรรมการบริหารสมาคม',
    en: 'Operations of the Executive Committee',
    items: [
      { th: 'การบริหารสมาคมจะกระทำได้เมื่อจัดตั้งกรรมการบริหารครบตามหมวด 7 แล้ว โดยมีนายกสมาคมเป็นประธาน', en: 'Administration may be carried out once the committee is fully constituted under Chapter 7, with the President as chair.' },
      {
        th: 'คณะกรรมการบริหารสมาคมมีอำนาจและหน้าที่ คือ',
        en: 'The executive committee has the following powers and duties:',
        sub: [
          { th: 'บริหารกิจการของสมาคมให้เป็นไปตามวัตถุประสงค์', en: 'Manage the association\u2019s affairs in accordance with its objectives.' },
          { th: 'วางระเบียบขึ้นใช้โดยไม่ขัดต่อวัตถุประสงค์', en: 'Issue rules that do not conflict with the objectives.' },
          { th: 'แต่งตั้งกรรมการที่ปรึกษา อนุกรรมการ หรือพิจารณาเชิญผู้มีเกียรติคุณเป็นสมาชิกกิตติมศักดิ์ ทั้งชั่วคราวหรือถาวร', en: 'Appoint advisory members, subcommittees, or invite distinguished persons as honorary members, whether temporary or permanent.' },
          { th: 'แต่งตั้ง บรรจุ ปลดพนักงานของสมาคม', en: 'Appoint, employ, and dismiss staff of the association.' },
          { th: 'พิจารณาและลงมติการรับและถอดถอนสมาชิก', en: 'Consider and resolve on admission and removal of members.' },
          { th: 'พิจารณาการให้ของที่ระลึกในนามสมาคมแก่ผู้ช่วยเหลือกิจการของสมาคม', en: 'Consider giving mementos in the association\u2019s name to those who assist its affairs.' },
          { th: 'พิจารณาการรับและให้ความช่วยเหลือจากรัฐบาล รัฐวิสาหกิจ สถาบัน และบุคคล โดยไม่ผูกพันเป็นหนี้สินแก่สมาคม เว้นแต่ได้รับอนุมัติจากที่ประชุมใหญ่', en: 'Consider receiving and giving assistance from government, state enterprises, institutions, and individuals without binding the association in debt, except with approval of the general meeting.' },
        ],
      },
      { th: 'ในระหว่างที่คณะกรรมการชุดใหม่ยังมิได้รับมอบงาน ให้คณะกรรมการชุดเก่ารับผิดชอบต่อไปเท่าที่จำเป็น และต้องมอบหมายงานให้เสร็จภายใน 30 วันนับจากวันที่คณะใหม่ได้รับเลือกตั้ง โดยทำเป็นหนังสือเป็นหลักฐาน', en: 'While the new committee has not yet received the handover, the old committee remains responsible as necessary and must complete the handover within 30 days of the new committee\u2019s election, documented in writing.' },
      { th: 'กรณีนายกสมาคมไม่สามารถปฏิบัติงานได้ ให้อุปนายกทำหน้าที่แทน ถ้าทั้งนายกและอุปนายกไม่สามารถปฏิบัติได้ ให้คณะกรรมการบริหารเลือกกรรมการคนหนึ่งทำหน้าที่แทน', en: 'If the President cannot perform duties, the Vice President acts on his behalf; if both cannot, the committee selects one member to act.' },
      { th: 'ถ้าตำแหน่งนายกว่างลงด้วยเหตุอื่นนอกจากออกตามวาระ ให้อุปนายกเป็นนายกจนหมดวาระ แต่ถ้าว่างเพราะนายกลาออก ให้ถือว่าคณะกรรมการชุดนั้นหมดสภาพ และให้เลือกตั้งใหม่ภายใน 30 วัน', en: 'If the presidency becomes vacant for reasons other than end of term, the Vice President serves until the term ends; but if it is vacant due to the President\u2019s resignation, that committee is deemed dissolved and a new election held within 30 days.' },
      { th: 'ถ้าตำแหน่งกรรมการบริหารใดว่างลง ให้นายกสมาคมแต่งตั้งจากสมาชิกสามัญเข้าดำรงตำแหน่งจนหมดวาระ', en: 'If any committee position becomes vacant, the President appoints a regular member to fill it until the term ends.' },
    ],
  },
  {
    num: 12,
    th: 'กรรมการที่ปรึกษาและอนุกรรมการ',
    en: 'Advisory Members and Subcommittees',
    items: [
      { th: 'กรรมการที่ปรึกษาที่คณะกรรมการบริหารเชิญมา มีหน้าที่ให้คำแนะนำในกิจการทั่วไป และอยู่ในตำแหน่งตามวาระของคณะกรรมการบริหารชุดที่แต่งตั้ง', en: 'Advisory members invited by the executive committee provide advice on general affairs and hold office for the term of the appointing committee.' },
      { th: 'คณะอนุกรรมการที่คณะกรรมการบริหารแต่งตั้ง มีหน้าที่ดำเนินการตามที่ได้รับมอบหมายเป็นครั้งคราว และอยู่ในตำแหน่งตามที่ได้รับมอบหมายหรือตามวาระของคณะกรรมการบริหารชุดที่แต่งตั้ง', en: 'Subcommittees appointed by the executive committee act as assigned from time to time and hold office as assigned or for the term of the appointing committee.' },
      { th: 'กรรมการที่ปรึกษาและอนุกรรมการไม่มีสิทธิออกเสียงลงมติในที่ประชุมคณะกรรมการบริหารสมาคม', en: 'Advisory members and subcommittee members have no right to vote in executive committee meetings.' },
    ],
  },
  {
    num: 13,
    th: 'การประชุม',
    en: 'Meetings',
    items: [
      {
        th: 'การประชุมแบ่งออกเป็น 3 ประเภท คือ การประชุมคณะกรรมการบริหารสมาคม, การประชุมใหญ่วิสามัญ และการประชุมใหญ่สามัญ',
        en: 'There are three types of meetings: executive committee meetings, extraordinary general meetings, and annual general meetings.',
      },
      {
        th: 'การประชุมคณะกรรมการบริหารสมาคม',
        en: 'Executive committee meetings:',
        sub: [
          { th: 'ให้คณะกรรมการบริหารประชุมปรึกษากิจการของสมาคมปีละไม่น้อยกว่า 2 ครั้ง โดยเลขาธิการเป็นผู้เรียกประชุมตามความเห็นชอบของนายก หรือของกรรมการบริหารตั้งแต่ 5 คนขึ้นไป', en: 'The committee shall meet to discuss affairs at least twice a year, convened by the Secretary-General with the President\u2019s consent or by five or more committee members.' },
          { th: 'องค์ประชุมทุกครั้งต้องมีกรรมการบริหารเข้าประชุมไม่น้อยกว่า 7 คน โดยนายกสมาคมเป็นประธาน หากนายกไม่อยู่ให้ที่ประชุมเลือกประธานชั่วคราว', en: 'A quorum requires at least 7 committee members present, chaired by the President; if absent, the meeting selects a temporary chair.' },
          { th: 'มติของที่ประชุมคณะกรรมการบริหารให้ถือเสียงข้างมาก ถ้าคะแนนเท่ากันให้ประธานเป็นผู้ชี้ขาด', en: 'Resolutions are by majority vote; in a tie, the chair decides.' },
        ],
      },
      {
        th: 'การประชุมใหญ่วิสามัญ',
        en: 'Extraordinary general meetings:',
        sub: [
          { th: 'คณะกรรมการบริหารเห็นสมควรด้วยคะแนนเสียงไม่ต่ำกว่าครึ่งหนึ่งให้เรียกประชุมใหญ่วิสามัญได้', en: 'The committee may call one by a vote of not less than half.' },
          { th: 'สมาชิกสามัญไม่น้อยกว่า 20 คน มีสิทธิร้องขอให้เปิดประชุมใหญ่วิสามัญ โดยยื่นเป็นหนังสือต่อเลขาธิการล่วงหน้าไม่น้อยกว่า 15 วัน หากมาไม่ครบ 20 คน ถือว่าไม่ครบองค์ประชุม', en: 'At least 20 regular members may request one by written notice to the Secretary-General at least 15 days in advance; if fewer than 20 attend, there is no quorum.' },
          { th: 'ให้เลขาธิการเป็นผู้นัดหมายพร้อมส่งระเบียบวาระให้สมาชิกทราบล่วงหน้าก่อนการประชุมไม่น้อยกว่า 7 วัน', en: 'The Secretary-General arranges and sends the agenda to members at least 7 days before the meeting.' },
          { th: 'ต้องมีสมาชิกเข้าประชุมไม่น้อยกว่า 20 คน จึงจะเป็นองค์ประชุม', en: 'A quorum requires at least 20 members present.' },
        ],
      },
      {
        th: 'การประชุมใหญ่สามัญ',
        en: 'Annual general meetings:',
        sub: [
          { th: 'ให้คณะกรรมการบริหารเรียกประชุมใหญ่อย่างน้อยปีละหนึ่งครั้ง องค์ประชุมต้องมีสมาชิกสามัญและสมาชิกนิติบุคคลรวมกันไม่น้อยกว่า 40 ราย หากไม่ครบให้เรียกประชุมใหญ่ภายใน 60 วัน ซึ่งครั้งนี้สมาชิกมาเท่าใดก็ถือเป็นองค์ประชุม โดยมีระเบียบวาระ: นายกแถลงผลงานในรอบปี, เหรัญญิกเสนองบดุลที่ผู้ตรวจบัญชีรับรอง, เสนองบประมาณ, ปรึกษากิจการของสมาคม และเลือกตั้งนายกตามวาระ (ถ้ามี)', en: 'The committee shall convene at least once a year; a quorum requires at least 40 regular and corporate members combined; if not met, a new meeting is called within 60 days at which any number attending forms a quorum. The agenda includes: the President\u2019s annual report, the Treasurer\u2019s audited balance sheet, budget proposal, discussion of affairs, and election of the President when due.' },
          { th: 'ให้คณะกรรมการบริหารแจ้งสมาชิกล่วงหน้าเป็นหนังสือไม่น้อยกว่า 15 วัน พร้อมสถานที่และระเบียบวาระการประชุม', en: 'The committee shall notify members in writing at least 15 days in advance, with the venue and agenda.' },
        ],
      },
      { th: 'การประชุมใหญ่ทุกครั้งให้นายกสมาคมเป็นประธานประชุม หากนายกไม่อยู่หรือไม่สามารถดำเนินการได้ ให้อุปนายกเป็นประธาน ถ้าทั้งนายกและอุปนายกไม่สามารถดำเนินการได้ ให้ที่ประชุมเลือกกรรมการบริหารคนหนึ่งเป็นประธานที่ประชุมนั้น', en: 'The President chairs every general meeting; if the President is absent or unable, the Vice President chairs; if both are unable, the meeting selects one committee member as chair.' },
      { th: 'นอกจากจะบังคับไว้เป็นอย่างอื่น มติของที่ประชุมให้ถือเสียงข้างมาก ถ้าคะแนนเสียงเท่ากันให้ประธานที่ประชุมเป็นผู้ชี้ขาด', en: 'Unless otherwise required, resolutions are by majority vote; in a tie, the chair of the meeting decides.' },
      { th: 'ในที่ประชุมใหญ่และการประชุมกรรมการบริหารทุกครั้ง ให้เลขาธิการหรือผู้ช่วยเลขาธิการสมาคมเป็นผู้บันทึกรายงานการประชุม และให้ประธานที่ประชุมลงนามรับรองเพื่อรักษาไว้เป็นหลักฐาน', en: 'At every general meeting and executive committee meeting, the Secretary-General or assistant records the minutes, which the chair signs to certify and keep as evidence.' },
    ],
  },
  {
    num: 14,
    th: 'การเงิน',
    en: 'Finance',
    items: [
      { th: 'ให้นายกสมาคมและเหรัญญิกเป็นผู้รับผิดชอบการเงินและทรัพย์สินของสมาคมตามกฎหมาย และทำรายงานการเงินและทรัพย์สินเสนอคณะกรรมการบริหารทุก 6 เดือน', en: 'The President and Treasurer are legally responsible for the association\u2019s finances and assets and shall report on finances and assets to the committee every 6 months.' },
      { th: 'เงินของสมาคมต้องนำฝากธนาคารหรือสถาบันการเงินที่เชื่อถือได้ในนามของสมาคม โดยเงินส่วนหนึ่งให้ฝากประจำหรือดำเนินการให้เกิดดอกผลตามที่คณะกรรมการบริหารเห็นสมควร เว้นแต่เงินบริจาคที่ผู้บริจาคกำหนดเงื่อนไขไว้เป็นอย่างอื่น', en: 'The association\u2019s funds must be deposited in a reliable bank or financial institution in the association\u2019s name, with a portion in fixed deposits or otherwise to earn returns as the committee deems appropriate, except for donations with donor conditions.' },
      { th: 'เหรัญญิกเก็บรักษาเงินสดสำรองจ่ายได้ไม่เกิน 10,000 บาท ส่วนที่เกินต้องนำฝากธนาคาร', en: 'The Treasurer may keep petty cash of no more than 10,000 baht; any excess must be deposited in a bank.' },
      { th: 'การสั่งจ่ายเงินจากธนาคาร ให้นายกหรือเลขาธิการ และเหรัญญิก ร่วมกัน 2 คนลงนาม คราวละไม่เกิน 50,000 บาท หากเกิน 50,000 แต่ไม่เกิน 100,000 บาท ต้องขอมติคณะกรรมการบริหาร ถ้าเกิน 100,000 บาท ต้องขอมติที่ประชุมใหญ่เป็นกรณีไป', en: 'Bank withdrawals require joint signatures of the President or Secretary-General and the Treasurer, up to 50,000 baht each time; amounts over 50,000 but not exceeding 100,000 baht require committee approval; amounts over 100,000 baht require general meeting approval case by case.' },
      { th: 'การจ่ายเงินทุกครั้งต้องมีหลักฐานการจ่ายเป็นหนังสือเพื่อการตรวจสอบ', en: 'Every payment must have written evidence for audit.' },
      { th: 'ให้คณะกรรมการบริหารแต่งตั้งผู้สอบบัญชีที่จดทะเบียนถูกต้องตามกฎหมายเป็นผู้ตรวจสอบบัญชีของสมาคม', en: 'The committee shall appoint a legally registered auditor to audit the association\u2019s accounts.' },
    ],
  },
  {
    num: 15,
    th: 'การแก้ไขข้อบังคับ',
    en: 'Amendment of the Regulations',
    items: [
      { th: 'การแก้ไขเปลี่ยนแปลงหรือเพิ่มเติมข้อบังคับจะทำได้เมื่อได้รับอนุมัติจากที่ประชุมใหญ่ด้วยคะแนนเสียงไม่น้อยกว่า 2 ใน 3 ของสมาชิกผู้มีสิทธิออกเสียงที่มาประชุม', en: 'Amendments or additions to the regulations may be made only with approval of the general meeting by at least a two-thirds vote of eligible members present.' },
      { th: 'ที่ประชุมใหญ่จะลงมติได้เมื่อมีสมาชิกผู้มีสิทธิออกเสียงไม่น้อยกว่า 20 คน หรือคณะกรรมการบริหารเป็นผู้เสนอ โดยเสนอเป็นหนังสือต่อเลขาธิการล่วงหน้าไม่น้อยกว่า 30 วัน', en: 'The general meeting may pass a resolution when at least 20 eligible members are present, or upon proposal by the executive committee, submitted in writing to the Secretary-General at least 30 days in advance.' },
      { th: 'ให้เลขาธิการโดยความเห็นชอบของคณะกรรมการบริหารส่งสำเนาข้อเสนอให้สมาชิกผู้มีสิทธิออกเสียงล่วงหน้าไม่น้อยกว่า 20 วัน และประกาศ ณ สำนักงานสมาคมไม่น้อยกว่า 10 วันก่อนการประชุม', en: 'The Secretary-General, with the committee\u2019s consent, shall send copies of the proposal to eligible members at least 20 days in advance and post it at the office at least 10 days before the meeting.' },
      { th: 'ข้อบังคับที่แก้ไขเปลี่ยนแปลงหรือเพิ่มเติมให้ใช้บังคับเมื่อได้จดทะเบียนต่อพนักงานเจ้าหน้าที่แล้ว', en: 'Amended or added regulations take effect upon registration with the competent official.' },
    ],
  },
  {
    num: 16,
    th: 'การเลิกสมาคมและการชำระบัญชี',
    en: 'Dissolution and Liquidation',
    items: [
      { th: 'การเลิกสมาคมให้กระทำโดยคะแนนเสียง 3 ใน 4 ของจำนวนสมาชิกผู้มีสิทธิออกเสียงทั้งหมดในที่ประชุมใหญ่', en: 'Dissolution requires a three-fourths vote of all eligible members at the general meeting.' },
      { th: 'ให้ที่ประชุมใหญ่ลงมติแต่งตั้งผู้ชำระบัญชี และการชำระบัญชีให้เป็นไปตามกฎหมาย', en: 'The general meeting shall appoint a liquidator, and liquidation shall proceed in accordance with the law.' },
      { th: 'ทรัพย์สินของสมาคมที่เหลือจากการชำระบัญชี ให้ตกเป็นของนิติบุคคลซึ่งมีวัตถุประสงค์อย่างเดียวกัน หรือเพื่อการกุศลอื่น ตามที่ที่ประชุมใหญ่จะเห็นสมควร', en: 'Any assets remaining after liquidation shall go to a juristic person with the same objectives or to other charitable purposes as the general meeting deems appropriate.' },
    ],
  },
];

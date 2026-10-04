/* TSAE CMS — single-page admin, simplified */
(() => {
  const API = '/admin/cms/api';
  const ic = (name, size = 18, cls = '') => CMSIcons.icon(name, size, cls);

  const NAV = [
    { hash: '#/', icon: 'layoutDashboard', label: 'ภาพรวม' },
    { hash: '#/home', icon: 'panelsTopLeft', label: 'หน้าแรก' },
    { hash: '#/hero', icon: 'image', label: 'Hero สไลด์' },
    { hash: '#/pages', icon: 'fileText', label: 'หน้าเว็บ' },
    { hash: '#/campaigns', icon: 'megaphone', label: 'แคมเปญ / โปสเตอร์' },
    { hash: '#/timeline', icon: 'calendarDays', label: 'ข่าวและกิจกรรม' },
    { hash: '#/media', icon: 'folderOpen', label: 'คลังสื่อ' },
  ];

  const EVENT_TYPES = {
    conference: 'ประชุม', training: 'อบรม', news: 'ข่าว',
    webinar: 'สัมมนาออนไลน์', activity: 'กิจกรรม', international: 'นานาชาติ',
  };
  const STATUS_LABELS = { upcoming: 'กำลังจะมา', ongoing: 'กำลังจัด', past: 'ผ่านแล้ว' };

  let quill = null;
  let calendar = null;
  let mediaPickerCb = null;
  let currentCrumb = [];

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string'
        ? { 'Content-Type': 'application/json' }
        : {},
      ...opts,
      body: opts.body instanceof FormData
        ? opts.body
        : typeof opts.body === 'string'
          ? opts.body
          : opts.body
            ? JSON.stringify(opts.body)
            : undefined,
    });
    if (res.status === 401) {
      location.href = '/admin/login?next=' + encodeURIComponent('/admin/cms' + (location.hash || ''));
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail;
      let msg = res.statusText;
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail)) msg = detail.map(d => d.msg || JSON.stringify(d)).join(', ');
      else if (detail != null) msg = JSON.stringify(detail);
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  let toastTimer = null;
  function toast(msg, ms = 3200) {
    const el = $('#toast');
    el.innerHTML = `${ic('check', 16)} ${esc(msg)}`;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  /** After CMS save: API already queued rebuild — poll until public site is ready. */
  async function afterSavePublish(msg) {
    toast(msg || 'บันทึกแล้ว — กำลังอัปเดตหน้าเว็บ…', 8000);
    notifyParentSave();
    try {
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api('/publish/status');
        if (st.status === 'ok' && !st.queued) {
          toast('อัปเดตหน้าเว็บแล้ว', 4000);
          return;
        }
        if (st.status === 'error') {
          toast('บันทึกแล้ว แต่ build ไม่สำเร็จ — ติดต่อผู้ดูแล', 6000);
          return;
        }
      }
      toast('บันทึกแล้ว — เว็บกำลังอัปเดต (อาจใช้เวลาสักครู่)', 5000);
    } catch (_) {
      /* status endpoint may be offline on older API — data is still saved */
    }
  }

  function setTitle(t, desc = '') {
    $('#page-title').textContent = t;
    $('#page-desc').textContent = desc;
  }
  function setActions(html) { $('#topbar-actions').innerHTML = html || ''; }
  function setCrumb(parts) {
    currentCrumb = parts || [];
    $('#crumb').innerHTML = parts.map((p, i) => {
      const last = i === parts.length - 1;
      return last
        ? `<span class="here">${esc(p[1])}</span>`
        : `<a href="${p[0]}" data-crumb="${esc(p[0])}">${esc(p[1])}</a><span class="sep">/</span>`;
    }).join('');
  }
  function loading() { return `<div class="loading">${ic('loader', 18, 'icon-spin')} กำลังโหลด…</div>`; }

  function parseRoute() {
    const raw = (location.hash || '#/').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return { page: parts[0] || 'dashboard', action: parts[1], id: parts[2] };
  }
  function navPageFromHash(hash) {
    const raw = (hash || '#/').replace(/^#\/?/, '');
    return raw.split('/').filter(Boolean)[0] || 'dashboard';
  }

  function renderNav() {
    const current = navPageFromHash(location.hash);
    const link = (n) => {
      const np = navPageFromHash(n.hash);
      const active = np === current;
      return `<a href="${n.hash}" class="${active ? 'on' : ''}">${ic(n.icon, 15)} <span>${n.label}</span></a>`;
    };
    $('#main-nav').innerHTML = NAV.map(link).join('');
  }

  function searchInput(id, placeholder) {
    return `<div class="search">${ic('search', 16)}<input type="search" id="${id}" placeholder="${placeholder}"></div>`;
  }

  async function route() {
    try {
      renderNav();
      const { page, action, id } = parseRoute();

      if (page === 'pages' && window.CMSPages) return await window.CMSPages.route(action, id);
      if (page === 'campaigns' && window.CMSCampaigns) return await window.CMSCampaigns.route(action, id);
      if (page === 'home' && window.CMSHome) return await window.CMSHome.route(action, id);
      if (page === 'hero' && window.CMSHome) return await window.CMSHome.routeHero(action, id);
      if (page === 'dashboard') return await viewDashboard();
      if (page === 'timeline' && action === 'news' && id === 'new') return await viewNewsEdit(null);
      if (page === 'timeline' && action === 'news' && id) return await viewNewsEdit(id);
      if (page === 'timeline' && action === 'edit') return await viewEventEdit(id);
      if (page === 'timeline' && action === 'new') return await viewEventEdit(null);
      if (page === 'timeline') return await viewTimeline();
      if (page === 'media') return await viewMedia();
      return await viewDashboard();
    } catch (err) {
      console.error(err);
      $('#content').innerHTML = `<div class="card card-body" style="color:var(--danger)">${ic('info', 18)} เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
    }
  }

  function initQuill(html, toolbar = 'full', onImage) {
    const container = toolbar === 'full'
      ? [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image', 'video'],
          ['blockquote', 'code-block'],
          [{ align: [] }],
          ['clean'],
        ]
      : [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'link', 'image'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ];
    quill = new Quill('#editor', {
      theme: 'snow',
      modules: {
        toolbar: {
          container,
          handlers: {
            image: () => openMediaPicker((url) => {
              const r = quill.getSelection(true);
              quill.insertEmbed(r.index, 'image', url);
              quill.setSelection(r.index + 1);
            }),
          },
        },
        clipboard: {
          matchers: onImage ? [
            [Node.ELEMENT_NODE, (node, delta) => {
              if (node.tagName === 'IMG' && node.src && node.src.startsWith('data:')) {
                onImage(node.src);
              }
              return delta;
            }],
          ] : [],
        },
      },
    });
    quill.root.innerHTML = html || '';
    if (onImage) {
      quill.root.addEventListener('drop', async (e) => {
        const files = e.dataTransfer?.files;
        if (!files?.length) return;
        e.preventDefault();
        for (const f of files) {
          if (!f.type.startsWith('image/')) continue;
          const url = await uploadImage(f);
          if (url) {
            const r = quill.getSelection(true) || { index: quill.getLength() };
            quill.insertEmbed(r.index, 'image', url);
            quill.setSelection(r.index + 1);
          }
        }
      });
      quill.root.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const it of items) {
          if (it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (!f) continue;
            const url = await uploadImage(f);
            if (url) {
              const r = quill.getSelection(true) || { index: quill.getLength() };
              quill.insertEmbed(r.index, 'image', url);
              quill.setSelection(r.index + 1);
            }
          }
        }
      });
    }
    return quill;
  }

  function insertEditorHtml(html) {
    if (!quill) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.clipboard.dangerouslyPasteHTML(range.index, html);
    quill.setSelection(range.index + 1);
  }

  function editorLayoutBar() {
    return `<div class="ed-layout-bar">
      <span class="ed-layout-label">จัดวางง่าย ๆ</span>
      <button type="button" class="btn btn-ghost btn-sm" id="ed-ins-cols">${ic('layoutDashboard', 15)} 2 คอลัมน์</button>
      <button type="button" class="btn btn-ghost btn-sm" id="ed-ins-sched">${ic('clipboardList', 15)} แถวกำหนดการ</button>
      <span class="ed-layout-hint">ดีกว่าใช้ตาราง — มือถืออ่านง่าย</span>
    </div>`;
  }

  function wireEditorLayoutTools(onChange) {
    const colsBtn = $('#ed-ins-cols');
    const schedBtn = $('#ed-ins-sched');
    if (colsBtn) {
      colsBtn.onclick = async () => {
        const left = await openFormDialog({
          title: 'คอลัมน์ซ้าย',
          message: 'ใส่ข้อความคอลัมน์ซ้าย (เช่น สถานที่ / เวลา)',
          placeholder: 'Location / เวลา',
          allowEmpty: true,
          confirmLabel: 'ถัดไป',
        });
        if (left === null) return;
        const right = await openFormDialog({
          title: 'คอลัมน์ขวา',
          message: 'ใส่ข้อความคอลัมน์ขวา',
          placeholder: 'รายละเอียด / หัวข้อ',
          allowEmpty: true,
          confirmLabel: 'แทรก',
        });
        if (right === null) return;
        const L = left || 'คอลัมน์ซ้าย';
        const R = right || 'คอลัมน์ขวา';
        insertEditorHtml(
          `<table class="cms-cols" role="presentation"><tbody><tr><td class="cms-col"><p>${esc(L)}</p></td><td class="cms-col"><p>${esc(R)}</p></td></tr></tbody></table><p><br></p>`
        );
        onChange?.();
      };
    }
    if (schedBtn) {
      schedBtn.onclick = async () => {
        const time = await openFormDialog({
          title: 'เวลา',
          message: 'เช่น 9:00–9:05am',
          placeholder: '9:00–9:05am',
          allowEmpty: true,
          confirmLabel: 'ถัดไป',
        });
        if (time === null) return;
        const title = await openFormDialog({
          title: 'หัวข้อช่วง',
          message: 'เช่น Welcome Remarks',
          placeholder: 'Welcome Remarks',
          allowEmpty: true,
          confirmLabel: 'ถัดไป',
        });
        if (title === null) return;
        const who = await openFormDialog({
          title: 'ผู้พูด / รายละเอียด',
          message: 'ชื่อวิทยากรหรือรายละเอียดเพิ่ม (ว่างได้)',
          placeholder: 'Dr. …',
          allowEmpty: true,
          confirmLabel: 'แทรก',
        });
        if (who === null) return;
        const whoHtml = who ? `<div class="cms-schedule-who">${esc(who)}</div>` : '';
        insertEditorHtml(
          `<table class="cms-schedule" role="presentation"><tbody><tr><td class="cms-schedule-time">${esc(time || 'เวลา')}</td><td class="cms-schedule-body"><strong>${esc(title || 'หัวข้อ')}</strong>${whoHtml}</td></tr></tbody></table><p><br></p>`
        );
        onChange?.();
      };
    }
  }

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/media/upload', { method: 'POST', body: fd });
      toast('อัปโหลด ' + file.name);
      return r.url;
    } catch (e) {
      toast('อัปโหลดไม่สำเร็จ: ' + e.message);
      return null;
    }
  }

  function eventTypeOptions(selected) {
    return Object.entries(EVENT_TYPES).map(([k, v]) =>
      `<option value="${k}"${selected === k ? ' selected' : ''}>${v}</option>`
    ).join('');
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  async function viewDashboard() {
    setTitle('ภาพรวม', 'สรุปเนื้อหาทั้งหมดในเว็บไซต์');
    setCrumb([['#/', 'ภาพรวม']]);
    setActions('');
    $('#content').innerHTML = loading();
    const s = await api('/stats');
    if (!s) return;

    $('#content').innerHTML = `
      <div class="stats">
        <div class="stat green">
          <div class="top"><span class="k">ข่าว</span>
            <span class="ico">${ic('newspaper', 16)}</span></div>
          <div class="v">${s.news ?? 0}</div>
          <div class="trend">news/*.json บนเว็บจริง</div>
        </div>
        <div class="stat gold">
          <div class="top"><span class="k">Hero</span>
            <span class="ico">${ic('image', 16)}</span></div>
          <div class="v">${s.hero ?? 0}</div>
          <div class="trend">สไลด์หน้าแรก</div>
        </div>
        <div class="stat blue">
          <div class="top"><span class="k">กิจกรรม</span>
            <span class="ico">${ic('calendarDays', 16)}</span></div>
          <div class="v">${s.events}</div>
          <div class="trend">events + แคมเปญ</div>
        </div>
        <div class="stat green">
          <div class="top"><span class="k">วิดีโอ / การ์ด</span>
            <span class="ico">${ic('megaphone', 16)}</span></div>
          <div class="v">${(s.videos ?? 0) + (s.homeConferences ?? 0)}</div>
          <div class="trend">Watch & Learn + Flagship</div>
        </div>
      </div>
      <div class="card"><div class="card-body">
        <h3 class="card-title">ทางลัด — เนื้อหาหน้าบ้าน</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
          <a class="btn btn-ghost" href="#/hero">${ic('image', 16)} Hero สไลด์</a>
          <a class="btn btn-ghost" href="#/home">${ic('panelsTopLeft', 16)} ข้อความหน้าแรก</a>
          <a class="btn btn-ghost" href="#/home/conferences">${ic('megaphone', 16)} การ์ดประชุม</a>
          <a class="btn btn-ghost" href="#/home/videos">${ic('image', 16)} วิดีโอ</a>
          <a class="btn btn-ghost" href="#/timeline">${ic('calendarDays', 16)} ข่าวและกิจกรรม</a>
          <a class="btn btn-ghost" href="#/campaigns/new">${ic('plus', 16)} แคมเปญใหม่</a>
          <a class="btn btn-ghost" href="#/media">${ic('upload', 16)} อัปโหลดสื่อ</a>
        </div>
      </div></div>`;
  }

  // ── Timeline (events + news) ─────────────────────────────────────────────

  let timelineView = 'list';
  let timelineKind = 'events';

  const NEWS_CATS = {
    announcement: 'ประกาศ', conference: 'ประชุม', training: 'อบรม',
    journal: 'วารสาร', activity: 'กิจกรรม',
  };

  function siteBase() {
    if (/\.tsae\.asia$/i.test(location.hostname) || location.hostname === 'tsae.asia') return location.origin;
    return 'https://www.tsae.asia';
  }
  function absUrl(path) {
    const p = path.startsWith('/') ? path : '/' + path;
    return siteBase().replace(/\/$/, '') + p;
  }
  function newsUrls(id) {
    if (!id) return null;
    return { en: absUrl(`/news/${id}/`), th: absUrl(`/th/news/${id}/`), listEn: absUrl('/news/'), listTh: absUrl('/th/news/') };
  }
  function eventUrls(id) {
    if (!id) return null;
    return { en: absUrl(`/events/${id}/`), th: absUrl(`/th/events/${id}/`), listEn: absUrl('/events/'), listTh: absUrl('/th/events/') };
  }
  function openLinkBtn(href, label) {
    if (!href) return '';
    return `<a class="btn btn-ghost btn-sm" href="${esc(href)}" target="_blank" rel="noopener">${ic('externalLink', 14)} ${esc(label)}</a>`;
  }
  function liveLinksBlock(urls, kindLabel) {
    if (!urls) {
      return `<div class="tl-live-box"><strong>ลิงก์หน้าเว็บ</strong><p class="dlg-note">บันทึกก่อน แล้วจะมีลิงก์ไปหน้าแสดงจริง</p></div>`;
    }
    return `<div class="tl-live-box">
      <strong>ลิงก์หน้าเว็บ (${esc(kindLabel)})</strong>
      <div class="tl-live-actions">
        ${openLinkBtn(urls.th, 'เปิด TH')}
        ${openLinkBtn(urls.en, 'เปิด EN')}
      </div>
      <p class="dlg-note">หลังบันทึก ระบบจะอัปเดตหน้าเว็บให้อัตโนมัติ · พรีวิวด้านล่างเห็นทันที</p>
      <div class="tl-live-actions" style="margin-top:8px">
        ${openLinkBtn(urls.listTh, 'รายการ TH')}
        ${openLinkBtn(urls.listEn, 'รายการ EN')}
      </div>
    </div>`;
  }

  function timelineShell({ title, subtitle, stats, toolbar, body }) {
    return `<div class="tl-shell">
      <div class="tl-top">
        <div class="tl-intro">
          <div>
            <h2 class="tl-h">${title}</h2>
            <p class="tl-sub">${subtitle}</p>
          </div>
        </div>
        ${stats || ''}
        ${toolbar || ''}
      </div>
      <div class="tl-body" id="ev-render">${body || ''}</div>
    </div>`;
  }

  function timelineStats(evItems, newsTotal) {
    const now = Date.now();
    const upcoming = evItems.filter(i => i.startDate && new Date(i.startDate).getTime() >= now && i.published !== false).length;
    const drafts = evItems.filter(i => i.published === false).length;
    return `<div class="tl-stats">
      <div class="tl-stat"><span class="k">กิจกรรมทั้งหมด</span><strong>${evItems.length}</strong></div>
      <div class="tl-stat green"><span class="k">กำลังจะมา</span><strong>${upcoming}</strong></div>
      <div class="tl-stat"><span class="k">ฉบับร่าง</span><strong>${drafts}</strong></div>
      <div class="tl-stat"><span class="k">ข่าว</span><strong>${newsTotal}</strong></div>
    </div>`;
  }

  async function viewTimeline() {
    setTitle('ข่าวและกิจกรรม', 'จัดการข่าวบนเว็บจริง และปฏิทินกิจกรรม');
    setCrumb([['#/', 'ภาพรวม'], ['#/timeline', 'ข่าวและกิจกรรม']]);
    const addHref = timelineKind === 'news' ? '#/timeline/news/new' : '#/timeline/new';
    setActions(`<a class="btn btn-primary" href="${addHref}">${ic('plus', 16)} ${timelineKind === 'news' ? 'เพิ่มข่าว' : 'เพิ่มกิจกรรม'}</a>`);
    $('#content').innerHTML = loading();

    const [evData, newsData] = await Promise.all([api('/events'), api('/news')]);
    if (!evData || !newsData) return;
    const evItems = evData.items || [];
    const newsItems = newsData.items || [];
    const newsTotal = newsData.total ?? newsItems.length;

    const kindSeg = `<div class="seg">
      <a href="#" data-kind="events" class="${timelineKind === 'events' ? 'on' : ''}">${ic('calendarDays', 14)} กิจกรรม (${evItems.length})</a>
      <a href="#" data-kind="news" class="${timelineKind === 'news' ? 'on' : ''}">${ic('newspaper', 14)} ข่าว (${newsTotal})</a>
    </div>`;

    if (timelineKind === 'news') {
      setActions(`
        ${openLinkBtn(absUrl('/th/news/'), 'หน้ารายการข่าว')}
        <a class="btn btn-primary" href="#/timeline/news/new">${ic('plus', 16)} เพิ่มข่าว</a>
      `);
      $('#content').innerHTML = timelineShell({
        title: 'ข่าวสาร',
        subtitle: 'หน้าเว็บจริง: /th/news/ และ /news/ — กด «ดูหน้าเว็บ» บนการ์ดเพื่อเปิด',
        stats: timelineStats(evItems, newsTotal),
        toolbar: `<div class="tl-toolbar">
          ${kindSeg}
          <div class="tl-filters">
            ${searchInput('nw-q', 'ค้นหาข่าว…')}
            <select class="filter-select" id="nw-cat"><option value="">ทุกหมวด</option>
              ${Object.entries(NEWS_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
        </div>`,
        body: '',
      });

      const renderNews = () => {
        const q = ($('#nw-q')?.value || '').toLowerCase();
        const cat = $('select#nw-cat')?.value;
        let items = [...newsItems];
        if (cat) items = items.filter(i => i.category === cat);
        if (q) items = items.filter(i =>
          (i.title || '').toLowerCase().includes(q) ||
          (i.titleTH || '').toLowerCase().includes(q) ||
          (i.excerpt || '').toLowerCase().includes(q) ||
          (i.id || '').toLowerCase().includes(q));
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (!items.length) {
          $('#ev-render').innerHTML = `<div class="media-empty">${ic('newspaper', 44)}<div class="title">ไม่พบข่าว</div>
            <a class="btn btn-primary" href="#/timeline/news/new">${ic('plus', 16)} เพิ่มข่าว</a></div>`;
          return;
        }
        $('#ev-render').innerHTML = `<div class="tl-cards">${items.map(newsCard).join('')}</div>
          <div class="tl-foot">แสดง ${items.length} จาก ${newsTotal} ข่าว</div>`;
      };

      $('#nw-q').oninput = debounce(renderNews, 200);
      $('select#nw-cat').onchange = renderNews;
      $('#content').onclick = (e) => {
        const a = e.target.closest('a[data-kind]');
        if (a) { e.preventDefault(); timelineKind = a.dataset.kind; viewTimeline(); }
      };
      renderNews();
      return;
    }

    $('#content').innerHTML = timelineShell({
      title: 'กิจกรรมและปฏิทิน',
      subtitle: 'หน้าเว็บจริงที่ /events/ และ /th/events/ · คลิกปฏิทินเพื่อสร้างงานใหม่',
      stats: timelineStats(evItems, newsTotal),
      toolbar: `<div class="tl-toolbar">
        ${kindSeg}
        <div class="seg">
          <a href="#" data-view="list" class="${timelineView === 'list' ? 'on' : ''}">${ic('clipboardList', 14)} การ์ด</a>
          <a href="#" data-view="cal" class="${timelineView === 'cal' ? 'on' : ''}">${ic('calendar', 14)} ปฏิทิน</a>
        </div>
        <div class="tl-filters">
          ${searchInput('ev-q', 'ค้นหากิจกรรม…')}
          <select class="filter-select" id="ev-type"><option value="">ทุกประเภท</option>${eventTypeOptions('')}</select>
        </div>
      </div>`,
      body: '',
    });

    setActions(`
      ${openLinkBtn(absUrl('/th/events/'), 'หน้ารายการกิจกรรม')}
      <a class="btn btn-primary" href="#/timeline/new">${ic('plus', 16)} เพิ่มกิจกรรม</a>
    `);

    $('select#ev-type').onchange = () => renderEventsList(evItems);
    $('#ev-q').oninput = debounce(() => renderEventsList(evItems), 200);
    $('#content').onclick = (e) => {
      const v = e.target.closest('[data-view]');
      if (v) {
        e.preventDefault();
        timelineView = v.dataset.view;
        document.querySelectorAll('[data-view]').forEach(a => a.classList.toggle('on', a.dataset.view === timelineView));
        renderEventsList(evItems);
      }
      const k = e.target.closest('[data-kind]');
      if (k) { e.preventDefault(); timelineKind = k.dataset.kind; viewTimeline(); }
    };
    renderEventsList(evItems);
  }

  function newsCard(i) {
    const cat = NEWS_CATS[i.category] || i.category || '';
    const urls = newsUrls(i.id);
    const img = i.image
      ? `<img src="${esc(i.image)}" alt="" loading="lazy">`
      : `<div class="tl-card-ph">${ic('newspaper', 28)}</div>`;
    return `<article class="tl-card">
      <a class="tl-card-media" href="#/timeline/news/${esc(i.id)}">${img}${i.featured ? '<span class="tl-pin">เด่น</span>' : ''}</a>
      <div class="tl-card-body">
        <div class="tl-card-meta">
          <span class="badge badge-${esc(i.category || 'news')}">${esc(cat)}</span>
          <time>${esc((i.date || '').slice(0, 10))}</time>
        </div>
        <a class="tl-card-title" href="#/timeline/news/${esc(i.id)}">${esc(i.titleTH || i.title || i.id)}</a>
        ${i.excerptTH || i.excerpt ? `<p class="tl-card-ex">${esc((i.excerptTH || i.excerpt || '').slice(0, 110))}</p>` : ''}
        <div class="tl-card-actions">
          <a class="btn btn-sm btn-ghost" href="#/timeline/news/${esc(i.id)}">${ic('pencil', 14)} แก้ไข</a>
          ${urls ? openLinkBtn(urls.th, 'ดูหน้าเว็บ') : ''}
        </div>
      </div>
    </article>`;
  }

  function eventCard(i) {
    const urls = eventUrls(i.id);
    const img = i.image
      ? `<img src="${esc(i.image)}" alt="" loading="lazy">`
      : `<div class="tl-card-ph type-${esc(i.type || 'activity')}">${ic('calendarDays', 28)}</div>`;
    const start = (i.startDate || '').slice(0, 10);
    const end = (i.endDate || '').slice(0, 10);
    const range = end && end !== start ? `${start} → ${end}` : start;
    return `<article class="tl-card">
      <a class="tl-card-media" href="#/timeline/edit/${esc(i.id)}">${img}</a>
      <div class="tl-card-body">
        <div class="tl-card-meta">
          <span class="badge badge-${esc(i.type || 'activity')}">${esc(EVENT_TYPES[i.type] || i.type)}</span>
          ${i.published === false
            ? '<span class="badge badge-draft">ร่าง</span>'
            : `<span class="badge badge-published">${esc(STATUS_LABELS[i.status] || 'เปิด')}</span>`}
        </div>
        <a class="tl-card-title" href="#/timeline/edit/${esc(i.id)}">${esc(i.titleTH || i.title || i.id)}</a>
        <div class="tl-card-ex">${ic('calendar', 13)} ${esc(range || '—')}${i.locationTH || i.location ? ` · ${esc(i.locationTH || i.location)}` : ''}</div>
        <div class="tl-card-actions">
          <a class="btn btn-sm btn-ghost" href="#/timeline/edit/${esc(i.id)}">${ic('pencil', 14)} แก้ไข</a>
          ${urls ? openLinkBtn(urls.th, 'ดูหน้าเว็บ') : ''}
        </div>
      </div>
    </article>`;
  }

  function renderEventsList(allItems) {
    const q = ($('#ev-q')?.value || '').toLowerCase();
    const type = $('select#ev-type')?.value;
    let items = allItems;
    if (type) items = items.filter(i => i.type === type);
    if (q) items = items.filter(i =>
      (i.titleTH || i.title || '').toLowerCase().includes(q) ||
      (i.excerpt || i.excerptTH || '').toLowerCase().includes(q) ||
      (i.locationTH || i.location || '').toLowerCase().includes(q));

    if (timelineView === 'cal') {
      renderCalendar(items);
      return;
    }

    if (!items.length) {
      $('#ev-render').innerHTML = `<div class="media-empty">${ic('calendarDays', 44)}<div class="title">ยังไม่มีกิจกรรม</div>
        <a class="btn btn-primary" href="#/timeline/new">${ic('plus', 16)} เพิ่มกิจกรรม</a></div>`;
      return;
    }

    items = [...items].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    $('#ev-render').innerHTML = `<div class="tl-cards">${items.map(eventCard).join('')}</div>
      <div class="tl-foot">แสดง ${items.length} กิจกรรม</div>`;
  }

  function renderCalendar(items) {
    const legend = Object.entries(EVENT_TYPES).map(([k, v]) => {
      const color = { conference: '#1a6b3a', training: '#c8a951', news: '#b91c1c', webinar: '#3d4db0', activity: '#0e7490' }[k] || '#1a6b3a';
      return `<span class="tl-legend-item"><i style="background:${color}"></i>${esc(v)}</span>`;
    }).join('');

    $('#ev-render').innerHTML = `<div class="tl-cal-wrap">
      <div class="tl-cal-head">
        <div>
          <strong>ปฏิทินกิจกรรม</strong>
          <p>คลิกวันเพื่อสร้างกิจกรรมใหม่ · คลิกงานเพื่อแก้ไข</p>
        </div>
        <div class="tl-legend">${legend}</div>
      </div>
      <div id="calendar"></div>
    </div>`;

    if (calendar) { calendar.destroy(); calendar = null; }
    const events = items.map(i => {
      const color = { conference: '#1a6b3a', training: '#c8a951', news: '#b91c1c', webinar: '#3d4db0', activity: '#0e7490' }[i.type] || '#1a6b3a';
      return {
        id: i.id,
        title: i.titleTH || i.title || 'Event',
        start: i.startDate,
        end: i.endDate || undefined,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { type: i.type, location: i.locationTH || i.location || '' },
      };
    });
    calendar = new FullCalendar.Calendar($('#calendar'), {
      initialView: 'dayGridMonth',
      locale: 'th',
      firstDay: 1,
      height: 'auto',
      expandRows: true,
      navLinks: true,
      nowIndicator: true,
      dayMaxEvents: 3,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth',
      },
      buttonText: { today: 'วันนี้', month: 'เดือน', week: 'สัปดาห์', list: 'รายการ' },
      events,
      eventClick(info) {
        info.jsEvent.preventDefault();
        location.hash = '#/timeline/edit/' + info.event.id;
      },
      dateClick(info) {
        try { sessionStorage.setItem('cms_ev_start', info.dateStr); } catch (_) {}
        location.hash = '#/timeline/new';
      },
      eventDidMount(info) {
        const loc = info.event.extendedProps.location;
        if (loc) info.el.title = `${info.event.title} · ${loc}`;
      },
    });
    calendar.render();
  }

  async function viewNewsEdit(id) {
    const isNew = !id;
    const urls = newsUrls(id);
    setTitle(isNew ? 'เพิ่มข่าว' : 'แก้ไขข่าว');
    setCrumb([['#/', 'ภาพรวม'], ['#/timeline', 'ข่าวและกิจกรรม'], [isNew ? 'เพิ่มข่าว' : 'แก้ไขข่าว']]);
    setActions(`
      <a class="btn btn-ghost" href="#/timeline">${ic('arrowLeft', 16)} กลับ</a>
      ${urls ? openLinkBtn(urls.th, 'ดูหน้าเว็บ') : ''}
      <button class="btn btn-primary" id="save-nw">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="del-nw">${ic('trash2', 16)} ลบ</button>`}
    `);
    $('#content').innerHTML = loading();
    timelineKind = 'news';

    let item = isNew
      ? { title: '', titleTH: '', category: 'announcement', date: new Date().toISOString(), excerpt: '', excerptTH: '', image: '', featured: false, html: '', author: 'admin' }
      : await api('/news/' + encodeURIComponent(id));
    if (!item) return;

    $('#content').innerHTML = `
      <div class="tl-editor">
        <div class="tl-editor-main card"><div class="card-body form-grid">
          <div class="field"><label>หัวข้อ (EN) *</label><input id="n-title" value="${esc(item.title || '')}" placeholder="English title"></div>
          <div class="field"><label>หัวข้อ (TH)</label><input id="n-titleTH" value="${esc(item.titleTH || '')}" placeholder="หัวข้อภาษาไทย"></div>
          <div class="field"><label>หมวด</label><select id="n-cat">${Object.entries(NEWS_CATS).map(([c, label]) => `<option value="${c}"${item.category===c?' selected':''}>${label}</option>`).join('')}</select></div>
          <div class="field"><label>วันที่</label><input id="n-date" type="datetime-local" value="${toLocalInput(item.date)}"></div>
          <div class="full field"><label>คำโปรย EN</label><textarea id="n-excerpt" rows="2">${esc(item.excerpt || '')}</textarea></div>
          <div class="full field"><label>คำโปรย TH</label><textarea id="n-excerptTH" rows="2">${esc(item.excerptTH || '')}</textarea></div>
          <div class="full field"><label>เนื้อหา</label>
            ${editorLayoutBar()}
            <div class="editor-wrap"><div id="editor"></div></div>
            <p class="ed-layout-tip">อย่าใช้ตารางจาก Word สำหรับจัดคอลัมน์ — กด «2 คอลัมน์» หรือ «แถวกำหนดการ» ด้านบนแทน</p>
          </div>
        </div></div>
        <aside class="tl-editor-side">
          <div class="card"><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            ${liveLinksBlock(urls, 'ข่าว')}
            <div class="field" style="margin:0"><label>รูปปก</label>
              <div class="input-row">
                <input id="n-image" value="${esc(item.image || '')}" placeholder="/images/... หรือ /wp-uploads/...">
                <button type="button" class="btn btn-ghost" id="pick-nw-img">${ic('imagePlus', 16)}</button>
              </div>
            </div>
            <div class="field" style="margin:0"><label>ผู้เขียน</label><input id="n-author" value="${esc(item.author || '')}"></div>
            <div class="checks" style="padding:0;background:transparent;border:none">
              <label><input type="checkbox" id="n-feat"${item.featured ? ' checked' : ''}> ข่าวเด่นบนหน้าแรก</label>
            </div>
            <div>
              <div class="tl-pv-label">พรีวิวสด</div>
              <div class="tl-pv" id="n-live-preview"></div>
            </div>
          </div></div>
        </aside>
      </div>`;

    initQuill(item.html || '', 'full', true);

    const refreshLive = () => {
      const title = ($('#n-titleTH').value || $('#n-title').value || 'หัวข้อข่าว').trim();
      const cat = NEWS_CATS[$('#n-cat').value] || $('#n-cat').value;
      const date = ($('#n-date').value || '').slice(0, 10).replace('T', ' ');
      const excerpt = ($('#n-excerptTH').value || $('#n-excerpt').value || '').trim();
      const img = $('#n-image').value.trim();
      const html = quill ? quill.root.innerHTML : '';
      $('#n-live-preview').innerHTML = `
        <article class="pv-article">
          ${img ? `<div class="pv-hero"><img src="${esc(img)}" alt=""></div>` : ''}
          <div class="pv-kicker"><span class="badge badge-${esc($('#n-cat').value || 'news')}">${esc(cat)}</span> <time>${esc(date)}</time></div>
          <h1>${esc(title)}</h1>
          ${excerpt ? `<p class="pv-excerpt">${esc(excerpt)}</p>` : ''}
          <div class="pv-body">${html || '<p style="color:#9aa8a0">ยังไม่มีเนื้อหา</p>'}</div>
        </article>`;
    };

    wireEditorLayoutTools(refreshLive);

    $('#pick-nw-img').onclick = () => openMediaPicker(url => { $('#n-image').value = url; refreshLive(); });
    ['n-title', 'n-titleTH', 'n-excerpt', 'n-excerptTH', 'n-image', 'n-date'].forEach((fid) => {
      $(`#${fid}`)?.addEventListener('input', debounce(refreshLive, 120));
    });
    $('#n-cat')?.addEventListener('change', refreshLive);
    if (quill) quill.on('text-change', debounce(refreshLive, 150));
    refreshLive();

    $('#save-nw').onclick = async () => {
      const body = {
        title: $('#n-title').value.trim(),
        titleTH: $('#n-titleTH').value.trim(),
        category: $('#n-cat').value,
        date: fromLocalInput($('#n-date').value) || new Date().toISOString(),
        image: $('#n-image').value.trim() || null,
        excerpt: $('#n-excerpt').value.trim(),
        excerptTH: $('#n-excerptTH').value.trim(),
        featured: $('#n-feat').checked,
        author: $('#n-author').value.trim(),
        html: quill ? quill.root.innerHTML : '',
      };
      if (!body.title) { toast('ต้องมีหัวข้อ EN'); return; }
      try {
        if (isNew) {
          const r = await api('/news', { method: 'POST', body });
          location.hash = '#/timeline/news/' + r.id;
          await afterSavePublish('สร้างข่าวแล้ว — กำลังอัปเดตหน้าเว็บ…');
        } else {
          await api('/news/' + encodeURIComponent(id), { method: 'PUT', body });
          await afterSavePublish('บันทึกแล้ว — กำลังอัปเดตหน้าเว็บ…');
        }
      } catch (err) { toast(err.message); }
    };
    const del = $('#del-nw');
    if (del) del.onclick = async () => {
      const ok = await openConfirmDialog({ title: 'ลบข่าว', message: 'ลบข่าวนี้ถาวร? ไม่สามารถกู้คืนได้', confirmLabel: 'ลบข่าว', danger: true });
      if (!ok) return;
      await api('/news/' + encodeURIComponent(id), { method: 'DELETE' });
      location.hash = '#/timeline';
      await afterSavePublish('ลบแล้ว — กำลังอัปเดตหน้าเว็บ…');
    };
  }

  async function viewEventEdit(id) {
    const isNew = !id;
    const urls = eventUrls(id);
    setTitle(isNew ? 'เพิ่มกิจกรรม' : 'แก้ไขกิจกรรม');
    setCrumb([['#/', 'ภาพรวม'], ['#/timeline', 'ข่าวและกิจกรรม'], [isNew ? 'เพิ่ม' : 'แก้ไข']]);
    setActions(`
      <a class="btn btn-ghost" href="#/timeline">${ic('arrowLeft', 16)} กลับ</a>
      ${urls ? openLinkBtn(urls.th, 'ดูหน้าเว็บ') : ''}
      <button class="btn btn-primary" id="save-ev">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="del-ev">${ic('trash2', 16)} ลบ</button>`}
    `);
    $('#content').innerHTML = loading();

    let presetStart = '';
    try { presetStart = sessionStorage.getItem('cms_ev_start') || ''; sessionStorage.removeItem('cms_ev_start'); } catch (_) {}

    let item = isNew
      ? { title:'', titleTH:'', type:'conference', status:'upcoming', location:'', locationTH:'',
          startDate: presetStart ? `${presetStart}T09:00:00` : '', endDate:'', registrationUrl:'', image:'', excerpt:'', excerptTH:'',
          html:'', published:true }
      : await api('/events/' + encodeURIComponent(id));
    if (!item) return;

    $('#content').innerHTML = `
      <div class="tl-editor">
        <div class="tl-editor-main card"><div class="card-body form-grid">
          <div class="field"><label>ชื่อ (TH) *</label><input id="f-titleTH" value="${esc(item.titleTH)}" placeholder="ชื่องานภาษาไทย"></div>
          <div class="field"><label>ชื่อ (EN)</label><input id="f-title" value="${esc(item.title)}" placeholder="English title"></div>
          <div class="field"><label>ประเภท</label><select id="f-type">${eventTypeOptions(item.type)}</select></div>
          <div class="field"><label>สถานะ</label><select id="f-status">
            ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}"${item.status===k?' selected':''}>${v}</option>`).join('')}
          </select></div>
          <div class="field"><label>วันเริ่ม *</label><input id="f-start" type="datetime-local" value="${toLocalInput(item.startDate)}"></div>
          <div class="field"><label>วันสิ้นสุด</label><input id="f-end" type="datetime-local" value="${toLocalInput(item.endDate)}"></div>
          <div class="field"><label>สถานที่ (TH)</label><input id="f-locTH" value="${esc(item.locationTH)}"></div>
          <div class="field"><label>สถานที่ (EN)</label><input id="f-loc" value="${esc(item.location)}"></div>
          <div class="full field"><label>ลิงก์ลงทะเบียน</label><input id="f-reg" value="${esc(item.registrationUrl || '')}" placeholder="https://..."></div>
          <div class="full field"><label>คำโปรย (TH)</label><textarea id="f-excerptTH" rows="2">${esc(item.excerptTH || '')}</textarea></div>
          <div class="full field"><label>คำโปรย (EN)</label><textarea id="f-excerpt" rows="2">${esc(item.excerpt || '')}</textarea></div>
          <div class="full field"><label>รายละเอียด</label>
            ${editorLayoutBar()}
            <div class="editor-wrap"><div id="editor"></div></div>
            <p class="ed-layout-tip">อย่าใช้ตารางจาก Word สำหรับจัดคอลัมน์ — กด «2 คอลัมน์» หรือ «แถวกำหนดการ» ด้านบนแทน</p>
          </div>
        </div></div>
        <aside class="tl-editor-side">
          <div class="card"><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            ${liveLinksBlock(urls, 'กิจกรรม')}
            <div class="field" style="margin:0"><label>รูปกิจกรรม</label>
              <div class="input-row">
                <input id="f-image" value="${esc(item.image || '')}">
                <button type="button" class="btn btn-ghost" id="pick-ev-img">${ic('imagePlus', 16)}</button>
              </div>
            </div>
            <div class="checks" style="padding:0;background:transparent;border:none">
              <label><input type="checkbox" id="f-pub"${item.published !== false ? ' checked' : ''}> เผยแพร่บนเว็บ</label>
            </div>
            <div>
              <div class="tl-pv-label">พรีวิวสด</div>
              <div class="tl-pv" id="f-live-preview"></div>
            </div>
          </div></div>
        </aside>
      </div>`;

    initQuill(item.html || '', 'simple', true);

    const refreshLive = () => {
      const title = ($('#f-titleTH').value || $('#f-title').value || 'ชื่องาน').trim();
      const type = $('#f-type').value;
      const start = ($('#f-start').value || '').slice(0, 10);
      const end = ($('#f-end').value || '').slice(0, 10);
      const loc = ($('#f-locTH').value || $('#f-loc').value || '').trim();
      const excerpt = ($('#f-excerptTH').value || $('#f-excerpt').value || '').trim();
      const img = $('#f-image').value.trim();
      const html = quill ? quill.root.innerHTML : '';
      const range = end && end !== start ? `${start} → ${end}` : start;
      $('#f-live-preview').innerHTML = `
        <article class="pv-article">
          ${img ? `<div class="pv-hero"><img src="${esc(img)}" alt=""></div>` : ''}
          <div class="pv-kicker"><span class="badge badge-${esc(type)}">${esc(EVENT_TYPES[type] || type)}</span> <time>${esc(range || '—')}</time></div>
          <h1>${esc(title)}</h1>
          ${loc ? `<p class="pv-excerpt">${esc(loc)}</p>` : ''}
          ${excerpt ? `<p class="pv-excerpt">${esc(excerpt)}</p>` : ''}
          <div class="pv-body">${html || '<p style="color:#9aa8a0">ยังไม่มีรายละเอียด</p>'}</div>
        </article>`;
    };

    wireEditorLayoutTools(refreshLive);

    $('#pick-ev-img').onclick = () => openMediaPicker(url => { $('#f-image').value = url; refreshLive(); });
    ['f-title', 'f-titleTH', 'f-excerpt', 'f-excerptTH', 'f-image', 'f-start', 'f-end', 'f-loc', 'f-locTH'].forEach((fid) => {
      $(`#${fid}`)?.addEventListener('input', debounce(refreshLive, 120));
    });
    $('#f-type')?.addEventListener('change', refreshLive);
    if (quill) quill.on('text-change', debounce(refreshLive, 150));
    refreshLive();

    $('#save-ev').onclick = async () => {
      const body = {
        title: $('#f-title').value, titleTH: $('#f-titleTH').value,
        type: $('#f-type').value, status: $('#f-status').value,
        startDate: fromLocalInput($('#f-start').value),
        endDate: fromLocalInput($('#f-end').value) || null,
        location: $('#f-loc').value, locationTH: $('#f-locTH').value,
        registrationUrl: $('#f-reg').value || null,
        image: $('#f-image').value || null,
        excerpt: $('#f-excerpt').value, excerptTH: $('#f-excerptTH').value,
        html: quill.root.innerHTML, featured: !!item.featured,
        published: $('#f-pub').checked,
      };
      if (!body.titleTH && !body.title) return toast('กรุณาใส่ชื่องาน');
      if (!body.startDate) return toast('กรุณาใส่วันเริ่ม');
      try {
        if (isNew) {
          const r = await api('/events', { method: 'POST', body });
          location.hash = '#/timeline/edit/' + r.id;
          await afterSavePublish('สร้างกิจกรรมแล้ว — กำลังอัปเดตหน้าเว็บ…');
        } else {
          await api('/events/' + encodeURIComponent(id), { method: 'PUT', body });
          await afterSavePublish('บันทึกแล้ว — กำลังอัปเดตหน้าเว็บ…');
        }
      } catch (e) { toast('ผิดพลาด: ' + e.message); }
    };
    if (!isNew) $('#del-ev').onclick = async () => {
      const ok = await openConfirmDialog({ title: 'ลบกิจกรรม', message: 'ลบกิจกรรมนี้ถาวร?', confirmLabel: 'ลบ', danger: true });
      if (!ok) return;
      await api('/events/' + encodeURIComponent(id), { method: 'DELETE' });
      location.hash = '#/timeline';
      await afterSavePublish('ลบแล้ว — กำลังอัปเดตหน้าเว็บ…');
    };
  }

  // ── Dialogs (replace browser prompt/confirm) ────────────────────────────

  let dialogResolver = null;

  function closeModal(result) {
    $('#modal').classList.add('hidden');
    mediaPickerCb = null;
    const panel = $('#modal-panel');
    panel.classList.remove('modal-sm');
    panel.onclick = null;
    if (dialogResolver) {
      const resolve = dialogResolver;
      dialogResolver = null;
      resolve(result === undefined ? null : result);
    }
  }

  function openFormDialog({ title, message = '', placeholder = '', value = '', confirmLabel = 'ตกลง', danger = false, allowEmpty = false, inputLabel = 'ข้อความ' }) {
    return new Promise((resolve) => {
      dialogResolver = resolve;
      const panel = $('#modal-panel');
      panel.classList.add('modal-sm');
      panel.onclick = null;
      panel.innerHTML = `
        <div class="modal-head"><strong>${esc(title)}</strong>
          <button type="button" class="btn btn-icon btn-ghost" data-close aria-label="ปิด">${ic('x', 18)}</button></div>
        <div class="modal-body">
          ${message ? `<p class="dlg-msg">${message}</p>` : ''}
          <label class="dlg-label">${esc(inputLabel)}</label>
          <input class="dlg-input" id="dlg-input" type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off">
          <p class="dlg-hint" id="dlg-error" hidden></p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="dlg-ok">${esc(confirmLabel)}</button>
        </div>`;
      $('#modal').classList.remove('hidden');
      const input = $('#dlg-input');
      setTimeout(() => { input.focus(); input.select(); }, 30);
      const finish = (v) => {
        const r = dialogResolver;
        dialogResolver = null;
        panel.classList.remove('modal-sm');
        $('#modal').classList.add('hidden');
        if (r) r(v);
      };
      $('#dlg-ok').onclick = () => {
        const v = input.value.trim();
        if (!v && !allowEmpty) {
          const err = $('#dlg-error');
          err.hidden = false;
          err.textContent = 'กรุณากรอกข้อมูล';
          input.focus();
          return;
        }
        finish(v);
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('#dlg-ok').click(); }
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      };
    });
  }

  function openConfirmDialog({ title, message, confirmLabel = 'ยืนยัน', danger = false }) {
    return new Promise((resolve) => {
      dialogResolver = resolve;
      const panel = $('#modal-panel');
      panel.classList.add('modal-sm');
      panel.onclick = null;
      panel.innerHTML = `
        <div class="modal-head"><strong>${esc(title)}</strong>
          <button type="button" class="btn btn-icon btn-ghost" data-close aria-label="ปิด">${ic('x', 18)}</button></div>
        <div class="modal-body"><p class="dlg-msg">${message}</p></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="dlg-ok">${esc(confirmLabel)}</button>
        </div>`;
      $('#modal').classList.remove('hidden');
      const finish = (v) => {
        const r = dialogResolver;
        dialogResolver = null;
        panel.classList.remove('modal-sm');
        $('#modal').classList.add('hidden');
        if (r) r(v);
      };
      $('#dlg-ok').onclick = () => finish(true);
    });
  }

  // ── Media ────────────────────────────────────────────────────────────────

  let mediaPath = '';
  let mediaPage = 1;
  let mediaSelected = new Set();
  let mediaLibrary = 'uploads';
  let mediaWritable = true;
  let mediaLibs = [];
  let pickerLibrary = 'uploads';
  let pickerPath = '';

  const MEDIA_LIB_ICON = {
    uploads: 'upload',
    images: 'image',
    'wp-uploads': 'folderOpen',
    downloads: 'fileText',
  };

  function mediaLibTabs(activeId, dataAttr = 'data-lib') {
    return `<div class="media-libs">${(mediaLibs.length ? mediaLibs : [{ id: 'uploads', label: 'อัปโหลดใหม่', writable: true, fileCount: 0 }]).map(lib => {
      const on = lib.id === activeId ? ' on' : '';
      const ro = lib.writable ? '' : ' ro';
      const count = typeof lib.fileCount === 'number' ? lib.fileCount : '—';
      const icon = MEDIA_LIB_ICON[lib.id] || 'folder';
      return `<button type="button" class="media-lib${on}${ro}" ${dataAttr}="${esc(lib.id)}" title="${esc(lib.hint || '')}">
        <span class="media-lib-ico">${ic(icon, 16)}</span>
        <span class="media-lib-txt"><strong>${esc(lib.label)}</strong><small>${count} ไฟล์${!lib.writable ? ' · อ่านอย่างเดียว' : ''}</small></span>
      </button>`;
    }).join('')}</div>`;
  }

  function mediaActionBar() {
    if (!mediaWritable) {
      return `<div class="media-actions"><span class="media-ro-badge">${ic('lock', 14)} คลังนี้อ่านอย่างเดียว — คลิกไฟล์เพื่อเปิด/คัดลอก URL</span></div>`;
    }
    const n = mediaSelected.size;
    return `<div class="media-actions">
      <button type="button" class="btn btn-ghost" data-media-act="mkdir">${ic('folderPlus', 16)} สร้างโฟลเดอร์</button>
      <button type="button" class="btn btn-ghost" data-media-act="rmdir" ${mediaPath ? '' : 'disabled'}>${ic('trash', 16)} ลบโฟลเดอร์นี้</button>
      <button type="button" class="btn btn-ghost" data-media-act="move" ${n ? '' : 'disabled'}>${ic('move', 16)} ย้าย (${n})</button>
      <button type="button" class="btn btn-ghost" data-media-act="del" ${n ? '' : 'disabled'}>${ic('trash', 16)} ลบ (${n})</button>
      <label class="btn btn-primary" style="cursor:pointer">${ic('upload', 16)} อัปโหลดไฟล์<input type="file" data-media-act="upload" hidden multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.mp4,.webm"></label>
    </div>`;
  }

  async function mediaDoMkdir() {
    const name = await openFormDialog({
      title: 'สร้างโฟลเดอร์',
      message: `สร้างภายใต้ <strong>${esc(mediaPath || 'รากของคลังนี้')}</strong>`,
      placeholder: 'เช่น news, posters, 2026',
      confirmLabel: 'สร้างโฟลเดอร์',
    });
    if (!name) return;
    const safe = name.replace(/[\\/]+/g, '-').trim();
    if (!safe) return;
    const full = mediaPath ? `${mediaPath}/${safe}` : safe;
    try {
      await api('/media/mkdir', { method: 'POST', body: { path: full, library: mediaLibrary } });
      toast('สร้างโฟลเดอร์แล้ว');
      mediaPath = full;
      mediaPage = 1;
      await loadMedia();
    } catch (err) { toast(err.message); }
  }

  async function mediaDoRmdir() {
    if (!mediaPath) { toast('เข้าไปในโฟลเดอร์ที่จะลบก่อน'); return; }
    const ok = await openConfirmDialog({
      title: 'ลบโฟลเดอร์',
      message: `ลบโฟลเดอร์ <strong>${esc(mediaPath)}</strong>?<br><span class="dlg-note">ลบได้เฉพาะโฟลเดอร์ว่าง</span>`,
      confirmLabel: 'ลบโฟลเดอร์',
      danger: true,
    });
    if (!ok) return;
    try {
      await api('/media/rmdir', { method: 'POST', body: { path: mediaPath, library: mediaLibrary } });
      toast('ลบโฟลเดอร์แล้ว');
      mediaPath = mediaPath.includes('/') ? mediaPath.replace(/\/[^/]+$/, '') : '';
      mediaPage = 1;
      await loadMedia();
    } catch (err) { toast(err.message); }
  }

  async function mediaDoMove() {
    if (mediaSelected.size === 0) { toast('เลือกไฟล์ก่อน'); return; }
    const dest = await openFormDialog({
      title: `ย้าย ${mediaSelected.size} ไฟล์`,
      message: 'ใส่ path โฟลเดอร์ปลายทาง หรือเว้นว่างเพื่อย้ายไปราก',
      placeholder: 'เช่น news หรือ cms/2026/07',
      value: mediaPath || '',
      confirmLabel: 'ย้ายไฟล์',
      allowEmpty: true,
    });
    if (dest === null) return;
    const destPath = String(dest).trim();
    let ok = 0, fail = 0;
    for (const p of mediaSelected) {
      try {
        await api('/media/move', { method: 'POST', body: { src: p, dest: destPath, library: mediaLibrary } });
        ok++;
      } catch (err) { toast(err.message); fail++; }
    }
    mediaSelected.clear();
    toast(`ย้าย ${ok} ไฟล์${fail ? `, ล้มเหลว ${fail}` : ''}`);
    await loadMedia();
  }

  async function mediaDoDelete() {
    if (mediaSelected.size === 0) { toast('เลือกไฟล์ก่อน'); return; }
    const ok = await openConfirmDialog({
      title: 'ลบไฟล์',
      message: `ลบ <strong>${mediaSelected.size}</strong> ไฟล์ที่เลือก?<br><span class="dlg-note">ไม่สามารถกู้คืนได้</span>`,
      confirmLabel: 'ลบไฟล์',
      danger: true,
    });
    if (!ok) return;
    let nOk = 0, fail = 0;
    for (const p of mediaSelected) {
      try {
        await api('/media?library=' + encodeURIComponent(mediaLibrary) + '&path=' + encodeURIComponent(p), { method: 'DELETE' });
        nOk++;
      } catch (err) { fail++; }
    }
    mediaSelected.clear();
    toast(`ลบ ${nOk} ไฟล์${fail ? `, ล้มเหลว ${fail}` : ''}`);
    await loadMedia();
  }

  async function mediaDoUpload(fileList) {
    if (!fileList?.length) return;
    let ok = 0;
    for (const f of fileList) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        await api('/media/upload?library=' + encodeURIComponent(mediaLibrary) + '&path=' + encodeURIComponent(mediaPath), { method: 'POST', body: fd });
        ok++;
      } catch (err) { toast(err.message); }
    }
    if (ok) toast(`อัปโหลดสำเร็จ ${ok} ไฟล์`);
    await loadMedia();
  }

  async function viewMedia() {
    setTitle('คลังสื่อ', 'จัดการรูปและไฟล์บนเว็บไซต์');
    setCrumb([['#/', 'ภาพรวม'], ['#/media', 'คลังสื่อ']]);
    setActions('');
    $('#content').innerHTML = loading();
    const libs = await api('/media/libraries');
    mediaLibs = libs?.items || [];
    if (!mediaLibs.find(l => l.id === mediaLibrary)) mediaLibrary = 'uploads';
    await loadMedia();
  }

  async function loadMedia() {
    if (mediaPath && /\.[a-z0-9]{2,5}$/i.test(mediaPath.split('/').pop() || '')) {
      mediaPath = mediaPath.includes('/') ? mediaPath.replace(/\/[^/]+$/, '') : '';
    }
    // recursive=1: show files in subfolders too (images live under hero/, conf/, …)
    const data = await api(`/media?library=${encodeURIComponent(mediaLibrary)}&path=${encodeURIComponent(mediaPath)}&page=${mediaPage}&recursive=1`);
    if (!data) return;
    mediaWritable = !!data.writable;

    const libMeta = mediaLibs.find(l => l.id === mediaLibrary);
    const crumbs = [`<a href="#" data-nav-path="">${ic('folderOpen', 14)} ${esc(libMeta?.label || mediaLibrary)}</a>`];
    if (mediaPath) {
      let acc = '';
      mediaPath.split('/').forEach(p => {
        acc = acc ? acc + '/' + p : p;
        crumbs.push(`<span>/</span><a href="#" data-nav-path="${esc(acc)}">${esc(p)}</a>`);
      });
    }

    const hasContent = data.dirs.length || data.items.length;
    const dropZone = mediaWritable ? `
      <div class="media-drop" data-media-drop>
        <div class="media-drop-inner">
          ${ic('upload', 28)}
          <strong>ลากไฟล์มาวางที่นี่</strong>
          <span>หรือเลือกไฟล์จากปุ่มอัปโหลด · รองรับรูป / PDF / Office</span>
        </div>
      </div>` : '';

    const folders = data.dirs.length ? `
      <div class="media-section-label">โฟลเดอร์</div>
      <div class="media-folders">${data.dirs.map(d => `
        <button type="button" class="media-folder" data-dir="${esc(d.path)}">
          <span class="media-folder-ico">${ic('folder', 22)}</span>
          <span class="media-folder-meta">
            <span class="media-folder-name">${esc(d.name)}</span>
            <span class="media-folder-count">${d.fileCount != null ? d.fileCount + ' ไฟล์' : ''}</span>
          </span>
          <span class="media-folder-go">${ic('chevronRight', 16)}</span>
        </button>`).join('')}</div>` : '';

    const scopeLabel = mediaPath ? `ไฟล์ใน «${mediaPath}» และโฟลเดอร์ย่อย` : 'ไฟล์ทั้งหมดในคลังนี้';
    const files = data.items.length ? `
      <div class="media-section-label">${esc(scopeLabel)} <span>${data.total}</span></div>
      <div class="media-grid" id="media-grid">${data.items.map(m => mediaTile(m)).join('')}</div>` : '';

    const empty = !hasContent ? `
      <div class="media-empty">
        ${ic('folderOpen', 48)}
        <div class="title">ยังไม่มีไฟล์ในโฟลเดอร์นี้</div>
        <div class="desc">${mediaWritable ? 'สร้างโฟลเดอร์ หรือลากไฟล์มาวางด้านบน' : 'คลังนี้อ่านอย่างเดียว'}</div>
      </div>` : (data.items.length === 0 && data.dirs.length ? `
      <div class="media-empty" style="padding:28px 20px">
        <div class="title">ยังไม่มีไฟล์ที่นี่</div>
        <div class="desc">เปิดโฟลเดอร์ด้านบนเพื่อดูไฟล์</div>
      </div>` : '');

    $('#content').innerHTML = `<div class="media-shell" id="media-card">
      <div class="media-top">
        ${mediaLibTabs(mediaLibrary)}
        <p class="media-hint">${esc(libMeta?.hint || '')}${libMeta?.exists === false ? ' · <strong>ยังไม่พบโฟลเดอร์บนเซิร์ฟเวอร์</strong>' : ''}</p>
        ${mediaActionBar()}
        <div class="media-toolbar">
          <div class="breadcrumb">${crumbs.join(' ')}</div>
          <div class="media-toolbar-right">
            ${searchInput('media-q', 'ค้นหาชื่อไฟล์…')}
            <span class="media-count" data-media-status>${data.total} ไฟล์ · เลือก ${mediaSelected.size}</span>
          </div>
        </div>
      </div>
      ${dropZone}
      <div class="media-body">
        ${folders}
        ${files}
        ${empty}
        ${data.pages > 1 ? `<div class="media-pager">
          ${mediaPage > 1 ? `<button type="button" class="btn btn-ghost" id="mp-prev">${ic('chevronLeft', 16)} ก่อนหน้า</button>` : ''}
          <span>หน้า ${data.page}/${data.pages}</span>
          ${mediaPage < data.pages ? `<button type="button" class="btn btn-ghost" id="mp-next">ถัดไป ${ic('chevronRight', 16)}</button>` : ''}
        </div>` : ''}
      </div>
    </div>`;

    const card = $('#media-card');
    card.addEventListener('click', (e) => {
      const libBtn = e.target.closest('[data-lib]');
      if (libBtn) {
        e.preventDefault();
        if (libBtn.dataset.lib === mediaLibrary) return;
        mediaLibrary = libBtn.dataset.lib;
        mediaPath = '';
        mediaPage = 1;
        mediaSelected.clear();
        loadMedia();
        return;
      }

      const act = e.target.closest('[data-media-act]');
      if (act) {
        const kind = act.dataset.mediaAct;
        if (kind === 'upload') return;
        e.preventDefault();
        if (act.disabled || act.hasAttribute('disabled')) return;
        if (kind === 'mkdir') return mediaDoMkdir();
        if (kind === 'rmdir') return mediaDoRmdir();
        if (kind === 'move') return mediaDoMove();
        if (kind === 'del') return mediaDoDelete();
      }

      const dir = e.target.closest('[data-dir]');
      if (dir) {
        e.preventDefault();
        mediaPath = dir.dataset.dir || '';
        mediaPage = 1;
        loadMedia();
        return;
      }

      const nav = e.target.closest('[data-nav-path]');
      if (nav) {
        e.preventDefault();
        mediaPath = nav.getAttribute('data-nav-path') || '';
        mediaPage = 1;
        loadMedia();
        return;
      }

      const tile = e.target.closest('.media-item');
      if (tile) {
        e.preventDefault();
        const url = tile.dataset.url || '';
        if (!mediaWritable) {
          if (url) {
            navigator.clipboard?.writeText(url).then(
              () => toast('คัดลอก URL: ' + url),
              () => toast(url)
            );
            window.open(url, '_blank', 'noopener');
          }
          return;
        }
        const p = tile.dataset.filePath;
        if (mediaSelected.has(p)) { mediaSelected.delete(p); tile.classList.remove('selected'); }
        else { mediaSelected.add(p); tile.classList.add('selected'); }
        const n = mediaSelected.size;
        const status = card.querySelector('[data-media-status]');
        if (status) status.textContent = `${data.total} ไฟล์ · เลือก ${n}`;
        const moveBtn = card.querySelector('[data-media-act="move"]');
        const delBtn = card.querySelector('[data-media-act="del"]');
        if (moveBtn) {
          moveBtn.disabled = !n;
          moveBtn.innerHTML = `${ic('move', 16)} ย้าย (${n})`;
        }
        if (delBtn) {
          delBtn.disabled = !n;
          delBtn.innerHTML = `${ic('trash', 16)} ลบ (${n})`;
        }
      }
    });

    card.querySelector('[data-media-act="upload"]')?.addEventListener('change', async (e) => {
      await mediaDoUpload(e.target.files);
      e.target.value = '';
    });

    const drop = card.querySelector('[data-media-drop]');
    if (drop) {
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); drop.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); drop.classList.remove('over');
      }));
      drop.addEventListener('drop', async (e) => {
        const files = e.dataTransfer?.files;
        if (files?.length) await mediaDoUpload(files);
      });
    }

    $('#mp-prev')?.addEventListener('click', () => { mediaPage--; loadMedia(); });
    $('#mp-next')?.addEventListener('click', () => { mediaPage++; loadMedia(); });
    $('#media-q')?.addEventListener('input', debounce(async () => {
      const mq = $('#media-q').value;
      const d = await api(`/media?library=${encodeURIComponent(mediaLibrary)}&q=${encodeURIComponent(mq)}&path=${encodeURIComponent(mediaPath)}&recursive=1&per_page=60`);
      const grid = $('#media-grid');
      if (grid && d) grid.innerHTML = d.items.length ? d.items.map(m => mediaTile(m)).join('') : `<div class="media-empty" style="grid-column:1/-1"><div class="title">ไม่พบไฟล์</div></div>`;
      const status = $('[data-media-status]');
      if (status && d) status.textContent = `${d.total} ไฟล์ · เลือก ${mediaSelected.size}`;
    }, 300));
  }

  function mediaFileKind(m) {
    const name = (m.name || m.path || '').toLowerCase();
    const ext = (name.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (m.type === 'image' || ['jpg','jpeg','png','gif','webp','svg'].includes(ext)) {
      return { kind: 'image', icon: 'image', label: ext.toUpperCase() || 'IMG', cls: 'ft-image' };
    }
    if (ext === 'pdf' || m.type === 'pdf') return { kind: 'pdf', icon: 'filePdf', label: 'PDF', cls: 'ft-pdf' };
    if (['doc','docx'].includes(ext)) return { kind: 'doc', icon: 'fileWord', label: ext.toUpperCase(), cls: 'ft-doc' };
    if (['xls','xlsx'].includes(ext)) return { kind: 'xls', icon: 'fileSpreadsheet', label: ext.toUpperCase(), cls: 'ft-xls' };
    if (['ppt','pptx'].includes(ext)) return { kind: 'ppt', icon: 'presentation', label: ext.toUpperCase(), cls: 'ft-ppt' };
    if (['mp4','webm','mov'].includes(ext)) return { kind: 'video', icon: 'video', label: ext.toUpperCase(), cls: 'ft-video' };
    if (['mp3','wav','ogg'].includes(ext)) return { kind: 'audio', icon: 'music', label: ext.toUpperCase(), cls: 'ft-audio' };
    if (ext === 'zip') return { kind: 'zip', icon: 'archive', label: 'ZIP', cls: 'ft-zip' };
    if (['html','htm'].includes(ext)) return { kind: 'html', icon: 'code', label: 'HTML', cls: 'ft-html' };
    return { kind: 'file', icon: 'file', label: (ext || 'FILE').toUpperCase(), cls: 'ft-file' };
  }

  function mediaTile(m) {
    const kind = mediaFileKind(m);
    const sel = mediaSelected.has(m.path) ? ' selected' : '';
    const folder = (m.path || '').includes('/') ? m.path.split('/').slice(0, -1).join('/') : '';
    const preview = kind.kind === 'image'
      ? `<img src="${esc(m.url)}" loading="lazy" alt="">`
      : `<div class="file-icon ${kind.cls}">${ic(kind.icon, 28)}<span class="ext">${esc(kind.label)}</span></div>`;
    return `<div class="media-item${sel}" data-url="${esc(m.url)}" data-file-path="${esc(m.path)}" title="${esc(m.path || m.name)}">
      ${preview}
      <div class="meta">
        <span class="name">${esc(m.name)}</span>
        ${folder ? `<span class="folder">${esc(folder)}</span>` : ''}
        <span class="size">${(m.size/1024).toFixed(0)} KB</span>
      </div>
    </div>`;
  }

  function openMediaPicker(callback) {
    mediaPickerCb = callback;
    pickerLibrary = 'uploads';
    pickerPath = '';
    const panel = $('#modal-panel');
    panel.classList.remove('modal-sm');
    panel.innerHTML = `<div class="modal-head"><strong>เลือกจากคลังสื่อ</strong><button type="button" class="btn btn-icon btn-ghost" data-close aria-label="ปิด">${ic('x', 18)}</button></div>
      <div class="modal-body" id="picker-body">${loading()}</div>
      <div class="modal-foot"><label class="btn btn-primary" style="cursor:pointer" id="picker-upload-label">${ic('upload', 16)} อัปโหลดใหม่<input type="file" id="picker-upload" hidden accept="image/*,.pdf"></label>
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button></div>`;
    $('#modal').classList.remove('hidden');
    (async () => {
      if (!mediaLibs.length) {
        const libs = await api('/media/libraries');
        mediaLibs = libs?.items || [];
      }
      loadPicker(pickerPath);
    })();
    panel.onclick = async (e) => {
      if (e.target.closest('[data-close]')) closeModal();
      const libBtn = e.target.closest('[data-picker-lib]');
      if (libBtn) {
        e.preventDefault();
        pickerLibrary = libBtn.dataset.pickerLib;
        pickerPath = '';
        loadPicker('');
        return;
      }
      const item = e.target.closest('.media-item');
      if (item && mediaPickerCb) { mediaPickerCb(item.dataset.url); closeModal(); return; }
      const dir = e.target.closest('[data-dir]');
      if (dir) { e.preventDefault(); pickerPath = dir.dataset.dir; loadPicker(pickerPath); return; }
      if (e.target.closest('[data-picker-root]')) { e.preventDefault(); pickerPath = ''; loadPicker(''); return; }
      if (e.target.id === 'picker-upload') {
        for (const f of e.target.files) {
          const fd = new FormData(); fd.append('file', f);
          try {
            await api('/media/upload?library=uploads', { method: 'POST', body: fd });
            toast('อัปโหลด ' + f.name);
          } catch (err) { toast(err.message); }
        }
        pickerLibrary = 'uploads';
        pickerPath = '';
        loadPicker('');
      }
    };
  }

  const SITE_LINK_PRESETS = [
    { label: 'หน้าแรก', href: '/' },
    { label: 'ข่าวสาร', href: '/news/' },
    { label: 'กิจกรรม', href: '/events/' },
    { label: 'ประชุมนานาชาติ 2026', href: '/2026conf-intl/' },
    { label: 'ประชุมระดับชาติ 2026', href: '/2026conf-national/' },
    { label: 'IAEC 2026', href: '/c/iaec2026/' },
    { label: 'AAAE Awards 2026', href: '/c/aaae-awards-2026/' },
    { label: 'งานวิจัย / เอกสาร', href: '/about/research/' },
    { label: 'เอกสารวิชาการ', href: '/academic/' },
    { label: 'วารสาร', href: '/journal/' },
    { label: 'สมัครสมาชิก', href: '/membership/' },
    { label: 'ติดต่อ', href: '/contact/' },
  ];

  function openLinkPicker(callback, currentHref = '') {
    let linkLib = 'downloads';
    let linkPath = '';
    let initialTab = 'pages';
    if (/^https?:\/\//i.test(currentHref)) {
      initialTab = 'url';
    } else if (/^\/(downloads|uploads|images|wp-uploads)\//.test(currentHref)) {
      initialTab = 'files';
      linkLib = currentHref.match(/^\/(downloads|uploads|images|wp-uploads)\//)[1];
    }

    const panel = $('#modal-panel');
    panel.classList.remove('modal-sm');
    panel.innerHTML = `
      <div class="modal-head"><strong>เลือกปลายทางเมื่อกด</strong>
        <button type="button" class="btn btn-icon btn-ghost" data-close aria-label="ปิด">${ic('x', 18)}</button>
      </div>
      <div class="modal-body" id="link-picker-body">
        <div class="link-tabs" id="link-tabs">
          <button type="button" data-ltab="pages">${ic('fileText', 14)} หน้าเว็บ</button>
          <button type="button" data-ltab="files">${ic('folderOpen', 14)} ไฟล์ / สื่อ</button>
          <button type="button" data-ltab="url">${ic('link', 14)} ลิงก์</button>
        </div>
        <div id="link-pane-pages" class="link-pane">
          <input type="search" id="link-page-q" placeholder="ค้นหาหน้า…" style="margin-bottom:10px">
          <div id="link-page-list" class="link-list">${loading()}</div>
        </div>
        <div id="link-pane-files" class="link-pane hidden">
          <p class="help" style="margin:0 0 8px">เลือก PDF / รูป / เอกสารจากคลังสื่อ — รวมโฟลเดอร์ดาวน์โหลด</p>
          <div id="link-media-libs"></div>
          <input type="search" id="link-media-q" placeholder="ค้นหาไฟล์…" style="margin-bottom:8px">
          <div id="link-media-bc" class="breadcrumb" style="margin:0 0 8px"></div>
          <div id="link-media-folders" class="media-folders"></div>
          <div id="link-media-grid" class="media-grid link-media-grid">${loading()}</div>
          <label class="btn btn-primary" style="cursor:pointer;margin-top:10px;display:inline-flex" id="link-media-upload-label">${ic('upload', 16)} อัปโหลดไฟล์ใหม่<input type="file" id="link-media-upload" hidden accept="image/*,.pdf,.doc,.docx"></label>
        </div>
        <div id="link-pane-url" class="link-pane hidden">
          <div class="field" style="margin:0">
            <label>ลิงก์ภายนอก (URL)</label>
            <input id="link-url-input" type="url" placeholder="https://…" value="${esc(/^https?:\/\//.test(currentHref) ? currentHref : '')}">
            <p class="help">เช่น เว็บลงทะเบียน, Google Drive, YouTube</p>
          </div>
          <button type="button" class="btn btn-primary" id="link-url-ok" style="margin-top:12px">${ic('check', 16)} ใช้ลิงก์นี้</button>
          <hr class="link-divider">
          <div class="field" style="margin:0">
            <label>หรือ path ภายในเว็บ</label>
            <input id="link-path-input" type="text" placeholder="/downloads/… หรือ /news/…" value="${esc(/^https?:\/\//.test(currentHref) ? '' : (currentHref || ''))}">
            <p class="help">ถ้ารู้ path อยู่แล้ว — ไม่ต้องเลือกจากคลัง</p>
          </div>
          <button type="button" class="btn btn-ghost" id="link-path-ok" style="margin-top:12px">${ic('check', 16)} ใช้ path นี้</button>
        </div>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button></div>`;
    $('#modal').classList.remove('hidden');

    const showTab = (tab) => {
      panel.querySelectorAll('[data-ltab]').forEach((b) => b.classList.toggle('on', b.dataset.ltab === tab));
      ['pages', 'files', 'url'].forEach((t) => {
        const pane = panel.querySelector('#link-pane-' + t);
        if (pane) pane.classList.toggle('hidden', t !== tab);
      });
      if (tab === 'files') loadLinkMedia();
    };

    const pick = (href) => {
      const v = (href || '').trim();
      if (!v) return;
      callback(v);
      closeModal();
    };

    const renderPages = (items, q = '') => {
      const needle = q.trim().toLowerCase();
      const filtered = items.filter((p) => {
        if (!needle) return true;
        return (p.label + ' ' + p.href).toLowerCase().includes(needle);
      });
      const list = panel.querySelector('#link-page-list');
      if (!filtered.length) {
        list.innerHTML = `<div class="empty" style="padding:24px"><div class="title">ไม่พบหน้า</div></div>`;
        return;
      }
      list.innerHTML = filtered.map((p) => `
        <button type="button" class="link-item" data-href="${esc(p.href)}">
          <span class="link-item-label">${esc(p.label)}</span>
          <span class="link-item-href">${esc(p.href)}</span>
        </button>`).join('');
    };

    async function loadLinkMedia() {
      const grid = panel.querySelector('#link-media-grid');
      const foldersEl = panel.querySelector('#link-media-folders');
      const bcEl = panel.querySelector('#link-media-bc');
      const libsEl = panel.querySelector('#link-media-libs');
      if (!grid) return;
      grid.innerHTML = loading();
      if (!mediaLibs.length) {
        const libs = await api('/media/libraries');
        mediaLibs = libs?.items || [];
      }
      const q = (panel.querySelector('#link-media-q')?.value || '').trim();
      const data = await api('/media?library=' + encodeURIComponent(linkLib) + '&path=' + encodeURIComponent(linkPath) + '&per_page=60&recursive=1&q=' + encodeURIComponent(q));
      if (!data) { grid.innerHTML = `<div class="empty" style="padding:24px"><div class="title">โหลดไฟล์ไม่ได้</div></div>`; return; }
      if (libsEl) {
        libsEl.innerHTML = mediaLibTabs(linkLib, 'data-link-lib');
      }
      if (bcEl) {
        const libLabel = mediaLibs.find((l) => l.id === linkLib)?.label || linkLib;
        bcEl.innerHTML = `<a href="#" data-link-root="1">${esc(libLabel)}</a>${linkPath ? ' / ' + esc(linkPath) : ''}`;
      }
      if (foldersEl) {
        foldersEl.innerHTML = (data.dirs || []).map((d) => `
          <button type="button" class="media-folder" data-link-dir="${esc(d.path)}">
            <span class="media-folder-ico">${ic('folder', 18)}</span>
            <span class="media-folder-meta"><span class="media-folder-name">${esc(d.name)}</span></span>
          </button>`).join('');
      }
      grid.innerHTML = data.items.length
        ? data.items.map((m) => mediaTile(m)).join('')
        : `<div class="media-empty" style="grid-column:1/-1"><div class="title">ไม่พบไฟล์</div></div>`;
    }

    (async () => {
      let pages = SITE_LINK_PRESETS.slice();
      try {
        const data = await api('/pages');
        const extra = (data?.items || []).map((p) => ({
          label: p.title || p.slug || p.id,
          href: p.path || (p.slug ? `/p/${p.slug}/` : ''),
        })).filter((p) => p.href);
        pages = [...pages, ...extra];
      } catch (_) { /* presets only */ }
      renderPages(pages);
      const q = panel.querySelector('#link-page-q');
      if (q) q.oninput = () => renderPages(pages, q.value);
      showTab(initialTab);
    })();

    panel.onclick = async (e) => {
      if (e.target.closest('[data-close]')) { closeModal(); return; }
      const tab = e.target.closest('[data-ltab]');
      if (tab) { showTab(tab.dataset.ltab); return; }
      const item = e.target.closest('.link-item');
      if (item) { pick(item.dataset.href); return; }
      const mediaItem = e.target.closest('.media-item');
      if (mediaItem) { pick(mediaItem.dataset.url); return; }
      const libBtn = e.target.closest('[data-link-lib]');
      if (libBtn) {
        e.preventDefault();
        linkLib = libBtn.dataset.linkLib;
        linkPath = '';
        loadLinkMedia();
        return;
      }
      const dir = e.target.closest('[data-link-dir]');
      if (dir) { e.preventDefault(); linkPath = dir.dataset.linkDir; loadLinkMedia(); return; }
      if (e.target.closest('[data-link-root]')) { e.preventDefault(); linkPath = ''; loadLinkMedia(); return; }
      if (e.target.closest('#link-url-ok')) {
        const v = (panel.querySelector('#link-url-input')?.value || '').trim();
        if (!v) return toast('ใส่ URL ก่อน');
        pick(v);
        return;
      }
      if (e.target.closest('#link-path-ok')) {
        const v = (panel.querySelector('#link-path-input')?.value || '').trim();
        if (!v) return toast('ใส่ path ก่อน');
        pick(v.startsWith('/') ? v : '/' + v);
        return;
      }
      if (e.target.id === 'link-media-upload') {
        for (const f of e.target.files) {
          const fd = new FormData(); fd.append('file', f);
          try {
            await api('/media/upload?library=uploads', { method: 'POST', body: fd });
            toast('อัปโหลด ' + f.name);
          } catch (err) { toast(err.message); }
        }
        linkLib = 'uploads';
        linkPath = '';
        loadLinkMedia();
      }
    };
    panel.querySelector('#link-media-q')?.addEventListener('input', debounce(loadLinkMedia, 300));
  }

  async function loadPicker(path) {
    pickerPath = path || '';
    const data = await api('/media?library=' + encodeURIComponent(pickerLibrary) + '&path=' + encodeURIComponent(pickerPath) + '&per_page=60&recursive=1');
    if (!data) return;
    const writable = !!data.writable;
    $('#picker-body').innerHTML = `
      ${mediaLibTabs(pickerLibrary, 'data-picker-lib')}
      <p class="media-hint" style="margin:10px 0 0">${writable ? 'คลิกไฟล์เพื่อเลือก' : 'อ่านอย่างเดียว · คลิกเพื่อเลือกไฟล์ที่มีอยู่'}</p>
      <div class="breadcrumb" style="margin-top:10px"><a href="#" data-picker-root="1">${esc(mediaLibs.find(l => l.id === pickerLibrary)?.label || pickerLibrary)}</a>${pickerPath ? ' / ' + esc(pickerPath) : ''}</div>
      <div class="media-folders" style="margin-top:12px">${data.dirs.map(d => `<button type="button" class="media-folder" data-dir="${esc(d.path)}"><span class="media-folder-ico">${ic('folder', 18)}</span><span class="media-folder-meta"><span class="media-folder-name">${esc(d.name)}</span><span class="media-folder-count">${d.fileCount != null ? d.fileCount + ' ไฟล์' : ''}</span></span></button>`).join('')}</div>
      <div class="media-grid" style="margin-top:12px">${data.items.length ? data.items.map(m => mediaTile(m)).join('') : `<div class="media-empty" style="grid-column:1/-1"><div class="title">โฟลเดอร์ว่าง</div></div>`}</div>`;
  }

  // (closeModal defined above with dialog support)

  // ── Utils ────────────────────────────────────────────────────────────────

  function toLocalInput(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(d);
      const get = (t) => parts.find((p) => p.type === t)?.value || '00';
      return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
    } catch { return ''; }
  }
  function fromLocalInput(v) {
    if (!v) return null;
    // datetime-local has no timezone — treat as Asia/Bangkok wall clock
    const m = String(v).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/);
    if (m) return `${m[1]}:${m[2] || '00'}+07:00`;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function endsAtStatus(iso) {
    if (!iso) return { kind: 'forever', label: 'แสดงตลอด (ไม่มีวันหมดอายุ)' };
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return { kind: 'bad', label: 'วันเวลาไม่ถูกต้อง' };
    if (t <= Date.now()) return { kind: 'past', label: 'หมดอายุแล้ว — จะไม่โชว์บน Hero หลังอัปเดตเว็บ' };
    const mins = Math.round((t - Date.now()) / 60000);
    if (mins < 60) return { kind: 'soon', label: `จะซ่อนในอีก ${mins} นาที` };
    const hours = Math.round(mins / 60);
    if (hours < 48) return { kind: 'soon', label: `จะซ่อนในอีกประมาณ ${hours} ชม.` };
    const days = Math.round(hours / 24);
    return { kind: 'future', label: `จะซ่อนในอีกประมาณ ${days} วัน` };
  }
  function formatEndsDisplay(iso) {
    if (!iso) return '—';
    const local = toLocalInput(iso);
    if (!local) return iso;
    const [d, t] = local.split('T');
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y} ${t} น.`;
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function notifyParentSave() {
    if (new URLSearchParams(location.search).get('embed') === '1') {
      window.parent.postMessage({ type: 'tsae-cms-saved' }, location.origin);
    }
  }

  window.__cms = { api, ic, esc, $, setTitle, setCrumb, setActions, loading, openMediaPicker, openLinkPicker, openConfirmDialog, toast, afterSavePublish, debounce, initQuill, uploadImage, notifyParentSave, eventTypeOptions, EVENT_TYPES, toLocalInput, fromLocalInput, endsAtStatus, formatEndsDisplay };

  if (new URLSearchParams(location.search).get('embed') === '1') {
    document.body.classList.add('embed-mode');
  }

  if (!location.hash) location.hash = '#/';

  window.addEventListener('hashchange', route);
  $('#sidebar').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); }
    if (e.target.closest('[data-crumb]')) {
      const c = e.target.closest('[data-crumb]');
      location.hash = c.dataset.crumb.replace(/^#\//, '/');
    }
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModal();
  });

  route();
})();

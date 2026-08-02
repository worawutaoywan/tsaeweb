/* TSAE CMS — single-page admin, simplified */
(() => {
  const API = '/api/admin/cms/api';
  const ic = (name, size = 18, cls = '') => CMSIcons.icon(name, size, cls);

  const NAV = [
    { hash: '#/', icon: 'layoutDashboard', label: 'ภาพรวม' },
    { hash: '#/pages', icon: 'panelsTopLeft', label: 'หน้าเว็บ' },
    { hash: '#/timeline', icon: 'calendarDays', label: 'ข่าวและกิจกรรม' },
    { hash: '#/media', icon: 'folderOpen', label: 'คลังสื่อ' },
  ];

  const EVENT_TYPES = {
    conference: 'ประชุม', training: 'อบรม', news: 'ข่าว',
    webinar: 'เว็บinar', activity: 'กิจกรรม',
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
      headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
      ...opts,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      location.href = '/api/admin/login?next=' + encodeURIComponent('/api/admin/cms' + (location.hash || ''));
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function toast(msg) {
    const el = $('#toast');
    el.innerHTML = `${ic('check', 16)} ${esc(msg)}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
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
      if (page === 'dashboard') return await viewDashboard();
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
          <div class="top"><span class="k">หน้าเว็บ</span>
            <span class="ico">${ic('panelsTopLeft', 16)}</span></div>
          <div class="v">${s.pages ?? 0}</div>
          <div class="trend">แก้ไขด้วย Page Builder</div>
        </div>
        <div class="stat gold">
          <div class="top"><span class="k">ข่าวและกิจกรรม</span>
            <span class="ico">${ic('calendarDays', 16)}</span></div>
          <div class="v">${s.events}</div>
          <div class="trend">เหตุการณ์ + ข่าว</div>
        </div>
        <div class="stat blue">
          <div class="top"><span class="k">คลังสื่อ</span>
            <span class="ico">${ic('folderOpen', 16)}</span></div>
          <div class="v">${s.media}</div>
          <div class="trend">ไฟล์รูป + PDF</div>
        </div>
      </div>
      <div class="card"><div class="card-body">
        <h3 class="card-title">ทางลัด</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
          <a class="btn btn-ghost" href="#/pages/new">${ic('plus', 16)} หน้าเว็บใหม่</a>
          <a class="btn btn-ghost" href="#/timeline/new">${ic('plus', 16)} เพิ่มเหตุการณ์</a>
          <a class="btn btn-ghost" href="#/timeline">${ic('calendar', 16)} ดูปฏิทิน</a>
          <a class="btn btn-ghost" href="#/media">${ic('upload', 16)} อัปโหลดสื่อ</a>
        </div>
      </div></div>`;
  }

  // ── Timeline (events + news merged) ─────────────────────────────────────

  let timelineView = 'list';

  async function viewTimeline() {
    setTitle('ข่าวและกิจกรรม', 'เหตุการณ์และข่าว — ดูแบบปฏิทินหรือตาราง');
    setCrumb([['#/', 'ภาพรวม'], ['#/timeline', 'ข่าวและกิจกรรม']]);
    setActions(`<a class="btn btn-primary" href="#/timeline/new">${ic('plus', 16)} เพิ่ม</a>`);
    $('#content').innerHTML = loading();
    const data = await api('/events');
    if (!data) return;

    const seg = `<div class="seg">
      <a data-view="list" class="${timelineView==='list'?'on':''}">ตาราง</a>
      <a data-view="cal" class="${timelineView==='cal'?'on':''}">ปฏิทิน</a>
    </div>`;

    $('#content').innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      ${searchInput('ev-q', 'ค้นหาเหตุการณ์…')}
      <select class="filter-select" id="ev-type"><option value="">ทุกประเภท</option>${eventTypeOptions('')}</select>
      ${seg}
    </div>
    <div id="ev-render"></div>`;

    $('select#ev-type').onchange = () => renderEventsList(data.items);
    $('#ev-q').oninput = debounce(() => renderEventsList(data.items), 200);
    $('#ev-render').onclick = (e) => {
      const v = e.target.closest('[data-view]');
      if (v) {
        timelineView = v.dataset.view;
        document.querySelectorAll('[data-view]').forEach(a => a.classList.toggle('on', a.dataset.view === timelineView));
        renderEventsList(data.items);
      }
    };

    renderEventsList(data.items);
  }

  function renderEventsList(allItems) {
    const q = ($('#ev-q')?.value || '').toLowerCase();
    const type = $('select#ev-type')?.value;
    let items = allItems;
    if (type) items = items.filter(i => i.type === type);
    if (q) items = items.filter(i =>
      (i.titleTH || i.title || '').toLowerCase().includes(q) ||
      (i.excerpt || i.excerptTH || '').toLowerCase().includes(q));

    if (timelineView === 'cal') {
      renderCalendar(items);
      return;
    }

    if (!items.length) {
      $('#ev-render').innerHTML = `<div class="empty">${ic('calendarDays', 40)}<div class="title">ยังไม่มีเหตุการณ์</div>
        <a class="btn btn-primary" href="#/timeline/new">${ic('plus', 16)} เพิ่มเหตุการณ์</a></div>`;
      return;
    }

    items.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    $('#ev-render').innerHTML = `<div class="tablecard"><div class="table-wrap"><table>
      <thead><tr><th>วันที่</th><th>ชื่อ</th><th>ประเภท</th><th>สถานะ</th><th>เผยแพร่</th><th></th></tr></thead>
      <tbody>${items.map(i => `<tr>
        <td style="white-space:nowrap;color:var(--ink-500);font-size:13px">${esc((i.startDate||'').slice(0,10))}</td>
        <td><div class="row-title">${esc(i.titleTH || i.title)}</div>
          ${i.locationTH ? `<div class="row-sub">${esc(i.locationTH)}</div>` : ''}</td>
        <td><span class="badge badge-${i.type}">${EVENT_TYPES[i.type] || i.type}</span></td>
        <td style="font-size:13px;color:var(--ink-500)">${esc(STATUS_LABELS[i.status] || i.status)}</td>
        <td>${i.published === false ? '<span class="badge badge-draft">ฉบับร่าง</span>' : '<span class="badge badge-published">เผยแพร่</span>'}</td>
        <td><a class="btn btn-sm btn-ghost" href="#/timeline/edit/${esc(i.id)}">${ic('pencil', 14)} แก้ไข</a></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="table-foot">ทั้งหมด ${items.length} รายการ</div></div>`;
  }

  function renderCalendar(items) {
    $('#ev-render').innerHTML = '<div id="calendar"></div>';
    if (calendar) { calendar.destroy(); calendar = null; }
    const events = items.map(i => {
      const color = {
        conference: '#1a6b3a', training: '#c8a951', news: '#b91c1c',
        webinar: '#3d4db0', activity: '#0e7490',
      }.get?.(i.type) || { conference: '#1a6b3a', training: '#c8a951', news: '#b91c1c', webinar: '#3d4db0', activity: '#0e7490' }[i.type] || '#1a6b3a';
      return {
        id: i.id,
        title: i.titleTH || i.title || 'Event',
        start: i.startDate,
        end: i.endDate || i.startDate,
        backgroundColor: color,
        borderColor: color,
      };
    });
    calendar = new FullCalendar.Calendar($('#calendar'), {
      initialView: 'dayGridMonth',
      locale: 'th',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' },
      events,
      eventClick(info) { location.hash = '#/timeline/edit/' + info.event.id; },
      height: 'auto',
    });
    calendar.render();
  }

  async function viewEventEdit(id) {
    const isNew = !id;
    setTitle(isNew ? 'เพิ่มเหตุการณ์' : 'แก้ไขเหตุการณ์');
    setCrumb([['#/', 'ภาพรวม'], ['#/timeline', 'ข่าวและกิจกรรม'], [isNew ? 'เพิ่ม' : 'แก้ไข']]);
    setActions(`
      <a class="btn btn-ghost" href="#/timeline">${ic('arrowLeft', 16)} กลับ</a>
      <button class="btn btn-primary" id="save-ev">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="del-ev">${ic('trash2', 16)} ลบ</button>`}
    `);
    $('#content').innerHTML = loading();

    let item = isNew
      ? { title:'', titleTH:'', type:'conference', status:'upcoming', location:'', locationTH:'',
          startDate:'', endDate:'', registrationUrl:'', image:'', excerpt:'', excerptTH:'',
          html:'', published:true }
      : await api('/events/' + encodeURIComponent(id));
    if (!item) return;

    $('#content').innerHTML = `
      <div class="card"><div class="card-body form-grid">
        <div class="field"><label>ชื่อ (TH) *</label><input id="f-titleTH" value="${esc(item.titleTH)}"></div>
        <div class="field"><label>ชื่อ (EN)</label><input id="f-title" value="${esc(item.title)}"></div>
        <div class="field"><label>ประเภท</label><select id="f-type">${eventTypeOptions(item.type)}</select></div>
        <div class="field"><label>สถานะ</label><select id="f-status">
          ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}"${item.status===k?' selected':''}>${v}</option>`).join('')}
        </select></div>
        <div class="field"><label>วันเริ่ม *</label><input id="f-start" type="datetime-local" value="${toLocalInput(item.startDate)}"></div>
        <div class="field"><label>วันสิ้นสุด</label><input id="f-end" type="datetime-local" value="${toLocalInput(item.endDate)}"></div>
        <div class="field"><label>สถานที่ (TH)</label><input id="f-locTH" value="${esc(item.locationTH)}"></div>
        <div class="field"><label>สถานที่ (EN)</label><input id="f-loc" value="${esc(item.location)}"></div>
        <div class="full field"><label>ลิงก์ลงทะเบียน</label><input id="f-reg" value="${esc(item.registrationUrl || '')}"></div>
        <div class="full field"><label>รูป</label>
          <div class="input-row">
            <input id="f-image" value="${esc(item.image || '')}">
            <button type="button" class="btn btn-ghost" id="pick-ev-img">${ic('imagePlus', 16)} เลือก</button>
          </div>
          ${item.image ? `<img class="img-preview" src="${esc(item.image)}">` : ''}
        </div>
        <div class="full field"><label>คำโปรย (TH)</label><textarea id="f-excerptTH">${esc(item.excerptTH || '')}</textarea></div>
        <div class="full field"><label>คำโปรย (EN)</label><textarea id="f-excerpt">${esc(item.excerpt || '')}</textarea></div>
        <div class="full field field-check"><label><input type="checkbox" id="f-pub"${item.published !== false ? ' checked' : ''}> เผยแพร่ (ถ้าไม่เลือก = ฉบับร่าง)</label></div>
        <div class="full field"><label>รายละเอียด</label><div class="editor-wrap"><div id="editor"></div></div></div>
      </div></div>`;

    initQuill(item.html || '', 'simple', true);
    $('#pick-ev-img').onclick = () => openMediaPicker(url => {
      $('#f-image').value = url;
      const prev = $('#f-image').parentElement.nextElementSibling;
      if (prev?.tagName === 'IMG') prev.src = url;
    });

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
          toast('สร้างเหตุการณ์แล้ว');
        } else {
          await api('/events/' + encodeURIComponent(id), { method: 'PUT', body });
          toast('บันทึกแล้ว');
          notifyParentSave();
        }
      } catch (e) { toast('ผิดพลาด: ' + e.message); }
    };
    if (!isNew) $('#del-ev').onclick = async () => {
      if (!confirm('ลบเหตุการณ์นี้?')) return;
      await api('/events/' + encodeURIComponent(id), { method: 'DELETE' });
      location.hash = '#/timeline';
    };
  }

  // ── Media ────────────────────────────────────────────────────────────────

  let mediaPath = '';
  let mediaPage = 1;
  let mediaSelected = new Set();

  async function viewMedia() {
    setTitle('คลังสื่อ', 'รูปภาพ + ไฟล์ PDF สำหรับเว็บไซต์');
    setCrumb([['#/', 'ภาพรวม'], ['#/media', 'คลังสื่อ']]);
    setActions(`
      <button class="btn btn-ghost" id="btn-mkdir">${ic('folderPlus', 16)} สร้างโฟลเดอร์</button>
      <button class="btn btn-ghost" id="btn-rmdir">${ic('trash', 16)} ลบโฟลเดอร์</button>
      <button class="btn btn-ghost" id="btn-move">${ic('move', 16)} ย้ายไฟล์</button>
      <button class="btn btn-ghost" id="btn-del-sel">${ic('trash', 16)} ลบที่เลือก (${mediaSelected.size})</button>
      <label class="btn btn-primary" style="cursor:pointer">${ic('upload', 16)} อัปโหลด<input type="file" id="upload-file" hidden multiple accept="image/*,.pdf,.doc,.docx"></label>
    `);
    $('#content').innerHTML = loading();
    $('#upload-file').onchange = async (e) => {
      for (const f of e.target.files) {
        const fd = new FormData(); fd.append('file', f);
        try { await api('/media/upload?path=' + encodeURIComponent(mediaPath), { method: 'POST', body: fd }); toast('อัปโหลด ' + f.name); }
        catch (err) { toast(err.message); }
      }
      loadMedia();
      e.target.value = '';
    };
    $('#btn-mkdir')?.addEventListener('click', async () => {
      const name = prompt('ชื่อโฟลเดอร์ใหม่ (ภายใต้ ' + (mediaPath || 'คลังสื่อ') + '):');
      if (!name) return;
      const full = mediaPath ? `${mediaPath}/${name}` : name;
      try { await api('/media/mkdir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ path: full }) }); toast('สร้างโฟลเดอร์แล้ว'); loadMedia(); }
      catch (err) { toast(err.message); }
    });
    $('#btn-rmdir')?.addEventListener('click', async () => {
      if (!mediaPath) { toast('เลือกโฟลเดอร์ที่จะลบก่อน'); return; }
      if (!confirm(`ลบโฟลเดอร์ "${mediaPath}" ?\n(ลบได้เฉพาะโฟลเดอร์ว่าง)`)) return;
      try { await api('/media/rmdir', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ path: mediaPath }) }); toast('ลบโฟลเดอร์แล้ว'); mediaPath = ''; mediaPage = 1; loadMedia(); }
      catch (err) { toast(err.message); }
    });
    $('#btn-move')?.addEventListener('click', async () => {
      if (mediaSelected.size === 0) { toast('เลือกไฟล์ก่อน'); return; }
      const dest = prompt(`ย้าย ${mediaSelected.size} ไฟล์ไปยังโฟลเดอร์ (เช่น news หรือ cms/2026/07) หรือว่างไว้เพื่อย้ายไปราก:`);
      if (dest === null) return;
      const destPath = (dest || '').trim();
      let ok = 0, fail = 0;
      for (const p of mediaSelected) {
        try { await api('/media/move', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ src: p, dest: destPath }) }); ok++; }
        catch (err) { toast(err.message); fail++; }
      }
      mediaSelected.clear();
      toast(`ย้าย ${ok} ไฟล์${fail ? `, ล้มเหลว ${fail}` : ''}`);
      loadMedia();
    });
    $('#btn-del-sel')?.addEventListener('click', async () => {
      if (mediaSelected.size === 0) { toast('เลือกไฟล์ก่อน'); return; }
      if (!confirm(`ลบ ${mediaSelected.size} ไฟล์? ไม่สามารถกู้คืนได้`)) return;
      let ok = 0, fail = 0;
      for (const p of mediaSelected) {
        try { await api('/media?path=' + encodeURIComponent(p), { method: 'DELETE' }); ok++; }
        catch (err) { fail++; }
      }
      mediaSelected.clear();
      toast(`ลบ ${ok} ไฟล์${fail ? `, ล้มเหลว ${fail}` : ''}`);
      loadMedia();
    });
    loadMedia();
  }

  async function loadMedia() {
    const data = await api(`/media?path=${encodeURIComponent(mediaPath)}&page=${mediaPage}`);
    if (!data) return;

    // Clear selection if path changed or page changed
    if (!mediaSelected.size || !Array.from(mediaSelected).every(p => p.startsWith(mediaPath ? mediaPath + '/' : ''))) {
      // keep selection only if still under current path
    }

    const crumbs = [`<a data-path="">${ic('folderOpen', 14)} คลังสื่อ</a>`];
    if (mediaPath) {
      let acc = '';
      mediaPath.split('/').forEach(p => {
        acc = acc ? acc + '/' + p : p;
        crumbs.push(`<span>/</span><a data-path="${esc(acc)}">${esc(p)}</a>`);
      });
    }

    $('#content').innerHTML = `<div class="card">
      <div class="card-head toolbar">
        ${searchInput('media-q', 'ค้นหาไฟล์…')}
        <span style="font-size:13px;color:var(--ink-500)">${data.total} ไฟล์ · เลือก ${mediaSelected.size}</span>
      </div>
      <div class="card-body">
        <div class="breadcrumb">${crumbs.join(' ')}</div>
        <div class="media-dirs">${data.dirs.map(d => `<span class="media-dir" data-dir="${esc(d.path)}">${ic('folder', 16)} ${esc(d.name)}</span>`).join('')}</div>
        <div class="media-grid" id="media-grid">${data.items.length ? data.items.map(m => mediaTile(m)).join('') : `<div class="empty" style="grid-column:1/-1;padding:32px">${ic('folderOpen', 36)}<div class="title">โฟลเดอร์ว่าง</div></div>`}</div>
        ${data.pages > 1 ? `<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;align-items:center">
          ${mediaPage > 1 ? `<button class="btn btn-ghost" id="mp-prev">${ic('chevronLeft', 16)} ก่อนหน้า</button>` : ''}
          <span style="padding:8px;font-size:13px;color:var(--ink-500)">หน้า ${data.page}/${data.pages}</span>
          ${mediaPage < data.pages ? `<button class="btn btn-ghost" id="mp-next">ถัดไป ${ic('chevronRight', 16)}</button>` : ''}
        </div>` : ''}
      </div>
    </div>`;

    $('#content').onclick = (e) => {
      const dir = e.target.closest('[data-dir]');
      if (dir) { mediaPath = dir.dataset.dir; mediaPage = 1; loadMedia(); return; }
      const path = e.target.closest('[data-path]');
      if (path && path.dataset.path !== undefined) { mediaPath = path.dataset.path; mediaPage = 1; loadMedia(); return; }
      // Toggle file selection
      const tile = e.target.closest('.media-item');
      if (tile) {
        const p = tile.dataset.path;
        if (mediaSelected.has(p)) { mediaSelected.delete(p); tile.classList.remove('selected'); }
        else { mediaSelected.add(p); tile.classList.add('selected'); }
        // Update count badges
        document.querySelectorAll('#btn-del-sel, #btn-move').forEach(b => {
          if (b.id === 'btn-del-sel') b.textContent = `${ic('trash', 16)} ลบที่เลือก (${mediaSelected.size})`;
        });
        const cnt = document.querySelector('.card-head.toolbar span');
        if (cnt) cnt.textContent = `${data.total} ไฟล์ · เลือก ${mediaSelected.size}`;
      }
    };
    $('#mp-prev')?.addEventListener('click', () => { mediaPage--; loadMedia(); });
    $('#mp-next')?.addEventListener('click', () => { mediaPage++; loadMedia(); });
    $('#media-q').oninput = debounce(async () => {
      const mq = $('#media-q').value;
      const d = await api(`/media?q=${encodeURIComponent(mq)}&path=${encodeURIComponent(mediaPath)}`);
      if (d) $('#media-grid').innerHTML = d.items.length ? d.items.map(m => mediaTile(m)).join('') : `<div class="empty" style="grid-column:1/-1;padding:24px"><div class="title">ไม่พบไฟล์</div></div>`;
    }, 300);
  }

  function mediaTile(m) {
    const isImg = m.type === 'image';
    const fileIcon = m.type === 'pdf' ? ic('fileText', 28) : ic('paperclip', 28);
    const sel = mediaSelected.has(m.path) ? ' selected' : '';
    return `<div class="media-item${sel}" data-url="${esc(m.url)}" data-path="${esc(m.path)}" title="${esc(m.name)}">
      ${isImg ? `<img src="${esc(m.url)}" loading="lazy" alt="">` : `<div class="file-icon">${fileIcon}</div>`}
      <div class="meta">${esc(m.name)}<br>${(m.size/1024).toFixed(0)} KB</div>
    </div>`;
  }

  function openMediaPicker(callback) {
    mediaPickerCb = callback;
    const panel = $('#modal-panel');
    panel.innerHTML = `<div class="modal-head"><strong>เลือกจากคลังสื่อ</strong><button class="btn btn-icon btn-ghost" data-close aria-label="ปิด">${ic('x', 18)}</button></div>
      <div class="modal-body" id="picker-body">${loading()}</div>
      <div class="modal-foot"><label class="btn btn-primary" style="cursor:pointer">${ic('upload', 16)} อัปโหลดใหม่<input type="file" id="picker-upload" hidden accept="image/*,.pdf"></label>
      <button class="btn btn-ghost" data-close>ยกเลิก</button></div>`;
    $('#modal').classList.remove('hidden');
    loadPicker('');
    panel.onclick = async (e) => {
      if (e.target.closest('[data-close]')) closeModal();
      const item = e.target.closest('.media-item');
      if (item && mediaPickerCb) { mediaPickerCb(item.dataset.url); closeModal(); }
      const dir = e.target.closest('[data-dir]');
      if (dir) loadPicker(dir.dataset.dir);
      const up = e.target.closest('#picker-upload')?.parentElement;
      if (e.target.id === 'picker-upload') {
        for (const f of e.target.files) {
          const fd = new FormData(); fd.append('file', f);
          try { await api('/media/upload', { method: 'POST', body: fd }); toast('อัปโหลด ' + f.name); }
          catch (err) { toast(err.message); }
        }
        loadPicker('');
      }
    };
  }

  async function loadPicker(path) {
    const data = await api('/media?path=' + encodeURIComponent(path) + '&per_page=60');
    if (!data) return;
    $('#picker-body').innerHTML = `
      <div class="media-dirs">${data.dirs.map(d => `<span class="media-dir" data-dir="${esc(d.path)}">${ic('folder', 16)} ${esc(d.name)}</span>`).join('')}</div>
      <div class="media-grid">${data.items.map(m => mediaTile(m)).join('')}</div>`;
  }

  function closeModal() { $('#modal').classList.add('hidden'); mediaPickerCb = null; }

  // ── Utils ────────────────────────────────────────────────────────────────

  function toLocalInput(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return ''; }
  }
  function fromLocalInput(v) {
    if (!v) return null;
    return new Date(v).toISOString();
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function notifyParentSave() {
    if (new URLSearchParams(location.search).get('embed') === '1') {
      window.parent.postMessage({ type: 'tsae-cms-saved' }, location.origin);
    }
  }

  window.__cms = { api, ic, esc, $, setTitle, setCrumb, setActions, loading, openMediaPicker, toast, debounce, initQuill, uploadImage, notifyParentSave, eventTypeOptions, EVENT_TYPES };

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

/* TSAE CMS — Campaign packs (posters / IAEC-style pages) */
(() => {
  const cms = () => window.__cms;
  if (!window.CMSCampaigns) window.CMSCampaigns = {};

  function emptyCampaign() {
    return {
      slug: '',
      enabled: true,
      sortOrder: 0,
      showOnHome: true,
      showInHero: false,
      createEvent: true,
      homeKind: 'conference',
      ctaTH: '', ctaEN: '',
      titleTH: '', titleEN: '',
      themeTH: '', themeEN: '',
      badgeTH: '', badgeEN: '',
      dateTH: '', dateEN: '',
      venueTH: '', venueEN: '',
      target: '', endDate: '',
      registerUrl: '', contactEmail: '',
      posterImage: '', posterPdf: '', posterHtmlUrl: '',
      excerptTH: '', excerptEN: '',
      descriptionTH: '', descriptionEN: '',
      facts: [],
      fees: [],
      extraLinks: [],
    };
  }

  function rowsToJson(selector, keys) {
    const { $ } = cms();
    return [...document.querySelectorAll(selector)].map((row) => {
      const obj = {};
      keys.forEach((k) => {
        const el = row.querySelector(`[data-k="${k}"]`);
        obj[k] = el ? el.value.trim() : '';
      });
      return obj;
    }).filter((o) => Object.values(o).some(Boolean));
  }

  function factRows(facts) {
    const list = (facts && facts.length) ? facts : [{ label: '', value: '' }];
    return list.map((f) => `
      <div class="camp-row" data-row="fact">
        <input data-k="label" placeholder="Label" value="${cms().esc(f.label || '')}">
        <input data-k="value" placeholder="Value" value="${cms().esc(f.value || '')}">
        <button type="button" class="btn btn-ghost" data-rm>ลบ</button>
      </div>`).join('');
  }

  function feeRows(fees) {
    const list = (fees && fees.length) ? fees : [{ who: '', usd: '', inr: '' }];
    return list.map((f) => `
      <div class="camp-row" data-row="fee">
        <input data-k="who" placeholder="Who" value="${cms().esc(f.who || '')}">
        <input data-k="usd" placeholder="USD" value="${cms().esc(f.usd || '')}">
        <input data-k="inr" placeholder="INR" value="${cms().esc(f.inr || '')}">
        <button type="button" class="btn btn-ghost" data-rm>ลบ</button>
      </div>`).join('');
  }

  function linkRows(links) {
    const list = (links && links.length) ? links : [{ label: '', href: '', style: 'primary' }];
    return list.map((l) => `
      <div class="camp-row" data-row="link">
        <input data-k="label" placeholder="Label" value="${cms().esc(l.label || '')}">
        <input data-k="href" placeholder="https://…" value="${cms().esc(l.href || '')}">
        <select data-k="style">
          <option value="primary"${(l.style || 'primary') === 'primary' ? ' selected' : ''}>primary</option>
          <option value="secondary"${l.style === 'secondary' ? ' selected' : ''}>secondary</option>
        </select>
        <button type="button" class="btn btn-ghost" data-rm>ลบ</button>
      </div>`).join('');
  }

  async function viewList() {
    const { api, ic, esc, $, setTitle, setCrumb, setActions, loading, toast } = cms();
    setTitle('แคมเปญ / โปสเตอร์', 'แพ็กโปสเตอร์ — หน้า /c/{slug}/ + กิจกรรม + การ์ดหน้าแรก');
    setCrumb([['#/', 'ภาพรวม'], ['#/campaigns', 'แคมเปญ']]);
    setActions(`<a class="btn btn-primary" href="#/campaigns/new">${ic('plus', 16)} แคมเปญใหม่</a>`);
    $('#content').innerHTML = loading();
    const data = await api('/campaigns');
    if (!data) return;

    if (!data.items.length) {
      $('#content').innerHTML = `<div class="card"><div class="card-body">
        <p style="color:var(--ink-500);margin-bottom:12px">ยังไม่มีแคมเปญ — สร้างแพ็กโปสเตอร์แบบ IAEC / Awards ได้ที่นี่</p>
        <a class="btn btn-primary" href="#/campaigns/new">${ic('plus', 16)} สร้างแคมเปญแรก</a>
      </div></div>`;
      return;
    }

    $('#content').innerHTML = `<div class="card"><div class="table-wrap"><table class="data">
      <thead><tr>
        <th>ลำดับ</th><th>ชื่อ</th><th>Slug</th><th>สถานะ</th><th>โชว์</th><th></th>
      </tr></thead>
      <tbody>${data.items.map((c) => `
        <tr>
          <td>${esc(c.sortOrder)}</td>
          <td>
            <strong>${esc(c.titleTH || c.titleEN)}</strong>
            ${c.themeEN ? `<div style="font-size:12px;color:var(--ink-500)">${esc(c.themeEN)}</div>` : ''}
          </td>
          <td><code>/c/${esc(c.slug)}/</code></td>
          <td>${c.enabled ? '<span style="color:#15803d;font-weight:600">เปิด</span>' : '<span style="color:#6b7280">ปิด</span>'}</td>
          <td style="font-size:12px">
            ${c.showOnHome ? 'หน้าแรก ' : ''}${c.showInHero ? 'Hero ' : ''}${c.createEvent ? 'Events' : ''}
          </td>
          <td style="text-align:right">
            <a class="btn btn-ghost" href="#/campaigns/edit/${esc(c.id)}">${ic('pencil', 14)} แก้ไข</a>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
  }

  async function viewEdit(id) {
    const {
      api, ic, esc, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish,
      openMediaPicker, toLocalInput, fromLocalInput,
    } = cms();
    const isNew = !id;
    setTitle(isNew ? 'แคมเปญใหม่' : 'แก้ไขแคมเปญ');
    setCrumb([['#/', 'ภาพรวม'], ['#/campaigns', 'แคมเปญ'], [isNew ? 'ใหม่' : 'แก้ไข']]);
    setActions(`
      <a class="btn btn-ghost" href="#/campaigns">${ic('arrowLeft', 16)} กลับ</a>
      <button class="btn btn-primary" id="save-camp">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="del-camp">${ic('trash2', 16)} ลบ</button>`}
    `);
    $('#content').innerHTML = loading();

    let item = isNew ? emptyCampaign() : await api('/campaigns/' + encodeURIComponent(id));
    if (!item) return;

    $('#content').innerHTML = `
      <div class="card"><div class="card-body form-grid">
        <div class="field"><label>Slug (URL) *</label><input id="c-slug" value="${esc(item.slug)}" placeholder="iaec2026"></div>
        <div class="field"><label>ลำดับ</label><input id="c-sort" type="number" value="${esc(item.sortOrder || 0)}"></div>
        <div class="field"><label>ชื่อ (TH) *</label><input id="c-titleTH" value="${esc(item.titleTH)}"></div>
        <div class="field"><label>ชื่อ (EN) *</label><input id="c-titleEN" value="${esc(item.titleEN)}"></div>
        <div class="field"><label>ธีม / หัวข้อ (TH)</label><input id="c-themeTH" value="${esc(item.themeTH)}"></div>
        <div class="field"><label>ธีม / หัวข้อ (EN)</label><input id="c-themeEN" value="${esc(item.themeEN)}"></div>
        <div class="field"><label>Badge (TH)</label><input id="c-badgeTH" value="${esc(item.badgeTH)}"></div>
        <div class="field"><label>Badge (EN)</label><input id="c-badgeEN" value="${esc(item.badgeEN)}"></div>
        <div class="field"><label>วันที่ (TH)</label><input id="c-dateTH" value="${esc(item.dateTH)}"></div>
        <div class="field"><label>วันที่ (EN)</label><input id="c-dateEN" value="${esc(item.dateEN)}"></div>
        <div class="field"><label>สถานที่ (TH)</label><input id="c-venueTH" value="${esc(item.venueTH)}"></div>
        <div class="field"><label>สถานที่ (EN)</label><input id="c-venueEN" value="${esc(item.venueEN)}"></div>
        <div class="field"><label>วันเริ่ม (countdown)</label><input id="c-target" type="datetime-local" value="${toLocalInput(item.target)}"></div>
        <div class="field"><label>วันสิ้นสุด</label><input id="c-end" type="datetime-local" value="${toLocalInput(item.endDate)}"></div>
        <div class="full field"><label>ลิงก์ลงทะเบียน / CTA หลัก</label><input id="c-reg" value="${esc(item.registerUrl)}" placeholder="https://…"></div>
        <div class="field"><label>อีเมลติดต่อ</label><input id="c-email" value="${esc(item.contactEmail)}"></div>
        <div class="checks">
          <span class="checks-label">การแสดงผล</span>
          <label><input type="checkbox" id="c-enabled"${item.enabled !== false ? ' checked' : ''}> เปิดใช้งาน</label>
          <label><input type="checkbox" id="c-home"${item.showOnHome !== false ? ' checked' : ''}> โชว์การ์ดหน้าแรก</label>
          <label><input type="checkbox" id="c-hero"${item.showInHero ? ' checked' : ''}> โชว์ Hero</label>
          <label><input type="checkbox" id="c-event"${item.createEvent !== false ? ' checked' : ''}> สร้างกิจกรรมใน /events/</label>
        </div>
        <div class="field"><label>ประเภทบนหน้าแรก</label>
          <select id="c-homeKind">
            <option value="conference"${(item.homeKind || 'conference') === 'conference' ? ' selected' : ''}>งานประชุม (การ์ดใหญ่)</option>
            <option value="call"${item.homeKind === 'call' ? ' selected' : ''}>ประกาศ / รางวัล (แถบสั้น)</option>
          </select>
        </div>
        <div class="field"><label>ปุ่ม CTA รอง (EN)</label><input id="c-ctaEN" value="${esc(item.ctaEN || '')}" placeholder="Nominate / Submit paper"></div>
        <div class="field"><label>ปุ่ม CTA รอง (TH)</label><input id="c-ctaTH" value="${esc(item.ctaTH || '')}" placeholder="เสนอชื่อ / ส่งบทความ"></div>

        <div class="full field"><label>รูปโปสเตอร์</label>
          <div class="input-row">
            <input id="c-img" value="${esc(item.posterImage || '')}">
            <button type="button" class="btn btn-ghost" id="pick-img">${ic('imagePlus', 16)} เลือก</button>
          </div>
          ${item.posterImage ? `<img class="img-preview" id="c-img-prev" src="${esc(item.posterImage)}">` : '<img class="img-preview hidden" id="c-img-prev" alt="">'}
        </div>
        <div class="full field"><label>ไฟล์ PDF</label>
          <div class="input-row">
            <input id="c-pdf" value="${esc(item.posterPdf || '')}">
            <button type="button" class="btn btn-ghost" id="pick-pdf">${ic('fileText', 16)} เลือก</button>
          </div>
        </div>
        <div class="full field"><label>โปสเตอร์ HTML interactive</label>
          <div class="input-row">
            <input id="c-html" value="${esc(item.posterHtmlUrl || '')}" placeholder="/c/slug/poster/ หรือ /iaec2026/poster/">
          </div>
          ${isNew ? '<p style="font-size:12px;color:var(--ink-500);margin-top:6px">บันทึกแคมเปญก่อน แล้วค่อยอัปโหลดไฟล์ .html หรือ .zip</p>' : `
            <div class="input-row" style="margin-top:8px">
              <input type="file" id="c-html-file" accept=".html,.htm,.zip">
              <button type="button" class="btn btn-ghost" id="upload-html">${ic('upload', 16)} อัปโหลด HTML/ZIP</button>
            </div>`}
        </div>

        <div class="full field"><label>คำโปรย (TH)</label><textarea id="c-excerptTH">${esc(item.excerptTH || '')}</textarea></div>
        <div class="full field"><label>คำโปรย (EN)</label><textarea id="c-excerptEN">${esc(item.excerptEN || '')}</textarea></div>
        <div class="full field"><label>คำอธิบายหน้า (EN)</label><textarea id="c-descEN">${esc(item.descriptionEN || '')}</textarea></div>
        <div class="full field"><label>คำอธิบายหน้า (TH)</label><textarea id="c-descTH">${esc(item.descriptionTH || '')}</textarea></div>

        <div class="full field">
          <label>Key facts</label>
          <div id="facts-box">${factRows(item.facts)}</div>
          <button type="button" class="btn btn-ghost" id="add-fact" style="margin-top:8px">${ic('plus', 14)} เพิ่ม fact</button>
        </div>
        <div class="full field">
          <label>Registration fees</label>
          <div id="fees-box">${feeRows(item.fees)}</div>
          <button type="button" class="btn btn-ghost" id="add-fee" style="margin-top:8px">${ic('plus', 14)} เพิ่ม fee</button>
        </div>
        <div class="full field">
          <label>ลิงก์เพิ่มเติม</label>
          <div id="links-box">${linkRows(item.extraLinks)}</div>
          <button type="button" class="btn btn-ghost" id="add-link" style="margin-top:8px">${ic('plus', 14)} เพิ่มลิงก์</button>
        </div>

        ${!isNew ? `<div class="full" style="padding:12px;border-radius:10px;background:var(--surface-2);font-size:13px">
          หน้ารายละเอียด: <a href="/c/${esc(item.slug)}/" target="_blank" rel="noopener">/c/${esc(item.slug)}/</a>
          · หลังบันทึกระบบอัปเดตเว็บให้อัตโนมัติ
        </div>` : ''}
      </div></div>
      <style>
        .camp-row{display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;margin-bottom:8px;align-items:center}
        .camp-row[data-row="fee"]{grid-template-columns:2fr 1fr 1fr auto}
        .camp-row[data-row="link"]{grid-template-columns:1fr 2fr 110px auto}
        @media(max-width:800px){.camp-row,.camp-row[data-row="fee"],.camp-row[data-row="link"]{grid-template-columns:1fr}}
      </style>`;

    const bindRm = (box) => {
      box.onclick = (e) => {
        const btn = e.target.closest('[data-rm]');
        if (!btn) return;
        const row = btn.closest('[data-row]');
        if (row && box.querySelectorAll('[data-row]').length > 1) row.remove();
      };
    };
    bindRm($('#facts-box'));
    bindRm($('#fees-box'));
    bindRm($('#links-box'));
    $('#add-fact').onclick = () => { $('#facts-box').insertAdjacentHTML('beforeend', factRows([{}])); };
    $('#add-fee').onclick = () => { $('#fees-box').insertAdjacentHTML('beforeend', feeRows([{}])); };
    $('#add-link').onclick = () => { $('#links-box').insertAdjacentHTML('beforeend', linkRows([{}])); };

    const setImg = (url) => {
      $('#c-img').value = url;
      const img = $('#c-img-prev');
      if (img) { img.src = url; img.classList.remove('hidden'); }
    };
    $('#pick-img').onclick = () => openMediaPicker(setImg);
    $('#pick-pdf').onclick = () => openMediaPicker((url) => { $('#c-pdf').value = url; });

    if (!isNew) {
      $('#upload-html').onclick = async () => {
        const file = $('#c-html-file').files?.[0];
        if (!file) return toast('เลือกไฟล์ .html หรือ .zip ก่อน');
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch('/admin/cms/api/campaigns/' + encodeURIComponent(id) + '/poster-html', {
            method: 'POST', credentials: 'same-origin', body: fd,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || res.statusText);
          }
          const data = await res.json();
          $('#c-html').value = data.url;
          toast('อัปโหลดโปสเตอร์ HTML แล้ว');
          await afterSavePublish('อัปโหลดแล้ว — กำลังอัปเดตหน้าเว็บ…');
        } catch (e) {
          toast('ผิดพลาด: ' + e.message);
        }
      };
    }

    $('#save-camp').onclick = async () => {
      const body = {
        slug: $('#c-slug').value.trim(),
        sortOrder: Number($('#c-sort').value || 0),
        titleTH: $('#c-titleTH').value.trim(),
        titleEN: $('#c-titleEN').value.trim(),
        themeTH: $('#c-themeTH').value.trim(),
        themeEN: $('#c-themeEN').value.trim(),
        badgeTH: $('#c-badgeTH').value.trim(),
        badgeEN: $('#c-badgeEN').value.trim(),
        dateTH: $('#c-dateTH').value.trim(),
        dateEN: $('#c-dateEN').value.trim(),
        venueTH: $('#c-venueTH').value.trim(),
        venueEN: $('#c-venueEN').value.trim(),
        target: fromLocalInput($('#c-target').value) || '',
        endDate: fromLocalInput($('#c-end').value) || null,
        registerUrl: $('#c-reg').value.trim(),
        contactEmail: $('#c-email').value.trim(),
        enabled: $('#c-enabled').checked,
        showOnHome: $('#c-home').checked,
        showInHero: $('#c-hero').checked,
        createEvent: $('#c-event').checked,
        homeKind: $('#c-homeKind')?.value || 'conference',
        ctaEN: $('#c-ctaEN')?.value.trim() || '',
        ctaTH: $('#c-ctaTH')?.value.trim() || '',
        posterImage: $('#c-img').value.trim(),
        posterPdf: $('#c-pdf').value.trim(),
        posterHtmlUrl: $('#c-html').value.trim(),
        excerptTH: $('#c-excerptTH').value.trim(),
        excerptEN: $('#c-excerptEN').value.trim(),
        descriptionTH: $('#c-descTH').value.trim(),
        descriptionEN: $('#c-descEN').value.trim(),
        facts: rowsToJson('#facts-box [data-row="fact"]', ['label', 'value']),
        fees: rowsToJson('#fees-box [data-row="fee"]', ['who', 'usd', 'inr']),
        extraLinks: rowsToJson('#links-box [data-row="link"]', ['label', 'href', 'style']),
      };
      if (!body.titleTH && !body.titleEN) return toast('กรุณาใส่ชื่อแคมเปญ');
      if (!body.slug && isNew) {
        body.slug = (body.titleEN || body.titleTH).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      }
      try {
        if (isNew) {
          const r = await api('/campaigns', { method: 'POST', body });
          location.hash = '#/campaigns/edit/' + r.id;
          await afterSavePublish('สร้างแคมเปญแล้ว — กำลังอัปเดตหน้าเว็บ…');
        } else {
          await api('/campaigns/' + encodeURIComponent(id), { method: 'PUT', body });
          await afterSavePublish('บันทึกแล้ว — กำลังอัปเดตหน้าเว็บ…');
        }
      } catch (e) {
        toast('ผิดพลาด: ' + e.message);
      }
    };

    if (!isNew) {
      $('#del-camp').onclick = async () => {
        if (!confirm('ลบแคมเปญนี้และยกเลิก sync หน้าแรก/กิจกรรม?')) return;
        try {
          await api('/campaigns/' + encodeURIComponent(id), { method: 'DELETE' });
          location.hash = '#/campaigns';
          await afterSavePublish('ลบแล้ว — กำลังอัปเดตหน้าเว็บ…');
        } catch (e) {
          toast('ผิดพลาด: ' + e.message);
        }
      };
    }
  }

  window.CMSCampaigns.route = async (action, id) => {
    if (action === 'new') return viewEdit(null);
    if (action === 'edit') return viewEdit(id);
    return viewList();
  };
})();

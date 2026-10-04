/* TSAE CMS — Homepage / Hero / Videos / Conference cards (real site content) */
(() => {
  const cms = () => window.__cms;
  if (!window.CMSHome) window.CMSHome = {};

  function emptyHero() {
    return {
      id: '',
      enabled: true,
      sortOrder: 0,
      fullImage: true,
      endsAt: '',
      badgeTH: '', badgeEN: '',
      titleTH: '', titleEN: '',
      titleAccentTH: '', titleAccentEN: '',
      themeTH: '', themeEN: '',
      dateTH: '', dateEN: '',
      locationTH: '', locationEN: '',
      tagTH: '', tagEN: '',
      image: '',
      href: '', href2: '',
      href2LabelTH: '', href2LabelEN: '',
      registerHref: '',
      bg: 'linear-gradient(125deg,#14532d 0%,#1a6b3a 50%,#15803d 100%)',
      overlay: 'linear-gradient(90deg, rgba(20,83,45,0.55) 0%, rgba(20,83,45,0.35) 50%, rgba(21,128,61,0.30) 100%)',
      glow: 'rgba(74,222,128,0.4)',
    };
  }

  function emptyConf() {
    return {
      enabled: true,
      kind: 'conference',
      sortOrder: 0,
      href: '',
      image: '',
      badgeTH: '', badgeEN: '',
      titleTH: '', titleEN: '',
      themeTH: '', themeEN: '',
      dateTH: '', dateEN: '',
      venueTH: '', venueEN: '',
      target: '', endDate: '',
      submitUrl: '',
      ctaTH: '', ctaEN: '',
      campaignId: '',
    };
  }

  function emptyVideo() {
    return {
      id: '',
      date: '',
      category: '',
      pick: false,
      titleTH: '', titleEN: '',
      summaryTH: '', summaryEN: '',
      metaTH: '', metaEN: '',
      href: '',
      web: '',
    };
  }

  function pastLabel(endsAt) {
    const st = cms().endsAtStatus?.(endsAt);
    if (!st) return '';
    if (st.kind === 'past') return '<span style="color:#92400e;font-size:12px;font-weight:600">หมดอายุ</span>';
    if (st.kind === 'future' || st.kind === 'soon') return '<span style="color:#15803d;font-size:12px">Active</span>';
    return '';
  }

  // ── Hero ───────────────────────────────────────────────────────────────

  async function viewHeroList() {
    const { api, ic, esc, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish, formatEndsDisplay } = cms();
    setTitle('Hero สไลด์', 'สไลด์หน้าแรก — ใส่ endsAt แล้วระบบจะ archive อัตโนมัติ');
    setCrumb([['#/', 'ภาพรวม'], ['#/hero', 'Hero สไลด์']]);
    setActions(`<a class="btn btn-primary" href="#/hero/new">${ic('plus', 16)} สไลด์ใหม่</a>`);
    $('#content').innerHTML = loading();
    const data = await api('/hero');
    if (!data) return;
    const items = data.items || [];
    if (!items.length) {
      $('#content').innerHTML = `<div class="empty">${ic('image', 40)}<div class="title">ยังไม่มีสไลด์</div>
        <a class="btn btn-primary" href="#/hero/new">${ic('plus', 16)} เพิ่มสไลด์</a></div>`;
      return;
    }
    $('#content').innerHTML = `<div class="tablecard"><div class="table-wrap"><table>
      <thead><tr><th>ลำดับ</th><th>ภาพ</th><th>ป้าย</th><th>สถานะ</th><th>หมดอายุ</th><th></th></tr></thead>
      <tbody>${items.map((s) => `<tr>
        <td>${esc(s.sortOrder ?? 0)}</td>
        <td>${s.image ? `<img src="${esc(s.image)}" alt="" style="width:64px;height:40px;object-fit:cover;border-radius:6px">` : '—'}</td>
        <td><strong>${esc(s.badgeTH || s.badgeEN || s.id)}</strong><br><span style="color:#6b7280;font-size:12px">${esc(s.badgeEN || '')}</span></td>
        <td>${s.enabled === false ? '<span style="color:#6b7280">ปิด</span>' : '<span style="color:#15803d;font-weight:600">เปิด</span>'} ${pastLabel(s.endsAt)}</td>
        <td style="font-size:12px;color:#6b7280">${esc(formatEndsDisplay(s.endsAt))}</td>
        <td><a class="btn btn-sm btn-ghost" href="#/hero/edit/${esc(s.id)}">${ic('pencil', 14)} แก้ไข</a></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }

  async function viewHeroEdit(id) {
    const { api, ic, esc, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish, openMediaPicker, openLinkPicker, toLocalInput, fromLocalInput, endsAtStatus } = cms();
    const isNew = !id;
    setTitle(isNew ? 'สไลด์ใหม่' : 'แก้ไขสไลด์', 'รูป · ชื่อ · ปลายทางเมื่อกด');
    setCrumb([['#/', 'ภาพรวม'], ['#/hero', 'Hero สไลด์'], [isNew ? 'ใหม่' : 'แก้ไข']]);
    setActions(`
      <a class="btn btn-ghost" href="#/hero">${ic('arrowLeft', 16)} กลับ</a>
      <button class="btn btn-primary" id="hero-save">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="hero-del">${ic('trash2', 16)} ลบ</button>`}
    `);
    $('#content').innerHTML = loading();
    let item = isNew ? emptyHero() : await api('/hero');
    if (!isNew) {
      const found = (item.items || []).find((x) => x.id === id);
      if (!found) {
        $('#content').innerHTML = `<div class="card card-body" style="color:var(--danger)">ไม่พบสไลด์</div>`;
        return;
      }
      item = { ...emptyHero(), ...found };
    }

    if (!isNew) setTitle('แก้ไขสไลด์', item.badgeTH || item.badgeEN || '');

    const sameLang = !item.badgeEN || item.badgeEN === item.badgeTH;
    const endsInfo = endsAtStatus(item.endsAt);
    const endsClass = endsInfo.kind === 'past' ? 'ends-status past' : endsInfo.kind === 'soon' ? 'ends-status soon' : 'ends-status';

    const thumbInner = item.image
      ? `<img src="${esc(item.image)}" alt="">`
      : `<span class="hero-thumb-empty">${ic('imagePlus', 28)}<br>เลือกรูปโปสเตอร์</span>`;

    $('#content').innerHTML = `
      <div class="card hero-edit hero-edit-simple">
        <div class="hero-edit-layout">
          <aside class="hero-edit-media">
            <p class="form-section-label">รูปโปสเตอร์</p>
            <button type="button" class="hero-pick" id="h-pick">
              <div class="hero-thumb" id="h-thumb">${thumbInner}</div>
              <span class="hero-pick-badge">${ic('imagePlus', 14)} เปลี่ยนรูป</span>
            </button>
            <input type="hidden" id="h-image" value="${esc(item.image || '')}">
          </aside>

          <div class="hero-edit-fields">
            <section class="form-section">
              <div class="field" style="margin:0">
                <label>ชื่อสไลด์ *</label>
                <input id="h-badge" value="${esc(item.badgeTH || item.badgeEN || '')}" placeholder="เช่น การประชุมใหญ่สามัญประจำปี 2569" autofocus>
              </div>
            </section>

            <section class="form-section">
              <div class="form-section-head">
                <label>เมื่อกดแล้วไปที่</label>
                <button type="button" class="btn btn-sm btn-primary" id="h-href-pick">${ic('link', 14)} เลือก</button>
              </div>
              <div class="link-target link-target-compact" id="h-href-box">
                <code class="link-target-label" id="h-href-label">${item.href ? esc(item.href) : '— ยังไม่ได้เลือก'}</code>
                <div class="link-target-actions">
                  ${item.href ? `<button type="button" class="btn btn-sm btn-ghost" id="h-href-clear">${ic('x', 14)} ล้าง</button>` : ''}
                  ${item.href ? `<a class="btn btn-sm btn-ghost" href="${esc(item.href)}" target="_blank" rel="noopener">${ic('externalLink', 14)} ทดสอบ</a>` : ''}
                </div>
              </div>
              <input type="hidden" id="h-href" value="${esc(item.href || '')}">
            </section>

            <section class="form-section form-section-settings">
              <p class="form-section-label">การแสดงผล</p>
              <div class="hero-settings-grid">
                <div class="field" style="margin:0">
                  <label>แสดงถึง <span class="label-muted">(ไม่บังคับ)</span></label>
                  <div class="input-row">
                    <input id="h-ends" type="datetime-local" value="${toLocalInput(item.endsAt)}" style="flex:1">
                    <button type="button" class="btn btn-ghost btn-sm" id="h-ends-clear" title="ล้าง">ล้าง</button>
                  </div>
                  <p class="${endsClass}" id="h-ends-status">${esc(endsInfo.label)}</p>
                </div>
                ${!isNew ? `
                <div class="checks hero-enabled-check">
                  <label><input type="checkbox" id="h-en"${item.enabled !== false ? ' checked' : ''}> แสดงบนหน้าแรก</label>
                </div>` : '<input type="hidden" id="h-en" checked>'}
              </div>
              <p class="help help-inline">ว่างวันหมดอายุ = แสดงตลอด · บันทึกแล้วรออัปเดตเว็บ ~1 นาที</p>
            </section>

            <details class="hero-more">
              <summary>ภาษาอังกฤษต่างจากไทย?</summary>
              <div class="hero-more-body">
                <div class="field" style="margin:0">
                  <label>ชื่อภาษาอังกฤษ</label>
                  <input id="h-badge-en" value="${esc(sameLang ? '' : (item.badgeEN || ''))}" placeholder="ว่าง = ใช้ชื่อด้านบน">
                </div>
              </div>
            </details>
          </div>
        </div>
        <div class="form-footer">
          <a class="btn btn-ghost" href="#/hero">ยกเลิก</a>
          <button type="button" class="btn btn-primary" id="hero-save-footer">${ic('save', 16)} บันทึก</button>
        </div>
      </div>`;

    const setThumb = (url) => {
      $('#h-image').value = url || '';
      $('#h-thumb').innerHTML = url
        ? `<img src="${esc(url)}" alt="">`
        : `<span class="hero-thumb-empty">${ic('imagePlus', 28)}<br>เลือกรูปโปสเตอร์</span>`;
    };

    $('#h-pick').onclick = () => openMediaPicker((url) => setThumb(url));

    const setHref = (href) => {
      $('#h-href').value = href || '';
      const label = $('#h-href-label');
      if (label) label.textContent = href || '— ยังไม่ได้เลือก';
      const actions = $('#h-href-box .link-target-actions');
      if (actions) {
        actions.innerHTML = `
          ${href ? `<button type="button" class="btn btn-sm btn-ghost" id="h-href-clear">${ic('x', 14)} ล้าง</button>` : ''}
          ${href ? `<a class="btn btn-sm btn-ghost" href="${esc(href)}" target="_blank" rel="noopener">${ic('externalLink', 14)} ทดสอบ</a>` : ''}`;
        const clr = $('#h-href-clear');
        if (clr) clr.onclick = () => setHref('');
      }
    };
    $('#h-href-pick').onclick = () => openLinkPicker(setHref, item.href || $('#h-href').value || '');

    const refreshEndsStatus = () => {
      const raw = fromLocalInput($('#h-ends').value);
      const st = endsAtStatus(raw || '');
      const el = $('#h-ends-status');
      if (!el) return;
      el.textContent = st.label;
      el.className = st.kind === 'past' ? 'ends-status past' : st.kind === 'soon' ? 'ends-status soon' : 'ends-status';
    };
    $('#h-ends').oninput = refreshEndsStatus;
    $('#h-ends-clear').onclick = () => { $('#h-ends').value = ''; refreshEndsStatus(); };

    const doSave = async () => {
      const image = $('#h-image').value.trim();
      const badge = $('#h-badge').value.trim();
      const badgeEN = ($('#h-badge-en')?.value || '').trim() || badge;
      if (!image) return toast('เลือกรูปก่อน');
      if (!badge) return toast('ใส่ชื่อสไลด์ก่อน');

      const enabledEl = $('#h-en');
      const enabled = enabledEl.type === 'checkbox' ? enabledEl.checked : true;

      const body = {
        ...item,
        id: item.id || undefined,
        enabled,
        fullImage: item.fullImage !== false ? true : item.fullImage,
        sortOrder: Number(item.sortOrder || 0),
        endsAt: fromLocalInput($('#h-ends').value) || '',
        image,
        badgeTH: badge,
        badgeEN,
        href: $('#h-href').value.trim(),
        bg: item.bg || emptyHero().bg,
        overlay: item.overlay || emptyHero().overlay,
        glow: item.glow || emptyHero().glow,
      };
      if (isNew) {
        body.fullImage = true;
        body.sortOrder = 0;
        delete body.id;
      }

      try {
        if (isNew) {
          const r = await api('/hero', { method: 'POST', body });
          location.hash = '#/hero/edit/' + r.id;
          await afterSavePublish('สร้างสไลด์แล้ว — กำลังอัปเดตหน้าเว็บ…');
        } else {
          await api('/hero/' + encodeURIComponent(id), { method: 'PUT', body });
          await afterSavePublish('บันทึกแล้ว — กำลังอัปเดตหน้าเว็บ…');
        }
      } catch (err) { toast(err.message); }
    };
    $('#hero-save').onclick = doSave;
    $('#hero-save-footer').onclick = doSave;

    const del = $('#hero-del');
    if (del) del.onclick = async () => {
      const ok = await cms().openConfirmDialog({
        title: 'ลบสไลด์',
        message: 'ลบสไลด์นี้ถาวร? จะหายจาก Hero หลังอัปเดตเว็บ',
        confirmLabel: 'ลบสไลด์',
        danger: true,
      });
      if (!ok) return;
      try {
        await api('/hero/' + encodeURIComponent(id), { method: 'DELETE' });
        location.hash = '#/hero';
        await afterSavePublish('ลบแล้ว — กำลังอัปเดตหน้าเว็บ…');
      } catch (err) { toast(err.message); }
    };
  }

  // ── Homepage copy ──────────────────────────────────────────────────────

  async function viewHomepage() {
    const { api, ic, esc, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish } = cms();
    setTitle('หน้าแรก', 'ข้อความ About / Journal / CTA บนหน้าแรก');
    setCrumb([['#/', 'ภาพรวม'], ['#/home', 'หน้าแรก']]);
    setActions(`
      <a class="btn btn-ghost" href="#/home/conferences">${ic('megaphone', 16)} การ์ดประชุม</a>
      <a class="btn btn-ghost" href="#/home/videos">${ic('image', 16)} วิดีโอ</a>
      <button class="btn btn-primary" id="home-save">${ic('save', 16)} บันทึก</button>
    `);
    $('#content').innerHTML = loading();
    const item = await api('/homepage');
    if (!item) return;

    const field = (id, label, val, multiline = false) => multiline
      ? `<div class="field full"><label>${label}</label><textarea id="${id}" rows="3">${esc(val || '')}</textarea></div>`
      : `<div class="field"><label>${label}</label><input id="${id}" value="${esc(val || '')}"></div>`;

    $('#content').innerHTML = `
      <div class="card"><div class="card-body form-grid">
        <div class="field full"><strong>ข่าวล่าสุด</strong></div>
        <div class="checks">
          <label><input type="checkbox" id="hn-en"${item.latestNewsEnabled !== false ? ' checked' : ''}> แสดงบล็อกข่าว</label>
        </div>
        ${field('hn-tth', 'หัวข้อ TH', item.latestNewsTitleTH)}
        ${field('hn-ten', 'หัวข้อ EN', item.latestNewsTitleEN)}
        ${field('hn-dth', 'คำอธิบาย TH', item.latestNewsDescTH)}
        ${field('hn-den', 'คำอธิบาย EN', item.latestNewsDescEN)}

        <div class="field full" style="margin-top:8px"><strong>About</strong></div>
        <div class="checks">
          <label><input type="checkbox" id="ha-en"${item.aboutEnabled !== false ? ' checked' : ''}> แสดงบล็อก About</label>
        </div>
        ${field('ha-bth', 'Badge TH', item.aboutBadgeTH)}
        ${field('ha-ben', 'Badge EN', item.aboutBadgeEN)}
        ${field('ha-tth', 'หัวข้อ TH', item.aboutTitleTH)}
        ${field('ha-ten', 'หัวข้อ EN', item.aboutTitleEN)}
        ${field('ha-d1th', 'ย่อหน้า 1 TH', item.aboutDesc1TH, true)}
        ${field('ha-d1en', 'ย่อหน้า 1 EN', item.aboutDesc1EN, true)}
        ${field('ha-d2th', 'ย่อหน้า 2 TH', item.aboutDesc2TH, true)}
        ${field('ha-d2en', 'ย่อหน้า 2 EN', item.aboutDesc2EN, true)}

        <div class="field full" style="margin-top:8px"><strong>วารสารฉบับปัจจุบัน</strong></div>
        <div class="checks">
          <label><input type="checkbox" id="hj-en"${item.journalEnabled !== false ? ' checked' : ''}> แสดงบล็อกวารสาร</label>
        </div>
        ${field('hj-vol', 'Volume', item.journalVolume)}
        ${field('hj-iss', 'Issue', item.journalIssue)}
        ${field('hj-year', 'Year', item.journalYear)}
        ${field('hj-url', 'URL ThaiJO', item.journalUrl)}

        <div class="field full" style="margin-top:8px"><strong>CTA สมัครสมาชิก</strong></div>
        <div class="checks">
          <label><input type="checkbox" id="hc-en"${item.ctaEnabled !== false ? ' checked' : ''}> แสดง CTA</label>
        </div>
        ${field('hc-tth', 'หัวข้อ TH', item.ctaTitleTH)}
        ${field('hc-ten', 'หัวข้อ EN', item.ctaTitleEN)}
        ${field('hc-dth', 'คำอธิบาย TH', item.ctaDescTH, true)}
        ${field('hc-den', 'คำอธิบาย EN', item.ctaDescEN, true)}
        ${field('hc-bth', 'ปุ่ม TH', item.ctaButtonTH)}
        ${field('hc-ben', 'ปุ่ม EN', item.ctaButtonEN)}
      </div></div>`;

    $('#home-save').onclick = async () => {
      const body = {
        latestNewsEnabled: $('#hn-en').checked,
        latestNewsTitleTH: $('#hn-tth').value.trim(),
        latestNewsTitleEN: $('#hn-ten').value.trim(),
        latestNewsDescTH: $('#hn-dth').value.trim(),
        latestNewsDescEN: $('#hn-den').value.trim(),
        aboutEnabled: $('#ha-en').checked,
        aboutBadgeTH: $('#ha-bth').value.trim(),
        aboutBadgeEN: $('#ha-ben').value.trim(),
        aboutTitleTH: $('#ha-tth').value.trim(),
        aboutTitleEN: $('#ha-ten').value.trim(),
        aboutDesc1TH: $('#ha-d1th').value.trim(),
        aboutDesc1EN: $('#ha-d1en').value.trim(),
        aboutDesc2TH: $('#ha-d2th').value.trim(),
        aboutDesc2EN: $('#ha-d2en').value.trim(),
        journalEnabled: $('#hj-en').checked,
        journalVolume: Number($('#hj-vol').value || 0),
        journalIssue: Number($('#hj-iss').value || 0),
        journalYear: Number($('#hj-year').value || 0),
        journalUrl: $('#hj-url').value.trim(),
        ctaEnabled: $('#hc-en').checked,
        ctaTitleTH: $('#hc-tth').value.trim(),
        ctaTitleEN: $('#hc-ten').value.trim(),
        ctaDescTH: $('#hc-dth').value.trim(),
        ctaDescEN: $('#hc-den').value.trim(),
        ctaButtonTH: $('#hc-bth').value.trim(),
        ctaButtonEN: $('#hc-ben').value.trim(),
      };
      try {
        await api('/homepage', { method: 'PUT', body });
        await afterSavePublish('บันทึกหน้าแรกแล้ว — กำลังอัปเดตหน้าเว็บ…');
      } catch (err) { toast(err.message); }
    };
  }

  // ── Home conferences ───────────────────────────────────────────────────

  function confCard(item, idx) {
    const { esc } = cms();
    const c = { ...emptyConf(), ...item };
    return `<div class="card" data-conf="${idx}" style="margin-bottom:12px">
      <div class="card-body form-grid">
        <div class="field"><label>ลำดับ</label><input data-k="sortOrder" type="number" value="${esc(c.sortOrder)}"></div>
        <div class="field"><label>ประเภท</label>
          <select data-k="kind">
            <option value="conference"${c.kind !== 'call' ? ' selected' : ''}>conference</option>
            <option value="call"${c.kind === 'call' ? ' selected' : ''}>call</option>
          </select>
        </div>
        <div class="checks">
          <label><input type="checkbox" data-k="enabled"${c.enabled !== false ? ' checked' : ''}> เปิดใช้งาน</label>
        </div>
        <div class="field"><label>Campaign ID</label><input data-k="campaignId" value="${esc(c.campaignId || '')}"></div>
        <div class="field"><label>ลิงก์</label><input data-k="href" value="${esc(c.href || '')}"></div>
        <div class="field"><label>Submit URL</label><input data-k="submitUrl" value="${esc(c.submitUrl || '')}"></div>
        <div class="field"><label>Title TH</label><input data-k="titleTH" value="${esc(c.titleTH || '')}"></div>
        <div class="field"><label>Title EN</label><input data-k="titleEN" value="${esc(c.titleEN || '')}"></div>
        <div class="field"><label>Badge TH</label><input data-k="badgeTH" value="${esc(c.badgeTH || '')}"></div>
        <div class="field"><label>Badge EN</label><input data-k="badgeEN" value="${esc(c.badgeEN || '')}"></div>
        <div class="field full"><label>Theme TH</label><input data-k="themeTH" value="${esc(c.themeTH || '')}"></div>
        <div class="field full"><label>Theme EN</label><input data-k="themeEN" value="${esc(c.themeEN || '')}"></div>
        <div class="field"><label>Date TH</label><input data-k="dateTH" value="${esc(c.dateTH || '')}"></div>
        <div class="field"><label>Date EN</label><input data-k="dateEN" value="${esc(c.dateEN || '')}"></div>
        <div class="field"><label>Venue TH</label><input data-k="venueTH" value="${esc(c.venueTH || '')}"></div>
        <div class="field"><label>Venue EN</label><input data-k="venueEN" value="${esc(c.venueEN || '')}"></div>
        <div class="field"><label>Target (countdown)</label><input data-k="target" value="${esc(c.target || '')}" placeholder="2026-09-07T09:00:00+08:00"></div>
        <div class="field"><label>End date (archive)</label><input data-k="endDate" value="${esc(c.endDate || '')}"></div>
        <div class="field"><label>CTA TH</label><input data-k="ctaTH" value="${esc(c.ctaTH || '')}"></div>
        <div class="field"><label>CTA EN</label><input data-k="ctaEN" value="${esc(c.ctaEN || '')}"></div>
        <div class="field full"><label>รูป</label><input data-k="image" value="${esc(c.image || '')}"></div>
        <div class="field full"><button type="button" class="btn btn-ghost" data-rm-conf style="color:var(--danger)">ลบการ์ดนี้</button></div>
      </div>
    </div>`;
  }

  async function viewConferences() {
    const { api, ic, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish } = cms();
    setTitle('การ์ดประชุมหน้าแรก', 'Flagship conferences / calls — ใช้ endDate เพื่อ archive');
    setCrumb([['#/', 'ภาพรวม'], ['#/home', 'หน้าแรก'], ['#/home/conferences', 'การ์ดประชุม']]);
    setActions(`
      <a class="btn btn-ghost" href="#/home">${ic('arrowLeft', 16)} ข้อความหน้าแรก</a>
      <button class="btn btn-ghost" id="conf-add">${ic('plus', 16)} เพิ่มการ์ด</button>
      <button class="btn btn-primary" id="conf-save">${ic('save', 16)} บันทึกทั้งหมด</button>
    `);
    $('#content').innerHTML = loading();
    const data = await api('/home-conferences');
    if (!data) return;
    let items = data.items || [];

    const render = () => {
      $('#content').innerHTML = `<div id="conf-list">${items.map((c, i) => confCard(c, i)).join('') || '<div class="empty">ยังไม่มีการ์ด</div>'}</div>`;
      $('#conf-list').onclick = (e) => {
        const rm = e.target.closest('[data-rm-conf]');
        if (!rm) return;
        const card = rm.closest('[data-conf]');
        items.splice(Number(card.dataset.conf), 1);
        render();
      };
    };
    render();

    $('#conf-add').onclick = () => {
      items.push({ ...emptyConf(), sortOrder: items.length });
      render();
    };
    $('#conf-save').onclick = async () => {
      const cards = [...document.querySelectorAll('[data-conf]')];
      const next = cards.map((card, i) => {
        const obj = { ...emptyConf() };
        card.querySelectorAll('[data-k]').forEach((el) => {
          const k = el.dataset.k;
          if (el.type === 'checkbox') obj[k] = el.checked;
          else if (k === 'sortOrder') obj[k] = Number(el.value || i);
          else obj[k] = el.value.trim();
        });
        return obj;
      });
      try {
        await api('/home-conferences', { method: 'PUT', body: { items: next } });
        items = next;
        await afterSavePublish('บันทึกการ์ดประชุมแล้ว — กำลังอัปเดตหน้าเว็บ…');
      } catch (err) { toast(err.message); }
    };
  }

  // ── Videos ─────────────────────────────────────────────────────────────

  function videoCard(item, idx) {
    const { esc } = cms();
    const v = { ...emptyVideo(), ...item };
    return `<div class="card" data-vid="${idx}" style="margin-bottom:12px">
      <div class="card-body form-grid">
        <div class="field"><label>YouTube ID</label><input data-k="id" value="${esc(v.id || '')}"></div>
        <div class="field"><label>วันที่</label><input data-k="date" value="${esc(v.date || '')}" placeholder="2026-05-22"></div>
        <div class="field"><label>หมวด</label><input data-k="category" value="${esc(v.category || '')}" placeholder="symposium / exhibition / training"></div>
        <div class="checks">
          <label><input type="checkbox" data-k="pick"${v.pick ? ' checked' : ''}> แนะนำ (pick)</label>
        </div>
        <div class="field"><label>Title TH</label><input data-k="titleTH" value="${esc(v.titleTH || '')}"></div>
        <div class="field"><label>Title EN</label><input data-k="titleEN" value="${esc(v.titleEN || '')}"></div>
        <div class="field full"><label>Summary TH</label><input data-k="summaryTH" value="${esc(v.summaryTH || '')}"></div>
        <div class="field full"><label>Summary EN</label><input data-k="summaryEN" value="${esc(v.summaryEN || '')}"></div>
        <div class="field"><label>Meta TH</label><input data-k="metaTH" value="${esc(v.metaTH || '')}"></div>
        <div class="field"><label>Meta EN</label><input data-k="metaEN" value="${esc(v.metaEN || '')}"></div>
        <div class="field"><label>ลิงก์ภายนอก</label><input data-k="href" value="${esc(v.href || '')}"></div>
        <div class="field"><label>บทความ / web</label><input data-k="web" value="${esc(v.web || '')}"></div>
        <div class="field full"><button type="button" class="btn btn-ghost" data-rm-vid style="color:var(--danger)">ลบวิดีโอ</button></div>
      </div>
    </div>`;
  }

  async function viewVideos() {
    const { api, ic, $, setTitle, setCrumb, setActions, loading, toast, afterSavePublish } = cms();
    setTitle('วิดีโอหน้าแรก', 'Watch & Learn — YouTube ID + ข้อความ');
    setCrumb([['#/', 'ภาพรวม'], ['#/home', 'หน้าแรก'], ['#/home/videos', 'วิดีโอ']]);
    setActions(`
      <a class="btn btn-ghost" href="#/home">${ic('arrowLeft', 16)} ข้อความหน้าแรก</a>
      <button class="btn btn-ghost" id="vid-add">${ic('plus', 16)} เพิ่มวิดีโอ</button>
      <button class="btn btn-primary" id="vid-save">${ic('save', 16)} บันทึกทั้งหมด</button>
    `);
    $('#content').innerHTML = loading();
    const data = await api('/home-videos');
    if (!data) return;
    let items = data.items || [];

    const render = () => {
      $('#content').innerHTML = `<div id="vid-list">${items.map((v, i) => videoCard(v, i)).join('') || '<div class="empty">ยังไม่มีวิดีโอ</div>'}</div>`;
      $('#vid-list').onclick = (e) => {
        const rm = e.target.closest('[data-rm-vid]');
        if (!rm) return;
        const card = rm.closest('[data-vid]');
        items.splice(Number(card.dataset.vid), 1);
        render();
      };
    };
    render();

    $('#vid-add').onclick = () => {
      items.unshift({ ...emptyVideo() });
      render();
    };
    $('#vid-save').onclick = async () => {
      const cards = [...document.querySelectorAll('[data-vid]')];
      const next = cards.map((card) => {
        const obj = { ...emptyVideo() };
        card.querySelectorAll('[data-k]').forEach((el) => {
          const k = el.dataset.k;
          if (el.type === 'checkbox') obj[k] = el.checked;
          else obj[k] = el.value.trim();
        });
        return obj;
      }).filter((v) => v.id || v.href);
      try {
        await api('/home-videos', { method: 'PUT', body: { items: next } });
        items = next;
        await afterSavePublish('บันทึกวิดีโอแล้ว — กำลังอัปเดตหน้าเว็บ…');
      } catch (err) { toast(err.message); }
    };
  }

  window.CMSHome.route = async (action, id) => {
    if (action === 'conferences') return viewConferences();
    if (action === 'videos') return viewVideos();
    return viewHomepage();
  };
  window.CMSHome.routeHero = async (action, id) => {
    if (action === 'edit' || action === 'new') return viewHeroEdit(action === 'new' ? null : id);
    return viewHeroList();
  };
})();

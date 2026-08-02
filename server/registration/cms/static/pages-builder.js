/* Static page builder — block editor with live preview + inline media */
(() => {
  const cms = () => window.__cms;
  const ic = (n, s, c) => cms().ic(n, s, c);
  const esc = (s) => cms().esc(s);

  const BLOCK_TYPES = [
    { type: 'richtext', label: 'ข้อความ', icon: 'fileText' },
    { type: 'heading', label: 'หัวข้อ', icon: 'fileText' },
    { type: 'image', label: 'รูปภาพ', icon: 'image' },
    { type: 'gallery', label: 'แกลเลอรี่', icon: 'image' },
    { type: 'cta', label: 'ปุ่มลิงก์', icon: 'externalLink' },
    { type: 'file', label: 'ไฟล์ดาวน์โหลด', icon: 'file' },
    { type: 'alert', label: 'กล่องแจ้ง', icon: 'info' },
    { type: 'hero', label: 'Hero Banner', icon: 'image' },
    { type: 'html', label: 'HTML', icon: 'fileText' },
    { type: 'spacer', label: 'ช่องว่าง', icon: 'layoutDashboard' },
  ];

  let activeQuill = null;
  let activeQuillIdx = null;
  let pageData = null;

  function defaultBlock(type) {
    switch (type) {
      case 'heading': return { type, text: '', level: 2 };
      case 'image': return { type, src: '', alt: '', caption: '', width: 'full' };
      case 'gallery': return { type, images: [{ src: '', alt: '' }] };
      case 'cta': return { type, label: 'ดูรายละเอียด', href: '/', style: 'primary' };
      case 'file': return { type, label: 'ดาวน์โหลด', href: '', icon: 'pdf' };
      case 'alert': return { type, text: '', variant: 'info' };
      case 'hero': return { type, title: '', subtitle: '', image: '', href: '' };
      case 'html': return { type, html: '' };
      case 'spacer': return { type, size: 'md' };
      default: return { type: 'richtext', html: '' };
    }
  }

  function destroyQuill() {
    if (activeQuill) {
      activeQuill = null;
      activeQuillIdx = null;
    }
  }

  function imageRow(src, pickId) {
    return `<div class="input-row">
      <input data-bf="src" value="${esc(src || '')}" placeholder="/wp-uploads/... หรือ /images/...">
      <button type="button" class="btn btn-ghost btn-sm" data-pick="${pickId}">${ic('imagePlus', 14)} เลือก</button>
    </div>`;
  }

  function readBlockFromCard(card, block, idx) {
    if (!card) return block;
    const b = { ...block, type: block.type };
    card.querySelectorAll('[data-bf]').forEach(el => {
      const key = el.dataset.bf;
      b[key] = el.type === 'checkbox' ? el.checked : (key === 'level' ? +el.value : el.value);
    });
    if (block.type === 'richtext' && activeQuillIdx === idx && activeQuill) {
      b.html = activeQuill.root.innerHTML;
    }
    if (block.type === 'gallery') {
      b.images = [];
      card.querySelectorAll('.gallery-row').forEach(row => {
        b.images.push({
          src: row.querySelector('[data-bf="src"]')?.value || '',
          alt: row.querySelector('[data-bf="alt"]')?.value || '',
        });
      });
    }
    return b;
  }

  function readBlocksFromDom(blocks) {
    const root = cms().$('#blocks-root');
    if (!root) return blocks;
    return blocks.map((block, idx) => readBlockFromCard(root.querySelector(`[data-idx="${idx}"]`), block, idx));
  }

  function blockEditorHtml(block, idx) {
    const t = block.type;
    const head = `<div class="block-head">
      <span class="block-type">${BLOCK_TYPES.find(b => b.type === t)?.label || t}</span>
      <div class="block-actions">
        <button type="button" class="btn btn-icon btn-ghost btn-sm" data-move="${idx}" data-dir="up" title="เลื่อนขึ้น">${ic('chevronUp', 14)}</button>
        <button type="button" class="btn btn-icon btn-ghost btn-sm" data-move="${idx}" data-dir="down" title="เลื่อนลง">${ic('chevronDown', 14)}</button>
        <button type="button" class="btn btn-icon btn-ghost btn-sm" data-del="${idx}" title="ลบ">${ic('trash2', 14)}</button>
      </div>
    </div>`;

    if (t === 'heading') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>ข้อความ</label><input data-bf="text" value="${esc(block.text)}"></div>
        <div class="field"><label>ระดับ</label><select data-bf="level"><option value="2"${block.level===2?' selected':''}>H2</option><option value="3"${block.level===3?' selected':''}>H3</option><option value="4"${block.level===4?' selected':''}>H4</option></select></div>
      </div>`;
    }
    if (t === 'image') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>รูป</label>${imageRow(block.src, `img-${idx}`)}
        ${block.src ? `<img class="img-preview" src="${esc(block.src)}" style="max-height:100px">` : ''}</div>
        <div class="field"><label>คำอธิบาย (alt)</label><input data-bf="alt" value="${esc(block.alt || '')}"></div>
        <div class="field"><label>คำบรรยาย</label><input data-bf="caption" value="${esc(block.caption || '')}"></div>
        <div class="field"><label>ขนาด</label><select data-bf="width"><option value="full"${block.width!=='medium'?' selected':''}>เต็มความกว้าง</option><option value="medium"${block.width==='medium'?' selected':''}>กลาง</option></select></div>
      </div>`;
    }
    if (t === 'gallery') {
      const imgs = (block.images || []).map((im, j) => `
        <div class="gallery-row" data-gi="${j}">
          ${imageRow(im.src, `gal-${idx}-${j}`)}
          <input data-bf="alt" value="${esc(im.alt || '')}" placeholder="alt" style="margin-top:6px;width:100%">
          <button type="button" class="btn btn-sm btn-ghost" data-rmgal="${idx}" data-gj="${j}">${ic('trash2', 12)}</button>
        </div>`).join('');
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>รูปในแกลเลอรี่</label><div class="gallery-list">${imgs || '<p class="row-sub">ยังไม่มีรูป</p>'}</div>
        <button type="button" class="btn btn-sm btn-ghost" data-addgal="${idx}">${ic('plus', 14)} เพิ่มรูป</button></div>
      </div>`;
    }
    if (t === 'cta') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>ข้อความปุ่ม</label><input data-bf="label" value="${esc(block.label || '')}"></div>
        <div class="field"><label>ลิงก์</label><input data-bf="href" value="${esc(block.href || '')}"></div>
        <div class="field"><label>สไตล์</label><select data-bf="style"><option value="primary"${block.style!=='secondary'?' selected':''}>Primary (เขียว)</option><option value="secondary"${block.style==='secondary'?' selected':''}>Secondary (ทอง)</option></select></div>
      </div>`;
    }
    if (t === 'file') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>ชื่อลิงก์</label><input data-bf="label" value="${esc(block.label || '')}"></div>
        <div class="field"><label>ไฟล์</label>${imageRow(block.href, `file-${idx}`)}</div>
      </div>`;
    }
    if (t === 'alert') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>ข้อความ</label><textarea data-bf="text" rows="3">${esc(block.text || '')}</textarea></div>
        <div class="field"><label>ประเภท</label><select data-bf="variant"><option value="info"${block.variant!=='warn'?' selected':''}>ข้อมูล</option><option value="warn"${block.variant==='warn'?' selected':''}>คำเตือน</option></select></div>
      </div>`;
    }
    if (t === 'hero') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>หัวข้อ</label><input data-bf="title" value="${esc(block.title || '')}"></div>
        <div class="field"><label>คำบรรยาย</label><input data-bf="subtitle" value="${esc(block.subtitle || '')}"></div>
        <div class="full field"><label>รูป (ถ้ามี)</label>${imageRow(block.image, `hero-${idx}`)}</div>
        <div class="full field"><label>ลิงก์เมื่อคลิก</label><input data-bf="href" value="${esc(block.href || '')}"></div>
      </div>`;
    }
    if (t === 'html') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>HTML</label><textarea data-bf="html" rows="6" style="font-family:monospace;font-size:12px">${esc(block.html || '')}</textarea></div>
      </div>`;
    }
    if (t === 'spacer') {
      return `<div class="block-card" data-idx="${idx}">${head}
        <div class="field"><label>ขนาด</label><select data-bf="size"><option value="sm"${block.size==='sm'?' selected':''}>เล็ก</option><option value="md"${!block.size||block.size==='md'?' selected':''}>กลาง</option><option value="lg"${block.size==='lg'?' selected':''}>ใหญ่</option></select></div>
      </div>`;
    }
    // richtext
    const expanded = activeQuillIdx === idx;
    return `<div class="block-card" data-idx="${idx}">${head}
      <div class="field">
        <label>เนื้อหา ${expanded ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-expand="${idx}">${ic('pencil', 14)} แก้ไข</button>`}</label>
        ${expanded
          ? `<div class="editor-wrap"><div id="block-editor-${idx}"></div></div>`
          : `<div class="block-preview">${block.html || '<span class="row-sub">ว่าง</span>'}</div>`}
      </div>
    </div>`;
  }

  function renderBlocks(blocks) {
    const root = cms().$('#blocks-root');
    if (!root) return;
    root.innerHTML = blocks.map((b, i) => blockEditorHtml(b, i)).join('');
    if (activeQuillIdx !== null && blocks[activeQuillIdx]?.type === 'richtext') {
      const el = cms().$(`#block-editor-${activeQuillIdx}`);
      if (el) {
        activeQuill = new Quill(el, {
          theme: 'snow',
          modules: {
            toolbar: {
              container: [
                [{ header: [2, 3, false] }],
                ['bold', 'italic', 'underline', 'link', 'image'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['clean'],
              ],
              handlers: {
                image: () => cms().openMediaPicker((url) => {
                  const r = activeQuill.getSelection(true);
                  activeQuill.insertEmbed(r.index, 'image', url);
                  activeQuill.setSelection(r.index + 1);
                  renderPreview(blocks);
                }),
              },
            },
            clipboard: {
              matchers: [[Node.ELEMENT_NODE, (node, delta) => {
                if (node.tagName === 'IMG' && node.src?.startsWith('data:')) {
                  cms().uploadImage(node.src).then(url => {
                    if (url) {
                      const r = activeQuill.getSelection(true) || { index: activeQuill.getLength() };
                      activeQuill.insertEmbed(r.index, 'image', url);
                      activeQuill.setSelection(r.index + 1);
                      renderPreview(blocks);
                    }
                  });
                }
                return delta;
              }]],
            },
          },
        });
        activeQuill.root.innerHTML = blocks[activeQuillIdx].html || '';
        activeQuill.root.addEventListener('drop', async (e) => {
          const files = e.dataTransfer?.files;
          if (!files?.length) return;
          e.preventDefault();
          for (const f of files) {
            if (!f.type.startsWith('image/')) continue;
            const url = await cms().uploadImage(f);
            if (url) {
              const r = activeQuill.getSelection(true) || { index: activeQuill.getLength() };
              activeQuill.insertEmbed(r.index, 'image', url);
              activeQuill.setSelection(r.index + 1);
              renderPreview(blocks);
            }
          }
        });
        activeQuill.root.addEventListener('paste', async (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const it of items) {
            if (it.type.startsWith('image/')) {
              const f = it.getAsFile();
              if (!f) continue;
              const url = await cms().uploadImage(f);
              if (url) {
                const r = activeQuill.getSelection(true) || { index: activeQuill.getLength() };
                activeQuill.insertEmbed(r.index, 'image', url);
                activeQuill.setSelection(r.index + 1);
                renderPreview(blocks);
              }
            }
          }
        });
        activeQuill.on('text-change', () => renderPreview(blocks));
      }
    }
    renderPreview(blocks);
  }

  // ── Live preview ──

  function renderPreview(blocks) {
    const root = cms().$('#preview-root');
    if (!root) return;
    const hero = pageData?.heroTitle || pageData?.title || '';
    const heroSub = pageData?.heroSubtitle || pageData?.description || '';
    let html = '';
    if (hero) {
      html += `<div class="preview-hero"><h2>${esc(hero)}</h2>${heroSub ? `<p>${esc(heroSub)}</p>` : ''}</div>`;
    }
    for (const b of blocks) {
      html += renderBlockPreview(b);
    }
    root.innerHTML = html;
  }

  function renderBlockPreview(b) {
    const t = b.type;
    if (t === 'richtext') return `<div class="preview-block">${b.html || ''}</div>`;
    if (t === 'heading') {
      const lvl = b.level || 2;
      return `<div class="preview-block"><h${lvl}>${esc(b.text || '')}</h${lvl}></div>`;
    }
    if (t === 'image') {
      return b.src ? `<div class="preview-block">${b.caption ? `<figure><img src="${esc(b.src)}" alt="${esc(b.alt || '')}"><figcaption>${esc(b.caption)}</figcaption></figure>` : `<img src="${esc(b.src)}" alt="${esc(b.alt || '')}">`}</div>` : '';
    }
    if (t === 'gallery') {
      const imgs = (b.images || []).filter(i => i.src);
      if (!imgs.length) return '';
      return `<div class="preview-block" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
        ${imgs.map(i => `<img src="${esc(i.src)}" alt="${esc(i.alt || '')}" style="width:100%;border-radius:8px">`).join('')}
      </div>`;
    }
    if (t === 'cta') {
      return `<div class="preview-block"><a class="preview-cta ${b.style || 'primary'}">${esc(b.label || '')}</a></div>`;
    }
    if (t === 'file') {
      return `<div class="preview-block"><a class="btn btn-ghost">${ic('fileText', 16)} ${esc(b.label || 'ดาวน์โหลด')}</a></div>`;
    }
    if (t === 'alert') {
      return `<div class="preview-alert ${b.variant || 'info'}">${esc(b.text || '')}</div>`;
    }
    if (t === 'hero') {
      return `<div class="preview-hero"><h2>${esc(b.title || '')}</h2>${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.href ? `<p><a class="preview-cta">ดูเพิ่มเติม</a></p>` : ''}</div>`;
    }
    if (t === 'html') return `<div class="preview-block">${b.html || ''}</div>`;
    if (t === 'spacer') return `<div style="height:${b.size==='sm'?'16px':b.size==='lg'?'48px':'32px'}"></div>`;
    return '';
  }

  // ── List view ──

  async function viewPagesList() {
    cms().setTitle('หน้าเว็บ', 'สร้างและแก้ไขหน้าด้วย Page Builder — /p/...');
    cms().setCrumb([['#/', 'ภาพรวม'], ['#/pages', 'หน้าเว็บ']]);
    cms().setActions(`<a class="btn btn-primary" href="#/pages/new">${ic('plus', 16)} หน้าใหม่</a>`);
    cms().$('#content').innerHTML = cms().loading();
    const data = await cms().api('/pages');
    if (!data) return;

    if (!data.items.length) {
      cms().$('#content').innerHTML = `<div class="empty">${ic('panelsTopLeft', 40)}<div class="title">ยังไม่มีหน้าเว็บ</div><div class="desc">สร้างหน้าแรกด้วย page builder</div>
        <a class="btn btn-primary" href="#/pages/new">${ic('plus', 16)} สร้างหน้า</a></div>`;
      return;
    }

    cms().$('#content').innerHTML = `<div class="tablecard"><div class="table-wrap"><table>
      <thead><tr><th>หน้า</th><th>ภาษา</th><th>URL</th><th>บล็อก</th><th>สถานะ</th><th>อัปเดต</th><th></th></tr></thead>
      <tbody>${data.items.map(p => `<tr>
        <td><div class="row-title">${esc(p.title)}</div><div class="row-sub">${esc(p.id)}</div></td>
        <td>${p.lang === 'th' ? 'ไทย' : 'EN'}</td>
        <td><code style="font-size:12px">/${p.lang === 'th' ? 'th/' : ''}p/${esc(p.slug)}</code></td>
        <td>${(p.blocks || []).length}</td>
        <td>${p.published === false ? '<span class="badge badge-draft">ฉบับร่าง</span>' : '<span class="badge badge-published">เผยแพร่</span>'}</td>
        <td style="font-size:12px;color:var(--ink-500)">${esc((p.updatedAt || '').slice(0, 16).replace('T', ' '))}</td>
        <td><a class="btn btn-sm btn-ghost" href="#/pages/edit/${esc(p.id)}">${ic('pencil', 14)} แก้ไข</a></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="table-foot">ทั้งหมด ${data.items.length} หน้า</div></div>`;
  }

  async function viewPageEdit(id) {
    const isNew = !id;
    cms().setTitle(isNew ? 'หน้าเว็บใหม่' : 'แก้ไขหน้าเว็บ');
    cms().setCrumb([['#/', 'ภาพรวม'], ['#/pages', 'หน้าเว็บ'], [isNew ? 'เพิ่ม' : 'แก้ไข']]);
    destroyQuill();

    let item = isNew
      ? { slug: '', lang: 'th', title: '', description: '', heroTitle: '', heroSubtitle: '',
          enabled: true, published: true, author: 'admin', blocks: [],
          sitePath: new URLSearchParams(location.search).get('path') || '' }
      : await cms().api('/pages/' + encodeURIComponent(id));
    if (!item) return;

    let blocks = [...(item.blocks || [])];
    pageData = { ...item };

    cms().setActions(`
      <a class="btn btn-ghost" href="#/pages">${ic('arrowLeft', 16)} กลับ</a>
      <button class="btn btn-primary" id="save-page">${ic('save', 16)} บันทึก</button>
      ${isNew ? '' : `<button class="btn btn-danger" id="del-page">${ic('trash2', 16)} ลบ</button>`}
    `);

    function paintEditor() {
      cms().$('#content').innerHTML = `
        <div class="card" style="margin-bottom:16px"><div class="card-body form-grid">
          <div class="field"><label>ชื่อหน้า *</label><input id="p-title" value="${esc(item.title)}"></div>
          <div class="field"><label>Slug (URL) *</label><input id="p-slug" value="${esc(item.slug)}" placeholder="about-extra"></div>
          <div class="field"><label>ภาษา</label><select id="p-lang"><option value="th"${item.lang==='th'?' selected':''}>ไทย (/th/p/...)</option><option value="en"${item.lang==='en'?' selected':''}>English (/p/...)</option></select></div>
          <div class="field"><label>ผู้เขียน</label><input id="p-author" value="${esc(item.author || 'admin')}"></div>
          <div class="full field"><label>คำอธิบาย (SEO meta description)</label><input id="p-desc" value="${esc(item.description || '')}" placeholder="คำอธิบายสั้นๆ สำหรับ SEO"></div>
          <div class="field"><label>Hero หัวข้อ</label><input id="p-hero-t" value="${esc(item.heroTitle || item.title || '')}"></div>
          <div class="field"><label>Hero คำบรรยาย</label><input id="p-hero-s" value="${esc(item.heroSubtitle || '')}"></div>
          <div class="full field field-check" style="flex-direction:column;align-items:flex-start;gap:8px">
            <label><input type="checkbox" id="p-pub"${item.published !== false ? ' checked' : ''}> เผยแพร่ (ถ้าไม่เลือก = ฉบับร่าง draft)</label>
            <label><input type="checkbox" id="p-en"${item.enabled !== false ? ' checked' : ''}> เปิดใช้งานหน้านี้</label>
          </div>
        </div></div>
        <div class="editor-layout">
          <div class="editor-col">
            <div class="card">
              <div class="card-head">
                <strong>บล็อกเนื้อหา</strong>
                <div class="toolbar" style="justify-content:flex-end">
                  ${BLOCK_TYPES.map(bt => `<button type="button" class="btn btn-sm btn-ghost" data-add="${bt.type}">${ic(bt.icon, 14)} ${bt.label}</button>`).join('')}
                </div>
              </div>
              <div class="card-body" id="blocks-root"></div>
            </div>
          </div>
          <div class="preview-col">
            <div class="card" style="margin-bottom:8px"><div class="card-head"><strong>Live Preview</strong></div></div>
            <div class="preview-pane" id="preview-root"></div>
          </div>
        </div>`;

      renderBlocks(blocks);
      bindBlockEvents();
      bindMetaInputs();
    }

    function bindMetaInputs() {
      ['p-title', 'p-hero-t', 'p-hero-s', 'p-desc'].forEach(id => {
        cms().$('#' + id).addEventListener('input', () => {
          pageData = {
            ...pageData,
            title: cms().$('#p-title').value,
            heroTitle: cms().$('#p-hero-t').value,
            heroSubtitle: cms().$('#p-hero-s').value,
            description: cms().$('#p-desc').value,
          };
          renderPreview(blocks);
        });
      });
    }

    function bindBlockEvents() {
      const root = cms().$('#blocks-root');
      if (!root) return;

      root.onclick = (e) => {
        blocks = readBlocksFromDom(blocks);
        const add = e.target.closest('[data-add]');
        if (add) {
          destroyQuill();
          blocks.push(defaultBlock(add.dataset.add));
          activeQuillIdx = null;
          renderBlocks(blocks);
          bindBlockEvents();
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) {
          destroyQuill();
          blocks.splice(+del.dataset.del, 1);
          activeQuillIdx = null;
          renderBlocks(blocks);
          bindBlockEvents();
          return;
        }
        const move = e.target.closest('[data-move]');
        if (move) {
          const i = +move.dataset.move;
          const dir = move.dataset.dir === 'up' ? -1 : 1;
          if (i + dir < 0 || i + dir >= blocks.length) return;
          destroyQuill();
          [blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]];
          activeQuillIdx = null;
          renderBlocks(blocks);
          bindBlockEvents();
          return;
        }
        const expand = e.target.closest('[data-expand]');
        if (expand) {
          destroyQuill();
          activeQuillIdx = +expand.dataset.expand;
          renderBlocks(blocks);
          bindBlockEvents();
          return;
        }
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          cms().openMediaPicker((url) => {
            const card = pick.closest('.block-card');
            const inp = pick.parentElement?.querySelector('input') || card?.querySelector('.input-row input');
            if (inp) {
              inp.value = url;
              inp.dispatchEvent(new Event('input'));
              let prev = inp.closest('.field')?.querySelector('.img-preview');
              if (!prev && card) {
                prev = document.createElement('img');
                prev.className = 'img-preview';
                prev.style.maxHeight = '100px';
                inp.closest('.field')?.appendChild(prev);
              }
              if (prev) { prev.src = url; prev.classList.remove('hidden'); }
              blocks = readBlocksFromDom(blocks);
              renderPreview(blocks);
            }
          });
          return;
        }
        const addGal = e.target.closest('[data-addgal]');
        if (addGal) {
          const i = +addGal.dataset.addgal;
          blocks[i].images = blocks[i].images || [];
          blocks[i].images.push({ src: '', alt: '' });
          renderBlocks(blocks);
          bindBlockEvents();
        }
        const rmGal = e.target.closest('[data-rmgal]');
        if (rmGal) {
          const i = +rmGal.dataset.rmgal;
          const j = +rmGal.dataset.gj;
          blocks[i].images.splice(j, 1);
          renderBlocks(blocks);
          bindBlockEvents();
        }
      };

      root.oninput = () => {
        blocks = readBlocksFromDom(blocks);
        renderPreview(blocks);
      };
    }

    paintEditor();

    cms().$('#save-page').onclick = async () => {
      blocks = readBlocksFromDom(blocks);
      destroyQuill();
      const body = {
        slug: cms().$('#p-slug').value.trim(),
        lang: cms().$('#p-lang').value,
        title: cms().$('#p-title').value.trim(),
        description: cms().$('#p-desc').value,
        heroTitle: cms().$('#p-hero-t').value,
        heroSubtitle: cms().$('#p-hero-s').value,
        author: cms().$('#p-author').value || 'admin',
        enabled: cms().$('#p-en').checked,
        published: cms().$('#p-pub').checked,
        blocks,
      };
      if (!body.slug || !body.title) return cms().toast('กรุณาใส่ slug และชื่อหน้า');
      try {
        if (isNew) {
          body.id = `${body.slug}-${body.lang}`;
          const r = await cms().api('/pages', { method: 'POST', body });
          location.hash = '#/pages/edit/' + r.id;
          cms().toast('สร้างหน้าแล้ว');
          cms().notifyParentSave?.();
        } else {
          await cms().api('/pages/' + encodeURIComponent(id), { method: 'PUT', body });
          cms().toast('บันทึกแล้ว — รัน ./deploy.sh web');
          cms().notifyParentSave?.();
        }
      } catch (e) { cms().toast('ผิดพลาด: ' + e.message); }
    };

    if (!isNew) cms().$('#del-page').onclick = async () => {
      if (!confirm('ลบหน้านี้?')) return;
      await cms().api('/pages/' + encodeURIComponent(id), { method: 'DELETE' });
      location.hash = '#/pages';
    };
  }

  window.CMSPages = {
    async route(action, id) {
      if (action === 'edit') return viewPageEdit(id);
      if (action === 'new') return viewPageEdit(null);
      return viewPagesList();
    },
  };
})();

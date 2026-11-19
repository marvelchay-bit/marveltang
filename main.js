import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uxawnkddduhhvjhrvijn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_V8JViisHhHsXnTbx3bbtMw_nknLtOEZ';
const ADMIN_EMAIL = 'marveltang71@gmail.com';
const STORAGE_BUCKET = 'portfolio-assets';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getCurrentPageKey() {
  const params = new URLSearchParams(window.location.search);
  const customPage = params.get('page');
  if (customPage) return `page:${customPage.toLowerCase().replace(/[^a-z0-9-_]/g, '')}`;

  const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'index.html';
  const baseName = cleanPath.split('/').pop().replace(/\.html$/i, '') || 'index';
  return `page:${baseName}`;
}

const PAGE_ID = getCurrentPageKey();

let editorState = {
  texts: {},
  textStyles: {},
  colors: {},
  images: {},
  backgrounds: {},
  uploads: [],
  blocks: []
};

let undoStack = [];
let redoStack = [];
let autoSaveTimer = null;
let isApplyingHistory = false;
let activeEditableEl = null;
let activeStyleKey = null;
const chartInstances = new Map();

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isStudioUiNode(el) {
  if (!el || !(el instanceof Element)) return false;
  return Boolean(
    el.closest('#canva-top-bar') ||
      el.closest('#canva-format-bar') ||
      el.closest('#canva-left-rail') ||
      el.closest('#canva-side-panel')
  );
}

function extractYouTubeId(urlOrId = '') {
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : 'dQw4w9WgXcQ';
}

function toEmbedPdfUrl(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.includes('drive.google.com/file/d/')) {
    const id = trimmed.split('/file/d/')[1]?.split('/')[0];
    return id ? `https://drive.google.com/file/d/${id}/preview` : trimmed;
  }
  return trimmed;
}

function applyElementStyle(el, styleObj = {}) {
  if (!el || !styleObj) return;
  if (styleObj.color) el.style.color = styleObj.color;
  if (styleObj.dropColor) {
    el.style.backgroundColor = styleObj.dropColor;
    el.style.padding = el.style.padding || '4px 8px';
    el.style.borderRadius = el.style.borderRadius || '6px';
  }
  if (styleObj.fontFamily) el.style.fontFamily = styleObj.fontFamily;
  if (styleObj.fontSize) el.style.fontSize = `${styleObj.fontSize}px`;

  el.classList.remove('fx-shadow', 'fx-neon', 'fx-outline');
  if (styleObj.effect && styleObj.effect !== 'none') {
    el.classList.add(`fx-${styleObj.effect}`);
  }

  el.classList.remove('anim-fade-in', 'anim-type');
  if (styleObj.animation && styleObj.animation !== 'none') {
    el.classList.add(`anim-${styleObj.animation}`);
  }
}

function captureDomState() {
  const container = document.getElementById('dynamic-blocks-container');
  const updatedBlocks = (editorState.blocks || []).map((block) => {
    if (!container) return cloneState(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    if (!el) return cloneState(block);

    const updated = cloneState(block);
    el.querySelectorAll('[data-block-field]').forEach((fieldEl) => {
      updated[fieldEl.dataset.blockField] = fieldEl.innerHTML.trim();
    });

    if (updated.type === 'table') {
      const rows = [];
      el.querySelectorAll('tr').forEach((tr) => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach((cell) => cells.push(cell.innerText.trim()));
        rows.push(cells);
      });
      updated.rows = rows;
    }

    return updated;
  });

  const texts = {};
  document.querySelectorAll('[data-edit-text]').forEach((el) => {
    if (!isStudioUiNode(el)) {
      texts[el.dataset.editText] = el.innerHTML.trim();
    }
  });

  const colors = { ...(editorState.colors || {}) };
  document.querySelectorAll('#canva-side-panel input[type="color"][data-css-var]').forEach((input) => {
    colors[input.dataset.cssVar] = input.value;
  });

  const images = { ...(editorState.images || {}) };
  document.querySelectorAll('[data-edit-img]').forEach((img) => {
    if (!images[img.dataset.editImg]) {
      images[img.dataset.editImg] = img.getAttribute('src');
    }
  });

  return {
    texts,
    textStyles: cloneState(editorState.textStyles || {}),
    colors,
    images,
    backgrounds: { ...(editorState.backgrounds || {}) },
    uploads: cloneState(editorState.uploads || []),
    blocks: updatedBlocks
  };
}

function pushUndoSnapshot() {
  if (isApplyingHistory) return;
  const current = captureDomState();
  const last = undoStack[undoStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(current)) return;

  undoStack.push(current);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}

function selectEditableElement(el, styleKey) {
  if (activeEditableEl && activeEditableEl !== el) {
    activeEditableEl.classList.remove('studio-selected-box');
  }
  activeEditableEl = el;
  activeStyleKey = styleKey;
  if (el) {
    el.classList.add('studio-selected-box');
    syncFormatBarToElement(el, styleKey);
  }
}

function syncFormatBarToElement(el, styleKey) {
  const bar = document.getElementById('canva-format-bar');
  if (!bar || !el) return;
  const st = editorState.textStyles?.[styleKey] || {};
  const computedPx = parseInt(getComputedStyle(el).fontSize, 10) || 18;

  bar.querySelector('#fmt-text-color').value = rgbOrHexToHex(st.color || getComputedStyle(el).color, '#1e2229');
  bar.querySelector('#fmt-drop-color').value = rgbOrHexToHex(st.dropColor || '', '#f5f3ff');
  bar.querySelector('#fmt-font-family').value = st.fontFamily || '';
  bar.querySelector('#fmt-font-size').value = st.fontSize || computedPx;
  bar.querySelector('#fmt-effect').value = st.effect || 'none';
  bar.querySelector('#fmt-animation').value = st.animation || 'none';
}

function renderDynamicBlocks(blocks, isEditMode) {
  const container = document.getElementById('dynamic-blocks-container');
  if (!container) return;

  chartInstances.forEach((chart) => chart.destroy());
  chartInstances.clear();
  container.innerHTML = '';

  blocks.forEach((block, idx) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'section-block dynamic-block';
    wrapper.dataset.blockId = block.id;

    const removeBtnHtml = isEditMode
      ? `<button type="button" data-remove-block="${block.id}" style="float:right;font-size:0.74rem;padding:4px 8px;cursor:pointer;border-radius:6px;border:1px solid #d5dae2;background:#fff;color:#1e2229;">Remove</button>`
      : '';

    const styleKeyPrefix = `block:${block.id}`;

    if (block.type === 'text-node') {
      const tagMap = { h1: 'h1', h2: 'h2', h3: 'h3', p: 'p' };
      const tag = tagMap[block.tag] || 'p';
      const fKey = `${styleKeyPrefix}:content`;
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <${tag} contenteditable="${isEditMode}" data-block-field="content" data-style-key="${fKey}">${block.content || 'Editable text block...'}</${tag}>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${fKey}"]`), editorState.textStyles?.[fKey]);
    } else if (block.type === 'divider') {
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <hr style="border:none;border-top:1px solid var(--border-color);margin:16px 0;">
      `;
    } else if (block.type === 'pdf') {
      const pdfUrl = toEmbedPdfUrl(block.pdfUrl || '');
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">PDF DOCUMENT</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Research Document'}</h3>
          ${isEditMode ? `<div style="margin:8px 0;"><input type="text" data-pdf-url="${block.id}" value="${block.pdfUrl || ''}" placeholder="Paste PDF URL or Google Drive link" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);"></div>` : ''}
          ${
            pdfUrl
              ? `<div class="embed-container" style="height:460px;"><iframe src="${pdfUrl}" title="${block.title || 'PDF'}" loading="lazy"></iframe></div>`
              : `<p class="mono">Add a PDF URL to preview document.</p>`
          }
        </div>
      `;
    } else if (block.type === 'author') {
      const aKey = `${styleKeyPrefix}:bio`;
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
          ${block.avatarUrl ? `<img src="${block.avatarUrl}" alt="${block.name || 'Author'}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);">` : ''}
          <div style="flex:1;min-width:220px;">
            <span class="mono">AUTHOR</span>
            <h3 contenteditable="${isEditMode}" data-block-field="name" style="margin:4px 0;">${block.name || 'Marvel Tang'}</h3>
            <p contenteditable="${isEditMode}" data-block-field="bio" data-style-key="${aKey}" style="margin:0;">${block.bio || 'Marketing & Management @ HKUST.'}</p>
          </div>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${aKey}"]`), editorState.textStyles?.[aKey]);
    } else if (block.type === 'video') {
      const ytId = extractYouTubeId(block.ytUrl || '');
      const autoplay = Boolean(block.autoplay);
      const embedSrc = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&mute=${autoplay ? 1 : 0}`;
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <div class="featured-meta">
            <span class="mono">YOUTUBE VIDEO</span>
            <label class="mono" style="cursor:pointer;">
              <input type="checkbox" data-yt-autoplay="${block.id}" ${autoplay ? 'checked' : ''} ${!isEditMode ? 'disabled' : ''}> Autoplay on page load
            </label>
          </div>
          <h3 contenteditable="${isEditMode}" data-block-field="title">${block.title || 'Embedded Video'}</h3>
          ${isEditMode ? `<div style="margin-bottom:10px;"><input type="text" data-yt-url="${block.id}" value="${block.ytUrl || ''}" placeholder="Paste YouTube URL or Video ID" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);"></div>` : ''}
          <div class="embed-container" style="height:440px;">
            <iframe src="${embedSrc}" title="${block.title || 'YouTube Video'}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>
        </div>
      `;
    } else if (block.type === 'image-block') {
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">IMAGE</span>
          <div style="margin-top:12px;">
            <img src="${block.src || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80'}" alt="${block.caption || 'Uploaded visual'}" style="max-width:100%;border-radius:8px;display:block;">
          </div>
          <p contenteditable="${isEditMode}" data-block-field="caption" style="margin-top:10px;">${block.caption || 'Image caption...'}</p>
        </div>
      `;
    } else if (block.type === 'quiz') {
      const options = block.options || ['Option A', 'Option B', 'Option C'];
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">INTERACTIVE QUIZ</span>
          <h3 contenteditable="${isEditMode}" data-block-field="question" style="margin-top:8px;">${block.question || 'Quick check question?'}</h3>
          <div class="quiz-options">
            ${options
              .map(
                (opt, oIdx) => `
              <button type="button" class="quiz-opt-btn" data-correct="${oIdx === (block.correctIndex ?? 0)}" style="display:block;margin:6px 0;padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-main);cursor:pointer;">
                ${opt}
              </button>`
              )
              .join('')}
          </div>
          <p class="quiz-feedback mono" style="margin-top:10px;"></p>
        </div>
      `;
      wrapper.querySelectorAll('.quiz-opt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const feedback = wrapper.querySelector('.quiz-feedback');
          feedback.textContent = btn.dataset.correct === 'true' ? 'Correct!' : 'Try another option.';
        });
      });
    } else if (block.type === 'survey') {
      const choices = block.choices || ['Strongly Agree', 'Agree', 'Neutral', 'Disagree'];
      const totalVotes = block.counts ? Object.values(block.counts).reduce((a, b) => a + b, 0) : 0;
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">POLL / SURVEY</span>
          <h3 contenteditable="${isEditMode}" data-block-field="prompt" style="margin-top:8px;">${block.prompt || 'How useful was this breakdown?'}</h3>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            ${choices
              .map(
                (c) =>
                  `<button type="button" class="survey-choice-btn" data-choice="${c}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--soft-silver);color:var(--text-main);cursor:pointer;">${c}</button>`
              )
              .join('')}
          </div>
          <p class="survey-status mono" style="margin-top:10px;">Responses recorded: ${totalVotes}</p>
        </div>
      `;
      wrapper.querySelectorAll('.survey-choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const choice = btn.dataset.choice;
          block.counts = block.counts || {};
          block.counts[choice] = (block.counts[choice] || 0) + 1;
          const total = Object.values(block.counts).reduce((a, b) => a + b, 0);
          wrapper.querySelector('.survey-status').textContent = `Voted "${choice}" · Total responses: ${total}`;
          scheduleAutoSave();
        });
      });
    } else if (block.type === 'table') {
      const rows = block.rows || [
        ['Metric', 'Value', 'Notes'],
        ['Sample A', '42%', 'Baseline'],
        ['Sample B', '68%', 'After iteration']
      ];
      const trHtml = rows
        .map(
          (row, rIdx) => `
          <tr>
            ${row
              .map(
                (cell, cIdx) =>
                  `<${rIdx === 0 ? 'th' : 'td'} contenteditable="${isEditMode}" data-row="${rIdx}" data-col="${cIdx}" style="border:1px solid var(--border-color);padding:8px 12px;text-align:left;">${cell}</${rIdx === 0 ? 'th' : 'td'}>`
              )
              .join('')}
          </tr>`
        )
        .join('');
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card" style="overflow-x:auto;">
          <span class="mono">DATA TABLE</span>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">${trHtml}</table>
          ${isEditMode ? `<button type="button" data-add-row="${block.id}" style="margin-top:10px;padding:6px 10px;cursor:pointer;">+ Add Row</button>` : ''}
        </div>
      `;
    } else if (block.type === 'chart') {
      const canvasId = `chart-canvas-${block.id || idx}`;
      const labels = (block.labels || ['Q1', 'Q2', 'Q3', 'Q4']).map(String);
      const values = (block.values || [12, 24, 18, 32]).map(Number);
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">DATA CHART</span>
          <h3 contenteditable="${isEditMode}" data-block-field="chartTitle" style="margin-top:8px;">${block.chartTitle || 'Performance Overview'}</h3>
          <div style="max-width:680px;margin-top:16px;">
            <canvas id="${canvasId}"></canvas>
          </div>
        </div>
      `;
      if (typeof window.Chart === 'function') {
        const ctx = wrapper.querySelector(`#${canvasId}`);
        const chart = new window.Chart(ctx, {
          type: block.chartType || 'bar',
          data: {
            labels,
            datasets: [
              {
                label: block.chartTitle || 'Series',
                data: values,
                backgroundColor: '#71869A'
              }
            ]
          },
          options: { responsive: true }
        });
        chartInstances.set(block.id, chart);
      }
    } else if (block.type === 'references') {
      const refs = block.references || [
        { id: 1, citation: 'Kotler, P., & Keller, K. L. (2016). Marketing Management.' }
      ];
      wrapper.id = 'references-section';
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">REFERENCES</span>
          <h3 contenteditable="${isEditMode}" data-block-field="heading" style="margin-top:8px;">${block.heading || 'Sources & References'}</h3>
          <ol class="ref-list" style="padding-left:20px;display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            ${refs
              .map(
                (r) => `<li data-ref-id="${r.id}" style="padding:4px 6px;border-radius:4px;"><strong>[${r.id}]</strong> <span contenteditable="${isEditMode}" data-ref-text="${r.id}">${r.citation}</span></li>`
              )
              .join('')}
          </ol>
          ${
            isEditMode
              ? `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                  <input type="text" id="new-ref-input-${block.id}" placeholder="Add citation text..." style="flex:1;min-width:200px;padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);">
                  <button type="button" data-add-ref="${block.id}" style="padding:6px 12px;cursor:pointer;">+ Add Reference</button>
                </div>`
              : ''
          }
        </div>
      `;
    }

    wrapper.querySelectorAll('.ref-inline-badge').forEach((badge) => {
      badge.addEventListener('click', () => {
        const num = badge.dataset.refNum;
        const targetLi = document.querySelector(`#references-section [data-ref-id="${num}"]`);
        if (targetLi) {
          targetLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetLi.style.background = 'var(--mist-blue)';
          setTimeout(() => {
            targetLi.style.background = 'transparent';
          }, 1600);
        }
      });
    });

    if (isEditMode) {
      wrapper.querySelectorAll('[contenteditable="true"]').forEach((editable) => {
        const fKey = editable.dataset.styleKey || `block:${block.id}:${editable.dataset.blockField || editable.dataset.refText || 'text'}`;
        editable.dataset.styleKey = fKey;
        editable.addEventListener('focus', () => {
          pushUndoSnapshot();
          selectEditableElement(editable, fKey);
        });
        editable.addEventListener('input', () => {
          editorState = captureDomState();
          scheduleAutoSave();
        });
      });

      const pdfInput = wrapper.querySelector(`[data-pdf-url="${block.id}"]`);
      if (pdfInput) {
        pdfInput.addEventListener('change', (e) => {
          pushUndoSnapshot();
          block.pdfUrl = e.target.value.trim();
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      const ytUrlInput = wrapper.querySelector(`[data-yt-url="${block.id}"]`);
      if (ytUrlInput) {
        ytUrlInput.addEventListener('change', (e) => {
          pushUndoSnapshot();
          block.ytUrl = e.target.value.trim();
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      const ytAutoplayChk = wrapper.querySelector(`[data-yt-autoplay="${block.id}"]`);
      if (ytAutoplayChk) {
        ytAutoplayChk.addEventListener('change', (e) => {
          pushUndoSnapshot();
          block.autoplay = e.target.checked;
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      const addRefBtn = wrapper.querySelector(`[data-add-ref="${block.id}"]`);
      if (addRefBtn) {
        addRefBtn.addEventListener('click', () => {
          const input = wrapper.querySelector(`#new-ref-input-${block.id}`);
          const citation = input?.value.trim();
          if (!citation) return;
          pushUndoSnapshot();
          block.references = block.references || [];
          const nextId = block.references.length + 1;
          block.references.push({ id: nextId, citation });
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      wrapper.querySelectorAll('[data-ref-text]').forEach((refSpan) => {
        refSpan.addEventListener('input', () => {
          const rId = Number(refSpan.dataset.refText);
          const found = (block.references || []).find((r) => r.id === rId);
          if (found) found.citation = refSpan.innerText.trim();
          scheduleAutoSave();
        });
      });

      const removeBtn = wrapper.querySelector(`[data-remove-block="${block.id}"]`);
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          pushUndoSnapshot();
          editorState = captureDomState();
          editorState.blocks = editorState.blocks.filter((b) => b.id !== block.id);
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      const addRowBtn = wrapper.querySelector(`[data-add-row="${block.id}"]`);
      if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
          pushUndoSnapshot();
          editorState = captureDomState();
          const target = editorState.blocks.find((b) => b.id === block.id);
          if (target) {
            const colCount = target.rows?.[0]?.length || 3;
            target.rows = target.rows || [];
            target.rows.push(Array(colCount).fill('New cell'));
            renderDynamicBlocks(editorState.blocks, true);
            scheduleAutoSave();
          }
        });
      }
    }

    container.appendChild(wrapper);
  });
}

function applyStateToDom(state, isEditMode) {
  Object.entries(state.texts || {}).forEach(([key, html]) => {
    const el = document.querySelector(`[data-edit-text="${key}"]`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  });

  Object.entries(state.textStyles || {}).forEach(([sKey, st]) => {
    const el = document.querySelector(`[data-style-key="${sKey}"]`) || document.querySelector(`[data-edit-text="${sKey}"]`);
    if (el) applyElementStyle(el, st);
  });

  Object.entries(state.colors || {}).forEach(([cssVar, value]) => {
    document.documentElement.style.setProperty(cssVar, value);
    const picker = document.querySelector(`#canva-side-panel input[data-css-var="${cssVar}"]`);
    if (picker) picker.value = value;
  });

  Object.entries(state.images || {}).forEach(([key, url]) => {
    const img = document.querySelector(`[data-edit-img="${key}"]`);
    if (img && url) img.src = url;
  });

  Object.entries(state.backgrounds || {}).forEach(([key, url]) => {
    const el = document.querySelector(`[data-edit-bg="${key}"]`);
    if (el && url) {
      el.style.backgroundImage = `linear-gradient(135deg, rgba(113, 134, 154, 0.4), rgba(201, 216, 229, 0.6)), url('${url}')`;
    }
  });

  renderDynamicBlocks(state.blocks || [], isEditMode);
}

async function loadSavedSiteContent(isEditMode = false) {
  try {
    const idsToCheck = PAGE_ID === 'page:index' ? ['page:index', 'main'] : [PAGE_ID];
    const { data, error } = await supabase
      .from('site_content')
      .select('id, content, updated_at')
      .in('id', idsToCheck);

    if (error) {
      console.error('Error loading site_content:', error);
      return;
    }

    if (data && data.length > 0) {
      const record = data.find((row) => row.id === PAGE_ID) || data[0];
      if (record?.content) {
        editorState = {
          texts: record.content.texts || {},
          textStyles: record.content.textStyles || {},
          colors: record.content.colors || {},
          images: record.content.images || {},
          backgrounds: record.content.backgrounds || {},
          uploads: record.content.uploads || [],
          blocks: record.content.blocks || []
        };
      }
    }

    const { data: bucketFiles } = await supabase.storage.from(STORAGE_BUCKET).list('', { limit: 50 });
    if (Array.isArray(bucketFiles) && bucketFiles.length > 0) {
      const fromBucket = bucketFiles
        .filter((f) => f.name && !f.name.startsWith('.'))
        .map((f) => {
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(f.name);
          return { name: f.name, url: pub?.publicUrl || '' };
        })
        .filter((item) => item.url);

      const merged = [...(editorState.uploads || [])];
      fromBucket.forEach((bItem) => {
        if (!merged.some((m) => m.url === bItem.url)) merged.push(bItem);
      });
      editorState.uploads = merged;
    }

    applyStateToDom(editorState, isEditMode);
  } catch (err) {
    console.warn('Could not load saved site content:', err);
  }
}

async function saveNow() {
  const statusEl = document.getElementById('canva-save-status');
  editorState = captureDomState();
  const payloadContent = cloneState(editorState);

  if (statusEl) statusEl.textContent = 'Saving...';

  const { error } = await supabase
    .from('site_content')
    .upsert(
      {
        id: PAGE_ID,
        content: payloadContent,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('Supabase save error:', error);
    if (statusEl) statusEl.textContent = `Save failed: ${error.message}`;
  } else if (statusEl) {
    statusEl.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function scheduleAutoSave() {
  const statusEl = document.getElementById('canva-save-status');
  if (statusEl) statusEl.textContent = 'Unsaved changes...';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveNow();
  }, 1500);
}

async function getAuthenticatedSession() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return data.session;

  if (window.location.hash && window.location.hash.includes('access_token')) {
    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        const { data: retryData } = await supabase.auth.getSession();
        resolve(retryData?.session || null);
      }, 1500);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(session);
        }
      });
    });
  }

  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';

  await loadSavedSiteContent(isEditMode);

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const nextTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', nextTheme);
    });
  }

  if (isEditMode) {
    const session = await getAuthenticatedSession();
    const userEmail = (session?.user?.email || '').toLowerCase().trim();

    if (!session || userEmail !== ADMIN_EMAIL.toLowerCase()) {
      alert('Unauthorized access. Please log in with your admin account.');
      window.location.href = '/pages/login.html';
      return;
    }

    if (window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    enableCanvaStudio();
  }
});

function enableCanvaStudio() {
  document.body.classList.add('studio-active', 'studio-panel-open');
  editorState = captureDomState();
  undoStack = [cloneState(editorState)];

  const computedStyles = getComputedStyle(document.documentElement);

  // 1. Top Bar
  const topBar = document.createElement('header');
  topBar.id = 'canva-top-bar';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-weight:700;font-size:0.88rem;color:#6d28d9;">Studio</span>
      <span class="mono" style="font-size:0.74rem;color:#6b7280;">${PAGE_ID}</span>
      <button type="button" id="canva-undo-btn" title="Undo (Cmd+Z)">↶</button>
      <button type="button" id="canva-redo-btn" title="Redo (Cmd+Y)">↷</button>
      <span id="canva-save-status" class="mono" style="font-size:0.72rem;color:#6b7280;">Ready</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button type="button" id="canva-save-btn" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-weight:600;font-size:0.78rem;cursor:pointer;">Save</button>
      <a href="${window.location.pathname}" style="text-decoration:none;font-size:0.78rem;color:#374151;padding:6px 10px;border:1px solid #d5dae2;border-radius:6px;">View Site</a>
    </div>
  `;
  document.body.appendChild(topBar);

  // 2. Top Contextual Format Bar
  const formatBar = document.createElement('div');
  formatBar.id = 'canva-format-bar';
  formatBar.innerHTML = `
    <select id="fmt-font-family" title="Font">
      <option value="">Font</option>
      <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
      <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
      <option value="Georgia, serif">Georgia</option>
    </select>
    <button type="button" id="fmt-size-dec" title="Decrease Size">−</button>
    <input type="number" id="fmt-font-size" min="10" max="120" value="18" style="width:52px;text-align:center;" title="Font Size (px)">
    <button type="button" id="fmt-size-inc" title="Increase Size">+</button>
    <label title="Text Color" style="display:inline-flex;align-items:center;gap:4px;font-size:0.74rem;">A <input type="color" id="fmt-text-color" value="#1e2229"></label>
    <label title="Drop / Highlight Color" style="display:inline-flex;align-items:center;gap:4px;font-size:0.74rem;">Drop <input type="color" id="fmt-drop-color" value="#f5f3ff"></label>
    <button type="button" data-fmt-cmd="bold" title="Bold (Cmd+B)"><b>B</b></button>
    <button type="button" data-fmt-cmd="italic" title="Italic (Cmd+I)"><i>I</i></button>
    <button type="button" data-fmt-cmd="underline" title="Underline (Cmd+U)"><u>U</u></button>
    <button type="button" data-fmt-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <select id="fmt-effect" title="Effects">
      <option value="none">Effects</option>
      <option value="shadow">Shadow</option>
      <option value="neon">Neon</option>
      <option value="outline">Outline</option>
    </select>
    <select id="fmt-animation" title="Animate">
      <option value="none">Animate</option>
      <option value="fade-in">Fade In</option>
      <option value="type">Type</option>
    </select>
    <button type="button" id="fmt-embed-ref" title="Embed Reference [#]">+ Ref [#]</button>
  `;
  document.body.appendChild(formatBar);

  // 3. Left Icon Rail
  const leftRail = document.createElement('nav');
  leftRail.id = 'canva-left-rail';
  leftRail.innerHTML = `
    <button type="button" class="canva-rail-btn active" data-panel="widgets"><span>❖</span><span>Widgets</span></button>
    <button type="button" class="canva-rail-btn" data-panel="text"><span>T</span><span>Text</span></button>
    <button type="button" class="canva-rail-btn" data-panel="uploads"><span>☁</span><span>Uploads</span></button>
    <button type="button" class="canva-rail-btn" data-panel="theme"><span>◐</span><span>Theme</span></button>
    <button type="button" class="canva-rail-btn" id="canva-collapse-btn" title="Collapse / Expand Panel" style="margin-top:auto;margin-bottom:10px;"><span>⟨</span><span>Hide</span></button>
  `;
  document.body.appendChild(leftRail);

  // 4. Collapsible Left Side Panel
  const sidePanel = document.createElement('aside');
  sidePanel.id = 'canva-side-panel';
  sidePanel.innerHTML = `
    <div id="cpanel-widgets" class="cpanel-view">
      <div style="font-weight:700;margin-bottom:10px;">Widgets</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button type="button" data-add-block="divider" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Horizontal Line</button>
        <button type="button" data-add-block="pdf" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">PDF Embed</button>
        <button type="button" data-add-block="author" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Author Card</button>
        <button type="button" data-add-block="video" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">YouTube Video</button>
        <button type="button" data-add-block="quiz" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Quiz</button>
        <button type="button" data-add-block="survey" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Poll</button>
        <button type="button" data-add-block="table" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Table</button>
        <button type="button" data-add-block="chart" style="padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#fff;cursor:pointer;">Chart</button>
        <button type="button" data-add-block="references" style="grid-column:span 2;padding:8px;border:1px solid #d5dae2;border-radius:8px;background:#f9fafb;cursor:pointer;">References Section</button>
      </div>
    </div>

    <div id="cpanel-text" class="cpanel-view" style="display:none;">
      <div style="font-weight:700;margin-bottom:10px;">Add Text</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button type="button" data-add-text="h1" style="padding:12px;text-align:left;border:1px solid #d5dae2;border-radius:8px;background:#f9fafb;font-size:1.25rem;font-weight:700;cursor:pointer;">Add Heading (H1)</button>
        <button type="button" data-add-text="h2" style="padding:10px;text-align:left;border:1px solid #d5dae2;border-radius:8px;background:#f9fafb;font-size:1.05rem;font-weight:600;cursor:pointer;">Add Subheading (H2)</button>
        <button type="button" data-add-text="h3" style="padding:9px;text-align:left;border:1px solid #d5dae2;border-radius:8px;background:#f9fafb;font-size:0.92rem;font-weight:600;cursor:pointer;">Add Title (H3)</button>
        <button type="button" data-add-text="p" style="padding:8px;text-align:left;border:1px solid #d5dae2;border-radius:8px;background:#fff;font-size:0.84rem;cursor:pointer;">Add normal text</button>
      </div>
    </div>

    <div id="cpanel-uploads" class="cpanel-view" style="display:none;">
      <div style="font-weight:700;margin-bottom:8px;">Uploads</div>
      <input type="file" id="canva-upload-input" accept="image/*" style="width:100%;font-size:0.75rem;margin-bottom:12px;">
      <div id="canva-uploads-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
    </div>

    <div id="cpanel-theme" class="cpanel-view" style="display:none;">
      <div style="font-weight:700;margin-bottom:10px;">Theme & Pages</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        <label style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>Background</span><input type="color" data-css-var="--bg-color" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--bg-color'), '#F5F5F2')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>Text Main</span><input type="color" data-css-var="--text-main" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--text-main'), '#202124')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>Card Surface</span><input type="color" data-css-var="--card-bg" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--card-bg'), '#FFFFFF')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:0.8rem;"><span>Accent</span><input type="color" data-css-var="--slate-blue" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--slate-blue'), '#71869A')}"></label>
      </div>
      <div style="border-top:1px solid #e2e5ea;padding-top:12px;">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:6px;">Create New Page</div>
        <div style="display:flex;gap:6px;">
          <input type="text" id="canva-new-slug" placeholder="page-slug" style="flex:1;padding:6px;border:1px solid #d5dae2;border-radius:6px;">
          <button type="button" id="canva-create-page" style="padding:6px 10px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;">Go</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(sidePanel);

  // Make static [data-edit-text] elements editable and selectable
  document.querySelectorAll('[data-edit-text]').forEach((el) => {
    if (isStudioUiNode(el)) return;
    const sKey = el.dataset.editText;
    el.dataset.styleKey = sKey;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed rgba(124, 58, 237, 0.45)';
    el.style.outlineOffset = '4px';

    el.addEventListener('focus', () => {
      pushUndoSnapshot();
      selectEditableElement(el, sKey);
    });

    el.addEventListener('input', () => {
      editorState = captureDomState();
      scheduleAutoSave();
    });
  });

  // Format bar actions
  const patchActiveStyle = (patch) => {
    if (!activeEditableEl || !activeStyleKey) return;
    pushUndoSnapshot();
    const next = { ...(editorState.textStyles[activeStyleKey] || {}), ...patch };
    editorState.textStyles[activeStyleKey] = next;
    applyElementStyle(activeEditableEl, next);
    editorState = captureDomState();
    scheduleAutoSave();
  };

  formatBar.querySelector('#fmt-font-family').addEventListener('change', (e) => patchActiveStyle({ fontFamily: e.target.value }));
  formatBar.querySelector('#fmt-font-size').addEventListener('change', (e) => patchActiveStyle({ fontSize: Number(e.target.value) || 18 }));
  formatBar.querySelector('#fmt-size-inc').addEventListener('click', () => {
    const input = formatBar.querySelector('#fmt-font-size');
    const val = (Number(input.value) || 18) + 2;
    input.value = val;
    patchActiveStyle({ fontSize: val });
  });
  formatBar.querySelector('#fmt-size-dec').addEventListener('click', () => {
    const input = formatBar.querySelector('#fmt-font-size');
    const val = Math.max(10, (Number(input.value) || 18) - 2);
    input.value = val;
    patchActiveStyle({ fontSize: val });
  });
  formatBar.querySelector('#fmt-text-color').addEventListener('input', (e) => patchActiveStyle({ color: e.target.value }));
  formatBar.querySelector('#fmt-drop-color').addEventListener('input', (e) => patchActiveStyle({ dropColor: e.target.value }));
  formatBar.querySelector('#fmt-effect').addEventListener('change', (e) => patchActiveStyle({ effect: e.target.value }));
  formatBar.querySelector('#fmt-animation').addEventListener('change', (e) => patchActiveStyle({ animation: e.target.value }));

  formatBar.querySelectorAll('[data-fmt-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      document.execCommand(btn.dataset.fmtCmd, false, null);
      editorState = captureDomState();
      scheduleAutoSave();
    });
  });

  formatBar.querySelector('#fmt-embed-ref').addEventListener('click', () => {
    if (!activeEditableEl) return;
    const refNum = prompt('Reference number to embed (e.g. 1):', '1');
    if (!refNum) return;
    pushUndoSnapshot();
    document.execCommand('insertHTML', false, `<sup class="ref-inline-badge mono" data-ref-num="${refNum}" style="cursor:pointer;color:#6d28d9;font-weight:700;">[${refNum}]</sup>&nbsp;`);
    editorState = captureDomState();
    scheduleAutoSave();
  });

  // Rail switching & collapse
  const railBtns = leftRail.querySelectorAll('.canva-rail-btn[data-panel]');
  const panelViews = sidePanel.querySelectorAll('.cpanel-view');
  railBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      document.body.classList.add('studio-panel-open');
      railBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      panelViews.forEach((v) => (v.style.display = 'none'));
      sidePanel.querySelector(`#cpanel-${btn.dataset.panel}`).style.display = 'block';
    });
  });

  leftRail.querySelector('#canva-collapse-btn').addEventListener('click', () => {
    document.body.classList.toggle('studio-panel-open');
  });

  // Add text nodes
  sidePanel.querySelectorAll('[data-add-text]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      editorState = captureDomState();
      const tag = btn.dataset.addText;
      editorState.blocks.push({
        id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type: 'text-node',
        tag,
        content: tag === 'p' ? 'New paragraph text...' : `New ${tag.toUpperCase()} heading`
      });
      renderDynamicBlocks(editorState.blocks, true);
      scheduleAutoSave();
    });
  });

  // Add widgets
  sidePanel.querySelectorAll('[data-add-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      editorState = captureDomState();
      const bType = btn.dataset.addBlock;
      const newBlock = { id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, type: bType };

      if (bType === 'video') {
        newBlock.ytUrl = prompt('YouTube URL or Video ID:', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') || '';
        newBlock.autoplay = false;
        newBlock.title = 'Featured Video';
      } else if (bType === 'pdf') {
        newBlock.pdfUrl = prompt('PDF URL or Google Drive link:', '') || '';
        newBlock.title = 'Attached PDF';
      } else if (bType === 'chart') {
        const labels = prompt('Chart labels (comma-separated):', 'Jan, Feb, Mar, Apr') || 'Jan, Feb, Mar';
        const values = prompt('Chart numbers (comma-separated):', '12, 24, 18, 32') || '12, 24, 18';
        newBlock.labels = labels.split(',').map((s) => s.trim());
        newBlock.values = values.split(',').map((n) => Number(n.trim()) || 0);
      }

      editorState.blocks.push(newBlock);
      renderDynamicBlocks(editorState.blocks, true);
      scheduleAutoSave();
    });
  });

  // Uploads gallery & file upload
  const renderUploads = () => {
    const grid = sidePanel.querySelector('#canva-uploads-grid');
    if (!grid) return;
    const list = editorState.uploads || [];
    if (!list.length) {
      grid.innerHTML = `<span class="mono" style="grid-column:span 2;color:#6b7280;font-size:0.74rem;">No photos uploaded yet.</span>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (u) => `
      <div style="border:1px solid #e2e5ea;border-radius:8px;padding:4px;text-align:center;background:#fafafa;">
        <img src="${u.url}" alt="${u.name || 'Upload'}" style="width:100%;height:60px;object-fit:cover;border-radius:6px;display:block;margin-bottom:4px;">
        <button type="button" data-insert-photo="${u.url}" style="width:100%;padding:4px;font-size:0.7rem;border:1px solid #d5dae2;border-radius:5px;background:#fff;cursor:pointer;">Insert</button>
      </div>`
      )
      .join('');

    grid.querySelectorAll('[data-insert-photo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pushUndoSnapshot();
        editorState.blocks.push({
          id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          type: 'image-block',
          src: btn.dataset.insertPhoto,
          caption: 'Uploaded photo'
        });
        renderDynamicBlocks(editorState.blocks, true);
        scheduleAutoSave();
      });
    });
  };
  renderUploads();

  sidePanel.querySelector('#canva-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = topBar.querySelector('#canva-save-status');
    statusEl.textContent = 'Uploading...';

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `upload-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, file, { upsert: true });
    if (error) {
      statusEl.textContent = `Upload error: ${error.message}`;
      return;
    }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    if (!pub?.publicUrl) return;

    pushUndoSnapshot();
    editorState.uploads = editorState.uploads || [];
    editorState.uploads.unshift({ name: safeName, url: pub.publicUrl });
    editorState.blocks.push({
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: 'image-block',
      src: pub.publicUrl,
      caption: safeName
    });
    renderUploads();
    renderDynamicBlocks(editorState.blocks, true);
    await saveNow();
  });

  // Theme & Create Page
  sidePanel.querySelectorAll('input[type="color"][data-css-var]').forEach((input) => {
    input.addEventListener('input', (e) => {
      pushUndoSnapshot();
      document.documentElement.style.setProperty(e.target.dataset.cssVar, e.target.value);
      editorState.colors[e.target.dataset.cssVar] = e.target.value;
      scheduleAutoSave();
    });
  });

  sidePanel.querySelector('#canva-create-page').addEventListener('click', async () => {
    const slug = sidePanel.querySelector('#canva-new-slug').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slug) return;
    await supabase.from('site_content').upsert(
      {
        id: `page:${slug}`,
        content: {
          texts: {},
          textStyles: {},
          colors: editorState.colors || {},
          images: {},
          backgrounds: {},
          uploads: editorState.uploads || [],
          blocks: [{ id: `blk_${Date.now()}`, type: 'text-node', tag: 'h1', content: slug.toUpperCase() }]
        },
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );
    const url = new URL(window.location.href);
    url.searchParams.set('page', slug);
    url.searchParams.set('edit', 'true');
    window.location.href = url.toString();
  });

  // Undo / Redo / Save
  const handleUndo = () => {
    if (!undoStack.length) return;
    redoStack.push(captureDomState());
    const prev = undoStack.pop();
    isApplyingHistory = true;
    editorState = prev;
    applyStateToDom(editorState, true);
    isApplyingHistory = false;
    scheduleAutoSave();
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
    undoStack.push(captureDomState());
    const next = redoStack.pop();
    isApplyingHistory = true;
    editorState = next;
    applyStateToDom(editorState, true);
    isApplyingHistory = false;
    scheduleAutoSave();
  };

  topBar.querySelector('#canva-undo-btn').addEventListener('click', handleUndo);
  topBar.querySelector('#canva-redo-btn').addEventListener('click', handleRedo);
  topBar.querySelector('#canva-save-btn').addEventListener('click', saveNow);

  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    },
    true
  );
}

function rgbOrHexToHex(colorStr, fallback) {
  const trimmed = (colorStr || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return fallback;
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}
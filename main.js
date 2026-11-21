import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uxawnkddduhhvjhrvijn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_V8JViisHhHsXnTbx3bbtMw_nknLtOEZ';
const ADMIN_EMAIL = 'marveltang71@gmail.com';
const STORAGE_BUCKET = 'portfolio-assets';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getCustomSlugParam() {
  const params = new URLSearchParams(window.location.search);
  const customPage = params.get('page');
  return customPage ? customPage.toLowerCase().replace(/[^a-z0-9-_]/g, '') : '';
}

function getCurrentPageKey() {
  const customSlug = getCustomSlugParam();
  if (customSlug) return `page:${customSlug}`;

  const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'index.html';
  const baseName = cleanPath.split('/').pop().replace(/\.html$/i, '') || 'index';
  return `page:${baseName}`;
}

function getPageTargetUrl(pageSlug, editMode = false) {
  const isSub = window.location.pathname.includes('/pages/');
  const prefix = isSub ? '../' : '';
  const map = {
    index: `${prefix}index.html`,
    blog: isSub ? 'blog.html' : 'pages/blog.html',
    about: isSub ? 'about.html' : 'pages/about.html',
    project: isSub ? 'project.html' : 'pages/project.html'
  };
  const base = map[pageSlug] || `${prefix}index.html?page=${encodeURIComponent(pageSlug)}`;
  const sep = base.includes('?') ? '&' : '?';
  return editMode ? `${base}${sep}edit=true` : base;
}

function getDefaultPageLabel(pageId) {
  if (pageId === 'page:index') return 'Home';
  if (pageId === 'page:blog') return 'Blog';
  if (pageId === 'page:about') return 'About';
  if (pageId === 'page:project') return 'Projects';
  return pageId.replace(/^page:/, '').replace(/[-_]/g, ' ');
}

function getPageDisplayTitle(pageId, payload = {}) {
  if (pageId === PAGE_ID && editorState?.meta?.title) return editorState.meta.title;
  if (payload?.meta?.title) return payload.meta.title;
  return getDefaultPageLabel(pageId);
}

const CUSTOM_SLUG = getCustomSlugParam();
const PAGE_ID = getCurrentPageKey();

let publishedContentSnapshot = {};
let editorState = {
  meta: {
    title: CUSTOM_SLUG ? CUSTOM_SLUG.replace(/[-_]/g, ' ') : getDefaultPageLabel(PAGE_ID),
    category: CUSTOM_SLUG ? 'Parallel Page' : 'Core Page',
    parentId: ''
  },
  texts: {},
  textStyles: {},
  colors: {},
  brand: {
    logoText: 'MARVEL TANG',
    logoUrl: '',
    primaryColor: '#0F172A',
    accentColor: '#71869A'
  },
  images: {},
  backgrounds: {},
  uploads: [],
  blocks: []
};

let allSitePages = [];
let undoStack = [];
let redoStack = [];
let autoSaveTimer = null;
let isApplyingHistory = false;
let activeEditableEl = null;
let activeStyleKey = null;
let studioInitialized = false;
const chartInstances = new Map();

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function isStudioUiNode(el) {
  if (!el || !(el instanceof Element)) return false;
  return Boolean(
    el.closest('#studio-top-bar') ||
      el.closest('#studio-format-bar') ||
      el.closest('#studio-page-bar') ||
      el.closest('#studio-left-rail') ||
      el.closest('#studio-side-drawer')
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
  if (styleObj.opacity !== undefined && styleObj.opacity !== '') {
    el.style.opacity = String(styleObj.opacity);
  }

  el.classList.remove('fx-shadow', 'fx-neon', 'fx-outline');
  if (styleObj.effect && styleObj.effect !== 'none') {
    el.classList.add(`fx-${styleObj.effect}`);
  }

  el.classList.remove('anim-fade-in', 'anim-type');
  if (styleObj.animation && styleObj.animation !== 'none') {
    el.classList.add(`anim-${styleObj.animation}`);
  }
}

function applyBrandToPage(brand = {}) {
  if (!brand) return;
  if (brand.primaryColor) {
    document.documentElement.style.setProperty('--text-main', brand.primaryColor);
  }
  if (brand.accentColor) {
    document.documentElement.style.setProperty('--slate-blue', brand.accentColor);
  }
  if (brand.logoText) {
    document.querySelectorAll('.brand-logo').forEach((logoEl) => {
      if (!isStudioUiNode(logoEl) && !logoEl.querySelector('img')) {
        logoEl.textContent = brand.logoText;
      }
    });
  }
  if (brand.logoUrl) {
    document.querySelectorAll('.brand-logo').forEach((logoEl) => {
      if (!isStudioUiNode(logoEl)) {
        logoEl.innerHTML = `<img src="${brand.logoUrl}" alt="${brand.logoText || 'Logo'}" style="height:28px;width:auto;object-fit:contain;vertical-align:middle;">`;
      }
    });
  }
}

function mountParallelPageShellIfNeeded() {
  if (!CUSTOM_SLUG) return;
  const mainEl = document.querySelector('main.content-wrapper');
  if (!mainEl) return;

  const pageTitle = editorState.meta?.title || CUSTOM_SLUG.replace(/[-_]/g, ' ');
  const pageCategory = editorState.meta?.category || 'Parallel Page';
  document.title = `${pageTitle} — Marvel Tang`;

  mainEl.innerHTML = `
    <div class="page-header">
      <span class="mono" data-edit-text="parallel-kicker">${pageCategory.toUpperCase()}</span>
      <h1 data-edit-text="parallel-title">${pageTitle}</h1>
      <p data-edit-text="parallel-subtitle">Add content, widgets, media, or sections below.</p>
    </div>
    <div id="dynamic-blocks-container"></div>
  `;
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
  document.querySelectorAll('#studio-side-drawer input[type="color"][data-css-var]').forEach((input) => {
    colors[input.dataset.cssVar] = input.value;
  });

  const images = { ...(editorState.images || {}) };
  document.querySelectorAll('[data-edit-img]').forEach((img) => {
    if (!images[img.dataset.editImg]) {
      images[img.dataset.editImg] = img.getAttribute('src');
    }
  });

  return {
    meta: cloneState(editorState.meta || {}),
    texts,
    textStyles: cloneState(editorState.textStyles || {}),
    colors,
    brand: cloneState(editorState.brand || {}),
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
    activeEditableEl.classList.remove('studio-selected-outline');
  }
  activeEditableEl = el;
  activeStyleKey = styleKey;
  if (el) {
    el.classList.add('studio-selected-outline');
    syncFormatBarToElement(el, styleKey);
  }
}

function syncFormatBarToElement(el, styleKey) {
  const bar = document.getElementById('studio-format-bar');
  if (!bar || !el) return;
  const st = editorState.textStyles?.[styleKey] || {};
  const computedPx = parseInt(getComputedStyle(el).fontSize, 10) || 18;
  const currentOpacity =
    st.opacity !== undefined && st.opacity !== '' ? Number(st.opacity) : Number(getComputedStyle(el).opacity || 1);

  bar.querySelector('#fmt-text-color').value = rgbOrHexToHex(st.color || getComputedStyle(el).color, '#0F172A');
  bar.querySelector('#fmt-drop-color').value = rgbOrHexToHex(st.dropColor || '', '#EEF2FF');
  bar.querySelector('#fmt-font-family').value = st.fontFamily || '';
  bar.querySelector('#fmt-font-size').value = st.fontSize || computedPx;
  bar.querySelector('#fmt-opacity').value = Math.round(currentOpacity * 100);
  bar.querySelector('#fmt-opacity-val').textContent = `${Math.round(currentOpacity * 100)}%`;
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
      ? `<button type="button" data-remove-block="${block.id}" class="studio-card-btn" style="float:right;">Remove</button>`
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
        <hr style="border:none;border-top:1.5px solid var(--border-color);margin:16px 0;">
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
          ${isEditMode ? `<button type="button" data-add-row="${block.id}" class="studio-card-btn" style="margin-top:10px;">+ Add Row</button>` : ''}
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
                backgroundColor: editorState.brand?.accentColor || '#71869A'
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
                  <button type="button" data-add-ref="${block.id}" class="studio-card-btn">+ Add Reference</button>
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
        const fKey =
          editable.dataset.styleKey || `block:${block.id}:${editable.dataset.blockField || editable.dataset.refText || 'text'}`;
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

function hydrateStateObject(raw) {
  if (!raw) return;
  editorState = {
    meta: {
      title: raw.meta?.title || (CUSTOM_SLUG ? CUSTOM_SLUG.replace(/[-_]/g, ' ') : getDefaultPageLabel(PAGE_ID)),
      category: raw.meta?.category || (CUSTOM_SLUG ? 'Parallel Page' : 'Core Page'),
      parentId: raw.meta?.parentId || ''
    },
    texts: raw.texts || {},
    textStyles: raw.textStyles || {},
    colors: raw.colors || {},
    brand: {
      logoText: raw.brand?.logoText || 'MARVEL TANG',
      logoUrl: raw.brand?.logoUrl || '',
      primaryColor: raw.brand?.primaryColor || '#0F172A',
      accentColor: raw.brand?.accentColor || '#71869A'
    },
    images: raw.images || {},
    backgrounds: raw.backgrounds || {},
    uploads: raw.uploads || [],
    blocks: raw.blocks || []
  };
}

function applyStateToDom(state, isEditMode) {
  applyBrandToPage(state.brand || {});

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
    const picker = document.querySelector(`#studio-side-drawer input[data-css-var="${cssVar}"]`);
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

function appendPublishedParallelPagesToRollMenu(rows, isEditMode) {
  const rollMenu = document.getElementById('site-roll-menu');
  if (!rollMenu) return;

  const builtIn = new Set(['page:index', 'page:blog', 'page:about', 'page:project', 'main']);
  rows.forEach((row) => {
    if (!row.id || !row.id.startsWith('page:') || builtIn.has(row.id)) return;
    const payload = isEditMode ? (row.draft_content || row.content) : row.content;
    if (!payload) return;

    const slug = row.id.replace(/^page:/, '');
    if (rollMenu.querySelector(`a[data-parallel-slug="${slug}"]`)) return;

    const isSub = Boolean(payload.meta?.parentId);
    const label = payload.meta?.title || slug.replace(/[-_]/g, ' ');
    const link = document.createElement('a');
    link.href = getPageTargetUrl(slug, isEditMode);
    link.dataset.parallelSlug = slug;
    link.textContent = isSub ? `↳ ${label}` : label;
    rollMenu.appendChild(link);
  });
}

async function loadSavedSiteContent(isEditMode = false) {
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('id, content, draft_content, updated_at')
      .like('id', 'page:%');

    if (error) {
      console.error('Error loading site_content:', error);
    }

    if (Array.isArray(data)) {
      allSitePages = data;
      appendPublishedParallelPagesToRollMenu(data, isEditMode);

      const record =
        data.find((row) => row.id === PAGE_ID) ||
        (PAGE_ID === 'page:index' ? data.find((row) => row.id === 'main') : null);

      if (record) {
        publishedContentSnapshot = cloneState(record.content || record.draft_content || {});
        const chosenPayload = isEditMode
          ? (record.draft_content || record.content)
          : (record.content || record.draft_content);
        hydrateStateObject(chosenPayload);
      }
    }

    mountParallelPageShellIfNeeded();

    if (isEditMode && (!publishedContentSnapshot || Object.keys(publishedContentSnapshot).length === 0)) {
      publishedContentSnapshot = captureDomState();
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

async function saveDraftNow() {
  const statusEl = document.getElementById('studio-save-status');
  editorState = captureDomState();
  const draftPayload = cloneState(editorState);
  const livePayload =
    publishedContentSnapshot && Object.keys(publishedContentSnapshot).length > 0
      ? cloneState(publishedContentSnapshot)
      : cloneState(draftPayload);

  if (statusEl) statusEl.textContent = 'Saving...';

  const { error } = await supabase
    .from('site_content')
    .upsert(
      {
        id: PAGE_ID,
        draft_content: draftPayload,
        content: livePayload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('Draft save error:', error);
    if (statusEl) statusEl.textContent = `Error: ${error.message}`;
  } else if (statusEl) {
    statusEl.textContent = 'Draft saved';
  }
}

async function publishLiveNow() {
  const statusEl = document.getElementById('studio-save-status');
  editorState = captureDomState();
  const payloadContent = cloneState(editorState);
  publishedContentSnapshot = cloneState(payloadContent);

  if (statusEl) statusEl.textContent = 'Publishing...';

  const { error } = await supabase
    .from('site_content')
    .upsert(
      {
        id: PAGE_ID,
        draft_content: payloadContent,
        content: payloadContent,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('Publish error:', error);
    if (statusEl) statusEl.textContent = `Error: ${error.message}`;
  } else if (statusEl) {
    statusEl.textContent = 'Published';
  }
}

function scheduleAutoSave() {
  const statusEl = document.getElementById('studio-save-status');
  if (statusEl) statusEl.textContent = 'Draft';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveDraftNow();
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

function bindRollDownMenu() {
  const menuBtn = document.getElementById('nav-menu-toggle');
  const rollMenu = document.getElementById('site-roll-menu');
  if (!menuBtn || !rollMenu || menuBtn.dataset.bound) return;
  menuBtn.dataset.bound = 'true';

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = rollMenu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (e) => {
    if (!rollMenu.contains(e.target) && e.target !== menuBtn) {
      rollMenu.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

function mountHorizontalRuler() {
  const mainEl = document.querySelector('main.content-wrapper');
  if (!mainEl || document.getElementById('studio-ruler')) return;

  const ruler = document.createElement('div');
  ruler.id = 'studio-ruler';
  ruler.setAttribute('aria-hidden', 'true');

  const maxWidth = mainEl.clientWidth || 960;
  for (let px = 0; px < maxWidth; px += 100) {
    const label = document.createElement('span');
    label.style.left = `${px}px`;
    label.textContent = `${px}px`;
    ruler.appendChild(label);
  }

  mainEl.prepend(ruler);
}

async function runPageApp() {
  if (studioInitialized) return;
  studioInitialized = true;

  bindRollDownMenu();

  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';

  await loadSavedSiteContent(isEditMode);

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle && !themeToggle.dataset.bound) {
    themeToggle.dataset.bound = 'true';
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

    enableWhiteCanvaStudio();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runPageApp);
} else {
  runPageApp();
}

function enableWhiteCanvaStudio() {
  document.body.classList.add('studio-mode', 'studio-drawer-open');
  mountHorizontalRuler();
  editorState = captureDomState();
  undoStack = [cloneState(editorState)];

  const computedStyles = getComputedStyle(document.documentElement);
  const viewLiveHref = CUSTOM_SLUG ? `?page=${encodeURIComponent(CUSTOM_SLUG)}` : window.location.pathname;
  const activeTitle = getPageDisplayTitle(PAGE_ID, editorState);

  const topBar = document.createElement('header');
  topBar.id = 'studio-top-bar';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <strong style="font-size:14px;color:#0F172A;">Studio</strong>
      <span id="studio-topbar-page" style="font-size:12px;font-weight:600;color:#3730A3;background:#EEF2FF;border:1px solid #C7D2FE;padding:2px 9px;border-radius:999px;">${activeTitle}</span>
      <button type="button" id="studio-undo-btn" title="Undo" class="studio-card-btn" style="padding:3px 8px;">↶</button>
      <button type="button" id="studio-redo-btn" title="Redo" class="studio-card-btn" style="padding:3px 8px;">↷</button>
      <span id="studio-save-status" style="font-size:11px;color:#64748B;">Draft</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button type="button" id="studio-save-draft-btn" class="studio-card-btn">Save Draft</button>
      <button type="button" id="studio-publish-btn" style="background:#4F46E5;color:#FFFFFF;border:1px solid #4F46E5;border-radius:7px;padding:6px 12px;font-weight:600;font-size:12px;cursor:pointer;">Publish</button>
      <a href="${viewLiveHref}" class="studio-card-btn" style="text-decoration:none;">View Live</a>
    </div>
  `;
  document.body.appendChild(topBar);

  const formatBar = document.createElement('div');
  formatBar.id = 'studio-format-bar';
  formatBar.innerHTML = `
    <select id="fmt-font-family" title="Font Family">
      <option value="">Font</option>
      <option value="'Poppins', sans-serif">Poppins</option>
      <option value="Helvetica, Arial, sans-serif">Helvetica</option>
      <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
      <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
      <option value="Georgia, serif">Georgia</option>
    </select>
    <button type="button" id="fmt-size-dec" title="Decrease Size">-</button>
    <input type="number" id="fmt-font-size" min="10" max="120" value="18" style="width:52px;text-align:center;" title="Font Size (px)">
    <button type="button" id="fmt-size-inc" title="Increase Size">+</button>
    <label title="Text Color" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;border:1px solid #CBD5E1;padding:2px 6px;border-radius:6px;background:#fff;">A <input type="color" id="fmt-text-color" value="#0F172A"></label>
    <label title="Drop / Highlight Color" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;border:1px solid #CBD5E1;padding:2px 6px;border-radius:6px;background:#fff;">Drop <input type="color" id="fmt-drop-color" value="#EEF2FF"></label>
    <label title="Transparency" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;border:1px solid #CBD5E1;padding:2px 6px;border-radius:6px;background:#fff;">
      Opacity
      <input type="range" id="fmt-opacity" min="5" max="100" value="100" style="width:68px;">
      <span id="fmt-opacity-val" style="font-size:11px;">100%</span>
    </label>
    <button type="button" data-fmt-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" data-fmt-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" data-fmt-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-fmt-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <select id="fmt-effect" title="Visual Effect">
      <option value="none">Effects</option>
      <option value="shadow">Shadow</option>
      <option value="neon">Neon</option>
      <option value="outline">Outline</option>
    </select>
    <select id="fmt-animation" title="Animation">
      <option value="none">Animate</option>
      <option value="fade-in">Fade In</option>
      <option value="type">Type</option>
    </select>
    <button type="button" id="fmt-embed-ref" title="Embed Reference [#]">+ Ref [#]</button>
  `;
  document.body.appendChild(formatBar);

  const pageBar = document.createElement('div');
  pageBar.id = 'studio-page-bar';
  document.body.appendChild(pageBar);

  const leftRail = document.createElement('nav');
  leftRail.id = 'studio-left-rail';
  leftRail.innerHTML = `
    <button type="button" class="studio-rail-btn active" data-panel="pages"><span class="studio-rail-glyph">P</span><span>Pages</span></button>
    <button type="button" class="studio-rail-btn" data-panel="widgets"><span class="studio-rail-glyph">+</span><span>Widgets</span></button>
    <button type="button" class="studio-rail-btn" data-panel="text"><span class="studio-rail-glyph">T</span><span>Text</span></button>
    <button type="button" class="studio-rail-btn" data-panel="uploads"><span class="studio-rail-glyph">IMG</span><span>Uploads</span></button>
    <button type="button" class="studio-rail-btn" data-panel="brand"><span class="studio-rail-glyph">B</span><span>Brand</span></button>
    <button type="button" class="studio-rail-btn" data-panel="theme"><span class="studio-rail-glyph">UI</span><span>Theme</span></button>
    <button type="button" class="studio-rail-btn" id="studio-drawer-toggle" title="Toggle Drawer" style="margin-top:auto;"><span class="studio-rail-glyph">&lt;</span><span>Drawer</span></button>
  `;
  document.body.appendChild(leftRail);

  const sideDrawer = document.createElement('aside');
  sideDrawer.id = 'studio-side-drawer';
  sideDrawer.innerHTML = `
    <div id="spanel-pages" class="spanel-view">
      <div class="studio-drawer-header">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span style="font-weight:700;font-size:13px;">Pages</span>
          <span id="studio-drawer-page-ext" class="studio-active-page-ext">${activeTitle}</span>
        </div>
        <button type="button" id="studio-open-new-page-form" class="studio-icon-plus-btn" title="Add New Page">+</button>
      </div>

      <div id="studio-new-page-box" style="display:none;background:#F8FAFC;border:1px solid #C7D2FE;border-radius:8px;padding:10px;margin-bottom:12px;">
        <div id="studio-new-page-label" style="font-size:11px;font-weight:700;color:#3730A3;margin-bottom:6px;">NEW PAGE</div>
        <input type="hidden" id="studio-new-parent-id" value="">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <input type="text" id="studio-new-title" placeholder="Page Title (e.g. Field Notes)" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;color:#0F172A;font-size:12px;">
          <input type="text" id="studio-new-slug" placeholder="url-slug (auto-generated if empty)" style="padding:6px 8px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;color:#0F172A;font-size:12px;">
          <div style="display:flex;gap:6px;">
            <button type="button" id="studio-create-page" style="flex:1;padding:6px 10px;background:#4F46E5;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">+ Create</button>
            <button type="button" id="studio-cancel-new-page" class="studio-card-btn">Cancel</button>
          </div>
        </div>
      </div>

      <div id="pages-tree-list" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <div id="spanel-widgets" class="spanel-view" style="display:none;">
      <div class="studio-drawer-header">
        <span style="font-weight:700;font-size:13px;">Widgets</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button type="button" data-add-block="divider" class="studio-widget-btn"><span class="studio-widget-icon">—</span><span>Line</span></button>
        <button type="button" data-add-block="pdf" class="studio-widget-btn"><span class="studio-widget-icon">PDF</span><span>PDF</span></button>
        <button type="button" data-add-block="author" class="studio-widget-btn"><span class="studio-widget-icon">AU</span><span>Author</span></button>
        <button type="button" data-add-block="video" class="studio-widget-btn"><span class="studio-widget-icon">YT</span><span>Video</span></button>
        <button type="button" data-add-block="quiz" class="studio-widget-btn"><span class="studio-widget-icon">?</span><span>Quiz</span></button>
        <button type="button" data-add-block="survey" class="studio-widget-btn"><span class="studio-widget-icon">PL</span><span>Poll</span></button>
        <button type="button" data-add-block="table" class="studio-widget-btn"><span class="studio-widget-icon">TB</span><span>Table</span></button>
        <button type="button" data-add-block="chart" class="studio-widget-btn"><span class="studio-widget-icon">CH</span><span>Chart</span></button>
        <button type="button" data-add-block="references" class="studio-widget-btn" style="grid-column:span 2;"><span class="studio-widget-icon">REF</span><span>References Section</span></button>
      </div>
    </div>

    <div id="spanel-text" class="spanel-view" style="display:none;">
      <div class="studio-drawer-header">
        <span style="font-weight:700;font-size:13px;">Text Elements</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button type="button" data-add-text="h1" class="studio-widget-btn" style="font-size:13px;font-weight:700;"><span class="studio-widget-icon">H1</span><span>Add Heading</span></button>
        <button type="button" data-add-text="h2" class="studio-widget-btn" style="font-size:12px;font-weight:700;"><span class="studio-widget-icon">H2</span><span>Add Subheading</span></button>
        <button type="button" data-add-text="h3" class="studio-widget-btn" style="font-size:12px;font-weight:600;"><span class="studio-widget-icon">H3</span><span>Add Title</span></button>
        <button type="button" data-add-text="p" class="studio-widget-btn"><span class="studio-widget-icon">TX</span><span>Add Normal Text</span></button>
      </div>
    </div>

    <div id="spanel-uploads" class="spanel-view" style="display:none;">
      <div class="studio-drawer-header">
        <span style="font-weight:700;font-size:13px;">Uploads Library</span>
      </div>
      <input type="file" id="studio-upload-input" accept="image/*" style="width:100%;font-size:12px;margin-bottom:12px;border:1px solid #CBD5E1;padding:6px;border-radius:6px;background:#fff;">
      <div id="studio-uploads-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
    </div>

    <div id="spanel-brand" class="spanel-view" style="display:none;">
      <div class="studio-drawer-header">
        <span style="font-weight:700;font-size:13px;">Brand Kit</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:12px;font-weight:600;">
          Brand Logo Text
          <input type="text" id="brand-logo-text-input" value="${editorState.brand?.logoText || 'MARVEL TANG'}" style="width:100%;margin-top:4px;padding:6px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;color:#0F172A;">
        </label>
        <label style="font-size:12px;font-weight:600;">
          Brand Logo Image URL
          <input type="text" id="brand-logo-url-input" value="${editorState.brand?.logoUrl || ''}" placeholder="https://..." style="width:100%;margin-top:4px;padding:6px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;color:#0F172A;">
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;">
          <span>Primary Brand Color</span>
          <input type="color" id="brand-primary-color" value="${rgbOrHexToHex(editorState.brand?.primaryColor, '#0F172A')}">
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;">
          <span>Accent Brand Color</span>
          <input type="color" id="brand-accent-color" value="${rgbOrHexToHex(editorState.brand?.accentColor, '#71869A')}">
        </label>
      </div>
    </div>

    <div id="spanel-theme" class="spanel-view" style="display:none;">
      <div class="studio-drawer-header">
        <span style="font-weight:700;font-size:13px;">Theme Colors</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="display:flex;justify-content:space-between;font-size:12px;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;"><span>Background</span><input type="color" data-css-var="--bg-color" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--bg-color'), '#F5F5F2')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:12px;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;"><span>Text Main</span><input type="color" data-css-var="--text-main" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--text-main'), '#202124')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:12px;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;"><span>Card Surface</span><input type="color" data-css-var="--card-bg" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--card-bg'), '#FFFFFF')}"></label>
        <label style="display:flex;justify-content:space-between;font-size:12px;border:1px solid #E2E8F0;padding:6px 8px;border-radius:6px;"><span>Accent</span><input type="color" data-css-var="--slate-blue" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--slate-blue'), '#71869A')}"></label>
      </div>
    </div>
  `;
  document.body.appendChild(sideDrawer);

  const buildPageHierarchy = () => {
    const corePages = [
      { id: 'page:index', slug: 'index', isCore: true },
      { id: 'page:blog', slug: 'blog', isCore: true },
      { id: 'page:about', slug: 'about', isCore: true },
      { id: 'page:project', slug: 'project', isCore: true }
    ];
    const builtInIds = new Set(['page:index', 'page:blog', 'page:about', 'page:project', 'main']);

    const customPages = allSitePages
      .filter((r) => r.id && r.id.startsWith('page:') && !builtInIds.has(r.id))
      .map((r) => {
        const slug = r.id.replace(/^page:/, '');
        const payload = r.draft_content || r.content || {};
        return {
          id: r.id,
          slug,
          isCore: false,
          parentId: payload.meta?.parentId || '',
          title: getPageDisplayTitle(r.id, payload)
        };
      });

    const coreWithTitles = corePages.map((cp) => {
      const row = allSitePages.find((r) => r.id === cp.id);
      const payload = row ? (row.draft_content || row.content || {}) : {};
      return {
        ...cp,
        parentId: payload.meta?.parentId || '',
        title: getPageDisplayTitle(cp.id, payload)
      };
    });

    const allNodes = [...coreWithTitles, ...customPages];
    const topLevel = allNodes.filter((n) => !n.parentId);
    const childrenByParent = new Map();

    allNodes.forEach((n) => {
      if (n.parentId) {
        const arr = childrenByParent.get(n.parentId) || [];
        arr.push(n);
        childrenByParent.set(n.parentId, arr);
      }
    });

    const ordered = [];
    topLevel.forEach((parent) => {
      ordered.push({ ...parent, isSubpage: false });
      const kids = childrenByParent.get(parent.id) || [];
      kids.forEach((kid) => ordered.push({ ...kid, isSubpage: true }));
    });

    // Any subpages whose parent is not top-level
    allNodes
      .filter((n) => n.parentId && !topLevel.some((t) => t.id === n.parentId))
      .forEach((orphan) => ordered.push({ ...orphan, isSubpage: true }));

    return ordered;
  };

  const renderPagesNavigation = () => {
    const hierarchy = buildPageHierarchy();

    pageBar.innerHTML =
      `<span style="font-size:10px;font-weight:700;color:#64748B;letter-spacing:0.04em;margin-right:2px;">PAGES</span>` +
      hierarchy
        .map((node) => {
          const prefix = node.isSubpage ? '↳ ' : '';
          return `<a href="${getPageTargetUrl(node.slug, true)}" class="studio-page-pill ${node.id === PAGE_ID ? 'active' : ''}">${prefix}${node.title}</a>`;
        })
        .join('');

    const treeEl = sideDrawer.querySelector('#pages-tree-list');
    if (!treeEl) return;

    treeEl.innerHTML = hierarchy
      .map((node) => {
        const isCurrent = node.id === PAGE_ID;
        return `
          <div class="studio-page-row ${isCurrent ? 'is-current' : ''} ${node.isSubpage ? 'is-subpage' : ''}" data-page-row="${node.id}">
            <a href="${getPageTargetUrl(node.slug, true)}" class="studio-page-link" title="${node.title}">${node.isSubpage ? '↳ ' : ''}${node.title}</a>
            <button type="button" class="studio-mini-action" data-rename-page="${node.id}" data-current-title="${node.title}" title="Rename Page">Rename</button>
            <button type="button" class="studio-mini-action add-sub" data-add-subpage="${node.id}" data-parent-title="${node.title}" title="Add Subpage under ${node.title}">+ Sub</button>
            ${!node.isCore ? `<button type="button" class="studio-mini-action del" data-delete-page="${node.id}" title="Delete Page">x</button>` : ''}
          </div>
        `;
      })
      .join('');

    treeEl.querySelectorAll('[data-rename-page]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.renamePage;
        const oldTitle = btn.dataset.currentTitle || '';
        const nextTitle = prompt('Rename page:', oldTitle);
        if (!nextTitle || !nextTitle.trim()) return;
        const cleanTitle = nextTitle.trim();

        if (targetId === PAGE_ID) {
          editorState.meta = { ...(editorState.meta || {}), title: cleanTitle };
          const topBadge = document.getElementById('studio-topbar-page');
          const drawerBadge = document.getElementById('studio-drawer-page-ext');
          if (topBadge) topBadge.textContent = cleanTitle;
          if (drawerBadge) drawerBadge.textContent = cleanTitle;
          await saveDraftNow();
        } else {
          const existingRow = allSitePages.find((r) => r.id === targetId);
          const basePayload = cloneState(existingRow?.draft_content || existingRow?.content || {});
          basePayload.meta = { ...(basePayload.meta || {}), title: cleanTitle };
          await supabase.from('site_content').upsert(
            {
              id: targetId,
              draft_content: basePayload,
              content: existingRow?.content || basePayload,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
          );
          allSitePages = allSitePages.map((r) =>
            r.id === targetId ? { ...r, draft_content: basePayload } : r
          );
        }

        renderPagesNavigation();
      });
    });

    treeEl.querySelectorAll('[data-add-subpage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parentId = btn.dataset.addSubpage;
        const parentTitle = btn.dataset.parentTitle || parentId;
        const box = sideDrawer.querySelector('#studio-new-page-box');
        const label = sideDrawer.querySelector('#studio-new-page-label');
        const parentInput = sideDrawer.querySelector('#studio-new-parent-id');
        const titleInput = sideDrawer.querySelector('#studio-new-title');

        box.style.display = 'block';
        label.textContent = `NEW SUBPAGE UNDER: ${parentTitle.toUpperCase()}`;
        parentInput.value = parentId;
        titleInput.value = '';
        titleInput.focus();
      });
    });

    treeEl.querySelectorAll('[data-delete-page]').forEach((delBtn) => {
      delBtn.addEventListener('click', async () => {
        const targetId = delBtn.dataset.deletePage;
        if (!confirm(`Delete ${targetId}?`)) return;
        await supabase.from('site_content').delete().eq('id', targetId);
        allSitePages = allSitePages.filter((p) => p.id !== targetId);
        if (PAGE_ID === targetId) {
          window.location.href = getPageTargetUrl('index', true);
        } else {
          renderPagesNavigation();
        }
      });
    });
  };
  renderPagesNavigation();

  sideDrawer.querySelector('#studio-open-new-page-form').addEventListener('click', () => {
    const box = sideDrawer.querySelector('#studio-new-page-box');
    const label = sideDrawer.querySelector('#studio-new-page-label');
    const parentInput = sideDrawer.querySelector('#studio-new-parent-id');
    const titleInput = sideDrawer.querySelector('#studio-new-title');
    box.style.display = 'block';
    label.textContent = 'NEW TOP-LEVEL PAGE';
    parentInput.value = '';
    titleInput.value = '';
    titleInput.focus();
  });

  sideDrawer.querySelector('#studio-cancel-new-page').addEventListener('click', () => {
    sideDrawer.querySelector('#studio-new-page-box').style.display = 'none';
  });

  document.querySelectorAll('[data-edit-text]').forEach((el) => {
    if (isStudioUiNode(el)) return;
    const sKey = el.dataset.editText;
    el.dataset.styleKey = sKey;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed #64748B';
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
  formatBar.querySelector('#fmt-opacity').addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    formatBar.querySelector('#fmt-opacity-val').textContent = `${pct}%`;
    patchActiveStyle({ opacity: pct / 100 });
  });
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
    document.execCommand(
      'insertHTML',
      false,
      `<sup class="ref-inline-badge mono" data-ref-num="${refNum}" style="cursor:pointer;color:#4F46E5;font-weight:700;">[${refNum}]</sup>&nbsp;`
    );
    editorState = captureDomState();
    scheduleAutoSave();
  });

  const railBtns = leftRail.querySelectorAll('.studio-rail-btn[data-panel]');
  const panelViews = sideDrawer.querySelectorAll('.spanel-view');
  railBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      document.body.classList.add('studio-drawer-open');
      railBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      panelViews.forEach((v) => (v.style.display = 'none'));
      sideDrawer.querySelector(`#spanel-${btn.dataset.panel}`).style.display = 'block';
    });
  });

  leftRail.querySelector('#studio-drawer-toggle').addEventListener('click', () => {
    document.body.classList.toggle('studio-drawer-open');
  });

  const updateBrand = (patch) => {
    pushUndoSnapshot();
    editorState.brand = { ...(editorState.brand || {}), ...patch };
    applyBrandToPage(editorState.brand);
    scheduleAutoSave();
  };

  sideDrawer.querySelector('#brand-logo-text-input').addEventListener('input', (e) => updateBrand({ logoText: e.target.value }));
  sideDrawer.querySelector('#brand-logo-url-input').addEventListener('change', (e) => updateBrand({ logoUrl: e.target.value.trim() }));
  sideDrawer.querySelector('#brand-primary-color').addEventListener('input', (e) => updateBrand({ primaryColor: e.target.value }));
  sideDrawer.querySelector('#brand-accent-color').addEventListener('input', (e) => updateBrand({ accentColor: e.target.value }));

  sideDrawer.querySelectorAll('[data-add-text]').forEach((btn) => {
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

  sideDrawer.querySelectorAll('[data-add-block]').forEach((btn) => {
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

  const renderUploads = () => {
    const grid = sideDrawer.querySelector('#studio-uploads-grid');
    if (!grid) return;
    const list = editorState.uploads || [];
    if (!list.length) {
      grid.innerHTML = `<span style="grid-column:span 2;color:#64748B;font-size:12px;">No photos uploaded yet.</span>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (u) => `
      <div style="border:1px solid #CBD5E1;border-radius:8px;padding:4px;text-align:center;background:#F8FAFC;">
        <img src="${u.url}" alt="${u.name || 'Upload'}" style="width:100%;height:60px;object-fit:cover;border-radius:6px;display:block;margin-bottom:4px;">
        <button type="button" data-insert-photo="${u.url}" class="studio-card-btn" style="width:100%;padding:4px;font-size:11px;">Insert</button>
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

  sideDrawer.querySelector('#studio-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = topBar.querySelector('#studio-save-status');
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
    await saveDraftNow();
  });

  sideDrawer.querySelectorAll('input[type="color"][data-css-var]').forEach((input) => {
    input.addEventListener('input', (e) => {
      pushUndoSnapshot();
      document.documentElement.style.setProperty(e.target.dataset.cssVar, e.target.value);
      editorState.colors[e.target.dataset.cssVar] = e.target.value;
      scheduleAutoSave();
    });
  });

  sideDrawer.querySelector('#studio-create-page').addEventListener('click', async () => {
    const titleInput = sideDrawer.querySelector('#studio-new-title');
    const slugInput = sideDrawer.querySelector('#studio-new-slug');
    const parentInput = sideDrawer.querySelector('#studio-new-parent-id');

    const title = titleInput.value.trim() || 'Untitled Page';
    const rawSlug = slugInput.value.trim() || title;
    const slug = rawSlug
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
    if (!slug) return;

    const parentId = parentInput.value.trim();
    const category = parentId ? 'Subpage' : 'Parallel Page';
    const starter = {
      meta: { title, category, parentId },
      texts: {
        'parallel-kicker': category.toUpperCase(),
        'parallel-title': title,
        'parallel-subtitle': 'Add content, widgets, media, or sections below.'
      },
      textStyles: {},
      colors: editorState.colors || {},
      brand: editorState.brand || {},
      images: {},
      backgrounds: {},
      uploads: editorState.uploads || [],
      blocks: []
    };

    await supabase.from('site_content').upsert(
      {
        id: `page:${slug}`,
        draft_content: starter,
        content: publishedContentSnapshot || {},
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

    window.location.href = getPageTargetUrl(slug, true);
  });

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

  topBar.querySelector('#studio-undo-btn').addEventListener('click', handleUndo);
  topBar.querySelector('#studio-redo-btn').addEventListener('click', handleRedo);
  topBar.querySelector('#studio-save-draft-btn').addEventListener('click', saveDraftNow);
  topBar.querySelector('#studio-publish-btn').addEventListener('click', publishLiveNow);

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
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uxawnkddduhhvjhrvijn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_V8JViisHhHsXnTbx3bbtMw_nknLtOEZ';
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
const LOCAL_DRAFT_KEY = `studio_local_draft_${PAGE_ID}`;

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
    footerLogoText: 'MARVEL TANG',
    footerLogoUrl: '',
    primaryColor: '#202124',
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
let activeBoxEl = null;
let activeDrawerTab = 'pages';
let studioInitialized = false;
let magnetEnabled = true;
let isDraggingGuide = false;
let boxTransformSession = null;
const chartInstances = new Map();

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function isStudioUiNode(el) {
  if (!el || !(el instanceof Element)) return false;
  return Boolean(
    el.closest('#studio-top-bar') ||
      el.closest('#studio-format-bar') ||
      el.closest('#studio-ruler-ribbon') ||
      el.closest('#studio-drag-guide') ||
      el.closest('#studio-guide-readout') ||
      el.closest('#studio-magnet-line') ||
      el.closest('#studio-spatial-overlay') ||
      el.closest('#studio-spatial-badge') ||
      el.closest('#studio-left-rail') ||
      el.closest('#studio-side-drawer') ||
      el.classList.contains('studio-box-dot') ||
      el.classList.contains('studio-drag-pill')
  );
}

function extractYouTubeId(urlOrId = '') {
  const trimmed = (urlOrId || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : 'dQw4w9WgXcQ';
}

function toEmbedPdfUrl(url = '') {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('drive.google.com/file/d/')) {
    const id = trimmed.split('/file/d/')[1]?.split('/')[0];
    return id ? `https://drive.google.com/file/d/${id}/preview` : trimmed;
  }
  return trimmed;
}

function rgbOrHexToHex(colorVal, fallback = '#202124') {
  if (!colorVal) return fallback;
  const str = String(colorVal).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(str)) return str;
  const match = str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return fallback;
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
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

  const x = Number(styleObj.posX || 0);
  const y = Number(styleObj.posY || 0);
  el.style.setProperty('--pos-x', `${x}px`);
  el.style.setProperty('--pos-y', `${y}px`);
  if (x || y) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  } else {
    el.style.transform = '';
  }

  if (styleObj.boxWidth) {
    el.style.width = `${styleObj.boxWidth}px`;
    el.style.maxWidth = '100%';
  }
  if (styleObj.boxHeight) {
    el.style.minHeight = `${styleObj.boxHeight}px`;
  }

  el.classList.remove('fx-shadow', 'fx-neon', 'fx-outline', 'fx-shake');
  if (styleObj.effect && styleObj.effect !== 'none') {
    el.classList.add(`fx-${styleObj.effect}`);
  }

  el.classList.remove('anim-fade-in', 'anim-type', 'anim-pulse', 'anim-float', 'anim-shake');
  if (styleObj.animation && styleObj.animation !== 'none') {
    el.classList.add(`anim-${styleObj.animation}`);
  }
}

function renderBrandSlot(logoEl, logoUrl, logoText, fallbackText) {
  if (!logoEl || isStudioUiNode(logoEl)) return;
  const cleanUrl = (logoUrl || '').trim();
  const cleanText = (logoText || fallbackText || 'MARVEL TANG').trim();
  if (cleanUrl) {
    logoEl.innerHTML = `<img src="${cleanUrl}" alt="${cleanText}" style="height:28px;width:auto;max-width:180px;object-fit:contain;vertical-align:middle;">`;
  } else {
    logoEl.textContent = cleanText;
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

  const topText = brand.logoText || 'MARVEL TANG';
  const topUrl = brand.logoUrl || '';
  document.querySelectorAll('.header-brand-logo, .nav-ribbon .brand-logo').forEach((el) => {
    renderBrandSlot(el, topUrl, topText, 'MARVEL TANG');
  });

  const footText = brand.footerLogoText !== undefined && brand.footerLogoText !== '' ? brand.footerLogoText : topText;
  const footUrl = brand.footerLogoUrl !== undefined ? brand.footerLogoUrl : '';
  document.querySelectorAll('.footer-brand-logo, .global-footer .brand-logo').forEach((el) => {
    renderBrandSlot(el, footUrl, footText, topText);
  });
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
      <p data-edit-text="parallel-subtitle">Add content, templates, carousels, or sections below.</p>
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
      const path = fieldEl.dataset.blockField;
      if (path.startsWith('slides.')) {
        const [, idxStr, prop] = path.split('.');
        const idx = Number(idxStr);
        if (updated.slides && updated.slides[idx]) {
          updated.slides[idx][prop] = fieldEl.innerHTML.trim();
        }
      } else if (path.startsWith('cards.')) {
        const [, idxStr, prop] = path.split('.');
        const idx = Number(idxStr);
        if (updated.cards && updated.cards[idx]) {
          updated.cards[idx][prop] = fieldEl.innerHTML.trim();
        }
      } else {
        updated[path] = fieldEl.innerHTML.trim();
      }
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

    if (updated.type === 'list') {
      const items = [];
      el.querySelectorAll('li').forEach((li) => items.push(li.innerText.trim()));
      updated.items = items;
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
    if (img.getAttribute('src')) {
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
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
}

function applySnapshotToDom(snapshot) {
  if (!snapshot) return;
  isApplyingHistory = true;
  editorState = cloneState(snapshot);

  Object.entries(editorState.texts || {}).forEach(([key, htmlVal]) => {
    const el = document.querySelector(`[data-edit-text="${key}"]`);
    if (el && !isStudioUiNode(el)) el.innerHTML = htmlVal;
  });

  Object.entries(editorState.images || {}).forEach(([imgKey, srcVal]) => {
    const imgEl = document.querySelector(`[data-edit-img="${imgKey}"]`);
    if (imgEl && srcVal) imgEl.src = srcVal;
  });

  Object.entries(editorState.colors || {}).forEach(([cssVar, hex]) => {
    if (cssVar && hex) document.documentElement.style.setProperty(cssVar, hex);
  });

  Object.entries(editorState.backgrounds || {}).forEach(([bgKey, bgUrl]) => {
    const bgEl = document.querySelector(`[data-edit-bg="${bgKey}"]`);
    if (bgEl && bgUrl) {
      bgEl.style.backgroundImage = `linear-gradient(to top, rgba(12, 15, 20, 0.74), rgba(12, 15, 20, 0.18)), url('${bgUrl}')`;
    }
  });

  applyBrandToPage(editorState.brand);
  renderDynamicBlocks(editorState.blocks || [], true);
  bindEditableTargets();
  reapplyAllElementStyles();

  isApplyingHistory = false;
  scheduleAutoSave();
}

function handleUndo() {
  if (undoStack.length <= 1) return;
  const popped = undoStack.pop();
  redoStack.push(popped);
  const prev = undoStack[undoStack.length - 1];
  if (prev) applySnapshotToDom(prev);
}

function handleRedo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(cloneState(next));
  applySnapshotToDom(next);
}

function reapplyAllElementStyles() {
  Object.entries(editorState.textStyles || {}).forEach(([key, st]) => {
    document.querySelectorAll(`[data-style-key="${key}"], [data-box-key="${key}"], [data-edit-text="${key}"]`).forEach((el) => {
      if (!isStudioUiNode(el)) applyElementStyle(el, st);
    });
  });
}

function clearBoxHandles() {
  document.querySelectorAll('.studio-box-dot, .studio-drag-pill').forEach((node) => node.remove());
  if (activeBoxEl) {
    activeBoxEl.classList.remove('studio-selected-outline');
  }
}

function beginBoxMoveSession(boxEl, boxKey, clientX, clientY) {
  pushUndoSnapshot();
  const st = editorState.textStyles?.[boxKey] || {};
  boxTransformSession = {
    mode: 'move',
    el: boxEl,
    key: boxKey,
    startX: clientX,
    startY: clientY,
    origPosX: Number(st.posX || 0),
    origPosY: Number(st.posY || 0)
  };
}

function attachSixDotsAndMovePill(boxEl, boxKey) {
  clearBoxHandles();
  activeBoxEl = boxEl;
  boxEl.classList.add('studio-selected-outline');

  const movePill = document.createElement('span');
  movePill.className = 'studio-drag-pill';
  movePill.textContent = 'MOVE BOX';
  movePill.title = 'Drag to reposition box';
  movePill.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    beginBoxMoveSession(boxEl, boxKey, e.clientX, e.clientY);
  });
  boxEl.appendChild(movePill);

  const dots = [
    { cls: 'studio-dot-tl', handle: 'tl' },
    { cls: 'studio-dot-tc', handle: 'tc' },
    { cls: 'studio-dot-tr', handle: 'tr' },
    { cls: 'studio-dot-bl', handle: 'bl' },
    { cls: 'studio-dot-bc', handle: 'bc' },
    { cls: 'studio-dot-br', handle: 'br' }
  ];

  dots.forEach((d) => {
    const dot = document.createElement('span');
    dot.className = `studio-box-dot ${d.cls}`;
    dot.dataset.handle = d.handle;
    dot.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pushUndoSnapshot();
      const rect = boxEl.getBoundingClientRect();
      const st = editorState.textStyles?.[boxKey] || {};
      boxTransformSession = {
        mode: 'resize',
        handle: d.handle,
        el: boxEl,
        key: boxKey,
        startX: e.clientX,
        startY: e.clientY,
        origWidth: Number(st.boxWidth || rect.width),
        origHeight: Number(st.boxHeight || rect.height),
        origPosX: Number(st.posX || 0),
        origPosY: Number(st.posY || 0)
      };
    });
    boxEl.appendChild(dot);
  });
}

function updateSpatialGuidesForBox(boxEl) {
  const overlay = document.getElementById('studio-spatial-overlay');
  const badge = document.getElementById('studio-spatial-badge');
  if (!overlay || !badge || !boxEl) return;

  overlay.innerHTML = '';
  const r = boxEl.getBoundingClientRect();
  const contentEl = document.querySelector('.content-wrapper');
  const cRect = contentEl ? contentEl.getBoundingClientRect() : { left: 0, right: window.innerWidth, width: window.innerWidth };
  const centerX = cRect.left + cRect.width / 2;
  const boxCenterX = r.left + r.width / 2;

  const centerLine = document.createElement('div');
  centerLine.className = 'studio-guide-v studio-guide-center';
  centerLine.style.left = `${centerX}px`;
  overlay.appendChild(centerLine);

  const leftMargin = document.createElement('div');
  leftMargin.className = 'studio-guide-v studio-guide-margin';
  leftMargin.style.left = `${cRect.left + 56}px`;

  const rightMargin = document.createElement('div');
  rightMargin.className = 'studio-guide-v studio-guide-margin';
  rightMargin.style.left = `${cRect.right - 56}px`;
  overlay.append(leftMargin, rightMargin);

  const neighbors = Array.from(
    document.querySelectorAll('.content-wrapper .featured-card, .content-wrapper .hero-banner, .content-wrapper section')
  ).filter((el) => el !== boxEl && !el.contains(boxEl) && !boxEl.contains(el) && !isStudioUiNode(el));

  let nearestGap = null;
  for (const nb of neighbors) {
    const nr = nb.getBoundingClientRect();
    if (nr.width <= 0 || nr.height <= 0) continue;
    const alignedEdge = Math.abs(nr.left - r.left) < 12 || Math.abs(nr.right - r.right) < 12;
    const vGap = nr.top >= r.bottom ? nr.top - r.bottom : r.top >= nr.bottom ? r.top - nr.bottom : null;

    if (alignedEdge) {
      const edgeLine = document.createElement('div');
      edgeLine.className = 'studio-guide-v studio-guide-neighbor';
      edgeLine.style.left = `${nr.left}px`;
      overlay.appendChild(edgeLine);
    }

    if (vGap !== null && vGap < 240 && (nearestGap === null || vGap < nearestGap)) {
      nearestGap = Math.round(vGap);
      const hLine = document.createElement('div');
      hLine.className = 'studio-guide-h studio-guide-neighbor';
      hLine.style.top = `${nr.top >= r.bottom ? nr.top : nr.bottom}px`;
      overlay.appendChild(hLine);
    }
  }

  overlay.classList.add('active');
  const offsetFromCenter = Math.round(boxCenterX - centerX);
  const gapText = nearestGap !== null ? ` · Gap: ${nearestGap}px` : '';
  badge.textContent = `Center Δ: ${offsetFromCenter}px · W: ${Math.round(r.width)}px · H: ${Math.round(r.height)}px${gapText}`;
  badge.classList.add('active');
}

function hideSpatialGuides() {
  document.getElementById('studio-spatial-overlay')?.classList.remove('active');
  document.getElementById('studio-spatial-badge')?.classList.remove('active');
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

  const boxCandidate = el?.closest('.featured-card, .hero-banner, .dynamic-block') || null;
  if (boxCandidate && !isStudioUiNode(boxCandidate)) {
    const boxKey = boxCandidate.dataset.boxKey || `box:${boxCandidate.dataset.blockId || styleKey}`;
    boxCandidate.dataset.boxKey = boxKey;
    attachSixDotsAndMovePill(boxCandidate, boxKey);
    updateSpatialGuidesForBox(boxCandidate);
  }
}

function syncFormatBarToElement(el, styleKey) {
  const bar = document.getElementById('studio-format-bar');
  if (!bar || !el) return;
  const st = editorState.textStyles?.[styleKey] || {};
  const computedPx = parseInt(getComputedStyle(el).fontSize, 10) || 18;
  const currentOpacity =
    st.opacity !== undefined && st.opacity !== '' ? Number(st.opacity) : Number(getComputedStyle(el).opacity || 1);

  const textColorInput = bar.querySelector('#fmt-text-color');
  const dropColorInput = bar.querySelector('#fmt-drop-color');
  const fontFamilySelect = bar.querySelector('#fmt-font-family');
  const fontSizeInput = bar.querySelector('#fmt-font-size');
  const opacityInput = bar.querySelector('#fmt-opacity');
  const opacityVal = bar.querySelector('#fmt-opacity-val');

  if (textColorInput) textColorInput.value = rgbOrHexToHex(st.color || getComputedStyle(el).color, '#202124');
  if (dropColorInput) dropColorInput.value = rgbOrHexToHex(st.dropColor || '', '#EEF2FF');
  if (fontFamilySelect) fontFamilySelect.value = st.fontFamily || '';
  if (fontSizeInput) fontSizeInput.value = st.fontSize || computedPx;
  if (opacityInput) opacityInput.value = Math.round(currentOpacity * 100);
  if (opacityVal) opacityVal.textContent = `${Math.round(currentOpacity * 100)}%`;
}

function updateSelectedElementStyle(patch) {
  if (!activeEditableEl || !activeStyleKey) return;
  pushUndoSnapshot();
  editorState.textStyles = editorState.textStyles || {};
  editorState.textStyles[activeStyleKey] = {
    ...(editorState.textStyles[activeStyleKey] || {}),
    ...patch
  };
  applyElementStyle(activeEditableEl, editorState.textStyles[activeStyleKey]);
  syncFormatBarToElement(activeEditableEl, activeStyleKey);
  scheduleAutoSave();
}

async function applyEffectToCurrentPage(effectVal, animationVal) {
  pushUndoSnapshot();
  editorState.textStyles = editorState.textStyles || {};
  const targets = Array.from(
    document.querySelectorAll('[data-edit-text], .featured-card, .hero-banner, [data-block-field]')
  ).filter((el) => !isStudioUiNode(el));

  targets.forEach((el, idx) => {
    const key = el.dataset.styleKey || el.dataset.editText || el.dataset.boxKey || `auto-fx-${idx}`;
    el.dataset.styleKey = key;
    const prev = editorState.textStyles[key] || {};
    const nextStyle = { ...prev };
    if (effectVal !== undefined) nextStyle.effect = effectVal;
    if (animationVal !== undefined) nextStyle.animation = animationVal;
    editorState.textStyles[key] = nextStyle;
    applyElementStyle(el, nextStyle);
  });

  if (activeEditableEl && activeStyleKey) {
    syncFormatBarToElement(activeEditableEl, activeStyleKey);
  }
  scheduleAutoSave();
}

async function applyEffectAcrossAllPages(effectVal, animationVal) {
  await applyEffectToCurrentPage(effectVal, animationVal);
  await loadAllSitePages();

  for (const pg of allSitePages) {
    const payload = cloneState(pg.payload || {});
    payload.textStyles = payload.textStyles || {};
    Object.keys(payload.texts || {}).forEach((k) => {
      payload.textStyles[k] = {
        ...(payload.textStyles[k] || {}),
        ...(effectVal !== undefined ? { effect: effectVal } : {}),
        ...(animationVal !== undefined ? { animation: animationVal } : {})
      };
    });
    if (pg.page_id === PAGE_ID) {
      payload.textStyles = { ...payload.textStyles, ...(editorState.textStyles || {}) };
    }
    await supabase
      .from('site_pages')
      .upsert({ page_id: pg.page_id, payload, updated_at: new Date().toISOString() }, { onConflict: 'page_id' });
  }
  const statusEl = document.getElementById('studio-save-status');
  if (statusEl) statusEl.textContent = 'Applied to all pages ✓';
}

function moveBlockById(id, mode) {
  const list = editorState.blocks || [];
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return;

  pushUndoSnapshot();
  const [moved] = list.splice(idx, 1);

  if (mode === 'up' && idx > 0) {
    list.splice(idx - 1, 0, moved);
  } else if (mode === 'down' && idx <= list.length) {
    list.splice(Math.min(idx + 1, list.length), 0, moved);
  } else if (mode === 'top') {
    list.unshift(moved);
  } else {
    list.splice(idx, 0, moved);
  }

  const isEditMode = new URLSearchParams(window.location.search).get('edit') === 'true';
  renderDynamicBlocks(list, isEditMode);
  if (isEditMode) bindEditableTargets();
  scheduleAutoSave();
}

function bindEditableTargets() {
  document.querySelectorAll('[data-edit-text]').forEach((el) => {
    if (isStudioUiNode(el)) return;
    el.setAttribute('contenteditable', 'true');
    const key = el.dataset.editText;
    el.dataset.styleKey = key;
    if (editorState.textStyles?.[key]) {
      applyElementStyle(el, editorState.textStyles[key]);
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEditableElement(el, key);
    });
    el.addEventListener('input', () => scheduleAutoSave());
    el.addEventListener('blur', () => {
      pushUndoSnapshot();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('.featured-card, .hero-banner').forEach((cardEl, i) => {
    if (isStudioUiNode(cardEl)) return;
    const bKey = cardEl.dataset.boxKey || `card-box-${i}`;
    cardEl.dataset.boxKey = bKey;
    if (editorState.textStyles?.[bKey]) {
      applyElementStyle(cardEl, editorState.textStyles[bKey]);
    }
    cardEl.addEventListener('mousedown', (e) => {
      if (isStudioUiNode(e.target)) return;
      if (e.target.closest('[contenteditable="true"], a, button, input, select, textarea')) return;
      attachSixDotsAndMovePill(cardEl, bKey);
      updateSpatialGuidesForBox(cardEl);
      beginBoxMoveSession(cardEl, bKey, e.clientX, e.clientY);
    });
  });

  document.querySelectorAll('#dynamic-blocks-container [data-block-field]').forEach((el) => {
    const key = el.dataset.styleKey || `${el.closest('[data-block-id]')?.dataset.blockId}:${el.dataset.blockField}`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectEditableElement(el, key);
    });
    el.addEventListener('input', () => scheduleAutoSave());
    el.addEventListener('blur', () => {
      pushUndoSnapshot();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-remove-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.removeBlock;
      pushUndoSnapshot();
      editorState.blocks = (editorState.blocks || []).filter((b) => b.id !== id);
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-move-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveBlockById(btn.dataset.moveBlock, btn.dataset.dir || 'up');
    });
  });

  document.querySelectorAll('[data-yt-url]').forEach((input) => {
    input.addEventListener('change', () => {
      const block = (editorState.blocks || []).find((b) => b.id === input.dataset.ytUrl);
      if (!block) return;
      pushUndoSnapshot();
      block.ytUrl = input.value.trim();
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-yt-autoplay]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const block = (editorState.blocks || []).find((b) => b.id === chk.dataset.ytAutoplay);
      if (!block) return;
      pushUndoSnapshot();
      block.autoplay = chk.checked;
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-pdf-url]').forEach((input) => {
    input.addEventListener('change', () => {
      const block = (editorState.blocks || []).find((b) => b.id === input.dataset.pdfUrl);
      if (!block) return;
      pushUndoSnapshot();
      block.pdfUrl = input.value.trim();
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-embed-url]').forEach((input) => {
    input.addEventListener('change', () => {
      const block = (editorState.blocks || []).find((b) => b.id === input.dataset.embedUrl);
      if (!block) return;
      pushUndoSnapshot();
      block.embedUrl = input.value.trim();
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-project-url]').forEach((input) => {
    input.addEventListener('change', () => {
      const block = (editorState.blocks || []).find((b) => b.id === input.dataset.projectUrl);
      if (!block) return;
      pushUndoSnapshot();
      block.url = input.value.trim();
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-slide-img]').forEach((input) => {
    input.addEventListener('change', () => {
      const [blockId, idxStr] = input.dataset.slideImg.split('::');
      const block = (editorState.blocks || []).find((b) => b.id === blockId);
      const sIdx = Number(idxStr);
      if (!block || !block.slides || !block.slides[sIdx]) return;
      pushUndoSnapshot();
      block.slides[sIdx].imageUrl = input.value.trim();
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-add-slide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const block = (editorState.blocks || []).find((b) => b.id === btn.dataset.addSlide);
      if (!block) return;
      pushUndoSnapshot();
      block.slides = block.slides || [];
      block.slides.push({
        imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
        caption: `Slide ${block.slides.length + 1} — Research & field note`
      });
      block.activeIndex = block.slides.length - 1;
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });

  document.querySelectorAll('[data-tpl-img]').forEach((input) => {
    input.addEventListener('change', () => {
      const [blockId, fieldName] = input.dataset.tplImg.split('::');
      const block = (editorState.blocks || []).find((b) => b.id === blockId);
      if (!block) return;
      pushUndoSnapshot();
      if (fieldName.startsWith('cardImg_')) {
        const cIdx = Number(fieldName.replace('cardImg_', ''));
        if (block.cards && block.cards[cIdx]) {
          block.cards[cIdx].imageUrl = input.value.trim();
        }
      } else {
        block[fieldName] = input.value.trim();
      }
      renderDynamicBlocks(editorState.blocks, true);
      bindEditableTargets();
      scheduleAutoSave();
    });
  });
}

function bindCarouselControls(wrapper, block, isEditMode) {
  const slides = Array.isArray(block.slides) && block.slides.length
    ? block.slides
    : [
        {
          imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
          caption: 'Coastal observation & field study'
        }
      ];
  let idx = Math.min(Math.max(Number(block.activeIndex || 0), 0), slides.length - 1);

  const showSlide = (nextIdx) => {
    idx = (nextIdx + slides.length) % slides.length;
    block.activeIndex = idx;
    wrapper.querySelectorAll('.carousel-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    wrapper.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  };

  showSlide(idx);
  wrapper.querySelector('[data-carousel-prev]')?.addEventListener('click', () => showSlide(idx - 1));
  wrapper.querySelector('[data-carousel-next]')?.addEventListener('click', () => showSlide(idx + 1));
  wrapper.querySelectorAll('[data-carousel-dot]').forEach((dot) => {
    dot.addEventListener('click', () => showSlide(Number(dot.dataset.carouselDot)));
  });

  if (isEditMode) {
    const activeUrlInput = wrapper.querySelector('[data-active-slide-url]');
    if (activeUrlInput) {
      activeUrlInput.value = slides[idx]?.imageUrl || '';
      activeUrlInput.dataset.slideImg = `${block.id}::${idx}`;
    }
  }
}

function renderTemplateHtml(block, isEditMode, styleKeyPrefix) {
  const tpl = block.templateId || 'two-col-text';
  const hKey = `${styleKeyPrefix}:heading`;
  const bKey = `${styleKeyPrefix}:body`;

  if (tpl === 'split-photo') {
    return `
      <span class="mono">TEMPLATE // SPLIT + IMAGE SLOT</span>
      <div class="tpl-grid-2" style="align-items:center;">
        <div>
          <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}">${block.heading || 'Editorial Feature With Visual'}</h3>
          <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${bKey}">${block.body || 'Pair concise strategic framing with a dedicated image slot.'}</p>
          ${isEditMode ? `<input type="text" data-tpl-img="${block.id}::imageUrl" value="${block.imageUrl || ''}" placeholder="Image URL" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);">` : ''}
        </div>
        <div>
          ${block.imageUrl ? `<img src="${block.imageUrl}" alt="${block.heading || 'Feature'}" class="tpl-img-slot" style="height:260px;">` : `<div class="tpl-img-slot" style="height:260px;display:flex;align-items:center;justify-content:center;"><span class="mono">IMAGE SLOT</span></div>`}
        </div>
      </div>
    `;
  }

  if (tpl === 'hero-feature') {
    return `
      <span class="mono">TEMPLATE // HERO FEATURE + IMAGE SLOT</span>
      ${block.imageUrl ? `<img src="${block.imageUrl}" alt="${block.heading || 'Hero'}" class="tpl-img-slot" style="height:280px;margin:14px 0 18px 0;">` : `<div class="tpl-img-slot" style="height:240px;margin:14px 0 18px 0;display:flex;align-items:center;justify-content:center;"><span class="mono">HERO IMAGE SLOT</span></div>`}
      ${isEditMode ? `<input type="text" data-tpl-img="${block.id}::imageUrl" value="${block.imageUrl || ''}" placeholder="Hero image URL" style="width:100%;padding:6px;margin-bottom:12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);">` : ''}
      <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}">${block.heading || 'Flagship Case or Essay Title'}</h3>
      <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${bKey}" style="margin-bottom:0;">${block.body || 'Lead statement highlighting the core market question and outcome.'}</p>
    `;
  }

  if (tpl === 'gallery-trio') {
    const cards = block.cards || [
      { title: 'Frame 01', body: 'Observation note', imageUrl: '' },
      { title: 'Frame 02', body: 'Observation note', imageUrl: '' },
      { title: 'Frame 03', body: 'Observation note', imageUrl: '' }
    ];
    return `
      <span class="mono">TEMPLATE // 3-SLOT VISUAL STRIP</span>
      <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Visual Sequence'}</h3>
      <div class="tpl-grid-3">
        ${cards
          .map(
            (c, i) => `
          <div>
            ${c.imageUrl ? `<img src="${c.imageUrl}" alt="${c.title}" class="tpl-img-slot" style="height:170px;margin-bottom:10px;">` : `<div class="tpl-img-slot" style="height:170px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;"><span class="mono">SLOT ${i + 1}</span></div>`}
            ${isEditMode ? `<input type="text" data-tpl-img="${block.id}::cardImg_${i}" value="${c.imageUrl || ''}" placeholder="Image URL ${i + 1}" style="width:100%;padding:5px;margin-bottom:8px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);font-size:11px;">` : ''}
            <h4 contenteditable="${isEditMode}" data-block-field="cards.${i}.title" style="font-size:1rem;margin-bottom:6px;">${c.title}</h4>
            <p contenteditable="${isEditMode}" data-block-field="cards.${i}.body" style="font-size:0.88rem;margin-bottom:0;">${c.body}</p>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  if (tpl === 'case-study-split') {
    return `
      <span class="mono">TEMPLATE // CASE BRIEF + IMAGE SLOT</span>
      <div class="tpl-grid-2">
        <div>
          <span class="mono" contenteditable="${isEditMode}" data-block-field="metric">${block.metric || 'OUTCOME // +34% ENGAGEMENT'}</span>
          <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Brand & Strategy Sprint'}</h3>
          <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${bKey}" style="margin-bottom:0;">${block.body || 'Context, diagnostic insight, execution plan, and measurable result.'}</p>
        </div>
        <div>
          ${block.imageUrl ? `<img src="${block.imageUrl}" alt="${block.heading || 'Case'}" class="tpl-img-slot" style="height:220px;">` : `<div class="tpl-img-slot" style="height:220px;display:flex;align-items:center;justify-content:center;"><span class="mono">CASE VISUAL SLOT</span></div>`}
          ${isEditMode ? `<input type="text" data-tpl-img="${block.id}::imageUrl" value="${block.imageUrl || ''}" placeholder="Case image URL" style="width:100%;padding:6px;margin-top:8px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);">` : ''}
        </div>
      </div>
    `;
  }

  if (tpl === 'thesis-grid') {
    const cards = block.cards || [
      { title: '01 / Positioning', body: 'Clear differentiation over crowded features.' },
      { title: '02 / Behavior', body: 'Watch what people choose under real constraints.' },
      { title: '03 / Systems', body: 'Repeatable workflows beat one-off bursts.' }
    ];
    return `
      <span class="mono">TEMPLATE // 3-PILLAR TEXT GRID (NO IMAGES)</span>
      <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Core Thesis Pillars'}</h3>
      <div class="tpl-grid-3">
        ${cards
          .map(
            (c, i) => `
          <div style="padding:18px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-color);">
            <h4 contenteditable="${isEditMode}" data-block-field="cards.${i}.title" style="font-size:1rem;margin-bottom:8px;">${c.title}</h4>
            <p contenteditable="${isEditMode}" data-block-field="cards.${i}.body" style="font-size:0.9rem;margin-bottom:0;">${c.body}</p>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  if (tpl === 'brief-memo') {
    return `
      <span class="mono" contenteditable="${isEditMode}" data-block-field="kicker">${block.kicker || 'TEMPLATE // EXECUTIVE BRIEF (NO IMAGE)'}</span>
      <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Strategic Memo Summary'}</h3>
      <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${bKey}">${block.body || 'Concise summary of problem statement, hypotheses, and recommended next steps without heavy imagery.'}</p>
      <p contenteditable="${isEditMode}" data-block-field="footnote" class="mono" style="margin-bottom:0;">${block.footnote || 'STATUS // VERIFIED NOTES'}</p>
    `;
  }

  if (tpl === 'index-ledger') {
    const cards = block.cards || [
      { title: 'Entry A — Market Signal', body: 'Early shift in demand pattern.' },
      { title: 'Entry B — Execution Friction', body: 'Bottleneck identified in user journey.' }
    ];
    return `
      <span class="mono">TEMPLATE // INDEX LEDGER (NO IMAGE)</span>
      <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Research Log'}</h3>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:14px;">
        ${cards
          .map(
            (c, i) => `
          <div style="padding-bottom:14px;border-bottom:1px solid var(--border-color);">
            <strong contenteditable="${isEditMode}" data-block-field="cards.${i}.title" style="display:block;margin-bottom:4px;">${c.title}</strong>
            <p contenteditable="${isEditMode}" data-block-field="cards.${i}.body" style="margin-bottom:0;">${c.body}</p>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  return `
    <span class="mono">TEMPLATE // TWO-COLUMN ESSAY (NO IMAGE)</span>
    <h3 contenteditable="${isEditMode}" data-block-field="heading" data-style-key="${hKey}" style="margin-top:8px;">${block.heading || 'Comparative Analysis'}</h3>
    <div class="tpl-grid-2">
      <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${bKey}" style="margin-bottom:0;">${block.body || 'Left column: unpack the hypothesis, market context, and observable signal.'}</p>
      <p contenteditable="${isEditMode}" data-block-field="rightCol" style="margin-bottom:0;">${block.rightCol || 'Right column: unpack the counter-argument, trade-off, and practical implication.'}</p>
    </div>
  `;
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
    const boxKey = `box:${block.id}`;
    wrapper.dataset.boxKey = boxKey;

    const controlsHtml = isEditMode
      ? `<div style="float:right;display:flex;gap:6px;margin-bottom:10px;">
           <button type="button" data-move-block="${block.id}" data-dir="top" class="studio-card-btn" title="Move to Top">Top</button>
           <button type="button" data-move-block="${block.id}" data-dir="up" class="studio-card-btn" title="Move Up">↑</button>
           <button type="button" data-move-block="${block.id}" data-dir="down" class="studio-card-btn" title="Move Down">↓</button>
           <button type="button" data-remove-block="${block.id}" class="studio-card-btn">Remove</button>
         </div>`
      : '';

    const styleKeyPrefix = `block:${block.id}`;

    if (block.type === 'big-showcase') {
      const sKey = `${styleKeyPrefix}:headline`;
      const imgUrl = block.imageUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=85';
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <div class="big-showcase-grid">
            <div>
              <span class="mono" contenteditable="${isEditMode}" data-block-field="kicker">${block.kicker || 'VISUAL SHOWCASE'}</span>
              <h2 class="big-showcase-display" contenteditable="${isEditMode}" data-block-field="headline" data-style-key="${sKey}">${block.headline || 'BRANDS BUILT TO BE TRUSTED.'}</h2>
              <p contenteditable="${isEditMode}" data-block-field="body" style="margin-top:16px;margin-bottom:0;">${block.body || 'Big editorial statement paired with a high-impact visual frame.'}</p>
            </div>
            <div>
              <img src="${imgUrl}" alt="${block.headline || 'Showcase'}" class="big-showcase-img">
              ${isEditMode ? `<input type="text" data-tpl-img="${block.id}::imageUrl" value="${block.imageUrl || ''}" placeholder="Showcase image URL" style="width:100%;padding:6px;margin-top:10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);">` : ''}
            </div>
          </div>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${sKey}"]`), editorState.textStyles?.[sKey]);
    } else if (block.type === 'text-node') {
      const tagMap = { h1: 'h1', h2: 'h2', h3: 'h3', p: 'p' };
      const tag = tagMap[block.tag] || 'p';
      const fKey = `${styleKeyPrefix}:content`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <${tag} contenteditable="${isEditMode}" data-block-field="content" data-style-key="${fKey}">${block.content || 'Editable text block — click to edit.'}</${tag}>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${fKey}"]`), editorState.textStyles?.[fKey]);
    } else if (block.type === 'info') {
      const infoKey = `${styleKeyPrefix}:infoBody`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono" contenteditable="${isEditMode}" data-block-field="tag">${block.tag || 'INFO // NOTE'}</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Information Block'}</h3>
          <p contenteditable="${isEditMode}" data-block-field="infoBody" data-style-key="${infoKey}" style="margin-bottom:0;">${block.infoBody || 'Add background context, key dates, specs, or reference notes here.'}</p>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${infoKey}"]`), editorState.textStyles?.[infoKey]);
    } else if (block.type === 'project-link') {
      const pKey = `${styleKeyPrefix}:summary`;
      const safeHref = block.url && /^https?:\/\//i.test(block.url.trim()) ? block.url.trim() : '#';
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <div class="featured-meta">
            <span class="mono" contenteditable="${isEditMode}" data-block-field="badge">${block.badge || 'PROJECT LINK'}</span>
            <span class="mono" contenteditable="${isEditMode}" data-block-field="status">${block.status || 'LIVE // SUPABASE SYNCED'}</span>
          </div>
          <h3 contenteditable="${isEditMode}" data-block-field="title">${block.title || 'Featured Project'}</h3>
          <p contenteditable="${isEditMode}" data-block-field="summary" data-style-key="${pKey}">${block.summary || 'Interactive build or case study synced to Supabase.'}</p>
          ${isEditMode ? `<div style="margin-bottom:14px;"><input type="text" data-project-url="${block.id}" value="${block.url || ''}" placeholder="https://..." style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);font-size:12px;"></div>` : ''}
          <a href="${safeHref}" target="_blank" rel="noopener" class="read-link">Open Project &rarr;</a>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${pKey}"]`), editorState.textStyles?.[pKey]);
    } else if (block.type === 'carousel') {
      const slides = Array.isArray(block.slides) && block.slides.length
        ? block.slides
        : [
            {
              imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
              caption: 'Slide 1 — Visual study'
            },
            {
              imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
              caption: 'Slide 2 — Strategy & workspace note'
            }
          ];

      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <div class="featured-meta">
            <span class="mono">CAROUSEL</span>
            ${isEditMode ? `<button type="button" data-add-slide="${block.id}" class="studio-card-btn">+ Add Slide</button>` : ''}
          </div>
          <h3 contenteditable="${isEditMode}" data-block-field="title">${block.title || 'Visual Carousel'}</h3>
          ${
            isEditMode
              ? `<div style="margin-bottom:10px;"><input type="text" data-active-slide-url="${block.id}" value="" placeholder="Active slide image URL" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);font-size:12px;"></div>`
              : ''
          }
          <div class="carousel-stage">
            ${slides
              .map(
                (sl, sIdx) => `
              <div class="carousel-slide ${sIdx === (block.activeIndex || 0) ? 'active' : ''}">
                <img src="${sl.imageUrl}" alt="${sl.caption || `Slide ${sIdx + 1}`}">
                <div class="carousel-caption-bar">
                  <p contenteditable="${isEditMode}" data-block-field="slides.${sIdx}.caption" style="margin:0;font-size:0.92rem;">${sl.caption || ''}</p>
                  <span class="mono">${sIdx + 1} / ${slides.length}</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
          <div class="carousel-controls">
            <div style="display:flex;gap:8px;">
              <button type="button" data-carousel-prev class="studio-card-btn">&larr; Prev</button>
              <button type="button" data-carousel-next class="studio-card-btn">Next &rarr;</button>
            </div>
            <div class="carousel-dots">
              ${slides
                .map((_, sIdx) => `<button type="button" data-carousel-dot="${sIdx}" class="carousel-dot ${sIdx === (block.activeIndex || 0) ? 'active' : ''}" aria-label="Slide ${sIdx + 1}"></button>`)
                .join('')}
            </div>
          </div>
        </div>
      `;
      bindCarouselControls(wrapper, block, isEditMode);
    } else if (block.type === 'template') {
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          ${renderTemplateHtml(block, isEditMode, styleKeyPrefix)}
        </div>
      `;
      const hEl = wrapper.querySelector(`[data-style-key="${styleKeyPrefix}:heading"]`);
      const bEl = wrapper.querySelector(`[data-style-key="${styleKeyPrefix}:body"]`);
      if (hEl) applyElementStyle(hEl, editorState.textStyles?.[`${styleKeyPrefix}:heading`]);
      if (bEl) applyElementStyle(bEl, editorState.textStyles?.[`${styleKeyPrefix}:body`]);
    } else if (block.type === 'divider') {
      wrapper.innerHTML = `
        ${controlsHtml}
        <hr style="border:none;border-top:1.5px solid var(--border-color);margin:16px 0;">
      `;
    } else if (block.type === 'quote') {
      const qKey = `${styleKeyPrefix}:quote`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <blockquote class="featured-card" style="border-left:4px solid var(--text-main);">
          <p contenteditable="${isEditMode}" data-block-field="quote" data-style-key="${qKey}" style="font-size:1.25rem;font-weight:600;color:var(--text-main);">${block.quote || 'A sharp strategic observation goes here.'}</p>
          <span class="mono" contenteditable="${isEditMode}" data-block-field="cite">${block.cite || 'MARVEL TANG // FIELD NOTE'}</span>
        </blockquote>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${qKey}"]`), editorState.textStyles?.[qKey]);
    } else if (block.type === 'callout') {
      const cKey = `${styleKeyPrefix}:body`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card" style="background:var(--soft-silver);">
          <span class="mono" contenteditable="${isEditMode}" data-block-field="label">${block.label || 'KEY TAKEAWAY'}</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Highlighted Framework'}</h3>
          <p contenteditable="${isEditMode}" data-block-field="body" data-style-key="${cKey}" style="margin-bottom:0;">${block.body || 'Summarize the core insight or action step here.'}</p>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${cKey}"]`), editorState.textStyles?.[cKey]);
    } else if (block.type === 'list') {
      const items = Array.isArray(block.items) && block.items.length
        ? block.items
        : ['First point or finding', 'Second point or observation', 'Third actionable step'];
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">INDEX LIST</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Structured Notes'}</h3>
          <ul style="padding-left:20px;display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            ${items.map((item) => `<li contenteditable="${isEditMode}">${item}</li>`).join('')}
          </ul>
        </div>
      `;
    } else if (block.type === 'pdf') {
      const pdfUrl = toEmbedPdfUrl(block.pdfUrl || '');
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">PDF DOCUMENT</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Research Document'}</h3>
          ${isEditMode ? `<div style="margin:8px 0;"><input type="text" data-pdf-url="${block.id}" value="${block.pdfUrl || ''}" placeholder="Paste PDF URL or Google Drive link" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);"></div>` : ''}
          ${
            pdfUrl
              ? `<div class="embed-container" style="height:460px;"><iframe src="${pdfUrl}" title="${block.title || 'PDF'}" loading="lazy"></iframe></div>`
              : `<p class="mono">Add a PDF URL to preview document.</p>`
          }
        </div>
      `;
    } else if (block.type === 'embed') {
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">INTERACTIVE EMBED</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Embedded App or Deck'}</h3>
          ${isEditMode ? `<div style="margin:8px 0;"><input type="text" data-embed-url="${block.id}" value="${block.embedUrl || ''}" placeholder="Paste embed URL (https://...)" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);"></div>` : ''}
          ${
            block.embedUrl
              ? `<div class="embed-container"><iframe src="${block.embedUrl}" title="${block.title || 'Embed'}" loading="lazy"></iframe></div>`
              : `<p class="mono">Paste an embed URL above to display interactive content.</p>`
          }
        </div>
      `;
    } else if (block.type === 'author') {
      const aKey = `${styleKeyPrefix}:bio`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
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
        ${controlsHtml}
        <div class="featured-card">
          <div class="featured-meta">
            <span class="mono">YOUTUBE VIDEO</span>
            <label class="mono" style="cursor:pointer;">
              <input type="checkbox" data-yt-autoplay="${block.id}" ${autoplay ? 'checked' : ''} ${!isEditMode ? 'disabled' : ''}> Autoplay on page load
            </label>
          </div>
          <h3 contenteditable="${isEditMode}" data-block-field="title">${block.title || 'Embedded Video'}</h3>
          ${isEditMode ? `<div style="margin-bottom:10px;"><input type="text" data-yt-url="${block.id}" value="${block.ytUrl || ''}" placeholder="Paste YouTube URL or Video ID" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-main);"></div>` : ''}
          <div class="embed-container" style="height:420px;">
            <iframe src="${embedSrc}" title="${block.title || 'YouTube Video'}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
          </div>
        </div>
      `;
    } else if (block.type === 'image') {
      const iKey = `${styleKeyPrefix}:caption`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">VISUAL</span>
          ${block.url ? `<img src="${block.url}" alt="${block.caption || 'Visual'}" style="width:100%;max-height:480px;object-fit:cover;border-radius:8px;margin:14px 0;">` : `<p class="mono" style="margin:12px 0;">Upload or link an image in Studio mode.</p>`}
          <p contenteditable="${isEditMode}" data-block-field="caption" data-style-key="${iKey}" style="margin:0;">${block.caption || 'Add a bold caption...'}</p>
        </div>
      `;
      applyElementStyle(wrapper.querySelector(`[data-style-key="${iKey}"]`), editorState.textStyles?.[iKey]);
    } else if (block.type === 'table') {
      const rows = Array.isArray(block.rows) && block.rows.length
        ? block.rows
        : [['Metric', 'Observation', 'Takeaway'], ['Sample', 'Value', 'Note']];
      const rowsHtml = rows
        .map((row, rIdx) => {
          const cellsHtml = row
            .map((cell) => {
              const tag = rIdx === 0 ? 'th' : 'td';
              return `<${tag} contenteditable="${isEditMode}" style="border:1px solid var(--border-color);padding:10px 12px;text-align:left;">${cell}</${tag}>`;
            })
            .join('');
          return `<tr>${cellsHtml}</tr>`;
        })
        .join('');
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">DATA MATRIX</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Comparison Table'}</h3>
          <div style="overflow-x:auto;margin-top:12px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.92rem;">${rowsHtml}</table>
          </div>
        </div>
      `;
    } else if (block.type === 'chart' && typeof Chart !== 'undefined') {
      const canvasId = `chart-${block.id || idx}`;
      wrapper.innerHTML = `
        ${controlsHtml}
        <div class="featured-card">
          <span class="mono">CHART</span>
          <h3 contenteditable="${isEditMode}" data-block-field="title" style="margin-top:8px;">${block.title || 'Data Chart'}</h3>
          <div style="position:relative;height:280px;margin-top:14px;">
            <canvas id="${canvasId}"></canvas>
          </div>
        </div>
      `;
      const canvas = wrapper.querySelector(`#${canvasId}`);
      if (canvas) {
        const chart = new Chart(canvas.getContext('2d'), {
          type: block.chartType || 'bar',
          data: {
            labels: block.labels || ['Q1', 'Q2', 'Q3', 'Q4'],
            datasets: [
              {
                label: block.datasetLabel || 'Index',
                data: block.values || [24, 38, 31, 49],
                backgroundColor: 'rgba(113, 134, 154, 0.45)',
                borderColor: '#71869A',
                borderWidth: 1.5
              }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
        chartInstances.set(canvasId, chart);
      }
    }

    if (editorState.textStyles?.[boxKey]) {
      applyElementStyle(wrapper, editorState.textStyles[boxKey]);
    }
    container.appendChild(wrapper);
  });
}

function addBlock(type, templateId = 'two-col-text') {
  pushUndoSnapshot();
  editorState.blocks = editorState.blocks || [];
  const id = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const templates = {
    'big-showcase': {
      id,
      type: 'big-showcase',
      kicker: 'BIG SHOWCASE',
      headline: 'BRANDS BUILT TO BE TRUSTED.',
      body: 'Large visual frame paired with bold editorial copy.',
      imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=85'
    },
    'text-node': { id, type: 'text-node', tag: 'p', content: 'New editorial paragraph — click to edit.' },
    info: { id, type: 'info', tag: 'INFO // NOTE', title: 'Information Block', infoBody: 'Add detailed context, notes, or references.' },
    'project-link': {
      id,
      type: 'project-link',
      badge: 'PROJECT LINK',
      status: 'LIVE // SUPABASE',
      title: 'Project Entry',
      summary: 'Moveable project link block synced to Supabase.',
      url: 'https://marveltang.com'
    },
    carousel: {
      id,
      type: 'carousel',
      title: 'Featured Carousel',
      activeIndex: 0,
      slides: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
          caption: 'Slide 1 — Coastal & brand observation'
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80',
          caption: 'Slide 2 — Strategy & digital craft'
        }
      ]
    },
    template: {
      id,
      type: 'template',
      templateId,
      heading: 'Structured Layout Template',
      body: 'Edit copy directly on the canvas.',
      rightCol: 'Secondary column notes.',
      imageUrl: ''
    },
    divider: { id, type: 'divider' },
    quote: { id, type: 'quote', quote: 'Strategy starts where assumptions stop.', cite: 'MARVEL TANG // NOTE' },
    callout: { id, type: 'callout', label: 'TAKEAWAY', title: 'Core Strategic Insight', body: 'Add supporting analysis or next steps here.' },
    list: { id, type: 'list', title: 'Checklist', items: ['Item one', 'Item two', 'Item three'] },
    image: { id, type: 'image', url: '', caption: 'Visual highlight caption' },
    video: { id, type: 'video', title: 'Featured Video', ytUrl: '', autoplay: false },
    embed: { id, type: 'embed', title: 'Embedded Resource', embedUrl: '' },
    pdf: { id, type: 'pdf', title: 'Research Report', pdfUrl: '' },
    author: { id, type: 'author', name: 'Marvel Tang', bio: 'Marketing & Management @ HKUST.', avatarUrl: '' },
    table: { id, type: 'table', title: 'Benchmark Comparison', rows: [['Criteria', 'Option A', 'Option B'], ['Focus', 'Brand', 'Growth']] },
    chart: { id, type: 'chart', title: 'Quarterly Index', chartType: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [28, 36, 42, 54] }
  };

  editorState.blocks.push(templates[type] || templates['text-node']);
  renderDynamicBlocks(editorState.blocks, true);
  bindEditableTargets();
  scheduleAutoSave();
}

async function saveToSupabase(statusLabel = 'Saved') {
  const payload = captureDomState();
  editorState = cloneState(payload);

  try {
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(payload));
  } catch (_) {}

  const statusEl = document.getElementById('studio-save-status');
  if (statusEl) statusEl.textContent = 'Saving...';

  const { error } = await supabase
    .from('site_pages')
    .upsert({ page_id: PAGE_ID, payload, updated_at: new Date().toISOString() }, { onConflict: 'page_id' });

  if (error) {
    console.warn('Supabase write fallback:', error.message);
    if (statusEl) statusEl.textContent = `${statusLabel} (Local Draft)`;
    return false;
  }

  publishedContentSnapshot = cloneState(payload);
  if (statusEl) statusEl.textContent = `${statusLabel} ✓`;
  return true;
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToSupabase('Draft saved');
  }, 1400);
}

async function loadAllSitePages() {
  const { data } = await supabase.from('site_pages').select('page_id, payload');
  const defaultIds = ['page:index', 'page:blog', 'page:about', 'page:project'];
  const map = new Map();

  defaultIds.forEach((id) => map.set(id, { page_id: id, payload: {} }));
  (data || []).forEach((row) => map.set(row.page_id, row));
  map.set(PAGE_ID, { page_id: PAGE_ID, payload: captureDomState() });

  allSitePages = Array.from(map.values());
}

async function uploadFileToSupabase(file) {
  if (!file) return null;
  const cleanName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `studio/${cleanName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl || '';
  if (publicUrl) {
    pushUndoSnapshot();
    editorState.uploads = editorState.uploads || [];
    editorState.uploads.unshift({ name: file.name, url: publicUrl, createdAt: Date.now() });
    scheduleAutoSave();
  }
  return publicUrl;
}

function renderWidgetPreviewHtml(type) {
  if (type === 'big-showcase') {
    return `<div style="display:flex;gap:8px;align-items:center;height:100%;"><div style="flex:1;"><div class="studio-preview-line dark" style="width:85%;"></div><div class="studio-preview-line light" style="width:65%;margin-top:4px;"></div></div><div style="width:38px;height:30px;border-radius:4px;background:#CBD5E1;"></div></div>`;
  }
  if (type === 'info') {
    return `<div style="border-left:3px solid #2563EB;padding-left:6px;"><div class="studio-preview-line dark" style="width:60%;"></div><div class="studio-preview-line light" style="width:80%;margin-top:4px;"></div></div>`;
  }
  if (type === 'carousel') {
    return `<div style="display:flex;align-items:center;justify-content:space-between;height:100%;"><span style="font-size:10px;color:#64748B;">◀</span><div style="flex:1;margin:0 6px;height:24px;border-radius:4px;background:#E2E8F0;"></div><span style="font-size:10px;color:#64748B;">▶</span></div>`;
  }
  if (type === 'project-link') {
    return `<div class="studio-preview-line dark" style="width:72%;"></div><span style="font-size:9px;font-weight:700;color:#2563EB;">↗ https://...</span>`;
  }
  if (type === 'quote') {
    return `<div style="border-left:2px solid #111827;padding-left:6px;font-style:italic;font-size:10px;color:#334155;">“Insight...”</div>`;
  }
  if (type === 'chart') {
    return `<div style="display:flex;align-items:flex-end;gap:5px;height:28px;"><span style="width:10px;height:45%;background:#94A3B8;border-radius:2px;"></span><span style="width:10px;height:80%;background:#475569;border-radius:2px;"></span><span style="width:10px;height:60%;background:#94A3B8;border-radius:2px;"></span><span style="width:10px;height:95%;background:#1E293B;border-radius:2px;"></span></div>`;
  }
  if (type === 'image') {
    return `<div style="height:28px;border-radius:4px;background:#E2E8F0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#475569;">IMAGE FRAME</div>`;
  }
  if (type === 'divider') {
    return `<div style="width:100%;height:1px;background:#94A3B8;"></div>`;
  }
  return `<div class="studio-preview-line dark"></div><div class="studio-preview-line light"></div>`;
}

function renderDrawerContent() {
  const drawer = document.getElementById('studio-side-drawer');
  if (!drawer) return;

  const currentLabel = getPageDisplayTitle(PAGE_ID, editorState);

  if (activeDrawerTab === 'pages') {
    const pageRowsHtml = allSitePages
      .map((pg) => {
        const slug = pg.page_id.replace(/^page:/, '');
        const title = getPageDisplayTitle(pg.page_id, pg.payload);
        const isCurrent = pg.page_id === PAGE_ID;
        const isSub = Boolean(pg.payload?.meta?.parentId);
        return `
          <div class="studio-page-row ${isCurrent ? 'is-current' : ''} ${isSub ? 'is-subpage' : ''}" data-page-id="${pg.page_id}">
            <a href="${getPageTargetUrl(slug, true)}" class="studio-page-link">${title}</a>
            <div class="studio-row-actions">
              <button type="button" class="studio-mini-action" data-rename-page="${pg.page_id}">Rename</button>
              <button type="button" class="studio-mini-action" data-add-subpage="${pg.page_id}">+ Sub</button>
            </div>
          </div>
        `;
      })
      .join('');

    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">${currentLabel}</span>
        <button type="button" id="studio-new-page-btn" class="studio-icon-plus-btn" title="Create page">+</button>
      </div>
      <div id="studio-new-page-form" style="display:none;margin-bottom:12px;padding:10px;border:1px solid var(--studio-border);border-radius:10px;background:#F9FAFB;">
        <input type="text" id="studio-new-page-name" placeholder="Page title (e.g. Case Studies)" style="width:100%;padding:7px 9px;border:1px solid #D1D5DB;border-radius:7px;font-size:12px;margin-bottom:8px;">
        <button type="button" id="studio-create-page-confirm" class="studio-card-btn" style="width:100%;">Create &amp; Open</button>
      </div>
      <div style="display:flex;flex-direction:column;">${pageRowsHtml}</div>
    `;

    drawer.querySelector('#studio-new-page-btn')?.addEventListener('click', () => {
      const form = drawer.querySelector('#studio-new-page-form');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    drawer.querySelector('#studio-create-page-confirm')?.addEventListener('click', async () => {
      const input = drawer.querySelector('#studio-new-page-name');
      const rawTitle = (input?.value || '').trim();
      if (!rawTitle) return;
      const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return;
      const newPageId = `page:${slug}`;
      await supabase.from('site_pages').upsert(
        {
          page_id: newPageId,
          payload: {
            meta: { title: rawTitle, category: 'Parallel Page', parentId: '' },
            texts: {
              'parallel-kicker': 'PARALLEL PAGE',
              'parallel-title': rawTitle,
              'parallel-subtitle': 'Start editing text, media, and blocks in Canva Studio.'
            },
            blocks: []
          },
          updated_at: new Date().toISOString()
        },
        { onConflict: 'page_id' }
      );
      window.location.href = `index.html?page=${encodeURIComponent(slug)}&edit=true`;
    });

    drawer.querySelectorAll('[data-rename-page]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetPageId = btn.dataset.renamePage;
        const row = allSitePages.find((p) => p.page_id === targetPageId);
        const existingTitle = getPageDisplayTitle(targetPageId, row?.payload);
        const nextTitle = prompt('Rename page:', existingTitle);
        if (!nextTitle || !nextTitle.trim()) return;
        const trimmed = nextTitle.trim();
        const nextPayload = {
          ...(row?.payload || {}),
          meta: { ...((row?.payload && row.payload.meta) || {}), title: trimmed }
        };
        if (targetPageId === PAGE_ID) {
          editorState.meta = { ...editorState.meta, title: trimmed };
        }
        if (row) row.payload = nextPayload;
        await supabase.from('site_pages').upsert(
          { page_id: targetPageId, payload: nextPayload, updated_at: new Date().toISOString() },
          { onConflict: 'page_id' }
        );
        renderDrawerContent();
      });
    });

    drawer.querySelectorAll('[data-add-subpage]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const parentId = btn.dataset.addSubpage;
        const subTitle = prompt('New subpage title:');
        if (!subTitle || !subTitle.trim()) return;
        const trimmed = subTitle.trim();
        const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) return;
        const subPageId = `page:${slug}`;
        await supabase.from('site_pages').upsert(
          {
            page_id: subPageId,
            payload: {
              meta: { title: trimmed, category: 'Subpage', parentId },
              texts: {
                'parallel-kicker': 'SUBPAGE',
                'parallel-title': trimmed,
                'parallel-subtitle': `Subpage under ${getDefaultPageLabel(parentId)}.`
              },
              blocks: []
            },
            updated_at: new Date().toISOString()
          },
          { onConflict: 'page_id' }
        );
        await loadAllSitePages();
        renderDrawerContent();
      });
    });
  } else if (activeDrawerTab === 'widgets') {
    const items = [
      { type: 'big-showcase', label: 'Big Visual Showcase' },
      { type: 'info', label: 'Info Block' },
      { type: 'carousel', label: 'Carousel' },
      { type: 'project-link', label: 'Project Link' },
      { type: 'text-node', label: 'Text Block' },
      { type: 'callout', label: 'Callout Box' },
      { type: 'quote', label: 'Pull Quote' },
      { type: 'list', label: 'Index List' },
      { type: 'image', label: 'Image Card' },
      { type: 'video', label: 'YouTube Embed' },
      { type: 'embed', label: 'Web Embed' },
      { type: 'table', label: 'Comparison Table' },
      { type: 'chart', label: 'Data Chart' },
      { type: 'pdf', label: 'PDF Document' },
      { type: 'author', label: 'Author Box' },
      { type: 'divider', label: 'Section Divider' }
    ];

    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">Blocks &amp; Previews</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${items
          .map(
            (it) => `
          <button type="button" class="studio-widget-card" data-add-widget="${it.type}">
            <div class="studio-widget-head">
              <span>${it.label}</span>
              <span style="font-size:10px;color:#2563EB;">+ Add</span>
            </div>
            <div class="studio-widget-preview">${renderWidgetPreviewHtml(it.type)}</div>
          </button>
        `
          )
          .join('')}
      </div>
    `;

    drawer.querySelectorAll('[data-add-widget]').forEach((btn) => {
      btn.addEventListener('click', () => addBlock(btn.dataset.addWidget));
    });
  } else if (activeDrawerTab === 'templates') {
    const templateOptions = [
      { id: 'split-photo', label: 'Split + Image Slot', hasImg: true },
      { id: 'hero-feature', label: 'Hero + Image Slot', hasImg: true },
      { id: 'gallery-trio', label: '3-Slot Photo Strip', hasImg: true },
      { id: 'case-study-split', label: 'Case + Image Slot', hasImg: true },
      { id: 'two-col-text', label: '2-Col Essay (No Img)', hasImg: false },
      { id: 'thesis-grid', label: '3-Pillar Grid (No Img)', hasImg: false },
      { id: 'brief-memo', label: 'Brief Memo (No Img)', hasImg: false },
      { id: 'index-ledger', label: 'Index Ledger (No Img)', hasImg: false }
    ];

    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">Templates (8)</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${templateOptions
          .map(
            (t) => `
          <button type="button" class="studio-widget-card" data-add-template="${t.id}">
            <div class="studio-widget-head">
              <span>${t.label}</span>
              <span style="font-size:10px;color:#2563EB;">${t.hasImg ? 'IMG' : 'TXT'}</span>
            </div>
            <div class="studio-widget-preview">${renderWidgetPreviewHtml(t.hasImg ? 'image' : 'text-node')}</div>
          </button>
        `
          )
          .join('')}
      </div>
    `;

    drawer.querySelectorAll('[data-add-template]').forEach((btn) => {
      btn.addEventListener('click', () => addBlock('template', btn.dataset.addTemplate));
    });
  } else if (activeDrawerTab === 'effects') {
    const curStyle = (activeStyleKey && editorState.textStyles?.[activeStyleKey]) || {};
    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">Effects &amp; Motion</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;">
          <span>Visual Effect</span>
          <select id="fx-drawer-effect" style="padding:7px 8px;border:1px solid #D1D5DB;border-radius:7px;">
            <option value="none" ${curStyle.effect === 'none' || !curStyle.effect ? 'selected' : ''}>None</option>
            <option value="shadow" ${curStyle.effect === 'shadow' ? 'selected' : ''}>Drop Shadow</option>
            <option value="neon" ${curStyle.effect === 'neon' ? 'selected' : ''}>Soft Glow</option>
            <option value="outline" ${curStyle.effect === 'outline' ? 'selected' : ''}>Text Outline</option>
            <option value="shake" ${curStyle.effect === 'shake' ? 'selected' : ''}>Shake</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;">
          <span>Motion / Animation</span>
          <select id="fx-drawer-anim" style="padding:7px 8px;border:1px solid #D1D5DB;border-radius:7px;">
            <option value="none" ${curStyle.animation === 'none' || !curStyle.animation ? 'selected' : ''}>None</option>
            <option value="fade-in" ${curStyle.animation === 'fade-in' ? 'selected' : ''}>Fade In</option>
            <option value="pulse" ${curStyle.animation === 'pulse' ? 'selected' : ''}>Pulse</option>
            <option value="float" ${curStyle.animation === 'float' ? 'selected' : ''}>Float</option>
            <option value="shake" ${curStyle.animation === 'shake' ? 'selected' : ''}>Shake Loop</option>
            <option value="type" ${curStyle.animation === 'type' ? 'selected' : ''}>Typewriter</option>
          </select>
        </label>
        <div style="display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--studio-border);">
          <button type="button" id="fx-apply-page-btn" class="studio-card-btn">Apply to All on This Page</button>
          <button type="button" id="fx-apply-all-pages-btn" class="studio-card-btn is-active">Apply Across All Pages</button>
        </div>
      </div>
    `;

    drawer.querySelector('#fx-drawer-effect')?.addEventListener('change', (e) => {
      updateSelectedElementStyle({ effect: e.target.value });
    });
    drawer.querySelector('#fx-drawer-anim')?.addEventListener('change', (e) => {
      updateSelectedElementStyle({ animation: e.target.value });
    });
    drawer.querySelector('#fx-apply-page-btn')?.addEventListener('click', () => {
      const eff = drawer.querySelector('#fx-drawer-effect')?.value;
      const anim = drawer.querySelector('#fx-drawer-anim')?.value;
      applyEffectToCurrentPage(eff, anim);
    });
    drawer.querySelector('#fx-apply-all-pages-btn')?.addEventListener('click', () => {
      const eff = drawer.querySelector('#fx-drawer-effect')?.value;
      const anim = drawer.querySelector('#fx-drawer-anim')?.value;
      applyEffectAcrossAllPages(eff, anim);
    });
  } else if (activeDrawerTab === 'media') {
    const uploadsHtml = (editorState.uploads || [])
      .map(
        (u) => `
        <div style="border:1px solid var(--studio-border);border-radius:8px;padding:8px;margin-bottom:8px;background:#F9FAFB;">
          <img src="${u.url}" alt="${u.name}" style="width:100%;height:96px;object-fit:cover;border-radius:6px;margin-bottom:6px;">
          <div style="display:flex;gap:6px;">
            <button type="button" class="studio-mini-action" data-insert-img="${u.url}">Insert Card</button>
            <button type="button" class="studio-mini-action" data-set-banner="${u.url}">Set Hero Banner</button>
          </div>
        </div>
      `
      )
      .join('');

    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">Supabase Media</span>
      </div>
      <label class="studio-card-btn" style="display:block;text-align:center;margin-bottom:12px;">
        Upload Image
        <input type="file" id="studio-media-upload" accept="image/*" style="display:none;">
      </label>
      <div>${uploadsHtml || '<p class="mono">No uploaded assets yet.</p>'}</div>
    `;

    drawer.querySelector('#studio-media-upload')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadFileToSupabase(file);
      if (url) renderDrawerContent();
    });

    drawer.querySelectorAll('[data-insert-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pushUndoSnapshot();
        editorState.blocks = editorState.blocks || [];
        editorState.blocks.push({
          id: `blk_${Date.now()}`,
          type: 'image',
          url: btn.dataset.insertImg,
          caption: 'Uploaded media highlight'
        });
        renderDynamicBlocks(editorState.blocks, true);
        bindEditableTargets();
        scheduleAutoSave();
      });
    });

    drawer.querySelectorAll('[data-set-banner]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const banner = document.querySelector('[data-edit-bg="hero-banner"]');
        const url = btn.dataset.setBanner;
        pushUndoSnapshot();
        editorState.backgrounds = editorState.backgrounds || {};
        editorState.backgrounds['hero-banner'] = url;
        if (banner) {
          banner.style.backgroundImage = `linear-gradient(to top, rgba(12, 15, 20, 0.74), rgba(12, 15, 20, 0.18)), url('${url}')`;
        }
        scheduleAutoSave();
      });
    });
  } else if (activeDrawerTab === 'theme') {
    const bgHex = rgbOrHexToHex(editorState.colors?.['--bg-color'] || getComputedStyle(document.body).backgroundColor, '#F5F5F2');
    const inkHex = rgbOrHexToHex(editorState.colors?.['--text-main'] || getComputedStyle(document.body).color, '#202124');

    drawer.innerHTML = `
      <div class="studio-drawer-header">
        <span class="studio-active-page-ext">Logos &amp; Brand</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Top-Left Logo Text</span>
          <input type="text" id="studio-brand-logo-text" value="${editorState.brand?.logoText || 'MARVEL TANG'}" style="padding:6px 8px;border:1px solid #D1D5DB;border-radius:7px;">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Top-Left Logo Image URL</span>
          <input type="text" id="studio-brand-logo-url" value="${editorState.brand?.logoUrl || ''}" placeholder="https://...png/svg" style="padding:6px 8px;border:1px solid #D1D5DB;border-radius:7px;">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Footnote Logo Text (Different)</span>
          <input type="text" id="studio-footer-logo-text" value="${editorState.brand?.footerLogoText || editorState.brand?.logoText || 'MARVEL TANG'}" style="padding:6px 8px;border:1px solid #D1D5DB;border-radius:7px;">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Footnote Logo Image URL (Different)</span>
          <input type="text" id="studio-footer-logo-url" value="${editorState.brand?.footerLogoUrl || ''}" placeholder="https://...png/svg" style="padding:6px 8px;border:1px solid #D1D5DB;border-radius:7px;">
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;padding-top:6px;border-top:1px solid var(--studio-border);">
          <span>Canvas Surface</span>
          <input type="color" data-css-var="--bg-color" value="${bgHex}">
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;">
          <span>Ink / Text</span>
          <input type="color" data-css-var="--text-main" value="${inkHex}">
        </label>
      </div>
    `;

    drawer.querySelectorAll('input[type="color"][data-css-var]').forEach((colorInput) => {
      colorInput.addEventListener('input', () => {
        pushUndoSnapshot();
        editorState.colors = editorState.colors || {};
        editorState.colors[colorInput.dataset.cssVar] = colorInput.value;
        document.documentElement.style.setProperty(colorInput.dataset.cssVar, colorInput.value);
        scheduleAutoSave();
      });
    });

    drawer.querySelector('#studio-brand-logo-text')?.addEventListener('input', (e) => {
      editorState.brand = editorState.brand || {};
      editorState.brand.logoText = e.target.value;
      applyBrandToPage(editorState.brand);
      scheduleAutoSave();
    });
    drawer.querySelector('#studio-brand-logo-url')?.addEventListener('input', (e) => {
      editorState.brand = editorState.brand || {};
      editorState.brand.logoUrl = e.target.value.trim();
      applyBrandToPage(editorState.brand);
      scheduleAutoSave();
    });
    drawer.querySelector('#studio-footer-logo-text')?.addEventListener('input', (e) => {
      editorState.brand = editorState.brand || {};
      editorState.brand.footerLogoText = e.target.value;
      applyBrandToPage(editorState.brand);
      scheduleAutoSave();
    });
    drawer.querySelector('#studio-footer-logo-url')?.addEventListener('input', (e) => {
      editorState.brand = editorState.brand || {};
      editorState.brand.footerLogoUrl = e.target.value.trim();
      applyBrandToPage(editorState.brand);
      scheduleAutoSave();
    });
  }
}

function initMeasureRulerAndMagnet() {
  const ruler = document.createElement('div');
  ruler.id = 'studio-ruler-ribbon';
  for (let px = 0; px <= 1600; px += 100) {
    const lbl = document.createElement('span');
    lbl.style.left = `${px}px`;
    lbl.textContent = `${px}px`;
    ruler.appendChild(lbl);
  }

  const guide = document.createElement('div');
  guide.id = 'studio-drag-guide';

  const readout = document.createElement('div');
  readout.id = 'studio-guide-readout';

  const magnetLine = document.createElement('div');
  magnetLine.id = 'studio-magnet-line';

  const spatialOverlay = document.createElement('div');
  spatialOverlay.id = 'studio-spatial-overlay';

  const spatialBadge = document.createElement('div');
  spatialBadge.id = 'studio-spatial-badge';

  document.body.append(ruler, guide, readout, magnetLine, spatialOverlay, spatialBadge);

  const updateGuideAtClientX = (clientX) => {
    const rulerRect = ruler.getBoundingClientRect();
    let x = Math.max(rulerRect.left, Math.min(clientX, window.innerWidth - 4));
    let snappedLabel = '';

    if (magnetEnabled) {
      const snapThreshold = 8;
      const targets = Array.from(
        document.querySelectorAll('.content-wrapper section, .content-wrapper .featured-card, .content-wrapper h1, .content-wrapper h2, .content-wrapper h3, .content-wrapper p')
      ).filter((el) => !isStudioUiNode(el));

      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const snapPoints = [
          { val: r.left, label: 'LEFT' },
          { val: r.left + r.width / 2, label: 'CENTER' },
          { val: r.right, label: 'RIGHT' }
        ];
        const hit = snapPoints.find((pt) => Math.abs(pt.val - x) <= snapThreshold);
        if (hit) {
          x = hit.val;
          snappedLabel = ` · SNAP ${hit.label}`;
          magnetLine.style.left = `${x}px`;
          magnetLine.classList.add('active');
          break;
        }
        magnetLine.classList.remove('active');
      }
    } else {
      magnetLine.classList.remove('active');
    }

    guide.style.left = `${x}px`;
    guide.classList.add('active');
    readout.style.left = `${x}px`;
    readout.textContent = `${Math.round(x - rulerRect.left)}px${snappedLabel}`;
    readout.classList.add('active');
  };

  ruler.addEventListener('mousedown', (e) => {
    isDraggingGuide = true;
    updateGuideAtClientX(e.clientX);
  });

  guide.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingGuide = true;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingGuide) {
      updateGuideAtClientX(e.clientX);
      return;
    }
    if (boxTransformSession) {
      const dx = e.clientX - boxTransformSession.startX;
      const dy = e.clientY - boxTransformSession.startY;
      editorState.textStyles = editorState.textStyles || {};
      const current = editorState.textStyles[boxTransformSession.key] || {};

      if (boxTransformSession.mode === 'move') {
        const nextStyle = {
          ...current,
          posX: Math.round(boxTransformSession.origPosX + dx),
          posY: Math.round(boxTransformSession.origPosY + dy)
        };
        editorState.textStyles[boxTransformSession.key] = nextStyle;
        applyElementStyle(boxTransformSession.el, nextStyle);
      } else if (boxTransformSession.mode === 'resize') {
        const h = boxTransformSession.handle;
        let nextW = boxTransformSession.origWidth;
        let nextH = boxTransformSession.origHeight;
        let nextX = boxTransformSession.origPosX;
        let nextY = boxTransformSession.origPosY;

        if (h.includes('r')) nextW = Math.max(140, boxTransformSession.origWidth + dx);
        if (h.includes('l')) {
          nextW = Math.max(140, boxTransformSession.origWidth - dx);
          nextX = boxTransformSession.origPosX + dx;
        }
        if (h.includes('b')) nextH = Math.max(60, boxTransformSession.origHeight + dy);
        if (h.includes('t')) {
          nextH = Math.max(60, boxTransformSession.origHeight - dy);
          nextY = boxTransformSession.origPosY + dy;
        }

        const nextStyle = {
          ...current,
          boxWidth: Math.round(nextW),
          boxHeight: Math.round(nextH),
          posX: Math.round(nextX),
          posY: Math.round(nextY)
        };
        editorState.textStyles[boxTransformSession.key] = nextStyle;
        applyElementStyle(boxTransformSession.el, nextStyle);
      }

      updateSpatialGuidesForBox(boxTransformSession.el);
    }
  });

  document.addEventListener('mouseup', () => {
    isDraggingGuide = false;
    if (boxTransformSession) {
      boxTransformSession = null;
      scheduleAutoSave();
    }
  });
}

async function initCanvaStudio() {
  if (studioInitialized) return;
  studioInitialized = true;

  document.body.classList.add('studio-mode', 'studio-drawer-open');
  await loadAllSitePages();
  pushUndoSnapshot();

  const topBar = document.createElement('div');
  topBar.id = 'studio-top-bar';
  topBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <strong style="font-size:12px;letter-spacing:0.08em;">CANVA STUDIO</strong>
      <span id="studio-save-status" class="mono" style="font-size:0.68rem;">Ready</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <button type="button" id="studio-undo-btn" class="studio-card-btn" title="Undo">Undo</button>
      <button type="button" id="studio-redo-btn" class="studio-card-btn" title="Redo">Redo</button>
      <button type="button" id="studio-publish-btn" class="btn btn-primary" style="padding:6px 14px;font-size:12px;">Publish</button>
      <button type="button" id="studio-exit-btn" class="studio-card-btn">View Live</button>
    </div>
  `;

  const formatBar = document.createElement('div');
  formatBar.id = 'studio-format-bar';
  formatBar.innerHTML = `
    <select id="fmt-font-family" title="Font family">
      <option value="">Default Font</option>
      <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
      <option value="'Poppins', sans-serif">Poppins</option>
      <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
    </select>
    <input type="number" id="fmt-font-size" min="11" max="120" value="18" style="width:62px;" title="Font size (px)">
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;">
      Text <input type="color" id="fmt-text-color" value="#202124">
    </label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;">
      Fill <input type="color" id="fmt-drop-color" value="#EEF2FF">
    </label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;">
      Opacity <input type="range" id="fmt-opacity" min="10" max="100" value="100" style="width:68px;">
      <span id="fmt-opacity-val">100%</span>
    </label>
    <button type="button" id="studio-magnet-btn" class="studio-card-btn is-active" title="Toggle magnetic alignment snap">Magnet: ON</button>
  `;

  const leftRail = document.createElement('aside');
  leftRail.id = 'studio-left-rail';
  leftRail.innerHTML = `
    <button type="button" class="studio-rail-btn active" data-rail-tab="pages">
      <span class="studio-rail-glyph">P</span>
      <span>Pages</span>
    </button>
    <button type="button" class="studio-rail-btn" data-rail-tab="widgets">
      <span class="studio-rail-glyph">+</span>
      <span>Blocks</span>
    </button>
    <button type="button" class="studio-rail-btn" data-rail-tab="templates">
      <span class="studio-rail-glyph">LYT</span>
      <span>Layouts</span>
    </button>
    <button type="button" class="studio-rail-btn" data-rail-tab="effects">
      <span class="studio-rail-glyph">FX</span>
      <span>Effects</span>
    </button>
    <button type="button" class="studio-rail-btn" data-rail-tab="media">
      <span class="studio-rail-glyph">IMG</span>
      <span>Media</span>
    </button>
    <button type="button" class="studio-rail-btn" data-rail-tab="theme">
      <span class="studio-rail-glyph">◐</span>
      <span>Brand</span>
    </button>
  `;

  const sideDrawer = document.createElement('aside');
  sideDrawer.id = 'studio-side-drawer';

  document.body.append(topBar, formatBar, leftRail, sideDrawer);
  initMeasureRulerAndMagnet();

  topBar.querySelector('#studio-undo-btn')?.addEventListener('click', handleUndo);
  topBar.querySelector('#studio-redo-btn')?.addEventListener('click', handleRedo);
  topBar.querySelector('#studio-publish-btn')?.addEventListener('click', () => saveToSupabase('Published'));
  topBar.querySelector('#studio-exit-btn')?.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.location.href = url.toString();
  });

  formatBar.querySelector('#studio-magnet-btn')?.addEventListener('click', (btnEvt) => {
    magnetEnabled = !magnetEnabled;
    const btn = btnEvt.currentTarget;
    btn.textContent = magnetEnabled ? 'Magnet: ON' : 'Magnet: OFF';
    btn.classList.toggle('is-active', magnetEnabled);
    if (!magnetEnabled) {
      document.getElementById('studio-magnet-line')?.classList.remove('active');
    }
  });

  formatBar.querySelector('#fmt-font-family')?.addEventListener('change', (e) =>
    updateSelectedElementStyle({ fontFamily: e.target.value })
  );
  formatBar.querySelector('#fmt-font-size')?.addEventListener('change', (e) =>
    updateSelectedElementStyle({ fontSize: Number(e.target.value) || 18 })
  );
  formatBar.querySelector('#fmt-text-color')?.addEventListener('input', (e) =>
    updateSelectedElementStyle({ color: e.target.value })
  );
  formatBar.querySelector('#fmt-drop-color')?.addEventListener('input', (e) =>
    updateSelectedElementStyle({ dropColor: e.target.value })
  );
  formatBar.querySelector('#fmt-opacity')?.addEventListener('input', (e) => {
    const pct = Number(e.target.value) || 100;
    const valEl = formatBar.querySelector('#fmt-opacity-val');
    if (valEl) valEl.textContent = `${pct}%`;
    updateSelectedElementStyle({ opacity: (pct / 100).toFixed(2) });
  });

  leftRail.querySelectorAll('[data-rail-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const clickedTab = btn.dataset.railTab;
      if (activeDrawerTab === clickedTab && document.body.classList.contains('studio-drawer-open')) {
        document.body.classList.remove('studio-drawer-open');
        btn.classList.remove('active');
        return;
      }
      activeDrawerTab = clickedTab;
      leftRail.querySelectorAll('.studio-rail-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.body.classList.add('studio-drawer-open');
      renderDrawerContent();
    });
  });

  document.addEventListener('mousedown', (e) => {
    if (isStudioUiNode(e.target)) return;
    if (!e.target.closest('.featured-card, .hero-banner, .dynamic-block, [data-edit-text]')) {
      clearBoxHandles();
      hideSpatialGuides();
    }
  });

  renderDynamicBlocks(editorState.blocks || [], true);
  bindEditableTargets();
  reapplyAllElementStyles();
  renderDrawerContent();
}

function initMenu() {
  const menuToggle = document.getElementById('nav-menu-toggle');
  const rollMenu = document.getElementById('site-roll-menu');
  if (menuToggle && rollMenu) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = rollMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!rollMenu.contains(e.target) && !menuToggle.contains(e.target)) {
        rollMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

async function hydrateFromSupabase() {
  try {
    let loadedPayload = null;
    try {
      const localRaw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (localRaw) loadedPayload = JSON.parse(localRaw);
    } catch (_) {}

    const { data, error } = await supabase
      .from('site_pages')
      .select('payload')
      .eq('page_id', PAGE_ID)
      .maybeSingle();

    if (error) {
      console.warn('Supabase fetch notice:', error.message);
    } else if (data?.payload) {
      publishedContentSnapshot = cloneState(data.payload);
      loadedPayload = data.payload;
    }

    if (loadedPayload) {
      editorState = {
        ...editorState,
        ...cloneState(loadedPayload),
        meta: { ...editorState.meta, ...(loadedPayload.meta || {}) },
        brand: { ...editorState.brand, ...(loadedPayload.brand || {}) }
      };
    }

    mountParallelPageShellIfNeeded();
    applyBrandToPage(editorState.brand);

    Object.entries(editorState.texts || {}).forEach(([key, htmlVal]) => {
      const el = document.querySelector(`[data-edit-text="${key}"]`);
      if (el && !isStudioUiNode(el)) {
        el.innerHTML = htmlVal;
      }
    });

    Object.entries(editorState.images || {}).forEach(([imgKey, srcVal]) => {
      const imgEl = document.querySelector(`[data-edit-img="${imgKey}"]`);
      if (imgEl && srcVal) imgEl.src = srcVal;
    });

    reapplyAllElementStyles();

    Object.entries(editorState.colors || {}).forEach(([cssVar, hex]) => {
      if (cssVar && hex) document.documentElement.style.setProperty(cssVar, hex);
    });

    Object.entries(editorState.backgrounds || {}).forEach(([bgKey, bgUrl]) => {
      const bgEl = document.querySelector(`[data-edit-bg="${bgKey}"]`);
      if (bgEl && bgUrl) {
        bgEl.style.backgroundImage = `linear-gradient(to top, rgba(12, 15, 20, 0.74), rgba(12, 15, 20, 0.18)), url('${bgUrl}')`;
      }
    });

    const isEditMode = new URLSearchParams(window.location.search).get('edit') === 'true';
    renderDynamicBlocks(editorState.blocks || [], isEditMode);
    reapplyAllElementStyles();

    if (isEditMode) {
      await initCanvaStudio();
    }
  } catch (err) {
    console.error('Error loading page payload:', err);
    renderDynamicBlocks(editorState.blocks || [], false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  hydrateFromSupabase();
});
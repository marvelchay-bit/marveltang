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
    if (!el.closest('#admin-left-dock') && !el.closest('#floating-format-ribbon')) {
      texts[el.dataset.editText] = el.innerHTML.trim();
    }
  });

  const colors = { ...(editorState.colors || {}) };
  document.querySelectorAll('#admin-left-dock input[type="color"][data-css-var]').forEach((input) => {
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
      ? `<button type="button" data-remove-block="${block.id}" style="float:right;font-size:0.74rem;padding:4px 8px;cursor:pointer;border-radius:6px;border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-main);">Remove</button>`
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

    // Allow clicking [Ref #] inline badges anywhere to jump to and highlight that reference
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
        editable.addEventListener('focus', () => {
          pushUndoSnapshot();
          activeEditableEl = editable;
          activeStyleKey = editable.dataset.styleKey || `block:${block.id}:${editable.dataset.blockField || editable.dataset.refText || 'text'}`;
          editable.dataset.styleKey = activeStyleKey;
          showFloatingRibbon(editable, activeStyleKey);
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
    const picker = document.querySelector(`#admin-left-dock input[data-css-var="${cssVar}"]`);
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

    // Also pull previous uploads from storage bucket if available
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
  const statusEl = document.getElementById('save-status-msg');
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
    statusEl.textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }
}

function scheduleAutoSave() {
  const statusEl = document.getElementById('save-status-msg');
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

function buildFloatingRibbon() {
  const ribbon = document.createElement('div');
  ribbon.id = 'floating-format-ribbon';
  ribbon.innerHTML = `
    <span class="mono" style="color:#C9D8E5;">STYLE</span>
    <label title="Text Color">Text <input type="color" id="rib-text-color" value="#202124"></label>
    <label title="Drop / Highlight Color">Drop <input type="color" id="rib-drop-color" value="#f5f5f2"></label>
    <select id="rib-font-family" title="Font">
      <option value="">Default Font</option>
      <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
      <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
      <option value="Georgia, serif">Georgia</option>
    </select>
    <input type="number" id="rib-font-size" min="12" max="96" placeholder="px" title="Font Size (px)" style="width:56px;">
    <select id="rib-effect" title="Visual Effect">
      <option value="none">Effect: None</option>
      <option value="shadow">Shadow</option>
      <option value="neon">Neon</option>
      <option value="outline">Outline</option>
    </select>
    <select id="rib-animation" title="Animation">
      <option value="none">Anim: None</option>
      <option value="fade-in">Fade In</option>
      <option value="type">Type</option>
    </select>
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <button type="button" id="rib-cite-btn" title="Embed Reference Marker">Embed Ref [#]</button>
  `;
  document.body.appendChild(ribbon);

  const updateCurrentStyle = (patch) => {
    if (!activeEditableEl || !activeStyleKey) return;
    pushUndoSnapshot();
    const existing = editorState.textStyles[activeStyleKey] || {};
    const nextStyle = { ...existing, ...patch };
    editorState.textStyles[activeStyleKey] = nextStyle;
    applyElementStyle(activeEditableEl, nextStyle);
    editorState = captureDomState();
    scheduleAutoSave();
  };

  ribbon.querySelector('#rib-text-color').addEventListener('input', (e) => updateCurrentStyle({ color: e.target.value }));
  ribbon.querySelector('#rib-drop-color').addEventListener('input', (e) => updateCurrentStyle({ dropColor: e.target.value }));
  ribbon.querySelector('#rib-font-family').addEventListener('change', (e) => updateCurrentStyle({ fontFamily: e.target.value }));
  ribbon.querySelector('#rib-font-size').addEventListener('change', (e) => updateCurrentStyle({ fontSize: Number(e.target.value) || '' }));
  ribbon.querySelector('#rib-effect').addEventListener('change', (e) => updateCurrentStyle({ effect: e.target.value }));
  ribbon.querySelector('#rib-animation').addEventListener('change', (e) => updateCurrentStyle({ animation: e.target.value }));

  ribbon.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      document.execCommand(btn.dataset.cmd, false, null);
      editorState = captureDomState();
      scheduleAutoSave();
    });
  });

  // Embed inline [Ref #] badge directly inside text
  ribbon.querySelector('#rib-cite-btn').addEventListener('click', () => {
    if (!activeEditableEl) return;
    const refNum = prompt('Reference number to embed (e.g. 1):', '1');
    if (!refNum) return;
    pushUndoSnapshot();
    const badgeHtml = `<sup class="ref-inline-badge mono" data-ref-num="${refNum}" style="cursor:pointer;color:var(--slate-blue);font-weight:700;">[${refNum}]</sup>&nbsp;`;
    document.execCommand('insertHTML', false, badgeHtml);
    editorState = captureDomState();
    scheduleAutoSave();
  });

  return ribbon;
}

function showFloatingRibbon(el, styleKey) {
  const ribbon = document.getElementById('floating-format-ribbon');
  if (!ribbon) return;
  const st = editorState.textStyles?.[styleKey] || {};
  ribbon.querySelector('#rib-text-color').value = rgbOrHexToHex(st.color || getComputedStyle(el).color, '#202124');
  ribbon.querySelector('#rib-font-family').value = st.fontFamily || '';
  ribbon.querySelector('#rib-font-size').value = st.fontSize || '';
  ribbon.querySelector('#rib-effect').value = st.effect || 'none';
  ribbon.querySelector('#rib-animation').value = st.animation || 'none';
  ribbon.style.display = 'flex';
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

    enableLeftStudioEditor();
  }
});

function enableLeftStudioEditor() {
  editorState = captureDomState();
  undoStack = [cloneState(editorState)];

  buildFloatingRibbon();

  const textTargets = document.querySelectorAll('[data-edit-text]');
  textTargets.forEach((el) => {
    if (el.closest('#admin-left-dock') || el.closest('#floating-format-ribbon')) return;
    const sKey = el.dataset.editText;
    el.dataset.styleKey = sKey;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed #71869A';
    el.style.outlineOffset = '4px';

    el.addEventListener('focus', () => {
      pushUndoSnapshot();
      activeEditableEl = el;
      activeStyleKey = sKey;
      showFloatingRibbon(el, sKey);
    });

    el.addEventListener('input', () => {
      editorState = captureDomState();
      scheduleAutoSave();
    });
  });

  const computedStyles = getComputedStyle(document.documentElement);

  const dock = document.createElement('aside');
  dock.id = 'admin-left-dock';
  dock.innerHTML = `
    <button type="button" id="dock-toggle-btn" title="Minimize / Open Studio" style="position:fixed;top:90px;left:12px;z-index:100001;background:#202124;color:#C9D8E5;border:1px solid #343D47;border-radius:8px;padding:7px 11px;font-family:'JetBrains Mono',monospace;font-size:0.74rem;font-weight:600;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,0.25);">
      ◀ Studio
    </button>

    <div id="dock-drawer-panel" style="position:fixed;top:130px;left:12px;width:296px;max-height:calc(100vh - 150px);overflow-y:auto;z-index:100000;background:#202124;color:#F5F5F2;border:1px solid #343D47;border-radius:14px;padding:14px;box-shadow:0 14px 36px rgba(0,0,0,0.35);font-family:'Plus Jakarta Sans',sans-serif;font-size:0.82rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:#C9D8E5;font-weight:600;">${PAGE_ID}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" id="undo-btn" title="Undo (Cmd+Z)" style="padding:3px 7px;cursor:pointer;border-radius:5px;border:none;">Undo</button>
          <button type="button" id="redo-btn" title="Redo (Cmd+Y)" style="padding:3px 7px;cursor:pointer;border-radius:5px;border:none;">Redo</button>
          <a href="${window.location.pathname}" style="color:#9aa0a6;text-decoration:none;font-size:0.74rem;">Exit</a>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;background:#15191F;padding:4px;border-radius:8px;margin-bottom:12px;">
        <button type="button" class="dock-tab-btn" data-dtab="widgets" style="padding:6px;border:none;border-radius:6px;background:#C9D8E5;color:#202124;font-weight:700;cursor:pointer;font-size:0.74rem;">Widgets</button>
        <button type="button" class="dock-tab-btn" data-dtab="uploads" style="padding:6px;border:none;border-radius:6px;background:transparent;color:#F1F2F0;font-weight:600;cursor:pointer;font-size:0.74rem;">Uploads</button>
        <button type="button" class="dock-tab-btn" data-dtab="theme" style="padding:6px;border:none;border-radius:6px;background:transparent;color:#F1F2F0;font-weight:600;cursor:pointer;font-size:0.74rem;">Theme/Pg</button>
      </div>

      <!-- WIDGETS TAB -->
      <div id="dtab-widgets" class="dock-tab-panel">
        <div class="mono" style="margin-bottom:6px;color:#C9D8E5;">Text & Structure</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <button type="button" data-insert-widget="h1" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ H1</button>
          <button type="button" data-insert-widget="h2" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ H2</button>
          <button type="button" data-insert-widget="h3" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ H3</button>
          <button type="button" data-insert-widget="p" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Normal Text</button>
          <button type="button" data-insert-widget="divider" style="grid-column:span 2;padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Horizontal Line</button>
        </div>

        <div class="mono" style="margin-bottom:6px;color:#C9D8E5;">Media & Blocks</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <button type="button" data-insert-widget="pdf" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ PDF</button>
          <button type="button" data-insert-widget="author" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Author</button>
          <button type="button" data-insert-widget="video" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Video (YT)</button>
          <button type="button" data-insert-widget="image-block" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Image</button>
        </div>

        <div class="mono" style="margin-bottom:6px;color:#C9D8E5;">Interactive & Data</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <button type="button" data-insert-widget="quiz" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Quiz</button>
          <button type="button" data-insert-widget="survey" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Poll</button>
          <button type="button" data-insert-widget="table" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Table</button>
          <button type="button" data-insert-widget="chart" style="padding:6px;cursor:pointer;border-radius:6px;border:none;">+ Chart</button>
          <button type="button" data-insert-widget="references" style="grid-column:span 2;padding:6px;cursor:pointer;border-radius:6px;border:none;">+ References Section</button>
        </div>
      </div>

      <!-- UPLOADS TAB -->
      <div id="dtab-uploads" class="dock-tab-panel" style="display:none;">
        <label class="mono" style="display:block;margin-bottom:6px;color:#C9D8E5;">Upload New Photo</label>
        <input type="file" id="dock-upload-file" accept="image/*" style="width:100%;font-size:0.75rem;margin-bottom:10px;">
        <div class="mono" style="margin-bottom:6px;color:#C9D8E5;">Previous Uploads (Click to Insert)</div>
        <div id="uploads-gallery-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
      </div>

      <!-- THEME & NEW PAGE TAB -->
      <div id="dtab-theme" class="dock-tab-panel" style="display:none;">
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
          <label style="display:flex;justify-content:space-between;"><span>Background</span><input type="color" data-css-var="--bg-color" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--bg-color'), '#F5F5F2')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Main Text</span><input type="color" data-css-var="--text-main" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--text-main'), '#202124')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Card Surface</span><input type="color" data-css-var="--card-bg" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--card-bg'), '#FFFFFF')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Accent</span><input type="color" data-css-var="--slate-blue" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--slate-blue'), '#71869A')}"></label>
        </div>
        <div style="border-top:1px solid #343D47;padding-top:10px;">
          <label class="mono" style="display:block;margin-bottom:4px;color:#C9D8E5;">New Page Slug</label>
          <div style="display:flex;gap:6px;">
            <input type="text" id="new-page-slug" placeholder="notes" style="flex:1;padding:6px;border-radius:6px;border:1px solid #343D47;background:#15191F;color:#fff;">
            <button type="button" id="create-page-btn" style="padding:6px 10px;cursor:pointer;border-radius:6px;border:none;">Create</button>
          </div>
        </div>
      </div>

      <button type="button" id="save-now-btn" style="width:100%;margin-top:12px;padding:8px;border:none;border-radius:8px;background:#C9D8E5;color:#202124;font-weight:700;cursor:pointer;">Save Now</button>
      <span id="save-status-msg" style="display:block;margin-top:6px;font-size:0.72rem;text-align:center;color:#C9D8E5;">Auto-save active</span>
    </div>
  `;
  document.body.appendChild(dock);

  const panelEl = dock.querySelector('#dock-drawer-panel');
  const toggleBtn = dock.querySelector('#dock-toggle-btn');
  let isMinimized = false;

  toggleBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    panelEl.style.display = isMinimized ? 'none' : 'block';
    toggleBtn.textContent = isMinimized ? '▶ Studio' : '◀ Studio';
  });

  const renderUploadsGallery = () => {
    const grid = dock.querySelector('#uploads-gallery-grid');
    if (!grid) return;
    const list = editorState.uploads || [];
    if (!list.length) {
      grid.innerHTML = `<span class="mono" style="grid-column:span 2;color:#9aa0a6;">No photos yet.</span>`;
      return;
    }
    grid.innerHTML = list
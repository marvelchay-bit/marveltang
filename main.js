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
  colors: {},
  images: {},
  backgrounds: {},
  blocks: []
};

let undoStack = [];
let redoStack = [];
let autoSaveTimer = null;
let isApplyingHistory = false;
const chartInstances = new Map();

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pushUndoSnapshot() {
  if (isApplyingHistory) return;
  undoStack.push(cloneState(editorState));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}

function renderDynamicBlocks(blocks, isEditMode) {
  const container = document.getElementById('dynamic-blocks-container');
  if (!container) return;

  // Destroy old Chart.js instances before re-rendering
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances.clear();
  container.innerHTML = '';

  blocks.forEach((block, idx) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'section-block dynamic-block';
    wrapper.dataset.blockId = block.id;

    const removeBtnHtml = isEditMode
      ? `<button type="button" data-remove-block="${block.id}" style="float:right;font-size:0.75rem;padding:4px 8px;cursor:pointer;">Remove</button>`
      : '';

    if (block.type === 'section') {
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <h2 contenteditable="${isEditMode}" data-block-field="title">${block.title || 'New Section'}</h2>
        <p contenteditable="${isEditMode}" data-block-field="body">${block.body || 'Write your section content here...'}</p>
      `;
    } else if (block.type === 'quiz') {
      const optionsHtml = (block.options || ['Option A', 'Option B', 'Option C'])
        .map(
          (opt, oIdx) => `
          <button type="button" class="quiz-opt-btn" data-correct="${oIdx === (block.correctIndex ?? 0)}" style="display:block;margin:6px 0;padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--card-bg);color:var(--text-main);cursor:pointer;">
            ${opt}
          </button>`
        )
        .join('');
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">INTERACTIVE QUIZ</span>
          <h3 contenteditable="${isEditMode}" data-block-field="question" style="margin-top:8px;">${block.question || 'Quick check question?'}</h3>
          <div class="quiz-options">${optionsHtml}</div>
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
      wrapper.innerHTML = `
        ${removeBtnHtml}
        <div class="featured-card">
          <span class="mono">READER SURVEY</span>
          <h3 contenteditable="${isEditMode}" data-block-field="prompt" style="margin-top:8px;">${block.prompt || 'How useful was this breakdown?'}</h3>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            ${choices
              .map(
                (c) =>
                  `<button type="button" class="survey-choice-btn" data-choice="${c}" style="padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--soft-silver);color:var(--text-main);cursor:pointer;">${c}</button>`
              )
              .join('')}
          </div>
          <p class="survey-status mono" style="margin-top:10px;">Responses recorded: ${(block.counts && Object.values(block.counts).reduce((a, b) => a + b, 0)) || 0}</p>
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
    }

    // Bind inline edits and block actions when in edit mode
    if (isEditMode) {
      wrapper.querySelectorAll('[contenteditable="true"]').forEach((editable) => {
        editable.addEventListener('input', () => {
          pushUndoSnapshot();
          syncBlocksFromDom();
          scheduleAutoSave();
        });
      });

      const removeBtn = wrapper.querySelector(`[data-remove-block="${block.id}"]`);
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          pushUndoSnapshot();
          editorState.blocks = editorState.blocks.filter((b) => b.id !== block.id);
          renderDynamicBlocks(editorState.blocks, true);
          scheduleAutoSave();
        });
      }

      const addRowBtn = wrapper.querySelector(`[data-add-row="${block.id}"]`);
      if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
          pushUndoSnapshot();
          const target = editorState.blocks.find((b) => b.id === block.id);
          if (target) {
            const colCount = (target.rows?.[0]?.length) || 3;
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

function syncBlocksFromDom() {
  const container = document.getElementById('dynamic-blocks-container');
  if (!container) return;

  editorState.blocks = editorState.blocks.map((block) => {
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    if (!el) return block;

    const updated = cloneState(block);
    el.querySelectorAll('[data-block-field]').forEach((fieldEl) => {
      updated[fieldEl.dataset.blockField] = fieldEl.innerText.trim();
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
}

function applyStateToDom(state, isEditMode) {
  Object.entries(state.texts || {}).forEach(([key, html]) => {
    const el = document.querySelector(`[data-edit-text="${key}"]`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  });

  Object.entries(state.colors || {}).forEach(([cssVar, value]) => {
    document.documentElement.style.setProperty(cssVar, value);
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
    const { data, error } = await supabase
      .from('site_content')
      .select('content')
      .eq('id', PAGE_ID)
      .maybeSingle();

    if (error || !data?.content) return;
    editorState = {
      texts: data.content.texts || {},
      colors: data.content.colors || {},
      images: data.content.images || {},
      backgrounds: data.content.backgrounds || {},
      blocks: data.content.blocks || []
    };
    applyStateToDom(editorState, isEditMode);
  } catch (err) {
    console.warn('Could not load saved site content:', err);
  }
}

function collectCurrentState() {
  syncBlocksFromDom();

  const texts = {};
  document.querySelectorAll('[data-edit-text]').forEach((el) => {
    if (!el.closest('#admin-editor-drawer')) {
      texts[el.dataset.editText] = el.innerHTML.trim();
    }
  });

  const colors = { ...(editorState.colors || {}) };
  document.querySelectorAll('#admin-editor-drawer input[type="color"][data-css-var]').forEach((input) => {
    colors[input.dataset.cssVar] = input.value;
  });

  const images = { ...(editorState.images || {}) };
  document.querySelectorAll('[data-edit-img]').forEach((img) => {
    if (!images[img.dataset.editImg]) {
      images[img.dataset.editImg] = img.getAttribute('src');
    }
  });

  editorState = {
    ...editorState,
    texts,
    colors,
    images
  };

  return cloneState(editorState);
}

async function saveNow(statusEl) {
  const payloadContent = collectCurrentState();
  if (statusEl) statusEl.textContent = 'Auto-saving...';

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

  if (statusEl) {
    statusEl.textContent = error
      ? `Save failed: ${error.message}`
      : `Auto-saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function scheduleAutoSave(statusEl) {
  if (statusEl) statusEl.textContent = 'Unsaved changes...';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveNow(statusEl);
  }, 1500);
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
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session || session.user?.email !== ADMIN_EMAIL) {
      alert('Unauthorized access. Please log in with your admin account.');
      window.location.href = '/pages/login.html';
      return;
    }

    enableTabbedEditor();
  }
});

function enableTabbedEditor() {
  const textTargets = document.querySelectorAll('[data-edit-text]');
  textTargets.forEach((el) => {
    if (el.closest('#admin-editor-drawer')) return;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed #71869A';
    el.style.outlineOffset = '4px';
    el.addEventListener('input', () => {
      pushUndoSnapshot();
      scheduleAutoSave(statusEl);
    });
  });

  const imgTargets = Array.from(document.querySelectorAll('[data-edit-img]'));
  const bgTargets = Array.from(document.querySelectorAll('[data-edit-bg]'));
  const computedStyles = getComputedStyle(document.documentElement);

  const drawer = document.createElement('div');
  drawer.id = 'admin-editor-drawer';
  drawer.innerHTML = `
    <div style="position: fixed; bottom: 24px; right: 24px; width: 340px; max-height: 82vh; overflow-y: auto; z-index: 99999; background: #202124; color: #F5F5F2; padding: 16px; border-radius: 14px; box-shadow: 0 14px 36px rgba(0,0,0,0.35); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.84rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: #C9D8E5; font-weight: 600;">STUDIO · ${PAGE_ID}</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" id="undo-btn" title="Undo (Cmd+Z)" style="padding:3px 8px;cursor:pointer;border-radius:4px;border:none;">Undo</button>
          <button type="button" id="redo-btn" title="Redo (Cmd+Y)" style="padding:3px 8px;cursor:pointer;border-radius:4px;border:none;">Redo</button>
          <a href="${window.location.pathname}" style="color: #9aa0a6; text-decoration: none; font-size: 0.76rem;">Exit</a>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; background: #15191F; padding: 4px; border-radius: 8px; margin-bottom: 12px;">
        <button type="button" class="editor-tab-btn" data-tab="text" style="padding: 6px; border: none; border-radius: 6px; background: #C9D8E5; color: #202124; font-weight: 600; cursor: pointer; font-size: 0.75rem;">Text</button>
        <button type="button" class="editor-tab-btn" data-tab="colors" style="padding: 6px; border: none; border-radius: 6px; background: transparent; color: #F1F2F0; font-weight: 600; cursor: pointer; font-size: 0.75rem;">Colors</button>
        <button type="button" class="editor-tab-btn" data-tab="images" style="padding: 6px; border: none; border-radius: 6px; background: transparent; color: #F1F2F0; font-weight: 600; cursor: pointer; font-size: 0.75rem;">Images</button>
        <button type="button" class="editor-tab-btn" data-tab="blocks" style="padding: 6px; border: none; border-radius: 6px; background: transparent; color: #F1F2F0; font-weight: 600; cursor: pointer; font-size: 0.75rem;">Add / Page</button>
      </div>

      <div id="panel-text" class="editor-tab-panel">
        <p style="color: #C9D8E5; font-size: 0.78rem; margin: 0;">Click any dashed-outline text or block to edit. Changes auto-save after you pause typing.</p>
      </div>

      <div id="panel-colors" class="editor-tab-panel" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="display:flex;justify-content:space-between;"><span>Background</span><input type="color" data-css-var="--bg-color" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--bg-color'), '#F5F5F2')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Main Text</span><input type="color" data-css-var="--text-main" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--text-main'), '#202124')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Card Surface</span><input type="color" data-css-var="--card-bg" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--card-bg'), '#FFFFFF')}"></label>
          <label style="display:flex;justify-content:space-between;"><span>Accent</span><input type="color" data-css-var="--slate-blue" value="${rgbOrHexToHex(computedStyles.getPropertyValue('--slate-blue'), '#71869A')}"></label>
        </div>
      </div>

      <div id="panel-images" class="editor-tab-panel" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <select id="editor-image-slot" style="width:100%;padding:6px;border-radius:6px;background:#15191F;color:#F1F2F0;border:1px solid #343D47;">
            ${imgTargets.map((img) => `<option value="img:${img.dataset.editImg}">Image: ${img.dataset.editImg}</option>`).join('')}
            ${bgTargets.map((bg) => `<option value="bg:${bg.dataset.editBg}">Banner: ${bg.dataset.editBg}</option>`).join('')}
          </select>
          <input type="file" id="editor-image-file" accept="image/*" style="width:100%;font-size:0.76rem;">
        </div>
      </div>

      <div id="panel-blocks" class="editor-tab-panel" style="display: none;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
          <button type="button" data-add-block="section" style="padding:7px;cursor:pointer;border-radius:6px;border:none;">+ Section</button>
          <button type="button" data-add-block="quiz" style="padding:7px;cursor:pointer;border-radius:6px;border:none;">+ Quiz</button>
          <button type="button" data-add-block="survey" style="padding:7px;cursor:pointer;border-radius:6px;border:none;">+ Survey</button>
          <button type="button" data-add-block="table" style="padding:7px;cursor:pointer;border-radius:6px;border:none;">+ Table</button>
          <button type="button" data-add-block="chart" style="grid-column:span 2;padding:7px;cursor:pointer;border-radius:6px;border:none;">+ Chart</button>
        </div>
        <div style="border-top:1px solid #343D47;padding-top:10px;">
          <label style="display:block;font-size:0.76rem;color:#C9D8E5;margin-bottom:4px;">New Page Slug (e.g. notes)</label>
          <div style="display:flex;gap:6px;">
            <input type="text" id="new-page-slug" placeholder="notes" style="flex:1;padding:6px;border-radius:6px;border:1px solid #343D47;background:#15191F;color:#fff;">
            <button type="button" id="create-page-btn" style="padding:6px 10px;cursor:pointer;border-radius:6px;border:none;">Create & Open</button>
          </div>
        </div>
      </div>

      <button type="button" id="save-now-btn" style="width:100%;margin-top:12px;padding:8px;border:none;border-radius:8px;background:#C9D8E5;color:#202124;font-weight:700;cursor:pointer;">Save Now</button>
      <span id="save-status-msg" style="display:block;margin-top:6px;font-size:0.74rem;text-align:center;color:#C9D8E5;">Auto-save active</span>
    </div>
  `;
  document.body.appendChild(drawer);

  const statusEl = drawer.querySelector('#save-status-msg');

  // Tabs
  const tabBtns = drawer.querySelectorAll('.editor-tab-btn');
  const tabPanels = drawer.querySelectorAll('.editor-tab-panel');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = '#F1F2F0';
      });
      btn.style.background = '#C9D8E5';
      btn.style.color = '#202124';
      tabPanels.forEach((p) => (p.style.display = 'none'));
      drawer.querySelector(`#panel-${btn.dataset.tab}`).style.display = 'block';
    });
  });

  // Colors
  drawer.querySelectorAll('input[type="color"][data-css-var]').forEach((input) => {
    input.addEventListener('input', (e) => {
      pushUndoSnapshot();
      document.documentElement.style.setProperty(e.target.dataset.cssVar, e.target.value);
      editorState.colors[e.target.dataset.cssVar] = e.target.value;
      scheduleAutoSave(statusEl);
    });
  });

  // Image upload
  drawer.querySelector('#editor-image-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const slotVal = drawer.querySelector('#editor-image-slot').value;
    if (!file || !slotVal) return;

    pushUndoSnapshot();
    const [kind, key] = slotVal.split(':');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${key}-${Date.now()}-${safeName}`;
    statusEl.textContent = 'Uploading image...';

    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, file, { upsert: true });
    if (error) {
      statusEl.textContent = `Upload error: ${error.message}`;
      return;
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    const url = data?.publicUrl;
    if (!url) return;

    if (kind === 'img') {
      editorState.images[key] = url;
    } else {
      editorState.backgrounds[key] = url;
    }

    applyStateToDom(editorState, true);
    await saveNow(statusEl);
  });

  // Insert blocks
  drawer.querySelectorAll('[data-add-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      const type = btn.dataset.addBlock;
      const newBlock = {
        id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type
      };
      if (type === 'chart') {
        const rawLabels = prompt('Chart labels (comma-separated):', 'Jan, Feb, Mar, Apr') || 'Jan, Feb, Mar';
        const rawValues = prompt('Chart numbers (comma-separated):', '10, 25, 18, 40') || '10, 25, 18';
        newBlock.labels = rawLabels.split(',').map((s) => s.trim());
        newBlock.values = rawValues.split(',').map((n) => Number(n.trim()) || 0);
      }
      editorState.blocks.push(newBlock);
      renderDynamicBlocks(editorState.blocks, true);
      scheduleAutoSave(statusEl);
    });
  });

  // Create new page record in Supabase and open it
  drawer.querySelector('#create-page-btn').addEventListener('click', async () => {
    const slugInput = drawer.querySelector('#new-page-slug');
    const slug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slug) return;

    const targetPageId = `page:${slug}`;
    await supabase.from('site_content').upsert(
      {
        id: targetPageId,
        content: {
          texts: {},
          colors: editorState.colors || {},
          images: {},
          backgrounds: {},
          blocks: [{ id: `blk_${Date.now()}`, type: 'section', title: slug.toUpperCase(), body: 'Start writing this page...' }]
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

  // Undo / Redo handlers
  const handleUndo = () => {
    if (!undoStack.length) return;
    redoStack.push(collectCurrentState());
    const prev = undoStack.pop();
    isApplyingHistory = true;
    editorState = prev;
    applyStateToDom(editorState, true);
    isApplyingHistory = false;
    scheduleAutoSave(statusEl);
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
    undoStack.push(collectCurrentState());
    const next = redoStack.pop();
    isApplyingHistory = true;
    editorState = next;
    applyStateToDom(editorState, true);
    isApplyingHistory = false;
    scheduleAutoSave(statusEl);
  };

  drawer.querySelector('#undo-btn').addEventListener('click', handleUndo);
  drawer.querySelector('#redo-btn').addEventListener('click', handleRedo);
  drawer.querySelector('#save-now-btn').addEventListener('click', () => saveNow(statusEl));

  document.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
      e.preventDefault();
      handleRedo();
    }
  });
}

function rgbOrHexToHex(colorStr, fallback) {
  const trimmed = (colorStr || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return fallback;
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}
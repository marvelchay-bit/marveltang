import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uxawnkddduhhvjhrvijn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_V8JViisHhHsXnTbx3bbtMw_nknLtOEZ';
const ADMIN_EMAIL = 'marveltang71@gmail.com';
const STORAGE_BUCKET = 'portfolio-assets';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Load saved text, colors, and images from Supabase for every visitor
async function loadSavedSiteContent() {
  try {
    const { data, error } = await supabase
      .from('site_content')
      .select('content')
      .eq('id', 'main')
      .maybeSingle();

    if (error || !data?.content) return;

    const { texts = {}, colors = {}, images = {}, backgrounds = {} } = data.content;

    Object.entries(texts).forEach(([key, html]) => {
      const el = document.querySelector(`[data-edit-text="${key}"]`);
      if (el) el.innerHTML = html;
    });

    Object.entries(colors).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value);
    });

    Object.entries(images).forEach(([key, url]) => {
      const img = document.querySelector(`[data-edit-img="${key}"]`);
      if (img && url) img.src = url;
    });

    Object.entries(backgrounds).forEach(([key, url]) => {
      const el = document.querySelector(`[data-edit-bg="${key}"]`);
      if (el && url) {
        el.style.backgroundImage = `linear-gradient(135deg, rgba(113, 134, 154, 0.4), rgba(201, 216, 229, 0.6)), url('${url}')`;
      }
    });
  } catch (err) {
    console.warn('Could not load saved site content:', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Always apply saved edits on page load
  await loadSavedSiteContent();

  // Wire up theme toggle button if present
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const nextTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', nextTheme);
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';

  if (isEditMode) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || session.user?.email !== ADMIN_EMAIL) {
      alert('Unauthorized access. Please log in with your admin account.');
      window.location.href = '/pages/login.html';
      return;
    }

    console.log('Admin authenticated. Unlocking visual editor...');
    enableTabbedEditor();
  }
});

function enableTabbedEditor() {
  // 1. Make tagged text elements directly editable
  const textTargets = document.querySelectorAll('[data-edit-text]');
  textTargets.forEach((el) => {
    if (el.closest('#admin-editor-drawer')) return;
    el.contentEditable = 'true';
    el.style.outline = '1px dashed #71869A';
    el.style.outlineOffset = '4px';
  });

  // Collect image & background targets
  const imgTargets = Array.from(document.querySelectorAll('[data-edit-img]'));
  const bgTargets = Array.from(document.querySelectorAll('[data-edit-bg]'));

  const computedStyles = getComputedStyle(document.documentElement);
  const currentBg = computedStyles.getPropertyValue('--bg-color').trim() || '#F5F5F2';
  const currentText = computedStyles.getPropertyValue('--text-main').trim() || '#202124';
  const currentCard = computedStyles.getPropertyValue('--card-bg').trim() || '#FFFFFF';
  const currentAccent = computedStyles.getPropertyValue('--slate-blue').trim() || '#71869A';

  // 2. Build floating tabbed admin panel
  const drawer = document.createElement('div');
  drawer.id = 'admin-editor-drawer';
  drawer.innerHTML = `
    <div style="position: fixed; bottom: 24px; right: 24px; width: 320px; z-index: 99999; background: #202124; color: #F5F5F2; padding: 18px; border-radius: 14px; box-shadow: 0 14px 36px rgba(0,0,0,0.35); font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.85rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; letter-spacing: 0.06em; color: #C9D8E5; font-weight: 600;">ADMIN STUDIO</span>
        <a href="${window.location.pathname}" style="color: #9aa0a6; text-decoration: none; font-size: 0.78rem;">Exit Edit</a>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; background: #15191F; padding: 4px; border-radius: 8px; margin-bottom: 14px;">
        <button type="button" class="editor-tab-btn" data-tab="text" style="padding: 6px; border: none; border-radius: 6px; background: #C9D8E5; color: #202124; font-weight: 600; cursor: pointer; font-size: 0.78rem;">Text</button>
        <button type="button" class="editor-tab-btn" data-tab="colors" style="padding: 6px; border: none; border-radius: 6px; background: transparent; color: #F1F2F0; font-weight: 600; cursor: pointer; font-size: 0.78rem;">Colors</button>
        <button type="button" class="editor-tab-btn" data-tab="images" style="padding: 6px; border: none; border-radius: 6px; background: transparent; color: #F1F2F0; font-weight: 600; cursor: pointer; font-size: 0.78rem;">Images</button>
      </div>

      <!-- TAB 1: TEXT -->
      <div id="panel-text" class="editor-tab-panel">
        <p style="color: #C9D8E5; font-size: 0.8rem; line-height: 1.45; margin: 0;">
          Click any dashed-outline heading, paragraph, or tag directly on the page to edit its copy in place.
        </p>
      </div>

      <!-- TAB 2: COLORS -->
      <div id="panel-colors" class="editor-tab-panel" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <label style="display: flex; justify-content: space-between; align-items: center;">
            <span>Background</span>
            <input type="color" data-css-var="--bg-color" value="${rgbOrHexToHex(currentBg, '#F5F5F2')}">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center;">
            <span>Main Text</span>
            <input type="color" data-css-var="--text-main" value="${rgbOrHexToHex(currentText, '#202124')}">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center;">
            <span>Card Surface</span>
            <input type="color" data-css-var="--card-bg" value="${rgbOrHexToHex(currentCard, '#FFFFFF')}">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center;">
            <span>Accent / Slate</span>
            <input type="color" data-css-var="--slate-blue" value="${rgbOrHexToHex(currentAccent, '#71869A')}">
          </label>
        </div>
      </div>

      <!-- TAB 3: IMAGES -->
      <div id="panel-images" class="editor-tab-panel" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <label style="font-size: 0.78rem; color: #C9D8E5;">Target Slot</label>
          <select id="editor-image-slot" style="width: 100%; padding: 7px; border-radius: 6px; background: #15191F; color: #F1F2F0; border: 1px solid #343D47;">
            ${imgTargets.map((img) => `<option value="img:${img.dataset.editImg}">Image: ${img.dataset.editImg}</option>`).join('')}
            ${bgTargets.map((bg) => `<option value="bg:${bg.dataset.editBg}">Banner: ${bg.dataset.editBg}</option>`).join('')}
          </select>
          <input type="file" id="editor-image-file" accept="image/*" style="width: 100%; font-size: 0.78rem; color: #F1F2F0;">
          <span id="editor-upload-status" style="font-size: 0.75rem; color: #9aa0a6;"></span>
        </div>
      </div>

      <button type="button" id="save-publish-btn" style="width: 100%; margin-top: 16px; padding: 10px; border: none; border-radius: 8px; background: #C9D8E5; color: #202124; font-weight: 700; cursor: pointer;">
        Save & Publish to Supabase
      </button>
      <span id="save-status-msg" style="display: block; margin-top: 8px; font-size: 0.76rem; text-align: center; color: #C9D8E5;"></span>
    </div>
  `;
  document.body.appendChild(drawer);

  // Tab switching
  const tabButtons = drawer.querySelectorAll('.editor-tab-btn');
  const tabPanels = drawer.querySelectorAll('.editor-tab-panel');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = '#F1F2F0';
      });
      btn.style.background = '#C9D8E5';
      btn.style.color = '#202124';

      tabPanels.forEach((p) => (p.style.display = 'none'));
      drawer.querySelector(`#panel-${btn.dataset.tab}`).style.display = 'block';
    });
  });

  // Live color preview
  const colorInputs = drawer.querySelectorAll('input[type="color"][data-css-var]');
  colorInputs.forEach((input) => {
    input.addEventListener('input', (e) => {
      document.documentElement.style.setProperty(e.target.dataset.cssVar, e.target.value);
    });
  });

  // Image upload to Supabase Storage
  const fileInput = drawer.querySelector('#editor-image-file');
  const slotSelect = drawer.querySelector('#editor-image-slot');
  const uploadStatus = drawer.querySelector('#editor-upload-status');

  const uploadedImages = {};
  const uploadedBackgrounds = {};

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !slotSelect.value) return;

    const [kind, key] = slotSelect.value.split(':');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${key}-${Date.now()}-${safeName}`;

    uploadStatus.textContent = 'Uploading to Supabase Storage...';

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      uploadStatus.textContent = `Upload failed: ${uploadError.message}`;
      return;
    }

    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) {
      uploadStatus.textContent = 'Could not resolve public URL.';
      return;
    }

    if (kind === 'img') {
      const imgEl = document.querySelector(`[data-edit-img="${key}"]`);
      if (imgEl) imgEl.src = publicUrl;
      uploadedImages[key] = publicUrl;
    } else if (kind === 'bg') {
      const bgEl = document.querySelector(`[data-edit-bg="${key}"]`);
      if (bgEl) {
        bgEl.style.backgroundImage = `linear-gradient(135deg, rgba(113, 134, 154, 0.4), rgba(201, 216, 229, 0.6)), url('${publicUrl}')`;
      }
      uploadedBackgrounds[key] = publicUrl;
    }

    uploadStatus.textContent = 'Uploaded! Click "Save & Publish" to persist.';
  });

  // Save text, colors, and images to site_content table
  const saveBtn = drawer.querySelector('#save-publish-btn');
  const saveMsg = drawer.querySelector('#save-status-msg');

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveMsg.textContent = 'Saving...';

    const texts = {};
    textTargets.forEach((el) => {
      texts[el.dataset.editText] = el.innerHTML.trim();
    });

    const colors = {};
    colorInputs.forEach((input) => {
      colors[input.dataset.cssVar] = input.value;
    });

    const images = { ...uploadedImages };
    imgTargets.forEach((img) => {
      if (!images[img.dataset.editImg]) {
        images[img.dataset.editImg] = img.getAttribute('src');
      }
    });

    const backgrounds = { ...uploadedBackgrounds };

    const { error } = await supabase
      .from('site_content')
      .upsert(
        {
          id: 'main',
          content: { texts, colors, images, backgrounds },
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    saveBtn.disabled = false;
    if (error) {
      saveMsg.textContent = `Save failed: ${error.message}`;
    } else {
      saveMsg.textContent = 'Saved & published live!';
    }
  });
}

function rgbOrHexToHex(colorStr, fallback) {
  const trimmed = colorStr.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return fallback;
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}
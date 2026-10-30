import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 1. Initialize Supabase with your project credentials
const SUPABASE_URL = 'https://uxawnkddduhhvjhrvijn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_V8JViisHhHsXnTbx3bbtMw_nknLtOEZ'; // Your Publishable Key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';

  if (isEditMode) {
    // 2. Check if there is an active logged-in session
    const { data: { session } } = await supabase.auth.getSession();

    // 3. Verify the user is logged in and matches your email
    if (!session || session.user.email !== 'marveltang71@gmail.com') {
      alert('Unauthorized access. Please log in with your admin account.');
      window.location.href = '/pages/login.html';
      return;
    }

    // 4. Authenticated successfully! Launch your visual canvas editor
    console.log('Admin authenticated. Unlocking canvas editor...');
    enableVisualCanvasEditor(session.access_token);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get('edit') === 'true';

  if (isEditMode) {
    enableGitHubEditor();
  }
});

function enableGitHubEditor() {
  // 1. Add floating editor bar with GitHub Publish button
  const adminBar = document.createElement('div');
  adminBar.id = 'canvas-editor-bar';
  adminBar.innerHTML = `
    <div style="position: fixed; bottom: 24px; right: 24px; z-index: 99999; background: #202124; color: #F5F5F2; padding: 12px 20px; border-radius: 40px; box-shadow: 0 12px 30px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 16px; font-family: sans-serif; font-size: 0.85rem;">
      <span style="font-family: monospace; letter-spacing: 0.05em; color: #C9D8E5; font-weight: 600;">CLOUD EDIT MODE</span>
      <button id="publish-github-btn" style="background: #C9D8E5; color: #202124; border: none; padding: 8px 18px; border-radius: 20px; font-weight: 600; cursor: pointer;">Publish to Live</button>
      <button id="clear-token-btn" style="background: transparent; color: #A0A5AA; border: none; cursor: pointer; font-size: 0.75rem;">Reset Token</button>
      <a href="${window.location.pathname}" style="color: #A0A5AA; text-decoration: none; font-size: 0.8rem;">Exit</a>
    </div>
  `;
  document.body.appendChild(adminBar);

  // 2. Make text elements editable
  const editableTargets = document.querySelectorAll('h1, h2, h3, p, .mono, .tag-pill');
  editableTargets.forEach(el => {
    if (el.closest('.nav-ribbon') || el.closest('#canvas-editor-bar')) return;
    el.contentEditable = "true";
    el.style.outline = "1px dashed #71869A";
    el.style.outlineOffset = "4px";
  });

  // Reset stored token if requested
  document.getElementById('clear-token-btn').addEventListener('click', () => {
    localStorage.removeItem('github_pat_token');
    alert('Saved token cleared.');
  });

  // 3. Handle Publish Action
  document.getElementById('publish-github-btn').addEventListener('click', async () => {
    let token = localStorage.getItem('github_pat_token');

    if (!token) {
      token = prompt("Enter your GitHub Personal Access Token to publish:");
      if (!token) return;
      localStorage.setItem('github_pat_token', token);
    }

    // Clean up temporary edit attributes before generating final HTML string
    editableTargets.forEach(el => {
      el.removeAttribute('contenteditable');
      el.style.outline = '';
    });
    document.getElementById('canvas-editor-bar').remove();

    const updatedHTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    
    // Determine file path based on URL (e.g., index.html or pages/blog.html)
    let filePath = window.location.pathname.replace(/^\//, '');
    if (!filePath || filePath === '') filePath = 'index.html';

    const repo = 'marvelchay-bit/marveltang';
    const branch = 'main';

    try {
      // Step A: Get current file SHA from GitHub
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
        headers: { Authorization: `token ${token}` }
      });
      const getData = await getRes.json();
      const sha = getData.sha;

      // Step B: Push updated file content
      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update ${filePath} via visual editor`,
          content: btoa(unescape(encodeURIComponent(updatedHTML))),
          sha: sha,
          branch: branch
        })
      });

      if (putRes.ok) {
        alert("Successfully published! Cloudflare Pages is updating your live site now.");
        location.reload();
      } else {
        const err = await putRes.json();
        alert("Publish failed: " + err.message);
        localStorage.removeItem('github_pat_token'); // Clear if invalid
        location.reload();
      }
    } catch (error) {
      alert("Error connecting to GitHub API: " + error.message);
      location.reload();
    }
  });
}

// ================================================================
// STATE
// ================================================================
let currentScreen = 'screen-home';
let manualSongs = [];
let autoSongs = [];
let autoConfig = {};
let presSlides = [];
let presCurrentIdx = 0;
let ytPlayer = null;
let ytReady = false;
let exportHtmlContent = '';
let audioPlayer = new Audio();
let audioCurrentIdx = null;
const AUDIO_EXTRACT_API = localStorage.getItem('blindtestAudioExtractApi') || 'http://localhost:3478/api/extract';

// ================================================================
// WEB AUDIO — Fade in / Fade out (1.5 s)
// ================================================================
let _audioCtx = null;
let _gainNode = null;
let _audioSource = null;
const FADE_DURATION = 1.5; // secondes

function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _gainNode = _audioCtx.createGain();
    _gainNode.connect(_audioCtx.destination);
  }
  return { ctx: _audioCtx, gain: _gainNode };
}

function connectAudioToGain(player) {
  // Déconnecter l'ancienne source si elle existe
  try { if (_audioSource) { _audioSource.disconnect(); _audioSource = null; } } catch(e) {}
  const { ctx, gain } = getAudioCtx();
  // Reprendre le contexte si suspendu (politique autoplay)
  if (ctx.state === 'suspended') ctx.resume();
  _audioSource = ctx.createMediaElementSource(player);
  _audioSource.connect(gain);
}

function fadeIn(onComplete) {
  const { ctx, gain } = getAudioCtx();
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_DURATION);
  if (onComplete) setTimeout(onComplete, FADE_DURATION * 1000);
}

function fadeOut(onComplete) {
  const { ctx, gain } = getAudioCtx();
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
  if (onComplete) setTimeout(onComplete, FADE_DURATION * 1000);
}

function stopAudioWithFade(cb) {
  clearTimeout(window._audioStopTimer);
  clearTimeout(window._audioFadeOutTimer);
  fadeOut(() => {
    audioPlayer.pause();
    updatePlayBtn(false);
    if (cb) cb();
  });
}

// ================================================================
// NAVIGATION
// ================================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); currentScreen = id; }
}

function goHome() {
  showScreen('screen-home');
}

function selectMode(mode) {
  showScreen(mode === 'manual' ? 'screen-manual-cfg' : 'screen-auto-cfg');
}

// Mode card hover effects
document.querySelectorAll('.mode-card').forEach(card => {
  const isManual = card.dataset.mode === 'manual';
  const col = isManual ? 'rgba(0,245,255,' : 'rgba(255,45,120,';
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = col + '0.5)';
    card.style.boxShadow = `0 0 40px ${col}0.18), inset 0 0 20px rgba(0,0,0,.3)`;
    card.style.transform = 'translateY(-5px) scale(1.02)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'rgba(180,0,255,.25)';
    card.style.boxShadow = '';
    card.style.transform = '';
  });
});

// ================================================================
// AUTO CFG LIVE INFO
// ================================================================
function updateAutoInfo() {
  const r = parseInt(document.getElementById('auto-rounds').value) || 3;
  const s = parseInt(document.getElementById('auto-spr').value) || 5;
  document.getElementById('auto-cfg-info').textContent = `▶ ${r * s} CHANSONS (${r} manches × ${s})`;
}
['auto-rounds','auto-spr','auto-duration'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateAutoInfo);
});

// ================================================================
// MANUAL TABLE
// ================================================================
function makeManualRow(data = {}) {
  return {
    id: Date.now() + Math.random(),
    selected: true,
    artist: data.artist || '',
    title: data.title || '',
    mp3Data: data.mp3Data || '',
    mp3Name: data.mp3Name || '',
    url: data.url || '',
    start: data.start || '0:30',
    duration: data.duration || '30',
    bonus: data.bonus || '',
    bonusAnswer: data.bonusAnswer || '',
  };
}

function initManualTable() {
  const theme = document.getElementById('manual-theme').value.trim();
  const count = parseInt(document.getElementById('manual-count').value) || 10;
  if (!theme) { alert('Veuillez saisir un thème !'); return; }
  manualSongs = Array.from({ length: count }, () => makeManualRow());
  document.getElementById('manual-table-title').textContent = '🎵 ' + theme;
  renderManualTable();
  showScreen('screen-manual-table');
}

function renderManualTable() {
  const tbody = document.getElementById('manual-tbody');
  tbody.innerHTML = '';
  manualSongs.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.style.background = row.selected ? 'rgba(0,245,255,.02)' : 'transparent';
    tr.innerHTML = `
      <td style="padding:7px 6px"><input type="checkbox" class="check-cb" ${row.selected ? 'checked' : ''} data-idx="${i}" data-field="selected" onchange="updateManualRow(parseInt(this.dataset.idx),'selected',this.checked)"></td>
      ${['artist','title'].map(f => `
        <td><input class="cell-inp" value="${escHtml(row[f])}" placeholder="${f==='start'?'0:30':f==='duration'?'30':'...'}" data-idx="${i}" data-field="${f}" onchange="updateManualRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>
      `).join('')}
      ${buildMp3Cell('manual', i, row)}
      <td style="position:relative">
        <input class="cell-inp" id="manual-url-${i}" value="${escHtml(row.url)}" placeholder="https://youtu.be/..." data-idx="${i}" data-field="url"
          onchange="updateManualRow(parseInt(this.dataset.idx),'url',this.value);onYoutubeUrlChange('manual',parseInt(this.dataset.idx),this.value)">
        <span id="manual-url-spin-${i}" style="display:none;position:absolute;right:7px;top:50%;transform:translateY(-50%);font-size:.7rem;animation:spin .75s linear infinite;color:var(--cyan)">⟳</span>
      </td>
      ${['start','duration','bonus','bonusAnswer'].map(f => `
        <td><input class="cell-inp" value="${escHtml(row[f])}" placeholder="${f==='start'?'0:30':f==='duration'?'30':'...'}" data-idx="${i}" data-field="${f}" onchange="updateManualRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>
      `).join('')}
      <td><button class="del-btn" data-idx="${i}" onclick="deleteManualRow(parseInt(this.dataset.idx))">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  updateManualCount();
}

function updateManualRow(i, field, val) {
  manualSongs[i][field] = (field === 'selected') ? val : val;
  if (field === 'selected') updateManualCount();
}

// ----------------------------------------------------------------
// AUTO-FILL depuis YouTube URL (modes manual + auto)
// ----------------------------------------------------------------
async function fetchYoutubeTitle(url) {
  try {
    const oembed = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
    const res = await fetch(oembed);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch { return null; }
}

function parseArtistTitle(raw) {
  if (!raw) return { artist: '', title: '' };
  const sep = raw.match(/^(.+?)\s[-\u2013\u2014]\s(.+)$/);
  if (sep) return { artist: sep[1].trim(), title: sep[2].trim() };
  return { artist: '', title: raw.trim() };
}

function getActiveLlmConfig() {
  if (autoConfig && autoConfig.llm && (autoConfig.llm.apiKey || autoConfig.llm.id === 'albert')) {
    return autoConfig.llm;
  }
  try {
    const cfg = getLlmConfig();
    if (cfg.apiKey || cfg.id === 'albert') return cfg;
  } catch {}
  return null;
}

async function onYoutubeUrlChange(mode, i, url) {
  url = (url || '').trim();
  if (!url || !extractYoutubeId(url)) return;
  const songs = getSongCollection(mode);
  if (!songs[i]) return;
  const row = songs[i];
  const spinEl = document.getElementById(mode + '-url-spin-' + i);
  if (spinEl) spinEl.style.display = 'inline-block';
  try {
    const ytTitle = await fetchYoutubeTitle(url);
    let artist = row.artist || '';
    let title = row.title || '';
    if (ytTitle && (!artist || !title)) {
      const parsed = parseArtistTitle(ytTitle);
      if (!artist && parsed.artist) artist = parsed.artist;
      if (!title) title = parsed.title || ytTitle;
    }
    if (artist && !songs[i].artist) {
      songs[i].artist = artist;
      const el = document.querySelector('[data-idx="' + i + '"][data-field="artist"]');
      if (el) { el.value = artist; el.style.borderColor = 'var(--green)'; setTimeout(() => { el.style.borderColor = ''; }, 1800); }
    }
    if (title && !songs[i].title) {
      songs[i].title = title;
      const el = document.querySelector('[data-idx="' + i + '"][data-field="title"]');
      if (el) { el.value = title; el.style.borderColor = 'var(--green)'; setTimeout(() => { el.style.borderColor = ''; }, 1800); }
    }
    const hasBonusAlready = songs[i].bonus && songs[i].bonus.trim();
    const usedArtist = songs[i].artist;
    const usedTitle = songs[i].title;
    if (!hasBonusAlready && usedArtist && usedTitle) {
      const llmCfg = getActiveLlmConfig();
      if (llmCfg) {
        const bonusPrompt = 'Tu es un expert en musique. Pour la chanson "' + usedArtist + ' - ' + usedTitle + '", génère UNE question bonus courte et intéressante (anecdote, fait musical, histoire de la chanson, etc.) et sa réponse.\nRéponds UNIQUEMENT avec un objet JSON sans markdown ni backticks :\n{"bonus":"La question bonus ici ?","bonusAnswer":"La réponse ici"}';
        try {
          const llmText = await callLlm(bonusPrompt, llmCfg);
          const parsed = extractJsonPayload(llmText);
          if (parsed && parsed.bonus) {
            songs[i].bonus = parsed.bonus;
            songs[i].bonusAnswer = parsed.bonusAnswer || '';
            const bEl = document.querySelector('[data-idx="' + i + '"][data-field="bonus"]');
            const baEl = document.querySelector('[data-idx="' + i + '"][data-field="bonusAnswer"]');
            if (bEl) { bEl.value = parsed.bonus; bEl.style.borderColor = 'var(--cyan)'; setTimeout(() => { bEl.style.borderColor = ''; }, 2200); }
            if (baEl) { baEl.value = parsed.bonusAnswer || ''; baEl.style.borderColor = 'var(--cyan)'; setTimeout(() => { baEl.style.borderColor = ''; }, 2200); }
          }
        } catch {}
      }
    }
  } catch {}
  if (spinEl) spinEl.style.display = 'none';
}

function updateManualCount() {
  const sel = manualSongs.filter(s => s.selected).length;
  document.getElementById('manual-sel-count').textContent = `${sel} chanson(s) sélectionnée(s)`;
}

function addManualRow() {
  manualSongs.push(makeManualRow());
  renderManualTable();
}

function deleteManualRow(i) {
  manualSongs.splice(i, 1);
  renderManualTable();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildMp3Cell(mode, i, row) {
  const name = row.mp3Name ? escHtml(row.mp3Name) : 'Aucun MP3';
  const removeBtn = row.mp3Data ? `<button class="del-btn" type="button" onclick="removeMp3('${mode}',${i})" title="Retirer le MP3">✕</button>` : '';
  return `<td>
    <input type="file" accept="audio/mpeg,audio/mp3,audio/*" style="display:none" id="${mode}-mp3-${i}" onchange="handleMp3Upload('${mode}',${i},this.files[0]);this.value=''">
    <button class="btn btn-cyan btn-sm" type="button" style="padding:5px 9px;font-size:.42rem" onclick="document.getElementById('${mode}-mp3-${i}').click()">MP3</button>
    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;min-width:0">
      <span style="font-size:.52rem;color:${row.mp3Data ? 'var(--green)' : 'rgba(255,255,255,.35)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:105px">${name}</span>
      ${removeBtn}
    </div>
  </td>`;
}

function getSongCollection(mode) {
  return mode === 'manual' ? manualSongs : autoSongs;
}

function handleMp3Upload(mode, i, file) {
  if (!file) return;
  const looksAudio = file.type.startsWith('audio/') || /\.(mp3|mpeg|wav|ogg|m4a)$/i.test(file.name);
  if (!looksAudio) {
    alert('Veuillez choisir un fichier audio MP3.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const songs = getSongCollection(mode);
    if (!songs[i]) return;
    songs[i].mp3Data = String(reader.result || '');
    songs[i].mp3Name = file.name;
    mode === 'manual' ? renderManualTable() : renderAutoTable();
  };
  reader.onerror = () => alert('Impossible de lire ce fichier MP3.');
  reader.readAsDataURL(file);
}

function removeMp3(mode, i) {
  const songs = getSongCollection(mode);
  if (!songs[i]) return;
  songs[i].mp3Data = '';
  songs[i].mp3Name = '';
  mode === 'manual' ? renderManualTable() : renderAutoTable();
}

// ================================================================
// LLM AUTO GENERATION
// ================================================================
const LLM_PROVIDERS = {
  mistral: {
    label: 'Mistral',
    model: 'mistral-small-latest',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
    url: 'https://api.mistral.ai/v1/chat/completions',
    mode: 'openai',
    help: "Utilise l'API Mistral avec authentification Bearer."
  },
  perplexity: {
    label: 'Perplexity',
    model: 'sonar',
    models: ['sonar', 'sonar-pro', 'sonar-reasoning', 'sonar-reasoning-pro', 'sonar-deep-research'],
    url: 'https://api.perplexity.ai/chat/completions',
    mode: 'openai',
    help: "Utilise l'API Perplexity Chat Completions avec authentification Bearer."
  },
  claude: {
    label: 'Claude AI',
    model: 'claude-haiku-4-5-20251001',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
    url: 'https://api.anthropic.com/v1/messages',
    mode: 'anthropic',
    help: "Utilise l'API Anthropic Messages avec en-tête x-api-key."
  },
  gemini: {
    label: 'Gemini',
    model: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    mode: 'gemini',
    help: 'Utilise Google AI Studio. Gemini est disponible, mais pas sélectionné par défaut.'
  },
  openai: {
    label: 'ChatGPT',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    url: 'https://api.openai.com/v1/chat/completions',
    mode: 'openai',
    help: "Utilise l'API OpenAI Chat Completions avec authentification Bearer."
  },
  albert: {
    label: 'API Albert',
    model: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
    models: [
      'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
      'openai/gpt-oss-120b',
      'Qwen/Qwen3-Coder-30B-A3B-Instruct',
      'mistralai/Ministral-3-8B-Instruct-2512'
    ],
    url: 'https://albert.api.etalab.gouv.fr/v1/chat/completions',
    proxyUrl: '',
    mode: 'openai',
    help: "API Albert (IA souveraine française, DINUM). OBLIGATOIRE: configurez l'URL de votre worker n8n ci-dessous pour contourner CORS. Sans worker, l'API Albert ne fonctionnera pas."
  },
  custom: {
    label: 'LLM personnalisé',
    model: '',
    models: [],
    url: '',
    proxyUrl: '',
    mode: 'openai',
    help: "Utilisez une API compatible OpenAI. Renseignez l'URL complète de chat completions."
  }
};

const LLM_STORAGE_PREFIX = 'blindtest_llm_';
let llmModelAccess = {};

function getSavedLlmSettings(providerId) {
  try {
    return JSON.parse(localStorage.getItem(LLM_STORAGE_PREFIX + providerId) || '{}');
  } catch {
    return {};
  }
}

function setLlmStatus(msg, type = 'info') {
  const el = document.getElementById('auto-llm-status');
  if (!el) return;
  const colors = {
    info: 'rgba(0,245,255,.75)',
    success: 'var(--green)',
    error: '#ff5555'
  };
  el.textContent = msg;
  el.style.color = colors[type] || colors.info;
  el.style.display = 'block';
}

function getLlmConfig() {
  const providerId = document.getElementById('auto-provider')?.value || 'albert';
  const provider = LLM_PROVIDERS[providerId] || LLM_PROVIDERS.mistral;
  return {
    id: providerId,
    label: provider.label,
    mode: provider.mode,
    model: document.getElementById('auto-model').value.trim() || provider.model,
    url: document.getElementById('auto-baseurl').value.trim() || provider.url,
    proxyUrl: document.getElementById('auto-proxyurl')?.value.trim() || provider.proxyUrl || '',
    apiKey: document.getElementById('auto-apikey').value.trim()
  };
}

function getModelListUrl(cfg) {
  if (cfg.id === 'custom') return '';
  if (cfg.mode === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models';
  try {
    const url = new URL(cfg.url);
    url.pathname = url.pathname
      .replace(/\/chat\/completions\/?$/, '/models')
      .replace(/\/messages\/?$/, '/models');
    return url.toString();
  } catch {
    return '';
  }
}

function getDefaultModel(providerId) {
  const provider = LLM_PROVIDERS[providerId] || LLM_PROVIDERS.mistral;
  return provider.model || provider.models?.[0] || '';
}

function updateLlmFields() {
  const providerId = document.getElementById('auto-provider')?.value || 'albert';
  const provider = LLM_PROVIDERS[providerId] || LLM_PROVIDERS.mistral;
  const saved = getSavedLlmSettings(providerId);
  const modelEl = document.getElementById('auto-model');
  const modelListEl = document.getElementById('auto-model-list');
  const baseUrlEl = document.getElementById('auto-baseurl');
  const baseUrlWrap = document.getElementById('auto-baseurl-wrap');
  const proxyUrlEl = document.getElementById('auto-proxyurl');
  const proxyWrap = document.getElementById('auto-proxy-wrap');
  const apiKeyEl = document.getElementById('auto-apikey');
  const helpEl = document.getElementById('auto-provider-help');

  if (modelListEl) {
    modelListEl.innerHTML = '';
  }
  if (modelEl) {
    modelEl.value = '';
    modelEl.disabled = true;
    modelEl.placeholder = saved.model
      ? `Testez la connexion pour réactiver ${saved.model}`
      : 'Testez la connexion pour charger les modèles';
  }
  if (baseUrlEl) {
    baseUrlEl.value = saved.url || (providerId === 'custom' ? '' : provider.url);
    baseUrlEl.placeholder = provider.url || 'https://.../v1/chat/completions';
  }
  if (proxyUrlEl) {
    proxyUrlEl.value = saved.proxyUrl || provider.proxyUrl || '';
    proxyUrlEl.placeholder = provider.proxyUrl || 'https://n8n.incubateur.education.gouv.fr/webhook/blindtest-llm-proxy';
  }
  if (apiKeyEl) {
    apiKeyEl.value = saved.apiKey || '';
    apiKeyEl.placeholder = providerId === 'albert'
      ? 'Clé Albert (ou vide si configurée dans le worker n8n)'
      : 'Clé API du fournisseur choisi';
  }
  if (baseUrlWrap) {
    baseUrlWrap.style.display = ['albert', 'custom'].includes(providerId) ? 'block' : 'none';
  }
  if (proxyWrap) {
    proxyWrap.style.display = ['albert', 'custom'].includes(providerId) ? 'block' : 'none';
  }
  if (helpEl) helpEl.textContent = saved.apiKey ? `${provider.help} Clé enregistrée pour ce fournisseur.` : provider.help;
  const statusEl = document.getElementById('auto-llm-status');
  if (statusEl) statusEl.style.display = 'none';
  llmModelAccess[providerId] = false;
}

function saveLlmSettings() {
  const cfg = getLlmConfig();
  if (cfg.id === 'albert' && !cfg.proxyUrl) { setLlmStatus("Pour Albert, l'URL du worker n8n est OBLIGATOIRE. Configurez-la avant d'enregistrer.", 'error'); return; }
  if (!cfg.apiKey && cfg.id !== 'albert') { setLlmStatus(`Saisissez une clé API ${cfg.label} avant d'enregistrer.`, 'error'); return; }
  if (cfg.id === 'custom' && !cfg.url) { setLlmStatus('Saisissez une URL API pour ce fournisseur personnalisé.', 'error'); return; }
  localStorage.setItem(LLM_STORAGE_PREFIX + cfg.id, JSON.stringify({
    apiKey: cfg.apiKey,
    model: document.getElementById('auto-model').disabled ? '' : cfg.model,
    url: cfg.url,
    proxyUrl: cfg.proxyUrl
  }));
  setLlmStatus(`Clé API ${cfg.label} enregistrée dans ce navigateur.`, 'success');
}

async function readErrorMessage(res, providerLabel) {
  const raw = await res.text();
  console.error('Error response from API:', raw);
  try {
    const err = JSON.parse(raw);
    return err.error?.message || err.message || `${providerLabel} ${res.status}`;
  } catch {
    return raw || `${providerLabel} ${res.status}`;
  }
}

function explainNetworkError(error, cfg) {
  const msg = error?.message || String(error || '');
  if (/networkerror|failed to fetch|load failed|fetch resource/i.test(msg)) {
    if (cfg?.id === 'albert') {
      return "Le navigateur ne peut pas joindre Albert directement (CORS). Vérifiez l'URL du worker n8n, la clé Albert, et que le worker est bien actif.";
    }
    return "Erreur réseau. Vérifiez la connexion, l'URL API et les autorisations CORS du fournisseur.";
  }
  if (/json.*parse|json.*invalid/i.test(msg)) {
    if (cfg?.id === 'albert') {
      return "Le worker n8n retourne une réponse invalide. Vérifiez que l'URL du worker est correcte et que le worker est actif. URL par défaut: https://n8n.incubateur.education.gouv.fr/webhook/blindtest-llm-proxy";
    }
    return 'Réponse JSON invalide. Vérifiez la configuration du proxy.';
  }
  return msg;
}

async function llmFetch(cfg, url, options = {}) {
  // Albert MUST go through the n8n proxy (CORS blocks direct calls)
  if (cfg.id === 'albert' && !cfg.proxyUrl) {
    throw new Error('NetworkError: le worker n8n est requis pour Albert (champ URL Worker n8n vide).');
  }
  if (!cfg.proxyUrl) return fetch(url, options);

  let body = options.body || null;
  if (body && typeof body !== 'string') body = JSON.stringify(body);

  if (cfg.id === 'albert') {
    const albertPayload = {};
    if ((options.method || 'GET').toUpperCase() === 'GET') {
      albertPayload._get = new URL(url).pathname.replace(/^\/v1/, '') || '/models';
    } else {
      Object.assign(albertPayload, body ? JSON.parse(body) : {});
      albertPayload._path = new URL(url).pathname.replace(/^\/v1/, '') || '/chat/completions';
    }
    const res = await fetch(cfg.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(albertPayload)
    });
    // Log response for debugging
    if (!res.ok) {
      const raw = await res.text();
      console.error('Albert proxy error response:', raw);
      throw new Error(`Proxy error ${res.status}: ${raw}`);
    }
    return res;
  }

  return fetch(cfg.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body
    })
  });
}

async function callLlm(prompt, cfg) {
  if (cfg.mode === 'gemini') {
    const url = cfg.url.replace('{model}', encodeURIComponent(cfg.model));
    const res = await llmFetch(cfg, `${url}?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 4096 }
      })
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, cfg.label));
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (cfg.mode === 'anthropic') {
    const res = await llmFetch(cfg, cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        temperature: 0.85,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, cfg.label));
    const data = await res.json();
    return (data.content || []).map(part => part.text || '').join('\n');
  }

  const res = await llmFetch(cfg, cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.85,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, cfg.label));
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('JSON parse error, raw response:', raw);
    throw new Error(`Réponse JSON invalide du proxy: ${raw.substring(0, 200)}...`);
  }
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
}

async function fetchLlmModels(cfg) {
  if (cfg.id === 'custom') return [];

  if (cfg.mode === 'gemini') {
    const url = `${getModelListUrl(cfg)}?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await llmFetch(cfg, url);
    if (!res.ok) throw new Error(await readErrorMessage(res, cfg.label));
    const data = await res.json();
    return (data.models || [])
      .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }

  const modelsUrl = getModelListUrl(cfg);
  if (!modelsUrl) return [];
  const headers = cfg.mode === 'anthropic'
    ? {
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      }
    : {
        'Authorization': `Bearer ${cfg.apiKey}`
      };

  const res = await llmFetch(cfg, modelsUrl, { headers });
  if (!res.ok) throw new Error(await readErrorMessage(res, cfg.label));
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('JSON parse error in fetchLlmModels, raw response:', raw);
    throw new Error(`Réponse JSON invalide du proxy (models): ${raw.substring(0, 200)}...`);
  }
  const CHAT_TYPES = ['text-generation', 'image-text-to-text'];
  return (data.data || data.models || [])
    .filter(m => !m.type || CHAT_TYPES.includes(m.type))
    .map(m => m.id || m.name)
    .filter(Boolean);
}

function enableModelChoice(providerId, models, preferredModel = '') {
  const provider = LLM_PROVIDERS[providerId] || LLM_PROVIDERS.mistral;
  const saved = getSavedLlmSettings(providerId);
  const uniqueModels = Array.from(new Set((models || []).concat(provider.models || []).filter(Boolean)));
  const modelListEl = document.getElementById('auto-model-list');
  const modelEl = document.getElementById('auto-model');
  if (modelListEl) {
    modelListEl.innerHTML = uniqueModels.map(m => `<option value="${escHtml(m)}"></option>`).join('');
  }
  if (modelEl) {
    modelEl.disabled = false;
    modelEl.placeholder = 'Choisissez ou saisissez un modèle';
    modelEl.value = preferredModel || saved.model || uniqueModels[0] || getDefaultModel(providerId);
  }
  llmModelAccess[providerId] = true;
}

function extractJsonPayload(text) {
  const clean = String(text || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Try to extract JSON by finding matching brackets
    const startArray = clean.indexOf('[');
    const endArray = clean.lastIndexOf(']');
    if (startArray !== -1 && endArray > startArray) {
      try {
        return JSON.parse(clean.slice(startArray, endArray + 1));
      } catch {}
    }
    const startObject = clean.indexOf('{');
    const endObject = clean.lastIndexOf('}');
    if (startObject !== -1 && endObject > startObject) {
      try {
        return JSON.parse(clean.slice(startObject, endObject + 1));
      } catch {}
    }
    // Try to find the first complete JSON object/array by counting brackets
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonStart = -1;
    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' || char === "'") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      
      if (char === '{' || char === '[') {
        if (bracketCount === 0) jsonStart = i;
        bracketCount++;
      } else if (char === '}' || char === ']') {
        bracketCount--;
        if (bracketCount === 0 && jsonStart !== -1) {
          try {
            return JSON.parse(clean.slice(jsonStart, i + 1));
          } catch {}
        }
      }
    }
    console.error('JSON parse error, raw response:', clean.substring(0, 500));
    throw new Error('La réponse du LLM ne contient pas de JSON valide.');
  }
}

function buildThemeRules(theme) {
  const t = String(theme || '').toLowerCase();
  const rules = [
    `- Respecte TOUS les qualificatifs du thème "${theme}" : genre, pays/zone, langue, période, décennie, ambiance.`,
    "- Ne remplace jamais une contrainte géographique par une scène équivalente d'un autre pays.",
    '- Si le thème contient une décennie, chaque titre doit être sorti pendant cette décennie, pas seulement dans un style proche.',
    "- Si un morceau ne respecte pas une contrainte explicite du thème, exclue-le même s'il est célèbre."
  ];
  if (/\b(us|usa|u\.s\.|u\.s\.a\.|united states|états-unis|etats-unis|américain|americaine|américaine|american)\b/i.test(theme)) {
    rules.push('- CONTRAINTE US OBLIGATOIRE : tous les artistes/groupes doivent venir des États-Unis. Exclure rap français, belge, canadien, britannique ou autre pays.');
    rules.push('- Pour un thème comme "Rap US 90", propose uniquement du rap/hip-hop américain sorti entre 1990 et 1999.');
  }
  if (/\b(fr|france|français|francaise|française|french)\b/i.test(theme)) {
    rules.push('- CONTRAINTE FRANÇAISE OBLIGATOIRE : tous les artistes/groupes doivent être français ou clairement liés à la scène française.');
  }
  if (/\b90s|années 90|annees 90|1990|90\b/i.test(t)) {
    rules.push('- CONTRAINTE ANNÉES 90 : les titres doivent être sortis entre 1990 et 1999 inclus.');
  }
  return rules.join('\n');
}

async function testLlmConnection() {
  const currentCfg = getLlmConfig();
  const saved = getSavedLlmSettings(currentCfg.id);
  const cfg = { ...currentCfg, model: saved.model || currentCfg.model || getDefaultModel(currentCfg.id) };
  const btn = document.getElementById('auto-test-btn');
  if (cfg.id === 'albert' && !cfg.proxyUrl) { setLlmStatus("Pour Albert, l'URL du worker n8n est OBLIGATOIRE. Configurez-la dans le champ 'URL Worker n8n'.", 'error'); return; }
  if (!cfg.apiKey && cfg.id !== 'albert') { setLlmStatus(`Saisissez une clé API ${cfg.label} avant de tester.`, 'error'); return; }
  if (!cfg.model) { setLlmStatus("Aucun modèle de test n'est défini pour ce fournisseur.", 'error'); return; }
  if (!cfg.url) { setLlmStatus('Saisissez une URL API avant de tester.', 'error'); return; }

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'TEST...'; }
    setLlmStatus(`Test de connexion ${cfg.label} en cours...`, 'info');
    const text = await callLlm('Réponds uniquement avec le mot OK.', cfg);
    if (!String(text || '').trim()) throw new Error('réponse vide');
    let models = [];
    let modelSource = "découverts via l'API";
    try {
      models = await fetchLlmModels(cfg);
    } catch (modelErr) {
      models = LLM_PROVIDERS[cfg.id]?.models || [];
      modelSource = 'chargés depuis la liste de secours après connexion';
      if (!models.length) throw modelErr;
    }
    enableModelChoice(cfg.id, models, saved.model || cfg.model);
    setLlmStatus(`Connexion ${cfg.label} OK. Modèles ${modelSource}.`, 'success');
  } catch (e) {
    llmModelAccess[cfg.id] = false;
    setLlmStatus(`Connexion ${cfg.label} impossible : ${explainNetworkError(e, cfg)}.`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'TESTER'; }
  }
}

async function generatePlaylist() {
  const llmCfg = getLlmConfig();
  const theme = document.getElementById('auto-theme').value.trim();
  const rounds = parseInt(document.getElementById('auto-rounds').value) || 3;
  const spr = parseInt(document.getElementById('auto-spr').value) || 5;
  const duration = parseInt(document.getElementById('auto-duration').value) || 30;
  const bonus = document.getElementById('auto-bonus').checked;
  const errEl = document.getElementById('auto-cfg-err');
  errEl.style.display = 'none';

  if (llmCfg.id === 'albert' && !llmCfg.proxyUrl) { showErr("Pour Albert, l'URL du worker n8n est OBLIGATOIRE. Configurez-la dans le champ 'URL Worker n8n'."); return; }
  if (!llmCfg.apiKey && llmCfg.id !== 'albert') { showErr(`Veuillez saisir votre clé API ${llmCfg.label} !`); return; }
  if (!llmModelAccess[llmCfg.id] || document.getElementById('auto-model').disabled) { showErr('Veuillez tester la connexion avant de choisir le modèle et générer la playlist.'); return; }
  if (!llmCfg.model) { showErr('Veuillez saisir le modèle à utiliser !'); return; }
  if (!llmCfg.url) { showErr("Veuillez saisir l'URL API à utiliser !"); return; }
  if (!theme) { showErr('Veuillez saisir un thème !'); return; }

  const btn = document.getElementById('auto-gen-btn');
  btn.disabled = true;
  
  const total = rounds * spr;
  const bonusLine = bonus ? `- Pour chaque chanson, propose une question bonus (anecdote ou fait intéressant) et sa réponse.` : `- Les champs "bonus" et "bonusAnswer" doivent être des chaînes vides "".`;
  const themeRules = buildThemeRules(theme);
  
  let allParsed = [];

  try {
    for (let currentRound = 1; currentRound <= rounds; currentRound++) {
      btn.textContent = `⏳ GÉNÉRATION MANCHE ${currentRound}/${rounds}...`;
      const prompt = `Tu es un expert en musique. Génère les ${spr} chansons de la MANCHE ${currentRound} sur ${rounds} pour un blindtest musical sur le thème : "${theme}".

CONTRAINTES DU THÈME :
${themeRules}

RÈGLES :
- Chansons variées et emblématiques du thème
- Aucun doublon (ne propose pas d'artistes déjà utilisés si possible)
- Chaque objet doit respecter exactement les contraintes du thème
- Timing de début entre 0:20 et 1:30 (évite les longues intros)
- Durée de l'extrait : ${duration} secondes
${bonusLine}
- Assigne la valeur exacte ${currentRound} au champ "manche".
- Pour "youtubeUrl" : utilise de vrais liens YouTube connus. Si incertain, utilise https://www.youtube.com/results?search_query=ARTISTE+TITRE
- Avant de répondre, vérifie mentalement chaque chanson : artiste, pays/scène, décennie, genre et adéquation au thème.
- Pour le champ "justification" : explique en 1-2 phrases pourquoi cette chanson correspond au thème "${theme}" (décennie, genre, artiste emblématique, popularité...).

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, sans backticks, sans commentaires :
[{"artist":"...","title":"...","youtubeUrl":"https://...","start":"0:45","duration":${duration},"bonus":"...","bonusAnswer":"...","justification":"...","manche":${currentRound}}]

Génère exactement ${spr} objets.`;

      const text = await callLlm(prompt, llmCfg);
      const parsed = extractJsonPayload(text);
      if (!Array.isArray(parsed)) throw new Error('Le JSON reçu doit être un tableau de chansons.');
      allParsed = allParsed.concat(parsed);
    }
    
    autoSongs = allParsed.map(s => ({ ...s, id: Date.now() + Math.random(), selected: true, bonusEnabled: !!bonus, mp3Data: '', mp3Name: '' }));
    autoConfig = { theme, rounds, spr, duration, bonus, llm: llmCfg };
    document.getElementById('auto-table-title').textContent = '🎵 ' + theme;
    renderAutoTable();
    showScreen('screen-auto-table');
  } catch (e) {
    showErr(`Erreur ${llmCfg.label} (Manche en cours) : ${explainNetworkError(e, llmCfg)}. Vérifiez la clé API, le modèle et l'URL. (Total généré: ${allParsed.length}/${total})`);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 GÉNÉRER LA PLAYLIST →';
  }

  function showErr(msg) {
    errEl.textContent = '⚠ ' + msg;
    errEl.style.display = 'block';
  }
}

updateLlmFields();

// ================================================================
// AUTO TABLE
// ================================================================
function renderAutoTable() {
  const container = document.getElementById('auto-table-sections');
  container.innerHTML = '';

  // Group by manche
  const groups = {};
  autoSongs.forEach((s, i) => {
    const m = s.manche || Math.floor(i / (autoConfig.spr || 5)) + 1;
    if (!groups[m]) groups[m] = [];
    groups[m].push({ ...s, _i: i });
  });

  Object.entries(groups).forEach(([manche, songs]) => {
    const sec = document.createElement('div');
    sec.style.marginBottom = '26px';
    sec.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;flex-wrap:wrap">
        <div style="font-family:'Press Start 2P',monospace;font-size:.55rem;color:var(--purple);letter-spacing:3px;text-shadow:0 0 8px var(--purple)">▌ MANCHE ${manche}</div>
        <button class="btn btn-green btn-sm" onclick="addAutoRow(${parseInt(manche) || 1})">+ LIGNE MANCHE ${manche}</button>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th style="width:38px">✓</th>
            <th style="width:148px">ARTISTE</th>
            <th style="width:148px">TITRE</th>
            <th style="width:200px">JUSTIFICATION</th>
            <th style="width:150px">MP3</th>
            <th style="width:185px">LIEN YOUTUBE</th>
            <th style="width:74px">DÉBUT</th>
            <th style="width:70px">DURÉE (s)</th>
            <th style="width:70px">BONUS</th>
            <th style="width:165px">QUESTION BONUS</th>
            <th style="width:148px">RÉPONSE</th>
            <th style="width:44px">🔄</th>
            <th style="width:34px"></th>
          </tr></thead>
          <tbody>${songs.map(row => buildAutoRow(row)).join('')}</tbody>
        </table>
      </div>`;
    container.appendChild(sec);
  });
  updateAutoCount();
}

function buildAutoRow(row) {
  const i = row._i;
  const bonusEnabled = row.bonusEnabled !== false;
  const bonusCells = `
    <td style="text-align:center"><input type="checkbox" class="check-cb" ${bonusEnabled?'checked':''} data-idx="${i}" data-field="bonusEnabled" onchange="updateAutoRow(parseInt(this.dataset.idx),'bonusEnabled',this.checked)"></td>
    <td><input class="cell-inp" value="${escHtml(row.bonus)}" ${bonusEnabled?'':'disabled'} data-idx="${i}" data-field="bonus" onchange="updateAutoRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>
    <td><input class="cell-inp" value="${escHtml(row.bonusAnswer)}" ${bonusEnabled?'':'disabled'} data-idx="${i}" data-field="bonusAnswer" onchange="updateAutoRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>`;
  const justif = row.justification || '';
  return `<tr style="border-bottom:1px solid rgba(255,255,255,.03)">
    <td style="padding:7px 6px"><input type="checkbox" class="check-cb" ${row.selected?'checked':''} data-idx="${i}" data-field="selected" onchange="updateAutoRow(parseInt(this.dataset.idx),'selected',this.checked)"></td>
    ${['artist','title'].map(f =>
      `<td><input class="cell-inp" value="${escHtml(row[f])}" data-idx="${i}" data-field="${f}" onchange="updateAutoRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>`
    ).join('')}
    <td>
      <div style="font-family:'Orbitron',sans-serif;font-size:.56rem;color:rgba(255,255,255,.9);line-height:1.5;padding:5px 6px;background:rgba(180,0,255,.06);border-radius:5px;border-left:2px solid rgba(180,0,255,.4);min-height:28px;font-style:italic">${escHtml(justif) || '<span style="opacity:.3">—</span>'}</div>
    </td>
    ${buildMp3Cell('auto', i, row)}
    <td style="position:relative">
      <input class="cell-inp" id="auto-url-${i}" value="${escHtml(row.youtubeUrl)}" data-idx="${i}" data-field="youtubeUrl"
        onchange="updateAutoRow(parseInt(this.dataset.idx),this.dataset.field,this.value);onYoutubeUrlChange('auto',parseInt(this.dataset.idx),this.value)">
      <span id="auto-url-spin-${i}" style="display:none;position:absolute;right:7px;top:50%;transform:translateY(-50%);font-size:.7rem;animation:spin .75s linear infinite;color:var(--cyan)">⟳</span>
    </td>
    ${['start','duration'].map(f =>
      `<td><input class="cell-inp" value="${escHtml(row[f])}" data-idx="${i}" data-field="${f}" onchange="updateAutoRow(parseInt(this.dataset.idx),this.dataset.field,this.value)"></td>`
    ).join('')}
    ${bonusCells}
    <td><button class="revoke-btn" id="revoke-${i}" data-idx="${i}" onclick="revokeSong(parseInt(this.dataset.idx))" title="Remplacer avec le LLM choisi">🔄</button></td>
    <td><button class="del-btn" data-idx="${i}" onclick="deleteAutoRow(parseInt(this.dataset.idx))">✕</button></td>
  </tr>`;
}

function updateAutoRow(i, field, val) {
  autoSongs[i][field] = val;
  if (field === 'selected') updateAutoCount();
  if (field === 'bonusEnabled') renderAutoTable();
}

function updateAutoCount() {
  const sel = autoSongs.filter(s => s.selected).length;
  document.getElementById('auto-sel-count').textContent = `${sel} chanson(s) · ${autoConfig.rounds} manche(s)`;
}

function askAutoManche() {
  const rounds = Math.max(1, parseInt(autoConfig.rounds) || 1);
  if (rounds === 1) return 1;
  const raw = prompt(`Ajouter dans quelle manche ? (1 à ${rounds})`, '1');
  if (raw === null) return null;
  const manche = parseInt(raw);
  if (!Number.isInteger(manche) || manche < 1 || manche > rounds) {
    alert(`Veuillez choisir une manche entre 1 et ${rounds}.`);
    return null;
  }
  return manche;
}

function addAutoRow(manche = null) {
  const targetManche = manche ?? askAutoManche();
  if (!targetManche) return;
  autoSongs.push({
    id: Date.now() + Math.random(), selected: true,
    artist:'', title:'', youtubeUrl:'', start:'0:30',
    mp3Data:'', mp3Name:'',
    duration: autoConfig.duration || 30,
    bonus:'', bonusAnswer:'',
    bonusEnabled: !!autoConfig.bonus,
    manche: targetManche,
  });
  renderAutoTable();
}

function deleteAutoRow(i) {
  autoSongs.splice(i, 1);
  renderAutoTable();
}

async function revokeSong(i) {
  const btn = document.getElementById(`revoke-${i}`);
  if (!btn) return;
  btn.disabled = true; btn.textContent = '⏳';
  const existing = autoSongs.map(s => `${s.artist} - ${s.title}`).join(', ');
  const song = autoSongs[i];
  const themeRules = buildThemeRules(autoConfig.theme || '');
  const prompt = `Tu es un expert en musique. Propose UNE SEULE chanson de remplacement pour un blindtest sur le thème "${autoConfig.theme}".

CONTRAINTES DU THÈME :
${themeRules}

Chanson à remplacer : "${song.artist} - ${song.title}"
Chansons déjà dans la liste (à exclure absolument) : ${existing}

RÈGLES :
- La chanson proposée doit respecter toutes les contraintes du thème.
- Si le thème impose US/USA/États-Unis, l'artiste doit venir des États-Unis.
- Si le thème impose une décennie, le titre doit être sorti pendant cette décennie.

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks) :
{"artist":"...","title":"...","youtubeUrl":"https://...","start":"0:45","duration":${autoConfig.duration || 30},"bonus":"...","bonusAnswer":"...","manche":${song.manche || 1}}`;

  try {
    const llmCfg = autoConfig.llm || getLlmConfig();
    const text = await callLlm(prompt, llmCfg);
    const newSong = extractJsonPayload(text);
    autoSongs[i] = { ...newSong, id: Date.now() + Math.random(), selected: true, bonusEnabled: song.bonusEnabled !== false, mp3Data: '', mp3Name: '' };
    renderAutoTable();
  } catch (e) {
    alert(`Erreur remplacement : ${explainNetworkError(e, autoConfig.llm || getLlmConfig())}`);
    if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
  }
}

// ================================================================
// YOUTUBE PLAYER
// ================================================================
function loadYTAPI() {
  if (document.getElementById('yt-api-script')) return;
  const s = document.createElement('script');
  s.id = 'yt-api-script';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForYTReady(timeout = 6000) {
  loadYTAPI();
  if (ytReady) return Promise.resolve(true);
  return new Promise(resolve => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (ytReady) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });
}

function preloadMp3(src, start = 0) {
  return new Promise(resolve => {
    const a = new Audio();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.oncanplaythrough = null;
      a.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 5000);
    a.preload = 'auto';
    a.oncanplaythrough = () => {
      try { a.currentTime = start; } catch {}
      finish(true);
    };
    a.onerror = () => finish(false);
    a.src = src;
    a.load();
  });
}

function setPrepProgress(done, total) {
  const fill = document.getElementById('prep-fill');
  const subtitle = document.getElementById('prep-subtitle');
  const pct = total ? Math.round((done / total) * 100) : 100;
  if (fill) fill.style.width = `${pct}%`;
  if (subtitle) subtitle.textContent = `${done} / ${total} extrait(s) préparé(s)`;
}

function addPrepLine(icon, text, color = 'rgba(255,255,255,.62)') {
  const list = document.getElementById('prep-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'prep-item';
  div.innerHTML = `<span class="prep-icon" style="color:${color}">${icon}</span><span>${escHtml(text)}</span>`;
  list.appendChild(div);
}

function canDownloadAudio(song) {
  return !!((song.youtubeUrl && String(song.youtubeUrl).trim()) || (song.artist && song.title));
}

async function downloadYoutubeClip(song) {
  const response = await fetch(AUDIO_EXTRACT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      youtubeUrl: song.youtubeUrl,
      query: `${song.artist || ''} ${song.title || ''}`.trim(),
      start: song.start,
      duration: song.duration,
      artist: song.artist,
      title: song.title
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.dataUrl) {
    throw new Error(data.error || `Service audio indisponible (${response.status})`);
  }
  return data;
}

async function prepareAudioBeforePresentation(songs) {
  const modal = document.getElementById('prep-modal');
  const list = document.getElementById('prep-list');
  if (list) list.innerHTML = '';
  setPrepProgress(0, songs.length);
  modal?.classList.add('open');

  const needsDownload = songs.some(s => !s.mp3Data && canDownloadAudio(s));
  if (needsDownload) {
    addPrepLine('▶', `Service audio : ${AUDIO_EXTRACT_API}`, 'var(--cyan)');
  }

  let done = 0;
  for (const song of songs) {
    const label = `${song.artist} - ${song.title}`;
    if (song.mp3Data) {
      addPrepLine('…', `Préchargement MP3 : ${label}`, 'var(--cyan)');
      const ok = await preloadMp3(song.mp3Data, song.mp3FromYoutube ? 0 : parseTimeToSec(song.start));
      addPrepLine(ok ? '✓' : '!', ok ? `MP3 prêt : ${label}` : `MP3 non préchargé, tentative de lecture directe : ${label}`, ok ? 'var(--green)' : 'var(--yellow)');
    } else if (canDownloadAudio(song)) {
      addPrepLine('…', `Extraction MP3 : ${label}`, 'var(--cyan)');
      try {
        const clip = await downloadYoutubeClip(song);
        song.mp3Data = clip.dataUrl;
        song.mp3Name = clip.filename || `${song.artist} - ${song.title}.mp3`;
        song.mp3FromYoutube = true;
        if (song.__source) {
          song.__source.mp3Data = song.mp3Data;
          song.__source.mp3Name = song.mp3Name;
          song.__source.mp3FromYoutube = true;
        }
        addPrepLine('✓', `Extrait MP3 intégré : ${label}`, 'var(--green)');
      } catch (error) {
        addPrepLine('✕', `Service audio indisponible pour : ${label} — ${error.message}`, '#ff5555');
        song._audioError = true;
      }
    } else {
      addPrepLine('!', `Aucune source audio : ${label}`, '#ff5555');
    }
    done++;
    setPrepProgress(done, songs.length);
    await wait(80);
  }

  await wait(450);

  const audioErrors = songs.filter(s => s._audioError);
  if (audioErrors.length > 0) {
    addPrepLine('✕', `${audioErrors.length} chanson(s) sans audio. Vérifiez que le service localhost:3478 est démarré.`, '#ff5555');
    addPrepLine('▶', 'La présentation continuera mais ces chansons seront muettes. Démarrez le service et relancez.', 'rgba(255,255,255,.45)');
  }

  await wait(audioErrors.length > 0 ? 2000 : 0);
  modal?.classList.remove('open');
}

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player', {
    width: 1, height: 1,
    playerVars: { autoplay: 0, controls: 0 },
    events: {
      onReady: () => { ytReady = true; },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          // schedule stop after duration
          const slide = presSlides[presCurrentIdx];
          if (slide && slide.duration) {
            clearTimeout(window._ytStopTimer);
            window._ytStopTimer = setTimeout(() => {
              if (ytPlayer) ytPlayer.pauseVideo();
              updatePlayBtn(false);
            }, (parseInt(slide.duration) || 30) * 1000);
          }
        }
        if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
          updatePlayBtn(false);
        }
      }
    }
  });
};

function extractYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function parseTimeToSec(t) {
  if (!t) return 0;
  const parts = String(t).split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return parseFloat(parts[0]) || 0;
}

function togglePlay(idx) {
  const slide = presSlides[idx];
  if (!slide) return;
  const mp3Src = slide.mp3Data || '';
  const vid = extractYtId(slide.youtubeUrl);

  const startSec = parseTimeToSec(slide.start);
  const mp3StartSec = slide.mp3FromYoutube ? 0 : startSec;

  if (mp3Src) {
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    const isSameAudio = audioCurrentIdx === idx && !audioPlayer.paused;
    if (isSameAudio) {
      // Fade out puis pause
      stopAudioWithFade();
      return;
    }
    // Arrêter proprement l'audio précédent (fade out immédiat si en cours)
    clearTimeout(window._audioStopTimer);
    clearTimeout(window._audioFadeOutTimer);
    try { if (_gainNode) { _gainNode.gain.cancelScheduledValues(0); _gainNode.gain.setValueAtTime(0, 0); } } catch(e) {}
    audioPlayer.pause();

    audioPlayer = new Audio(mp3Src);
    audioCurrentIdx = idx;

    const durMs = (parseInt(slide.duration) || 30) * 1000;
    const fadeMs = FADE_DURATION * 1000;

    const setStartAndPlay = () => {
      try { audioPlayer.currentTime = mp3StartSec; } catch(e) {}
      connectAudioToGain(audioPlayer);
      audioPlayer.play().then(() => {
        updatePlayBtn(true);
        fadeIn(); // fondu d'entrée 1,5 s
        // Planifier le fade out avant la fin de la durée
        const fadeOutAt = Math.max(0, durMs - fadeMs);
        window._audioFadeOutTimer = setTimeout(() => {
          stopAudioWithFade();
        }, fadeOutAt);
      }).catch(() => alert('Impossible de lire ce MP3.'));
      audioPlayer.onended = () => { updatePlayBtn(false); };
    };
    if (mp3StartSec > 0) {
      audioPlayer.addEventListener('loadedmetadata', setStartAndPlay, { once: true });
      audioPlayer.load();
    } else {
      setStartAndPlay();
    }
    return;
  }

  if (!vid) {
    alert('Ajoutez un MP3 ou un lien YouTube valide pour cette chanson.');
    return;
  }

  if (!ytReady) {
    alert('Le lecteur YouTube se charge... réessayez dans un instant.');
    return;
  }

  audioPlayer.pause();
  clearTimeout(window._audioStopTimer);
  const isPlaying = ytPlayer.getPlayerState?.() === 1;

  if (isPlaying) {
    ytPlayer.pauseVideo();
    clearTimeout(window._ytStopTimer);
    updatePlayBtn(false);
  } else {
    ytPlayer.loadVideoById({ videoId: vid, startSeconds: startSec });
    ytPlayer.playVideo();
    updatePlayBtn(true);
  }
}

function updatePlayBtn(playing) {
  const btn = document.getElementById(`pres-play-${presCurrentIdx}`);
  if (!btn) return;
  btn.textContent = playing ? '⏸' : '▶';
  if (playing) btn.classList.add('playing'); else btn.classList.remove('playing');
}

function resetPresentationPlayButtons() {
  document.querySelectorAll('.pres-play-btn').forEach(btn => {
    btn.textContent = '▶';
    btn.classList.remove('playing');
  });
}

// ================================================================
// PRESENTATION
// ================================================================
async function goToPresentation(mode) {
  const rawSongs = mode === 'manual'
    ? manualSongs.filter(s => s.selected && s.artist && s.title)
    : autoSongs.filter(s => s.selected && s.artist && s.title);
  const songs = rawSongs.map(s => ({
    ...s,
    __source: s,
    youtubeUrl: s.youtubeUrl || s.url || '',
    mp3Data: s.mp3Data || '',
    mp3Name: s.mp3Name || '',
    mp3FromYoutube: !!s.mp3FromYoutube,
  }));

  if (songs.length === 0) {
    alert('Ajoutez au moins une chanson avec artiste et titre !');
    return;
  }

  const theme = mode === 'manual'
    ? document.getElementById('manual-theme').value.trim()
    : autoConfig.theme;

  presSlides = songs;
  presCurrentIdx = 0;
  await prepareAudioBeforePresentation(songs);
  buildPresentation(theme, songs);
  presNavigate._absIdx = 0;
  document.getElementById('pres-overlay').classList.add('open');
  presNavigate(0);
}

function buildPresentation(theme, songs) {
  const container = document.getElementById('pres-slides-container');
  container.innerHTML = '';

  // INTRO
  const intro = document.createElement('div');
  intro.className = 'pres-slide pres-active';
  intro.id = 'pres-slide--1';
  intro.innerHTML = `
    <div class="pres-intro-card">
      <div style="font-family:'Press Start 2P',monospace;font-size:.65rem;letter-spacing:5px;margin-bottom:14px" class="nt-cyan">🎵 BIENVENUE AU 🎵</div>
      <div style="font-family:'Boogaloo',cursive;font-size:clamp(2rem,6vw,4.5rem);line-height:1.1;margin-bottom:8px" class="nt-yellow">${escHtml(theme.toUpperCase())}</div>
      <div style="font-family:'Boogaloo',cursive;font-size:clamp(1.5rem,4vw,2.8rem)" class="nt-pink">BLINDTEST</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:.85rem;color:rgba(255,255,255,.35);margin:22px 0 34px;letter-spacing:1px">${songs.length} chanson${songs.length > 1 ? 's' : ''} à deviner !</div>
      <button class="btn btn-pink btn-lg" style="animation:pulse-pink 2s infinite" onclick="presNavigate(1)">▶ DÉMARRER</button>
    </div>`;
  container.appendChild(intro);

  // SONGS
  songs.forEach((song, i) => {
    const hasBonus = song.bonusEnabled !== false && song.bonus && song.bonus.trim();
    const div = document.createElement('div');
    div.className = 'pres-slide';
    div.id = `pres-slide-${i}`;
    div.innerHTML = `
      <div class="pres-song-card">
        <div class="pres-song-num">CHANSON ${i + 1} / ${songs.length}</div>
        <div class="pres-artist nt-pink">${escHtml(song.artist)}</div>
        <div class="pres-title nt-yellow">"${escHtml(song.title)}"</div>
        ${hasBonus ? `
          <div class="pres-bonus-box">
            <div class="pres-bonus-lbl nt-cyan">🎯 QUESTION BONUS</div>
            <div class="pres-bonus-q">${escHtml(song.bonus)}</div>
            <button class="btn btn-yellow btn-sm" onclick="revealAnswer('bonus-ans-${i}',this)">RÉVÉLER LA RÉPONSE</button>
            <div class="pres-bonus-a nt-yellow" id="bonus-ans-${i}">💡 ${escHtml(song.bonusAnswer || '—')}</div>
          </div>` : ''}
        <div style="display:flex;align-items:center;gap:16px;margin-top:6px">
          <button class="pres-play-btn" id="pres-play-${i}" onclick="togglePlay(${i})">▶</button>
          <div style="font-family:'VT323',monospace;font-size:1rem;color:rgba(255,255,255,.38);letter-spacing:2px">
            ${song.mp3Data ? '🎵 EXTRAIT MP3' : (song.youtubeUrl ? '🎵 EXTRAIT YOUTUBE' : '⚠ PAS DE SOURCE AUDIO')}
            ${song.start ? ` · Début: ${song.start}` : ''}
            ${song.duration ? ` · ${song.duration}s` : ''}
          </div>
        </div>
      </div>`;
    container.appendChild(div);
  });

  // OUTRO
  const outro = document.createElement('div');
  outro.className = 'pres-slide';
  outro.id = `pres-slide-${songs.length}`;
  outro.innerHTML = `
    <div class="pres-intro-card">
      <div style="font-family:'Boogaloo',cursive;font-size:clamp(2rem,5vw,3.5rem)" class="nt-cyan">FIN DU BLINDTEST</div>
      <div style="font-family:'Boogaloo',cursive;font-size:1.8rem;margin-top:8px" class="nt-yellow">Merci d'avoir joué !</div>
      <div style="font-size:3.5rem;margin:26px 0">🏆</div>
      <div style="font-family:'Boogaloo',cursive;font-size:1.2rem;color:rgba(255,255,255,.45)">Thème : <strong style="color:#fff">${escHtml(theme)}</strong></div>
      <div style="display:flex;gap:14px;justify-content:center;margin-top:28px;flex-wrap:wrap">
        <button class="btn btn-cyan btn-md" onclick="presNavigate._absIdx=0;presNavigate(0)">↺ RECOMMENCER</button>
        <button class="btn btn-yellow btn-md" onclick="openExportModal()">📄 EXPORTER HTML</button>
        <button class="btn btn-purple btn-md" onclick="closePresentation()">✕ FERMER</button>
      </div>
    </div>`;
  container.appendChild(outro);
}

function revealAnswer(id, btn) {
  const el = document.getElementById(id);
  if (el) el.classList.add('shown');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }
}

function presNavigate(dir) {
  const slides = document.querySelectorAll('.pres-slide');
  const maxIdx = slides.length - 1; // 0 = intro, 1..n = songs, n+1 = outro

  // Map visual index to slide index (-1 = intro, 0..n-1 = songs, n = outro)
  // presCurrentIdx tracks which song/special slide we're on
  // Actually let's use absolute slide index
  if (typeof presNavigate._absIdx === 'undefined') presNavigate._absIdx = 0;

  // Stop audio on navigation (fade out immédiat si en cours)
  if (ytPlayer && ytPlayer.pauseVideo) { ytPlayer.pauseVideo(); clearTimeout(window._ytStopTimer); }
  clearTimeout(window._audioStopTimer);
  clearTimeout(window._audioFadeOutTimer);
  if (!audioPlayer.paused) {
    stopAudioWithFade();
  } else {
    audioPlayer.pause();
  }
  audioCurrentIdx = null;
  resetPresentationPlayButtons();

  let absIdx = presNavigate._absIdx + dir;
  absIdx = Math.max(0, Math.min(absIdx, maxIdx));
  presNavigate._absIdx = absIdx;

  slides.forEach(s => s.classList.remove('pres-active'));
  slides[absIdx].classList.add('pres-active');

  // Update play btn reference (song slides only)
  const songIdx = absIdx - 1; // -1 means intro, maxIdx means outro
  presCurrentIdx = songIdx;

  // Counter
  const counter = document.getElementById('pres-counter');
  if (absIdx === 0) counter.textContent = '';
  else if (absIdx === maxIdx) counter.textContent = '';
  else counter.textContent = `${absIdx} / ${presSlides.length}`;

  // Nav btns
  document.getElementById('pres-prev').disabled = absIdx === 0;
  document.getElementById('pres-next').disabled = absIdx === maxIdx;
}

function closePresentation() {
  document.getElementById('pres-overlay').classList.remove('open');
  if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
  clearTimeout(window._ytStopTimer);
  clearTimeout(window._audioStopTimer);
  clearTimeout(window._audioFadeOutTimer);
  if (!audioPlayer.paused) {
    stopAudioWithFade();
  } else {
    audioPlayer.pause();
  }
  audioCurrentIdx = null;
  presNavigate._absIdx = 0;
}

// Keyboard nav
document.addEventListener('keydown', e => {
  if (!document.getElementById('pres-overlay').classList.contains('open')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); presNavigate(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); presNavigate(-1); }
  if (e.key === 'Escape') closePresentation();
});

// ================================================================
// EXPORT HTML
// ================================================================
function openExportModal() {
  exportHtmlContent = generateExportHTML();
  document.getElementById('export-preview').textContent = exportHtmlContent.substring(0, 2000) + (exportHtmlContent.length > 2000 ? '\n...[tronqué pour aperçu]...' : '');
  document.getElementById('export-modal').classList.add('open');
}

function closeExport() {
  document.getElementById('export-modal').classList.remove('open');
}

function downloadExportHTML() {
  const blob = new Blob([exportHtmlContent], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const theme = (autoConfig.theme || document.getElementById('manual-theme')?.value || 'blindtest').replace(/\s/g,'_');
  a.download = `blindtest_${theme}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyExportHTML() {
  navigator.clipboard.writeText(exportHtmlContent).then(() => alert('Copié dans le presse-papiers !'));
}

function generateExportHTML() {
  const mode = currentScreen.includes('manual') ? 'manual' : 'auto';
  const theme = autoConfig.theme || document.getElementById('manual-theme')?.value || 'Blindtest';
  const songs = presSlides;

  const slidesData = JSON.stringify(songs.map(s => ({
    artist: s.artist, title: s.title,
    youtubeUrl: s.youtubeUrl || s.url || '',
    mp3Data: s.mp3Data || '',
    mp3Name: s.mp3Name || '',
    mp3FromYoutube: !!s.mp3FromYoutube,
    start: s.start, duration: s.duration,
    bonus: s.bonusEnabled !== false ? (s.bonus || '') : '',
    bonusAnswer: s.bonusEnabled !== false ? (s.bonusAnswer || '') : '',
  })));

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blindtest — ${theme}</title>
<link href="https://fonts.googleapis.com/css2?family=Boogaloo&family=Orbitron:wght@700&family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
:root{--pink:#ff2d78;--cyan:#00f5ff;--yellow:#ffe600;--purple:#b400ff;--bg:#08000f}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:#fff;font-family:'Orbitron',sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(to bottom,transparent 0,transparent 2px,rgba(0,0,0,.07) 2px,rgba(0,0,0,.07) 4px);pointer-events:none;z-index:9999}
@keyframes slide-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{box-shadow:0 0 18px var(--pink)}50%{box-shadow:0 0 45px var(--pink),0 0 80px rgba(255,45,120,.3)}}
@keyframes rainbow{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}
.slide{display:none;flex-direction:column;align-items:center;width:90vw;max-width:860px;animation:slide-up .38s ease}
.slide.active{display:flex}
.card{background:linear-gradient(155deg,#130020,#09000e);border-radius:18px;padding:44px 40px;width:100%}
.intro-card{border:2px solid var(--cyan);box-shadow:0 0 55px rgba(0,245,255,.2);text-align:center}
.song-card{border:2px solid rgba(180,0,255,.45);box-shadow:0 0 38px rgba(180,0,255,.22);position:relative;overflow:hidden}
.song-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--pink),var(--cyan),var(--yellow),var(--purple),var(--pink));background-size:300%;animation:rainbow 4s linear infinite}
.bonus-box{background:rgba(0,245,255,.05);border:1px solid rgba(0,245,255,.22);border-radius:10px;padding:18px;margin-bottom:22px}
.bonus-ans{display:none;color:var(--yellow);text-shadow:0 0 8px rgba(255,230,0,.5);font-family:'Boogaloo',cursive;font-size:1.05rem;padding-top:10px;border-top:1px solid rgba(255,230,0,.25);margin-top:8px}
.bonus-ans.shown{display:block;animation:slide-up .25s ease}
.play-btn{width:60px;height:60px;border-radius:50%;border:2px solid var(--pink);background:rgba(255,45,120,.14);color:var(--pink);font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 0 18px rgba(255,45,120,.28);flex-shrink:0}
.play-btn:hover{background:rgba(255,45,120,.28);box-shadow:0 0 32px rgba(255,45,120,.6);transform:scale(1.06)}
.play-btn.playing{animation:pulse 1.2s infinite}
.btn{font-family:'Press Start 2P',monospace;border-radius:8px;cursor:pointer;border:2px solid;transition:all .2s}
.btn-p{background:rgba(255,45,120,.12);border-color:var(--pink);color:var(--pink);padding:12px 26px;font-size:.6rem;letter-spacing:2px}
.btn-c{background:rgba(0,245,255,.08);border-color:var(--cyan);color:var(--cyan);padding:10px 22px;font-size:.55rem;letter-spacing:1px}
.btn-y{background:rgba(255,230,0,.08);border-color:var(--yellow);color:var(--yellow);padding:8px 18px;font-size:.5rem;letter-spacing:1px}
.btn-pu{background:rgba(180,0,255,.08);border-color:var(--purple);color:var(--purple);padding:10px 22px;font-size:.55rem;letter-spacing:1px}
.nav-btn{width:52px;height:52px;border-radius:50%;border:2px solid var(--cyan);background:rgba(0,245,255,.08);color:var(--cyan);font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 0 14px rgba(0,245,255,.18)}
.nav-btn:hover:not([disabled]){background:rgba(0,245,255,.22)}
.nav-btn[disabled]{opacity:.2;cursor:not-allowed}
.counter{position:fixed;top:18px;right:26px;font-family:'Press Start 2P',monospace;font-size:.55rem;color:rgba(255,255,255,.35);z-index:100;letter-spacing:2px}
.vinyl{position:fixed;right:-70px;bottom:70px;width:180px;height:180px;border-radius:50%;border:2px solid rgba(180,0,255,.12);animation:spin 18s linear infinite;opacity:.22;pointer-events:none}
#yt-wrap{position:fixed;bottom:-200px;left:-200px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}

/* FULLSCREEN BUTTON */
#btn-fullscreen{position:fixed;top:14px;right:16px;z-index:30000;width:38px;height:38px;border-radius:8px;border:1px solid rgba(0,245,255,.35);background:rgba(0,245,255,.08);color:var(--cyan);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 0 10px rgba(0,245,255,.15)}
#btn-fullscreen:hover{background:rgba(0,245,255,.22);box-shadow:0 0 18px rgba(0,245,255,.45)}

/* FOOTER */
#app-footer{position:fixed;bottom:0;left:0;right:0;text-align:center;padding:5px;font-family:'Press Start 2P',monospace;font-size:.38rem;color:rgba(255,255,255,.75);letter-spacing:2px;z-index:100;pointer-events:none;background:linear-gradient(to top,rgba(8,0,15,.8),transparent)}

/* PWA INSTALL BANNER */
#pwa-banner{display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#13001f,#0a0012);border:1px solid rgba(0,245,255,.35);border-radius:14px;padding:14px 22px;box-shadow:0 0 30px rgba(0,245,255,.2);z-index:29000;align-items:center;gap:16px;max-width:420px;width:90vw;animation:slide-up .4s ease}
#pwa-banner.show{display:flex}
.pwa-icon{font-size:2rem;flex-shrink:0}
.pwa-txt{flex:1;min-width:0}
.pwa-txt strong{display:block;font-family:'Press Start 2P',monospace;font-size:.5rem;color:var(--cyan);letter-spacing:1px;margin-bottom:5px}
.pwa-txt span{font-family:'Orbitron',sans-serif;font-size:.62rem;color:rgba(255,255,255,.5);line-height:1.5}
.pwa-btns{display:flex;flex-direction:column;gap:6px;flex-shrink:0}
</style></head>
<body>
<div class="vinyl"><div style="position:absolute;inset:22%;border-radius:50%;border:1px solid rgba(0,245,255,.18)"></div><div style="position:absolute;inset:46%;border-radius:50%;background:rgba(255,45,120,.3)"></div></div>
<div class="counter" id="ctr"></div>
<div id="slides"></div>
<div style="position:fixed;bottom:26px;left:50%;transform:translateX(-50%);display:flex;gap:16px;z-index:100">
  <button class="nav-btn" id="btnP" onclick="nav(-1)">←</button>
  <button class="nav-btn" id="btnN" onclick="nav(1)">→</button>
</div>
<div id="yt-wrap"><div id="ytpl"></div></div>
<script>
const theme=${JSON.stringify(theme)};
const songs=${slidesData};
let cur=0,ytpl=null,ytRdy=false,audio=new Audio(),audioIdx=null;
function build(){
  const c=document.getElementById('slides');
  c.innerHTML='';
  // intro
  c.innerHTML+=\`<div class="slide active card intro-card" id="s-0">
    <div style="font-family:'Press Start 2P',monospace;font-size:.65rem;letter-spacing:5px;color:#00f5ff;margin-bottom:14px">🎵 BIENVENUE AU 🎵</div>
    <div style="font-family:'Boogaloo',cursive;font-size:clamp(2rem,6vw,4.5rem);color:#ffe600;text-shadow:0 0 15px #ffe600;line-height:1.1;margin-bottom:8px">\${theme.toUpperCase()}</div>
    <div style="font-family:'Boogaloo',cursive;font-size:clamp(1.5rem,4vw,2.8rem);color:#ff2d78;text-shadow:0 0 12px #ff2d78">BLINDTEST</div>
    <div style="font-size:.85rem;color:rgba(255,255,255,.35);margin:22px 0 34px">\${songs.length} chanson\${songs.length>1?'s':''} à deviner !</div>
    <button class="btn btn-p" style="animation:pulse 2s infinite" onclick="nav(1)">▶ DÉMARRER</button>
  </div>\`;
  songs.forEach((s,i)=>{
    const hb=s.bonus&&s.bonus.trim();
    c.innerHTML+=\`<div class="slide card song-card" id="s-\${i+1}">
      <div style="font-family:'Press Start 2P',monospace;font-size:.58rem;color:#00f5ff;letter-spacing:3px;margin-bottom:18px;text-shadow:0 0 8px #00f5ff">CHANSON \${i+1} / \${songs.length}</div>
      <div style="font-family:'Boogaloo',cursive;font-size:clamp(2rem,5vw,3.5rem);color:#ff2d78;text-shadow:0 0 15px #ff2d78;line-height:1.1;margin-bottom:8px">\${s.artist}</div>
      <div style="font-family:'Orbitron',sans-serif;font-weight:700;font-size:clamp(1.1rem,2.5vw,1.9rem);color:#ffe600;text-shadow:0 0 12px #ffe600;margin-bottom:28px">"\${s.title}"</div>
      \${hb?\`<div class="bonus-box">
        <div style="font-family:'Press Start 2P',monospace;font-size:.48rem;color:#00f5ff;letter-spacing:2px;margin-bottom:8px">🎯 QUESTION BONUS</div>
        <div style="font-family:'Boogaloo',cursive;font-size:1.15rem;color:#ddd;line-height:1.5;margin-bottom:10px">\${s.bonus}</div>
        <button class="btn btn-y" onclick="reveal('ba-\${i}',this)">RÉVÉLER LA RÉPONSE</button>
        <div class="bonus-ans" id="ba-\${i}">💡 \${s.bonusAnswer||'—'}</div>
      </div>\`:''}
      <div style="display:flex;align-items:center;gap:16px;margin-top:6px">
        <button class="play-btn" id="pb-\${i}" onclick="togglePlay(\${i})">▶</button>
        <div style="font-family:'VT323',monospace;font-size:1rem;color:rgba(255,255,255,.38);letter-spacing:2px">
          \${s.mp3Data?'🎵 EXTRAIT MP3':(s.youtubeUrl?'🎵 EXTRAIT YOUTUBE':'⚠ PAS DE SOURCE AUDIO')}
          \${s.start?' · Début: '+s.start:''}
          \${s.duration?' · '+s.duration+'s':''}
        </div>
      </div>
    </div>\`;
  });
  c.innerHTML+=\`<div class="slide card intro-card" id="s-\${songs.length+1}">
    <div style="font-family:'Boogaloo',cursive;font-size:clamp(2rem,5vw,3.5rem);color:#00f5ff;text-shadow:0 0 15px #00f5ff">FIN DU BLINDTEST</div>
    <div style="font-family:'Boogaloo',cursive;font-size:1.8rem;color:#ffe600;text-shadow:0 0 12px #ffe600;margin-top:8px">Merci d'avoir joué !</div>
    <div style="font-size:3.5rem;margin:26px 0">🏆</div>
    <div style="font-family:'Boogaloo',cursive;font-size:1.2rem;color:rgba(255,255,255,.45)">Thème : <strong style="color:#fff">\${theme}</strong></div>
  </div>\`;
  updateNav();
}
function nav(d){
  const all=document.querySelectorAll('.slide');
  stopAudio();
  all[cur].classList.remove('active');
  cur=Math.max(0,Math.min(cur+d,all.length-1));
  all[cur].classList.add('active');
  updateNav();
}
function updateNav(){
  const total=document.querySelectorAll('.slide').length;
  document.getElementById('btnP').disabled=cur===0;
  document.getElementById('btnN').disabled=cur===total-1;
  const ctr=document.getElementById('ctr');
  ctr.textContent=(cur>0&&cur<total-1)?\`\${cur} / \${songs.length}\`:'';
}
function reveal(id,btn){const el=document.getElementById(id);if(el)el.classList.add('shown');if(btn){btn.disabled=true;btn.style.opacity='.4'}}
function stopAudio(){if(ytpl&&ytpl.pauseVideo)ytpl.pauseVideo();audio.pause();audioIdx=null;clearTimeout(window._t);clearTimeout(window._at);document.querySelectorAll('.play-btn').forEach(b=>{b.textContent='▶';b.classList.remove('playing')})}
function togglePlay(i){
  const s=songs[i];if(!s)return;
  const start=(t=>{if(!t)return 0;const p=String(t).split(':').map(Number);if(p.length===2)return p[0]*60+p[1];return parseFloat(p[0])||0})(s.start);
  const mp3Start=s.mp3FromYoutube?0:start;
  const btn=document.getElementById('pb-'+i);
  if(s.mp3Data){
    if(audioIdx===i&&!audio.paused){stopAudio();return}
    stopAudio();
    audio=new Audio(s.mp3Data);
    audioIdx=i;
    const doPlay=()=>{
      try{audio.currentTime=mp3Start;}catch(e){}
      audio.play().then(()=>{
        btn.textContent='⏸';btn.classList.add('playing');
        window._at=setTimeout(()=>{audio.pause();btn.textContent='▶';btn.classList.remove('playing')},(parseInt(s.duration)||30)*1000);
      }).catch(()=>alert('Impossible de lire ce MP3.'));
      audio.onended=()=>{btn.textContent='▶';btn.classList.remove('playing')};
    };
    if(mp3Start>0){audio.addEventListener('loadedmetadata',doPlay,{once:true});audio.load();}else{doPlay();}
    return;
  }
  const m=s.youtubeUrl?s.youtubeUrl.match(/(?:v=|youtu\\.be\\/|embed\\/)([a-zA-Z0-9_-]{11})/):null;
  const vid=m?m[1]:null;
  if(!vid){alert('Ajoutez un MP3 ou un lien YouTube valide.');return}
  if(!ytRdy){alert('Lecteur YouTube en cours de chargement... réessayez.');return}
  const playing=ytpl.getPlayerState&&ytpl.getPlayerState()===1;
  if(playing){stopAudio();return}
  stopAudio();
  ytpl.loadVideoById({videoId:vid,startSeconds:start});
  ytpl.playVideo();
  btn.textContent='⏸';btn.classList.add('playing');
  window._t=setTimeout(()=>{ytpl.pauseVideo();btn.textContent='▶';btn.classList.remove('playing');},(parseInt(s.duration)||30)*1000);
}
window.onYouTubeIframeAPIReady=function(){ytpl=new YT.Player('ytpl',{width:1,height:1,playerVars:{autoplay:0,controls:0},events:{onReady:()=>{ytRdy=true}}})};
(function(){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s)})();
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();nav(1)}if(e.key==='ArrowLeft'){e.preventDefault();nav(-1)}});
build();
<\/script></body></html>`;
}

// Initial auto config info
updateAutoInfo();

// Masquer le bouton install uniquement si déjà lancé en mode standalone (app installée)
(function() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) {
    const wrap = document.getElementById('home-install-wrap');
    if (wrap) wrap.style.display = 'none';
  }
})();

// ================================================================
// FULLSCREEN
// ================================================================
function toggleFullscreen() {
  const btn = document.getElementById('btn-fullscreen');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    if (btn) btn.textContent = '⛶';
    if (btn) btn.title = 'Quitter le plein écran (Échap)';
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    if (btn) btn.textContent = '⛶';
    if (btn) btn.title = 'Plein écran (F11)';
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  if (document.fullscreenElement) {
    btn.textContent = '✕⛶';
    btn.style.borderColor = 'rgba(255,45,120,.5)';
    btn.style.color = 'var(--pink)';
  } else {
    btn.textContent = '⛶';
    btn.style.borderColor = 'rgba(0,245,255,.35)';
    btn.style.color = 'var(--cyan)';
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
});

// ================================================================
// PWA — Service Worker + Install
// ================================================================
let pwaInstallEvent = null;

// Inject manifest dynamically
(function() {
  const manifest = {
    name: 'BlindTest Studio',
    short_name: 'BlindTest',
    description: 'Créez et animez vos blindtests musicaux',
    start_url: './',
    display: 'standalone',
    background_color: '#08000f',
    theme_color: '#08000f',
    orientation: 'landscape',
    icons: [
      {
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='80' fill='%2308000f'/%3E%3Ccircle cx='256' cy='256' r='200' fill='none' stroke='%23ff2d78' stroke-width='18'/%3E%3Ccircle cx='256' cy='256' r='60' fill='%23ff2d78'/%3E%3Ctext x='256' y='295' text-anchor='middle' font-family='serif' font-size='120' fill='%23ffe600'%3E♪%3C/text%3E%3C/svg%3E",
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  document.getElementById('pwa-manifest').href = url;
})();

// Register service worker (inline via blob)
if ('serviceWorker' in navigator) {
  const swCode = `
    const CACHE = 'blindtest-v1';
    self.addEventListener('install', e => {
      self.skipWaiting();
    });
    self.addEventListener('activate', e => {
      e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      ));
      self.clients.claim();
    });
    self.addEventListener('fetch', e => {
      e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
      );
    });
  `;
  const swBlob = new Blob([swCode], { type: 'application/javascript' });
  const swUrl = URL.createObjectURL(swBlob);
  navigator.serviceWorker.register(swUrl).catch(() => {});
}

// Capture install event
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  pwaInstallEvent = e;
  // Mettre à jour le texte du bouton pour indiquer que l'install native est dispo
  const btn = document.querySelector('#home-install-wrap button');
  if (btn) { btn.textContent = '⬇ INSTALLER MAINTENANT'; }
});

window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-banner')?.classList.remove('show');
  document.getElementById('home-install-wrap') && (document.getElementById('home-install-wrap').style.display = 'none');
  pwaInstallEvent = null;
});

function installPWA() {
  const banner = document.getElementById('pwa-banner');
  if (pwaInstallEvent) {
    // Installation native disponible (Chrome/Edge sur HTTPS ou localhost)
    pwaInstallEvent.prompt();
    pwaInstallEvent.userChoice.then(result => {
      if (result.outcome === 'accepted') {
        banner?.classList.remove('show');
      }
      pwaInstallEvent = null;
    });
    return;
  }
  // Pas d'événement natif : afficher les instructions selon le navigateur/OS
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edg/i.test(ua);
  const isEdge = /edg/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isFileProtocol = location.protocol === 'file:';

  let msg = '📲 INSTALLER BLINDTEST STUDIO\n\n';

  if (isFileProtocol) {
    msg += '⚠️ Vous ouvrez le fichier en local (file://).\n';
    msg += 'Pour installer l\'application, elle doit être servie via un serveur web (HTTP/HTTPS).\n\n';
    msg += '💡 Solutions :\n';
    msg += '• Copiez index.html dans votre serveur web (ex: dossier public/)\n';
    msg += '• Ou utilisez un serveur local : npx serve . dans le dossier\n';
    msg += '• Puis ouvrez http://localhost:3000 dans Chrome ou Edge';
  } else if (isIOS) {
    msg += '1. Appuyez sur le bouton Partager ⬆ en bas de Safari\n';
    msg += '2. Faites défiler et choisissez "Sur l\'écran d\'accueil"\n';
    msg += '3. Appuyez sur "Ajouter"';
  } else if (isChrome || isEdge) {
    msg += 'Cliquez sur l\'icône ⊕ ou ⬇ dans la barre d\'adresse du navigateur,\n';
    msg += 'puis choisissez "Installer BlindTest Studio".\n\n';
    msg += '(Si l\'icône n\'apparaît pas, le site doit être en HTTPS)';
  } else if (isFirefox) {
    msg += 'Firefox ne supporte pas encore l\'installation PWA sur bureau.\n';
    msg += 'Utilisez Chrome ou Edge pour installer l\'application.';
  } else {
    msg += 'Depuis votre navigateur, cherchez l\'option\n"Ajouter à l\'écran d\'accueil" ou "Installer l\'application"\ndans le menu du navigateur.';
  }

  alert(msg);
}

function dismissPWA() {
  document.getElementById('pwa-banner')?.classList.remove('show');
  sessionStorage.setItem('pwa-dismissed', '1');
}


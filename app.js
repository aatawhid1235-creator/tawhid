const STORAGE_KEY = 'txb-gaming-panel:v1';
const PROFILE_FIELDS = [
  ['general', 'GENERAL'], ['redDot', 'RED DOT'], ['scope2x', '2× SCOPE'],
  ['scope4x', '4× SCOPE'], ['sniper', 'SNIPER'], ['freeLook', 'FREE LOOK']
];
const DEFAULT_VALUES = { general: 92, redDot: 86, scope2x: 78, scope4x: 68, sniper: 48, freeLook: 72 };
const DEFAULT_FEATURES = { aim: true, sensitivity: true, hud: true, performance: true, crosshair: true, sound: false };
const PAGE_TITLES = { dashboard: 'Dashboard', training: 'Aim training', sensitivity: 'Sensitivity', hud: 'HUD preview', performance: 'Performance' };

function makeId(prefix = 'id') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function freshHudElements() {
  return [
    { id: 'fire', name: 'FIRE', x: 82, y: 74, size: 72, kind: 'action' },
    { id: 'scope', name: 'SCOPE', x: 69, y: 61, size: 54, kind: 'utility' },
    { id: 'jump', name: 'JUMP', x: 90, y: 48, size: 53, kind: 'utility' },
    { id: 'crouch', name: 'CROUCH', x: 76, y: 84, size: 49, kind: 'utility' },
    { id: 'move', name: 'MOVE', x: 17, y: 74, size: 82, kind: 'utility' },
    { id: 'reload', name: 'RELOAD', x: 91, y: 32, size: 43, kind: 'utility' },
  ];
}
function defaultState() {
  const profile = { id: makeId('profile'), name: 'Balanced', values: { ...DEFAULT_VALUES }, style: 'balanced', updatedAt: Date.now() };
  const hud = { id: makeId('layout'), name: 'Default layout', elements: freshHudElements(), updatedAt: Date.now() };
  return {
    features: { ...DEFAULT_FEATURES }, profiles: [profile], activeProfileId: profile.id,
    playStyle: 'balanced', sessions: [], hudLayouts: [hud], activeHudId: hud.id, hudElements: freshHudElements(),
    floatingPosition: null,
  };
}
function readState() {
  const fallback = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return fallback;
    const profiles = Array.isArray(saved.profiles) ? saved.profiles.filter(isValidProfile).slice(0, 30) : fallback.profiles;
    const layouts = Array.isArray(saved.hudLayouts) ? saved.hudLayouts.filter(isValidLayout).slice(0, 30) : fallback.hudLayouts;
    const features = { ...DEFAULT_FEATURES };
    for (const key of Object.keys(features)) if (typeof saved.features?.[key] === 'boolean') features[key] = saved.features[key];
    const activeProfileId = profiles.some(p => p.id === saved.activeProfileId) ? saved.activeProfileId : profiles[0]?.id;
    const activeHudId = layouts.some(l => l.id === saved.activeHudId) ? saved.activeHudId : layouts[0]?.id;
    const activeLayout = layouts.find(l => l.id === activeHudId);
    return {
      ...fallback, ...saved, features, profiles: profiles.length ? profiles : fallback.profiles,
      activeProfileId: activeProfileId || fallback.activeProfileId,
      hudLayouts: layouts.length ? layouts : fallback.hudLayouts,
      activeHudId: activeHudId || fallback.activeHudId,
      hudElements: validElements(saved.hudElements) ? saved.hudElements : activeLayout?.elements || fallback.hudElements,
      sessions: Array.isArray(saved.sessions) ? saved.sessions.filter(isValidSession).slice(0, 100) : [],
      playStyle: ['balanced', 'precision', 'fast'].includes(saved.playStyle) ? saved.playStyle : 'balanced',
    };
  } catch { return fallback; }
}
function isValidProfile(value) {
  return value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.length <= 32 &&
    PROFILE_FIELDS.every(([key]) => Number.isFinite(value.values?.[key]) && value.values[key] >= 0 && value.values[key] <= 200);
}
function validElements(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 30 && value.every(e => e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.x) && e.x >= 0 && e.x <= 100 && Number.isFinite(e.y) && e.y >= 0 && e.y <= 100 && Number.isFinite(e.size) && e.size >= 36 && e.size <= 120 && ['action', 'utility'].includes(e.kind));
}
function isValidLayout(value) { return value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.length <= 32 && validElements(value.elements); }
function isValidSession(value) { return value && Number.isFinite(value.hits) && value.hits >= 0 && Number.isFinite(value.misses) && value.misses >= 0 && Number.isFinite(value.duration) && typeof value.date === 'string' && ['tracking', 'reaction'].includes(value.mode); }

let state = readState();
let currentPage = 'dashboard';
let activeMode = 'tracking';
let trainingRunning = false;
let sessionHits = 0;
let sessionMisses = 0;
let reactionSamples = [];
let trainingFrame = 0;
let trainingStartedAt = 0;
let trainingEndsAt = 0;
let lastFrameTime = 0;
let nextReactionTargetAt = 0;
let target = null;
let pointerPoint = null;
let audioContext = null;
let perfFrameId = 0;
let perfFrameCount = 0;
let perfFrameMark = 0;
let metricInterval = 0;
let batteryManager = null;
let networkAbort = null;
let selectedHudId = null;
let suppressFloatClick = false;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const canvas = $('#practiceCanvas');
const context = canvas.getContext('2d', { alpha: true });

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    toast('Could not save: browser storage may be full or disabled.', 'error');
    return false;
  }
}
function escapeText(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function toast(message, kind = '') {
  const item = document.createElement('div'); item.className = `toast ${kind}`.trim(); item.textContent = message;
  $('#toastRegion').append(item); window.setTimeout(() => item.remove(), 3000);
}
function activeProfile() { return state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0]; }
function activeLayout() { return state.hudLayouts.find(l => l.id === state.activeHudId) || state.hudLayouts[0]; }
function average(values) { return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null; }
function fmtTime(seconds) { const s = Math.max(0, Math.ceil(seconds)); return `00:${String(s).padStart(2, '0')}`; }
function localDate(time = Date.now()) { return new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function switchPage(page) {
  if (!PAGE_TITLES[page]) return;
  currentPage = page;
  $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('#pageTitle').textContent = PAGE_TITLES[page];
  $('#sidebar').classList.remove('open'); $('#mobileMenu').setAttribute('aria-expanded', 'false');
  if (page === 'training') resizeCanvas();
  if (page === 'sensitivity') renderSensitivity();
  if (page === 'hud') renderHud();
  if (page === 'performance') renderPerformance(true);
}
document.addEventListener('click', event => {
  const goto = event.target.closest('[data-go], [data-page]');
  if (!goto) return;
  const page = goto.dataset.go || goto.dataset.page;
  if (PAGE_TITLES[page]) switchPage(page);
});
$('#mobileMenu').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open'); $('#mobileMenu').setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', event => {
  if (window.innerWidth <= 820 && $('#sidebar').classList.contains('open') && !event.target.closest('#sidebar, #mobileMenu')) {
    $('#sidebar').classList.remove('open'); $('#mobileMenu').setAttribute('aria-expanded', 'false');
  }
});

function updateFeatureUI() {
  $$('[data-feature]').forEach(input => { input.checked = !!state.features[input.dataset.feature]; });
  const pages = { aim: 'training', sensitivity: 'sensitivity', hud: 'hud', performance: 'performance' };
  for (const [feature, page] of Object.entries(pages)) {
    const root = $(`#page-${page}`); const paused = !state.features[feature];
    let banner = $('.module-paused-banner', root);
    if (!banner) { banner = document.createElement('div'); banner.className = 'module-paused-banner'; banner.setAttribute('role', 'status'); root.prepend(banner); }
    banner.textContent = `This module is paused. Turn on “${featureLabel(feature)}” from Dashboard quick controls to use it.`;
    banner.hidden = !paused;
    root.classList.toggle('module-paused', paused);
    $$('button, input, select', root).forEach(control => {
      if (control.id === 'stopTraining' || control.id === 'resetTraining') return;
      control.disabled = paused;
    });
  }
  $('#canvasCrosshair').classList.toggle('visible', !!state.features.crosshair);
  if (!state.features.aim && trainingRunning) finishTraining('Aim training paused');
  if (state.features.performance) { startPerformanceLoop(); renderPerformance(false); }
  else { stopPerformanceLoop(); $('#browserFps').innerHTML = 'Paused<small>MODULE</small>'; }
  persist();
}
function featureLabel(key) { return ({ aim: 'Aim training', sensitivity: 'Sensitivity lab', hud: 'HUD preview', performance: 'Browser monitor', sound: 'Sound practice' })[key] || key; }
$$('[data-feature]').forEach(input => input.addEventListener('change', () => {
  state.features[input.dataset.feature] = input.checked; updateFeatureUI();
  toast(`${featureLabel(input.dataset.feature)} ${input.checked ? 'enabled' : 'paused'}.`);
}));
$('#stopAll').addEventListener('click', () => {
  if (trainingRunning) finishTraining('Stopped from quick controls');
  for (const key of Object.keys(state.features)) state.features[key] = false;
  updateFeatureUI(); toast('All training modules stopped.');
});

function renderDashboard() {
  const history = state.sessions;
  const hits = history.reduce((sum, item) => sum + item.hits, 0);
  const misses = history.reduce((sum, item) => sum + item.misses, 0);
  const reactions = history.flatMap(item => item.reactions || []);
  const accuracy = hits + misses ? Math.round(hits / (hits + misses) * 100) : null;
  $('#statSessions').textContent = String(history.length);
  $('#statAccuracy').innerHTML = accuracy === null ? '—<em>%</em>' : `${accuracy}<em>%</em>`;
  $('#statReaction').innerHTML = reactions.length ? `${Math.round(average(reactions))}<em>ms</em>` : '—<em>ms</em>';
  $('#statProfile').textContent = activeProfile()?.name || 'Balanced';
  $('#statProfileMeta').textContent = `${state.profiles.length} saved profile${state.profiles.length === 1 ? '' : 's'} on this device`;
  const list = $('#historyList'); list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    for (const [tag, value] of [['span', '◴'], ['strong', 'No sessions yet'], ['small', 'Complete a drill to see your progress here.']]) { const node = document.createElement(tag); node.textContent = value; if (tag === 'span') node.className = 'empty-icon'; empty.append(node); }
    const link = document.createElement('button'); link.className = 'text-button'; link.dataset.go = 'training'; link.textContent = 'Start training →'; empty.append(link); list.append(empty);
  } else {
    history.slice(0, 5).forEach(item => {
      const row = document.createElement('div'); row.className = 'history-item';
      const bullet = document.createElement('span'); bullet.className = 'history-bullet'; bullet.textContent = item.mode === 'reaction' ? 'ϟ' : '◎';
      const copy = document.createElement('span'); copy.className = 'history-copy';
      const name = document.createElement('strong'); name.textContent = item.mode === 'reaction' ? 'Reaction drill' : 'Tracking drill';
      const date = document.createElement('small'); date.textContent = `${localDate(Date.parse(item.date))} • ${item.duration}s`;
      copy.append(name, date);
      const value = document.createElement('span'); value.className = 'history-values';
      const total = item.hits + item.misses; value.textContent = `${total ? Math.round(item.hits / total * 100) : 0}%`;
      const detail = document.createElement('small'); detail.textContent = `${item.hits} hits / ${item.misses} misses`; value.append(detail);
      row.append(bullet, copy, value); list.append(row);
    });
  }
  const last = history[0];
  if (last) {
    const total = last.hits + last.misses;
    $('#lastSessionTitle').textContent = `${last.mode === 'reaction' ? 'Reaction' : 'Tracking'} drill • ${localDate(Date.parse(last.date))}`;
    $('#lastSessionAccuracy').textContent = `${total ? Math.round(last.hits / total * 100) : 0}%`;
    $('#lastSessionReaction').textContent = last.reactions?.length ? `${Math.round(average(last.reactions))} ms` : '—';
    $('#lastSessionHits').textContent = String(last.hits);
  }
  renderSensitivitySelects();
}
$('#clearHistory').addEventListener('click', () => {
  if (!state.sessions.length) { toast('There is no history to clear.'); return; }
  if (!window.confirm('Clear all saved TXB practice history from this browser?')) return;
  state.sessions = []; persist(); renderDashboard(); renderLiveStats(); toast('Practice history cleared.');
});

function renderSensitivitySelects() {
  const select = $('#profileSelect'); select.replaceChildren();
  state.profiles.forEach(profile => { const opt = document.createElement('option'); opt.value = profile.id; opt.textContent = profile.name; select.append(opt); });
  select.value = state.activeProfileId;
  const profile = activeProfile();
  if (!profile) return;
  $('#profileName').value = profile.name;
  PROFILE_FIELDS.forEach(([key]) => { const slider = $(`#sens-${key}`); if (slider) { slider.value = profile.values[key]; $(`#value-${key}`).textContent = profile.values[key]; } });
  $('#playStyle').value = state.playStyle;
}
function makeSensitivitySliders() {
  const host = $('#sensitivitySliders');
  PROFILE_FIELDS.forEach(([key, label]) => {
    const row = document.createElement('div'); row.className = 'sensitivity-row';
    const text = document.createElement('label'); text.htmlFor = `sens-${key}`; text.textContent = label;
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '200'; slider.step = '1'; slider.id = `sens-${key}`; slider.setAttribute('aria-label', `${label} sensitivity`);
    const output = document.createElement('output'); output.id = `value-${key}`; output.htmlFor = slider.id;
    slider.addEventListener('input', () => { const profile = activeProfile(); if (!profile) return; profile.values[key] = Number(slider.value); output.value = slider.value; output.textContent = slider.value; profile.updatedAt = Date.now(); persist(); renderRecommendations(); renderDashboard(); });
    row.append(text, slider, output); host.append(row);
  });
}
function saveProfile(promptForName = false) {
  const profile = activeProfile(); if (!profile) return;
  let name = $('#profileName').value.trim().slice(0, 32);
  if (promptForName) { const answer = window.prompt('Name this sensitivity profile:', `${name || 'My'} copy`); if (answer === null) return; name = answer.trim().slice(0, 32); }
  if (!name) { toast('Enter a profile name first.', 'error'); $('#profileName').focus(); return; }
  if (state.profiles.some(item => item.id !== profile.id && item.name.toLowerCase() === name.toLowerCase())) { toast('A profile with that name already exists.', 'error'); return; }
  profile.name = name; profile.style = state.playStyle; profile.updatedAt = Date.now(); persist(); renderSensitivitySelects(); renderDashboard(); toast(`“${name}” saved on this device.`);
}
$('#saveProfile').addEventListener('click', () => saveProfile(false));
$('#saveProfileTop').addEventListener('click', () => { switchPage('sensitivity'); saveProfile(true); });
$('#profileName').addEventListener('input', () => { const p = activeProfile(); if (p) { p.name = $('#profileName').value.slice(0, 32); renderDashboard(); persist(); } });
$('#profileSelect').addEventListener('change', () => { state.activeProfileId = $('#profileSelect').value; persist(); renderSensitivitySelects(); renderRecommendations(); renderDashboard(); });
$('#playStyle').addEventListener('change', () => { state.playStyle = $('#playStyle').value; const p = activeProfile(); if (p) p.style = state.playStyle; persist(); renderRecommendations(); });
$('#duplicateProfile').addEventListener('click', () => {
  const current = activeProfile(); if (!current) return;
  const name = window.prompt('Name the duplicate profile:', `${current.name} copy`); if (name === null) return;
  const trimmed = name.trim().slice(0, 32); if (!trimmed) { toast('A profile name is required.', 'error'); return; }
  if (state.profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) { toast('A profile with that name already exists.', 'error'); return; }
  const copy = { ...current, id: makeId('profile'), name: trimmed, values: { ...current.values }, updatedAt: Date.now() };
  state.profiles.push(copy); state.activeProfileId = copy.id; persist(); renderSensitivitySelects(); renderDashboard(); toast('Profile duplicated.');
});
$('#deleteProfile').addEventListener('click', () => {
  if (state.profiles.length < 2) { toast('Keep at least one sensitivity profile.', 'error'); return; }
  const current = activeProfile(); if (!current || !window.confirm(`Delete “${current.name}” from this browser?`)) return;
  state.profiles = state.profiles.filter(p => p.id !== current.id); state.activeProfileId = state.profiles[0].id; persist(); renderSensitivitySelects(); renderRecommendations(); renderDashboard(); toast('Profile deleted.');
});
function exportProfiles() {
  const payload = { app: 'TXB Gaming Panel', version: 1, exportedAt: new Date().toISOString(), profiles: state.profiles };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'txb-sensitivity-profiles.json'; link.click(); URL.revokeObjectURL(link.href); toast('Profile file exported.');
}
$('#exportProfiles').addEventListener('click', exportProfiles);
$('#importProfiles').addEventListener('click', () => $('#profileFile').click());
$('#profileFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  if (file.size > 250_000) { toast('Profile file is too large.', 'error'); return; }
  try {
    const data = JSON.parse(await file.text());
    const profiles = Array.isArray(data) ? data : data.profiles;
    if (!Array.isArray(profiles) || !profiles.length || profiles.length > 30 || !profiles.every(isValidProfile)) throw new Error('invalid');
    const incoming = profiles.map(p => ({ ...p, id: makeId('profile'), name: p.name.trim().slice(0, 32) || 'Imported profile' }));
    const unique = [];
    for (const item of incoming) {
      const base = item.name; let suffix = 2;
      while ([...state.profiles, ...unique].some(p => p.name.toLowerCase() === item.name.toLowerCase())) item.name = `${base.slice(0, 27)} ${suffix++}`;
      unique.push(item);
    }
    state.profiles = [...state.profiles, ...unique].slice(0, 30); state.activeProfileId = unique[0].id;
    persist(); renderSensitivitySelects(); renderRecommendations(); renderDashboard(); toast(`${unique.length} profile${unique.length === 1 ? '' : 's'} imported.`);
  } catch { toast('This profile file is invalid or unsupported. Nothing was imported.', 'error'); }
});

function getRecommendations() {
  const width = window.innerWidth; const dpr = window.devicePixelRatio || 1; const coarse = matchMedia('(pointer: coarse)').matches;
  const styleOffset = state.playStyle === 'precision' ? -7 : state.playStyle === 'fast' ? 7 : 0;
  const screenOffset = width < 380 ? 3 : width > 440 ? -2 : 0;
  const touchOffset = coarse ? 1 : 0;
  const total = styleOffset + screenOffset + touchOffset;
  const order = ['general', 'redDot', 'scope2x', 'scope4x', 'sniper', 'freeLook'];
  return {
    values: Object.fromEntries(order.map((key, index) => [key, Math.max(0, Math.min(200, DEFAULT_VALUES[key] + total - (index >= 2 && index <= 4 ? (index - 1) * 3 : 0)))])),
    text: `${coarse ? 'Touch-style input' : 'Pointer-style input'} detected • ${width} CSS px viewport • ${dpr.toFixed(2)}× pixel ratio. The pixel ratio is reported as context only; it is not treated as a game setting.`,
    reason: `Transparent heuristic: ${state.playStyle} baseline${screenOffset ? `, ${screenOffset > 0 ? '+' : ''}${screenOffset} for viewport width` : ''}${touchOffset ? ', +1 touch adjustment' : ''}. This is an experimentation start point, not a measured optimal value.`,
  };
}
function renderRecommendations() {
  const info = getRecommendations(); $('#recommendationDevice').textContent = info.text; $('#recommendationReason').textContent = info.reason;
  const host = $('#recommendationValues'); host.replaceChildren();
  PROFILE_FIELDS.forEach(([key, title]) => { const item = document.createElement('div'); item.className = 'recommendation-value'; const small = document.createElement('small'); small.textContent = title; const strong = document.createElement('strong'); strong.textContent = info.values[key]; item.append(small, strong); host.append(item); });
}
$('#applyRecommendation').addEventListener('click', () => {
  const profile = activeProfile(); if (!profile) return;
  profile.values = { ...getRecommendations().values }; profile.updatedAt = Date.now(); persist(); renderSensitivitySelects(); renderRecommendations(); renderDashboard(); toast('Recommendation copied to draft. Save the profile when ready.');
});

function resizeCanvas() {
  const rect = $('#canvasWrap').getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
  canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (target) { target.x = Math.max(target.radius, Math.min(rect.width - target.radius, target.x)); target.y = Math.max(target.radius, Math.min(rect.height - target.radius, target.y)); }
  drawCanvas();
}
function spawnTarget(now = performance.now()) {
  const rect = $('#canvasWrap').getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const speedSetting = Number($('#targetSpeed').value || 1.5);
  const angle = Math.random() * Math.PI * 2; const base = 72 * speedSetting;
  const radius = Math.max(18, 27 - speedSetting * 3);
  target = { x: radius + Math.random() * Math.max(1, rect.width - radius * 2), y: radius + Math.random() * Math.max(1, rect.height - radius * 2), vx: Math.cos(angle) * base, vy: Math.sin(angle) * base, radius, visible: activeMode === 'tracking', spawnAt: now };
  if (activeMode === 'reaction') { target.visible = false; nextReactionTargetAt = now + 550 + Math.random() * 1450; }
  if (state.features.sound && activeMode === 'tracking') playCue();
}
function drawCanvas() {
  const rect = $('#canvasWrap').getBoundingClientRect(); if (!rect.width || !rect.height) return;
  context.clearRect(0, 0, rect.width, rect.height);
  if (!target?.visible) return;
  const { x, y, radius } = target;
  context.save();
  context.strokeStyle = 'rgba(70,222,235,.22)'; context.lineWidth = 1;
  for (let ring = 3; ring >= 1; ring--) { context.beginPath(); context.arc(x, y, radius * ring / 3, 0, Math.PI * 2); context.stroke(); }
  const glow = context.createRadialGradient(x, y, 2, x, y, radius * 2.2); glow.addColorStop(0, 'rgba(70,222,235,.22)'); glow.addColorStop(1, 'rgba(70,222,235,0)');
  context.fillStyle = glow; context.beginPath(); context.arc(x, y, radius * 2.2, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#0c2029'; context.strokeStyle = '#4be1ea'; context.lineWidth = 2.4; context.beginPath(); context.arc(x, y, radius * .43, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = '#ff6572'; context.beginPath(); context.arc(x, y, radius * .14, 0, Math.PI * 2); context.fill();
  context.restore();
}
function updateLiveStats() {
  const attempts = sessionHits + sessionMisses; const acc = attempts ? Math.round(sessionHits / attempts * 100) : null;
  $('#liveHits').textContent = String(sessionHits); $('#liveMisses').textContent = String(sessionMisses); $('#liveAccuracy').textContent = acc === null ? '—%' : `${acc}%`;
  $('#liveReaction').textContent = reactionSamples.length ? `${Math.round(average(reactionSamples))} ms` : '— ms';
  $('#accuracyFill').style.width = `${acc || 0}%`;
}
function startTraining() {
  if (!state.features.aim) return toast('Enable Aim training from Dashboard first.', 'error');
  if (trainingRunning) return;
  sessionHits = 0; sessionMisses = 0; reactionSamples = []; activeMode = $('.segment.active')?.dataset.mode || 'tracking';
  trainingRunning = true; target = null;
  const seconds = Number($('#sessionDuration').value || 30); trainingStartedAt = performance.now(); trainingEndsAt = trainingStartedAt + seconds * 1000;
  spawnTarget(trainingStartedAt); $('#canvasOverlay').classList.add('hidden'); $('#canvasRunningLabel').classList.add('visible');
  $('#startTraining').disabled = true; $('#stopTraining').disabled = false; updateLiveStats();
  if (state.features.sound) playCue();
  trainingFrame = requestAnimationFrame(tickTraining); toast(`${activeMode === 'reaction' ? 'Reaction' : 'Tracking'} drill started.`);
}
function tickTraining(now) {
  if (!trainingRunning) return;
  const rect = $('#canvasWrap').getBoundingClientRect();
  const delta = Math.min(.04, Math.max(0, (now - (lastFrameTime || now)) / 1000)); lastFrameTime = now;
  if (activeMode === 'tracking' && target?.visible) {
    target.x += target.vx * delta; target.y += target.vy * delta;
    if (target.x < target.radius || target.x > rect.width - target.radius) target.vx *= -1;
    if (target.y < target.radius || target.y > rect.height - target.radius) target.vy *= -1;
    target.x = Math.max(target.radius, Math.min(rect.width - target.radius, target.x)); target.y = Math.max(target.radius, Math.min(rect.height - target.radius, target.y));
  } else if (activeMode === 'reaction' && target && !target.visible && now >= nextReactionTargetAt) {
    target.visible = true; target.spawnAt = now; if (state.features.sound) playCue();
  }
  const remaining = Math.max(0, (trainingEndsAt - now) / 1000); $('#timerText').textContent = fmtTime(remaining);
  drawCanvas();
  if (now >= trainingEndsAt) { finishTraining('Session complete'); return; }
  trainingFrame = requestAnimationFrame(tickTraining);
}
function finishTraining(message) {
  if (!trainingRunning) return;
  trainingRunning = false; cancelAnimationFrame(trainingFrame); lastFrameTime = 0;
  const selectedDuration = Number($('#sessionDuration').value || 30);
  const elapsed = Math.min(selectedDuration, Math.max(1, Math.round((performance.now() - trainingStartedAt) / 1000)));
  if (sessionHits + sessionMisses > 0) {
    state.sessions.unshift({ id: makeId('session'), mode: activeMode, hits: sessionHits, misses: sessionMisses, reactions: [...reactionSamples], duration: elapsed, date: new Date().toISOString() });
    state.sessions = state.sessions.slice(0, 100); persist(); renderDashboard();
    $('#lastSessionTitle').textContent = `${activeMode === 'reaction' ? 'Reaction' : 'Tracking'} drill • ${localDate()}`;
    const total = sessionHits + sessionMisses; $('#lastSessionAccuracy').textContent = `${Math.round(sessionHits / total * 100)}%`;
    $('#lastSessionReaction').textContent = reactionSamples.length ? `${Math.round(average(reactionSamples))} ms` : '—'; $('#lastSessionHits').textContent = String(sessionHits);
  }
  target = null; drawCanvas(); $('#canvasOverlay').classList.remove('hidden'); $('#canvasRunningLabel').classList.remove('visible');
  $('#startTraining').disabled = !state.features.aim; $('#stopTraining').disabled = true;
  updateLiveStats(); toast(sessionHits + sessionMisses ? `${message} • ${sessionHits} hits, ${sessionMisses} misses.` : `${message}. No taps were recorded.`);
}
function resetTraining() {
  if (trainingRunning) { trainingRunning = false; cancelAnimationFrame(trainingFrame); }
  sessionHits = 0; sessionMisses = 0; reactionSamples = []; target = null; lastFrameTime = 0;
  $('#canvasOverlay').classList.remove('hidden'); $('#canvasRunningLabel').classList.remove('visible'); $('#timerText').textContent = fmtTime(Number($('#sessionDuration').value || 30));
  $('#startTraining').disabled = !state.features.aim; $('#stopTraining').disabled = true; updateLiveStats(); drawCanvas(); toast('Current session reset. Saved history is unchanged.');
}
$('#startTraining').addEventListener('click', startTraining);
$('#stopTraining').addEventListener('click', () => finishTraining('Session stopped'));
$('#resetTraining').addEventListener('click', resetTraining);
$$('.segment').forEach(button => button.addEventListener('click', () => {
  if (trainingRunning) return toast('Stop the current drill before changing mode.', 'error');
  $$('.segment').forEach(item => item.classList.toggle('active', item === button)); activeMode = button.dataset.mode; $('#canvasOverlay small').textContent = activeMode === 'reaction' ? 'Wait for the target to appear, then tap it quickly.' : 'Start the session, then tap the target as it moves.';
}));
$('#sessionDuration').addEventListener('change', () => { if (!trainingRunning) $('#timerText').textContent = fmtTime(Number($('#sessionDuration').value)); });
$('#practiceCanvas').addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect(); pointerPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const crosshair = $('#canvasCrosshair'); crosshair.style.left = `${pointerPoint.x}px`; crosshair.style.top = `${pointerPoint.y}px`;
});
$('#practiceCanvas').addEventListener('pointerleave', () => { if (!state.features.crosshair) pointerPoint = null; });
$('#practiceCanvas').addEventListener('pointerdown', event => {
  if (!trainingRunning) return;
  event.preventDefault(); const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
  if (!target?.visible) { sessionMisses++; updateLiveStats(); return; }
  const distance = Math.hypot(x - target.x, y - target.y);
  if (distance <= target.radius) {
    sessionHits++; const reaction = Math.max(0, Math.round(performance.now() - target.spawnAt)); reactionSamples.push(reaction);
    const now = performance.now(); spawnTarget(now); updateLiveStats();
  } else { sessionMisses++; updateLiveStats(); }
});
function playCue() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 680; gain.gain.setValueAtTime(.045, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .085);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .09);
  } catch { /* Audio is optional; unsupported devices stay silent. */ }
}

function renderHud() {
  const stage = $('#hudStage'); const layout = activeLayout();
  if (layout && (!state.hudElements || !state.hudElements.length)) state.hudElements = layout.elements.map(e => ({ ...e }));
  stage.querySelectorAll('.hud-control').forEach(e => e.remove());
  state.hudElements.forEach(element => {
    const button = document.createElement('button'); button.className = `hud-control ${element.kind}${selectedHudId === element.id ? ' selected' : ''}`;
    button.textContent = element.name; button.style.left = `${element.x}%`; button.style.top = `${element.y}%`; button.style.width = `${element.size}px`; button.style.height = `${element.size}px`;
    button.setAttribute('aria-label', `${element.name} mock HUD button. Select and drag to reposition.`); button.setAttribute('aria-grabbed', String(selectedHudId === element.id)); button.tabIndex = 0;
    button.addEventListener('click', () => { selectedHudId = element.id; updateHudSelection(); });
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      event.preventDefault(); event.stopPropagation(); selectedHudId = element.id; button.setPointerCapture(event.pointerId);
      const stageRect = stage.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY; const originX = element.x; const originY = element.y;
      const move = moveEvent => { const nextRect = stage.getBoundingClientRect(); element.x = Math.max(5, Math.min(95, originX + (moveEvent.clientX - startX) / nextRect.width * 100)); element.y = Math.max(6, Math.min(94, originY + (moveEvent.clientY - startY) / nextRect.height * 100)); button.style.left = `${element.x}%`; button.style.top = `${element.y}%`; };
      const up = () => { button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', up); button.removeEventListener('pointercancel', up); persist(); updateHudSelection(); };
      button.addEventListener('pointermove', move); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up);
      updateHudSelection();
    });
    button.addEventListener('keydown', event => {
      const keyMap = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!keyMap[event.key]) return; event.preventDefault(); const [dx, dy] = keyMap[event.key]; element.x = Math.max(5, Math.min(95, element.x + dx)); element.y = Math.max(6, Math.min(94, element.y + dy)); button.style.left = `${element.x}%`; button.style.top = `${element.y}%`; selectedHudId = element.id; persist(); updateHudSelection();
    });
    stage.append(button);
  });
  const name = $('#layoutName'); if (layout && !name.value) name.value = layout.name;
  $('#layoutSelect').replaceChildren();
  state.hudLayouts.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; $('#layoutSelect').append(option); });
  $('#layoutSelect').value = state.activeHudId;
  updateHudSelection();
}
function updateHudSelection() {
  $$('.hud-control').forEach(button => { const selected = state.hudElements.find(e => e.name === button.textContent && e.id === selectedHudId); button.classList.toggle('selected', !!selected); button.setAttribute('aria-grabbed', String(!!selected)); });
  const element = state.hudElements.find(item => item.id === selectedHudId);
  $('#hudSize').value = element?.size || 64; $('#hudSizeValue').value = `${element?.size || 64} px`; $('#hudSizeValue').textContent = `${element?.size || 64} px`;
}
$('#hudStage').addEventListener('pointerdown', event => { if (event.target.id === 'hudStage' || event.target.classList.contains('hud-safe-area')) { selectedHudId = null; updateHudSelection(); } });
$('#hudSize').addEventListener('input', () => {
  const element = state.hudElements.find(e => e.id === selectedHudId); if (!element) return;
  element.size = Number($('#hudSize').value); $('#hudSizeValue').value = `${element.size} px`; $('#hudSizeValue').textContent = `${element.size} px`;
  const button = $$('.hud-control').find(item => item.getAttribute('aria-label').startsWith(`${element.name} mock`)); if (button) { button.style.width = `${element.size}px`; button.style.height = `${element.size}px`; }
  persist();
});
$('#addHudButton').addEventListener('click', () => {
  if (state.hudElements.length >= 20) return toast('Keep a layout to 20 controls or fewer.', 'error');
  const name = window.prompt('Label for the new mock control:', 'CUSTOM'); if (name === null) return;
  const clean = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 9); if (!clean) return toast('Use a short letter or number label.', 'error');
  const item = { id: makeId('hud'), name: clean, x: 50, y: 50, size: 54, kind: 'utility' }; state.hudElements.push(item); selectedHudId = item.id; persist(); renderHud(); toast('Mock HUD button added.');
});
function saveHudLayout(duplicate = false) {
  const name = $('#layoutName').value.trim().slice(0, 32) || 'My layout'; const current = activeLayout();
  if (!duplicate && current) { current.name = name; current.elements = state.hudElements.map(e => ({ ...e })); current.updatedAt = Date.now(); }
  else {
    if (state.hudLayouts.length >= 30) return toast('Delete an old layout before saving more.', 'error');
    const layout = { id: makeId('layout'), name, elements: state.hudElements.map(e => ({ ...e })), updatedAt: Date.now() }; state.hudLayouts.push(layout); state.activeHudId = layout.id;
  }
  persist(); renderHud(); toast(duplicate ? 'Layout duplicated.' : 'HUD preview layout saved locally.');
}
$('#saveHud').addEventListener('click', () => saveHudLayout(false));
$('#duplicateHud').addEventListener('click', () => saveHudLayout(true));
$('#layoutSelect').addEventListener('change', () => {
  const layout = state.hudLayouts.find(item => item.id === $('#layoutSelect').value); if (!layout) return;
  state.activeHudId = layout.id; state.hudElements = layout.elements.map(e => ({ ...e })); selectedHudId = null; $('#layoutName').value = layout.name; persist(); renderHud();
});
$('#resetHud').addEventListener('click', () => {
  if (!window.confirm('Reset the current HUD preview positions to the default layout?')) return;
  state.hudElements = freshHudElements(); selectedHudId = null; $('#layoutName').value = 'Default layout'; persist(); renderHud(); toast('HUD preview reset.');
});

async function renderPerformance(force = false) {
  if (!state.features.performance) return;
  $('#devicePlatform').textContent = navigator.userAgentData?.platform || navigator.platform || 'Unavailable';
  $('#deviceViewport').textContent = `${window.innerWidth} × ${window.innerHeight} CSS px`;
  $('#devicePixelRatio').textContent = `${(window.devicePixelRatio || 1).toFixed(2)}×`;
  $('#deviceCores').textContent = Number.isFinite(navigator.hardwareConcurrency) ? String(navigator.hardwareConcurrency) : 'Not exposed';
  $('#deviceMemory').textContent = Number.isFinite(navigator.deviceMemory) ? `~${navigator.deviceMemory} GB (browser estimate)` : 'Not exposed';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  $('#networkStatus').classList.toggle('online', navigator.onLine); $('#networkStatus').classList.toggle('offline', !navigator.onLine);
  $('#networkStatus').innerHTML = `<i></i> ${navigator.onLine ? 'ONLINE' : 'OFFLINE'}`;
  const connText = connection ? `${connection.effectiveType || 'connected'}${Number.isFinite(connection.rtt) ? ` • browser RTT hint ${connection.rtt} ms` : ''}` : 'No connection details exposed';
  $('#networkRange').textContent = navigator.onLine ? connText : 'Device reports offline';
  if (force || !batteryManager) await readBattery();
  startPerformanceLoop();
}
async function readBattery() {
  if (!('getBattery' in navigator)) { $('#batteryLevel').textContent = 'Unavailable'; $('#batteryCharging').textContent = 'Unavailable'; return; }
  try {
    batteryManager ||= await navigator.getBattery();
    const update = () => {
      const level = Math.round(batteryManager.level * 100); $('#batteryLevel').textContent = `${level}%`; $('#batteryFill').style.width = `${level}%`;
      $('#batteryCharging').textContent = batteryManager.charging ? 'Charging' : 'Not charging';
      $('#deviceTemperature').textContent = 'Not exposed by this browser';
    };
    update(); batteryManager.addEventListener('levelchange', update); batteryManager.addEventListener('chargingchange', update);
  } catch { $('#batteryLevel').textContent = 'Unavailable'; $('#batteryCharging').textContent = 'Unavailable'; }
}
function startPerformanceLoop() {
  if (perfFrameId || !state.features.performance || document.hidden) return;
  perfFrameMark = performance.now(); perfFrameCount = 0;
  const sample = now => {
    if (!state.features.performance || document.hidden) { perfFrameId = 0; return; }
    perfFrameCount++;
    if (now - perfFrameMark >= 1000) { $('#browserFps').innerHTML = `${Math.round(perfFrameCount * 1000 / (now - perfFrameMark))}<small>FPS</small>`; perfFrameCount = 0; perfFrameMark = now; }
    perfFrameId = requestAnimationFrame(sample);
  };
  perfFrameId = requestAnimationFrame(sample);
  clearInterval(metricInterval); metricInterval = window.setInterval(() => { if (!document.hidden && state.features.performance) renderPerformance(false); }, 10000);
}
function stopPerformanceLoop() {
  if (perfFrameId) cancelAnimationFrame(perfFrameId); perfFrameId = 0; clearInterval(metricInterval); metricInterval = 0;
  if (networkAbort) { networkAbort.abort(); networkAbort = null; }
}
$('#refreshMetrics').addEventListener('click', () => renderPerformance(true).then(() => toast('Browser readings refreshed.')));
window.addEventListener('resize', () => { if (currentPage === 'training') resizeCanvas(); if (currentPage === 'sensitivity') renderRecommendations(); if (state.features.performance) renderPerformance(false); });
window.addEventListener('online', () => renderPerformance(false)); window.addEventListener('offline', () => renderPerformance(false));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (perfFrameId) cancelAnimationFrame(perfFrameId); perfFrameId = 0; if (trainingRunning) finishTraining('Session paused when page became hidden'); }
  else if (state.features.performance) { renderPerformance(false); startPerformanceLoop(); }
});
$('#runNetworkTest').addEventListener('click', runNetworkTest);
async function runNetworkTest() {
  if (!state.features.performance) return toast('Enable Browser monitor before running diagnostics.', 'error');
  if (!navigator.onLine) return toast('This device reports no network connection.', 'error');
  const button = $('#runNetworkTest'); button.disabled = true; button.textContent = 'Testing…';
  $('#networkBars').classList.remove('complete'); const samples = []; let errors = 0; networkAbort = new AbortController();
  for (let i = 0; i < 3; i++) {
    if (networkAbort.signal.aborted) break;
    const timer = setTimeout(() => networkAbort?.abort(), 5000); const started = performance.now();
    try {
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=example.com&type=A&txb=${Date.now()}-${i}`, { method: 'GET', mode: 'cors', cache: 'no-store', headers: { accept: 'application/dns-json' }, signal: networkAbort.signal });
      if (!response.ok) throw new Error('endpoint'); await response.json(); samples.push(Math.round(performance.now() - started));
    } catch { errors++; }
    finally { clearTimeout(timer); }
    if (i < 2) await new Promise(resolve => setTimeout(resolve, 220));
  }
  networkAbort = null; button.disabled = false; button.textContent = 'Run 3-request test';
  const bars = $$('#networkBars i'); bars.forEach((bar, index) => { bar.classList.toggle('loss', index >= Math.round(samples.length / 3 * bars.length)); });
  if (samples.length) {
    const avg = Math.round(average(samples)); $('#networkAverage').innerHTML = `${avg}<small>ms</small>`;
    $('#networkRange').textContent = `${Math.min(...samples)}–${Math.max(...samples)} ms • ${errors} failed request${errors === 1 ? '' : 's'} • Cloudflare DNS`;
    $('#networkBars').classList.add('complete'); toast('Latency sample complete. This does not represent game-server ping.');
  } else { $('#networkAverage').innerHTML = '—<small>ms</small>'; $('#networkRange').textContent = errors ? 'Test endpoint blocked, timed out, or unavailable.' : 'No request completed.'; toast('Network test could not complete.', 'error'); }
}

function toggleFloating(open = $('#floatingPanel').hidden) {
  const panel = $('#floatingPanel'); panel.hidden = !open; $('#floatingTrigger').setAttribute('aria-expanded', String(open));
  $('#floatingTrigger').setAttribute('aria-label', open ? 'Close quick controls' : 'Open quick controls');
}
$('#floatingTrigger').addEventListener('click', event => {
  if (suppressFloatClick) { suppressFloatClick = false; event.preventDefault(); return; }
  toggleFloating($('#floatingPanel').hidden);
});
$('#closeFloating').addEventListener('click', () => toggleFloating(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape') { toggleFloating(false); $('#sidebar').classList.remove('open'); $('#mobileMenu').setAttribute('aria-expanded', 'false'); } });
let floatDrag = null;
$('#floatingTrigger').addEventListener('pointerdown', event => { if (event.button !== 0 && event.pointerType !== 'touch') return; floatDrag = { x: event.clientX, y: event.clientY, left: $('#floatingTrigger').getBoundingClientRect().left, top: $('#floatingTrigger').getBoundingClientRect().top, moved: false }; $('#floatingTrigger').setPointerCapture(event.pointerId); });
$('#floatingTrigger').addEventListener('pointermove', event => {
  if (!floatDrag) return; const dx = event.clientX - floatDrag.x; const dy = event.clientY - floatDrag.y;
  if (Math.abs(dx) + Math.abs(dy) > 8) floatDrag.moved = true;
  if (floatDrag.moved) { const button = $('#floatingTrigger'); button.style.left = `${Math.max(4, Math.min(window.innerWidth - button.offsetWidth - 4, floatDrag.left + dx))}px`; button.style.top = `${Math.max(4, Math.min(window.innerHeight - button.offsetHeight - 4, floatDrag.top + dy))}px`; button.style.right = 'auto'; button.style.bottom = 'auto'; }
});
$('#floatingTrigger').addEventListener('pointerup', () => { if (floatDrag?.moved) suppressFloatClick = true; floatDrag = null; });
$('#floatingTrigger').addEventListener('pointercancel', () => { floatDrag = null; });

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; showInstallButton(); });
function showInstallButton() {
  if ($('#installPwa')) return;
  const button = document.createElement('button'); button.id = 'installPwa'; button.className = 'button button-secondary'; button.textContent = 'Install web app'; button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) { toast('Use your browser menu → Install app or Add to Home screen.'); return; }
    deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; button.remove();
  });
  $('.top-actions').prepend(button);
}
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; $('#installPwa')?.remove(); toast('TXB Gaming Panel installed.'); });
if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).then(reg => {
    serviceWorkerRegistration = reg;
    reg.addEventListener('updatefound', () => { const worker = reg.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('An app update is ready. Refresh to use it.'); }); });
  }).catch(() => toast('Offline support could not be enabled in this browser.', 'error'));
}

function updateTimerLabel() { if (!trainingRunning) $('#timerText').textContent = fmtTime(Number($('#sessionDuration').value || 30)); }
window.addEventListener('resize', updateTimerLabel);
makeSensitivitySliders();
renderSensitivitySelects();
renderRecommendations();
renderHud();
renderDashboard();
updateFeatureUI();
updateLiveStats();
resizeCanvas();
updateTimerLabel();


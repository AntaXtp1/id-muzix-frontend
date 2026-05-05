// ─── Config ──────────────────────────────────────────────────────────────────
const BACKEND = 'https://owqcznklvwrw.ap-southeast-1.clawcloudrun.com';

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const audio         = document.getElementById('audioEl');
const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const resultCard    = document.getElementById('resultCard');
const errorMsg      = document.getElementById('errorMsg');
const cardTitle     = document.getElementById('cardTitle');
const cardMeta      = document.getElementById('cardMeta');
const thumbWrap     = document.getElementById('thumbWrap');
const playBtn       = document.getElementById('playBtn');
const progressFill  = document.getElementById('progressFill');
const progressBar   = document.getElementById('progressBar');
const timeCurrent   = document.getElementById('timeCurrent');
const timeDuration  = document.getElementById('timeDuration');
const downloadBtn   = document.getElementById('downloadBtn');
const muteBtn       = document.getElementById('muteBtn');
const loopBtn       = document.getElementById('loopBtn');
const nowPlayingBar = document.getElementById('nowPlayingBar');
const npThumb       = document.getElementById('npThumb');
const npTitle       = document.getElementById('npTitle');
const npPlayBtn     = document.getElementById('npPlayBtn');
const historySection= document.getElementById('historySection');
const historyChips  = document.getElementById('historyChips');

// ─── State ────────────────────────────────────────────────────────────────────
let currentToken   = null;
let currentThumb   = '';
let currentTitle   = '';
let isLooping      = false;
let isMuted        = false;
let retryCount     = 0;
const MAX_RETRY    = 3;
let searchController = null; // AbortController buat cancel request lama
let debounceTimer    = null;

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('toastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastEl';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── History ─────────────────────────────────────────────────────────────────
function getHistory() {
  try { return JSON.parse(localStorage.getItem('muzix_history') || '[]'); }
  catch { return []; }
}
function addHistory(q) {
  let h = getHistory().filter(x => x !== q);
  h.unshift(q);
  localStorage.setItem('muzix_history', JSON.stringify(h.slice(0, 6)));
  renderHistory();
}
function renderHistory() {
  const h = getHistory();
  if (!h.length) { historySection.style.display = 'none'; return; }
  historySection.style.display = 'block';
  historyChips.innerHTML = h.map(q =>
    `<div class="chip" onclick="doSearch('${q.replace(/'/g, "\\'")}')">🎵 ${q}</div>`
  ).join('');
}
renderHistory();

// ─── Search ───────────────────────────────────────────────────────────────────
function setSearchLoading(on) {
  if (on) {
    searchBtn.classList.add('loading');
    searchBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  } else {
    searchBtn.classList.remove('loading');
    searchBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
  }
}

async function doSearch(q) {
  q = (q || searchInput.value).trim();
  if (!q) return;
  searchInput.value = q;

  // Cancel request sebelumnya kalau masih jalan
  if (searchController) searchController.abort();
  searchController = new AbortController();

  setSearchLoading(true);
  resultCard.classList.remove('show');
  errorMsg.classList.remove('show');
  audio.pause();
  audio.src = '';
  playBtn.disabled = true;
  retryCount = 0;

  try {
    const res = await fetch(`${BACKEND}/search?q=${encodeURIComponent(q)}`, {
      signal: searchController.signal
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Gagal fetch');

    // Set data ke UI
    currentToken = data.stream_token;
    currentThumb = data.thumbnail || '';
    currentTitle = data.title;

    thumbWrap.innerHTML = currentThumb
      ? `<img class="card-thumb" src="${currentThumb}" alt="${currentTitle}" onerror="this.style.display='none'">`
      : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`;

    cardTitle.textContent = currentTitle;
    cardMeta.textContent  = formatDuration(data.duration);
    npThumb.src           = currentThumb;
    npTitle.textContent   = currentTitle;

    // ── Hybrid streaming: minta URL dari backend, audio langsung ke CDN ──
    await loadStreamUrl();

    downloadBtn.href     = `${BACKEND}/download/${currentToken}`;
    downloadBtn.download = `${currentTitle}.mp3`;

    resultCard.classList.add('show');
    addHistory(q);
    setupMediaSession();

  } catch (err) {
    if (err.name === 'AbortError') return; // dibatalin sendiri, skip
    console.error('[Search]', err);
    errorMsg.classList.add('show');
  }

  setSearchLoading(false);
}

// ── Hybrid: ambil signed URL dari backend, set ke audio langsung ──────────────
async function loadStreamUrl() {
  const res  = await fetch(`${BACKEND}/get-stream-url/${currentToken}`);
  const data = await res.json();
  if (!data.url) throw new Error('Stream URL kosong');

  audio.src = data.url;
  audio.load();
  playBtn.disabled = false;
}

// ── Retry handler kalau URL expired di tengah jalan ──────────────────────────
audio.onerror = async () => {
  if (!currentToken) return;
  if (retryCount >= MAX_RETRY) {
    showToast('Stream gagal, coba cari ulang 😞');
    return;
  }
  retryCount++;
  console.warn(`[Audio] error, retry ${retryCount}/${MAX_RETRY}`);
  try {
    await loadStreamUrl();
    audio.play();
  } catch {
    showToast('Gagal reconnect stream');
  }
};

// ─── Player Controls ─────────────────────────────────────────────────────────
function togglePlay() {
  if (audio.paused) audio.play();
  else audio.pause();
}

function setPlayIcons(playing) {
  const pauseSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const playSVG  = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  playBtn.innerHTML   = playing ? pauseSVG : playSVG;
  npPlayBtn.innerHTML = playing ? pauseSVG : playSVG;
}

audio.addEventListener('play', () => {
  setPlayIcons(true);
  nowPlayingBar.classList.add('show');
  retryCount = 0; // reset retry kalau berhasil main
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

audio.addEventListener('pause', () => {
  setPlayIcons(false);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressFill.style.width = pct + '%';
  timeCurrent.textContent  = formatTime(audio.currentTime);
  timeDuration.textContent = formatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  if (isLooping) { audio.currentTime = 0; audio.play(); }
  else setPlayIcons(false);
});

// ── Cleanup safety: remove event sebelum navigasi ────────────────────────────
window.addEventListener('beforeunload', () => {
  audio.pause();
  audio.src = '';
});

// ─── Seekbar — mouse + touch ──────────────────────────────────────────────────
function seekTo(clientX) {
  if (!audio.duration || isNaN(audio.duration)) return;
  const rect = progressBar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

progressBar.addEventListener('click', (e) => seekTo(e.clientX));

// Touch support buat mobile
progressBar.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
progressBar.addEventListener('touchmove',  (e) => {
  e.preventDefault();
  seekTo(e.touches[0].clientX);
}, { passive: false });

// ─── Mute & Loop ─────────────────────────────────────────────────────────────
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  audio.muted = isMuted;
  muteBtn.classList.toggle('active', isMuted);
});

loopBtn.addEventListener('click', () => {
  isLooping = !isLooping;
  audio.loop = isLooping;
  loopBtn.classList.toggle('active', isLooping);
});

playBtn.addEventListener('click', togglePlay);
npPlayBtn.addEventListener('click', togglePlay);

// ─── Search events — debounce 400ms ──────────────────────────────────────────
searchBtn.addEventListener('click', () => doSearch());
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    doSearch();
  }
});
// Optional: debounce auto search waktu ngetik
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (q.length < 3) return; // minimal 3 karakter dulu
  debounceTimer = setTimeout(() => doSearch(q), 400);
});

// ─── MediaSession API (lock screen control) ───────────────────────────────────
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentTitle,
    artwork: currentThumb
      ? [{ src: currentThumb, sizes: '600x600', type: 'image/jpeg' }]
      : []
  });
  navigator.mediaSession.setActionHandler('play',  () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function formatTime(s) {
  if (isNaN(s) || s < 0) return '0:00';
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function formatDuration(ms) {
  if (!ms) return '';
  return formatTime(Math.floor(ms / 1000));
}

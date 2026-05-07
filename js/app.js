// ─── Config ────────────────────────────────────────────────────────────────────
const BACKEND = 'https://owqcznklvwrw.ap-southeast-1.clawcloudrun.com';

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const audio          = document.getElementById('audioEl');
const preloadAudio   = document.getElementById('preloadAudio');
const searchInput    = document.getElementById('searchInput');
const searchClear    = document.getElementById('searchClear');
const resultCard     = document.getElementById('resultCard');
const errorMsg       = document.getElementById('errorMsg');
const cardTitle      = document.getElementById('cardTitle');
const cardArtist     = document.getElementById('cardArtist');
const cardMeta       = document.getElementById('cardMeta');
const thumbWrap      = document.getElementById('thumbWrap');
const playBtn        = document.getElementById('playBtn');
const progressFill   = document.getElementById('progressFill');
const progressThumb  = document.getElementById('progressThumb');
const progressBar    = document.getElementById('progressBar');
const timeCurrent    = document.getElementById('timeCurrent');
const timeDuration   = document.getElementById('timeDuration');
const downloadBtn    = document.getElementById('downloadBtn');
const muteBtn        = document.getElementById('muteBtn');
const loopBtn        = document.getElementById('loopBtn');
const shuffleBtn     = document.getElementById('shuffleBtn');
const nowPlayingBar  = document.getElementById('nowPlayingBar');
const npThumb        = document.getElementById('npThumb');
const npTitle        = document.getElementById('npTitle');
const npArtist       = document.getElementById('npArtist');
const npPlayBtn      = document.getElementById('npPlayBtn');
const npShuffleBtn   = document.getElementById('npShuffleBtn');
const npLoopBtn      = document.getElementById('npLoopBtn');
const npProgressFill = document.getElementById('npProgressFill');
const npProgressBar  = document.getElementById('npProgressBar');
const npTimeCurrent  = document.getElementById('npTimeCurrent');
const npTimeDuration = document.getElementById('npTimeDuration');
const historySection = document.getElementById('historySection');
const historyChips   = document.getElementById('historyChips');
const skeletonEl     = document.getElementById('skeletonLoader');
const sourceBadge    = document.getElementById('sourceBadge');
const relatedSection = document.getElementById('relatedSection');
const relatedList    = document.getElementById('relatedList');
const trendingHeroes = document.getElementById('trendingHeroes');
const trendingList   = document.getElementById('trendingList');
const trendSkeleton  = document.getElementById('trendingSkeleton');
const sidebarHistory = document.getElementById('sidebarHistory');
const greetingTime   = document.getElementById('greetingTime');

// ─── State ─────────────────────────────────────────────────────────────────────
let currentToken  = null;
let currentThumb  = '';
let currentTitle  = '';
let currentArtist = '';
let currentQuery  = '';
let isLooping     = false;
let isMuted       = false;
let retryCount    = 0;
let shouldAutoPlay= false;
const MAX_RETRY   = 3;
let searchController = null;
let debounceTimer    = null;
let relatedQueue     = [];   // queue lagu related untuk auto-next
let preloadedQuery   = null; // query yang udah di-preload
let preloadedUrl     = null; // URL yang udah di-preload
let isPreloading     = false;
let preloadTimer     = null;

// ─── NoSleep / Anti-throttle ───────────────────────────────────────────────────
// Trick: silent AudioContext yang terus "hidup" biar browser gak throttle tab
let audioCtx = null;
let silentNode = null;

function initNoSleep() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Buat oscillator silent (volume 0) - bikin browser anggap tab ini aktif audio
    silentNode = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.001; // nearly silent, bukan 0 biar gak di-optimize away
    silentNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    silentNode.start();
  } catch(e) {
    console.warn('[NoSleep] AudioContext gagal:', e.message);
  }
}

// Wake Lock API sebagai layer kedua anti-throttle
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log('[WakeLock] aktif');
    wakeLock.addEventListener('release', () => {
      console.log('[WakeLock] released');
    });
  } catch(e) {
    console.warn('[WakeLock] gagal:', e.message);
  }
}

// Re-request wake lock kalau tab visible lagi
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !audio.paused) {
    await requestWakeLock();
  }
});

// ─── View switching ────────────────────────────────────────────────────────────
function showView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.remove('hidden');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
}

// ─── Sidebar toggle (mobile) ───────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── Greeting ─────────────────────────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  if (h < 11)       greetingTime.textContent = 'Pagi';
  else if (h < 15)  greetingTime.textContent = 'Siang';
  else if (h < 18)  greetingTime.textContent = 'Sore';
  else              greetingTime.textContent = 'Malam';
}
setGreeting();

// ─── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const toast = document.getElementById('toastEl');
  toast.textContent = msg;
  toast.className = `toast show${type === 'info' ? ' info' : ''}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── History ───────────────────────────────────────────────────────────────────
function getHistory() {
  try { return JSON.parse(localStorage.getItem('muzix_history') || '[]'); }
  catch { return []; }
}
function addHistory(q) {
  let h = getHistory().filter(x => x !== q);
  h.unshift(q);
  localStorage.setItem('muzix_history', JSON.stringify(h.slice(0, 8)));
  renderHistory();
}
function renderHistory() {
  const h = getHistory();
  // Search view chips
  if (historySection && historyChips) {
    if (!h.length) {
      historySection.style.display = 'none';
    } else {
      historySection.style.display = 'block';
      historyChips.innerHTML = h.map(q =>
        `<div class="chip" data-query="${q.replace(/"/g,'&quot;')}">🕐 ${q}</div>`
      ).join('');
      historyChips.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => doSearch(chip.dataset.query));
      });
    }
  }
  // Sidebar
  if (sidebarHistory) {
    sidebarHistory.innerHTML = h.slice(0, 6).map(q =>
      `<div class="sidebar-hist-item" data-query="${q.replace(/"/g,'&quot;')}">${q}</div>`
    ).join('');
    sidebarHistory.querySelectorAll('.sidebar-hist-item').forEach(el => {
      el.addEventListener('click', () => { doSearch(el.dataset.query); showView('search'); });
    });
  }
}
renderHistory();

// ─── Trending ──────────────────────────────────────────────────────────────────
async function loadTrending() {
  if (trendSkeleton) trendSkeleton.style.display = 'grid';
  try {
    const res  = await fetch(`${BACKEND}/trending`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');

    if (trendSkeleton) trendSkeleton.style.display = 'none';

    // Top 3 → hero cards
    const heroes = data.slice(0, 3);
    trendingHeroes.innerHTML = heroes.map(item => `
      <div class="trend-hero" data-query="${item.query.replace(/"/g,'&quot;')}">
        ${item.thumbnail
          ? `<img class="trend-hero-img" src="${item.thumbnail}" alt="${item.title}" loading="lazy">`
          : `<div class="trend-hero-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`
        }
        <div class="trend-hero-body">
          <div class="trend-hero-rank">#${item.rank || (heroes.indexOf(item)+1)}</div>
          <div class="trend-hero-title">${item.title}</div>
          <div class="trend-hero-artist">${item.artist || ''}</div>
        </div>
      </div>
    `).join('');

    // Bind click
    trendingHeroes.querySelectorAll('.trend-hero').forEach(el => {
      el.addEventListener('click', () => { doSearch(el.dataset.query); showView('search'); });
    });

    // 4-20 → list
    const rest = data.slice(3);
    trendingList.innerHTML = rest.map((item, i) => `
      <div class="trending-row" data-query="${item.query.replace(/"/g,'&quot;')}" style="animation-delay:${i*0.04}s">
        <div class="tr-rank">${item.rank || (i+4)}</div>
        ${item.thumbnail
          ? `<img class="tr-thumb" src="${item.thumbnail}" alt="" loading="lazy">`
          : `<div class="tr-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`
        }
        <div class="tr-info">
          <div class="tr-title">${item.title}</div>
          <div class="tr-artist">${item.artist || ''}</div>
        </div>
      </div>
    `).join('');

    trendingList.querySelectorAll('.trending-row').forEach(el => {
      el.addEventListener('click', () => { doSearch(el.dataset.query); showView('search'); });
    });

  } catch(e) {
    console.warn('[Trending] gagal:', e.message);
    if (trendSkeleton) trendSkeleton.style.display = 'none';
  }
}
loadTrending();

// ─── Preload next song ─────────────────────────────────────────────────────────
async function preloadNextSong() {
  if (!relatedQueue.length || isPreloading) return;

  const next = relatedQueue[0];
  if (preloadedQuery === next.query) return; // udah di-preload

  isPreloading = true;
  try {
    const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(next.query)}`);
    const data = await res.json();
    if (data.stream_token) {
      const streamRes = await fetch(`${BACKEND}/get-stream-url/${data.stream_token}`);
      const streamData = await streamRes.json();
      if (streamData.url) {
        preloadAudio.src = streamData.url;
        preloadAudio.load();
        preloadedQuery = next.query;
        preloadedUrl   = streamData.url;
        console.log('[Preload] ✓', next.title);
      }
    }
  } catch(e) {
    console.warn('[Preload] gagal:', e.message);
  }
  isPreloading = false;
}

// Check progress untuk trigger preload
function checkPreloadTrigger() {
  if (!audio.duration || isNaN(audio.duration)) return;
  const remaining = audio.duration - audio.currentTime;
  // Trigger preload kalau sisa 25 detik
  if (remaining < 25 && remaining > 0 && relatedQueue.length && !preloadedQuery) {
    preloadNextSong();
  }
}

// ─── Auto-next / shuffle by related ───────────────────────────────────────────
async function loadRelated(query, artist) {
  try {
    const url = `${BACKEND}/related?q=${encodeURIComponent(query)}&artist=${encodeURIComponent(artist || '')}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      relatedQueue = data;
      renderRelated(data);
    }
  } catch(e) {
    console.warn('[Related] gagal:', e.message);
  }
}

function renderRelated(songs) {
  if (!songs.length) { relatedSection.classList.add('hidden'); return; }
  relatedSection.classList.remove('hidden');
  relatedList.innerHTML = songs.slice(0, 8).map((s, i) => `
    <div class="related-item" data-query="${s.query.replace(/"/g,'&quot;')}" style="animation-delay:${i*0.05}s">
      ${s.thumbnail
        ? `<img class="related-thumb" src="${s.thumbnail}" alt="" loading="lazy">`
        : `<div class="related-thumb" style="background:var(--surface2)"></div>`
      }
      <div class="related-info">
        <div class="related-title">${s.title}</div>
        <div class="related-artist">${s.artist || ''}</div>
      </div>
    </div>
  `).join('');
  relatedList.querySelectorAll('.related-item').forEach(el => {
    el.addEventListener('click', () => doSearch(el.dataset.query));
  });
}

function nextRelated() {
  if (!relatedQueue.length) {
    showToast('Belum ada lagu terkait', 'info');
    return;
  }

  // Kalau ada preloaded song, pakai itu langsung
  if (preloadedQuery && preloadedUrl && preloadedQuery === relatedQueue[0]?.query) {
    const next = relatedQueue.shift();
    doSearchWithPreload(next.query, preloadedUrl);
    preloadedQuery = null;
    preloadedUrl   = null;
    preloadAudio.src = '';
  } else {
    const next = relatedQueue.shift();
    doSearch(next.query);
  }
}

// Play lagu yang udah di-preload (skip fetch stream URL)
async function doSearchWithPreload(q, streamUrl) {
  searchInput.value = q;
  showView('search');

  // Reset state
  audio.pause();
  audio.src = streamUrl; // langsung pakai URL preloaded
  retryCount = 0;
  shouldAutoPlay = true;
  preloadedQuery = null;
  preloadedUrl   = null;

  // Coba fetch metadata aja (lebih ringan)
  try {
    const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.error) {
      currentTitle  = data.title;
      currentArtist = data.artist || '';
      currentThumb  = data.thumbnail || '';
      currentQuery  = q;
      currentToken  = data.stream_token;

      updateCardUI(data);
      addHistory(q);
      setupMediaSession();
      loadRelated(q, data.artist);
    }
  } catch(e) {
    console.warn('[SearchWithPreload] meta gagal:', e.message);
  }

  playBtn.disabled = false;
  audio.play().catch(() => {});
}

// ─── Search ────────────────────────────────────────────────────────────────────
function setSearchLoading(on) {
  const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
  const spin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  // inject spin style jika belum ada
  if (!document.getElementById('spinStyle')) {
    const s = document.createElement('style');
    s.id = 'spinStyle';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}

function updateCardUI(data) {
  thumbWrap.innerHTML = currentThumb
    ? `<img class="card-thumb" src="${currentThumb}" alt="${currentTitle}" onerror="this.style.display='none'">`
    : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`;

  cardTitle.textContent  = currentTitle;
  cardArtist.textContent = currentArtist;
  cardMeta.textContent   = formatDuration(data.duration);
  npThumb.src            = currentThumb;
  npTitle.textContent    = currentTitle;
  npArtist.textContent   = currentArtist;

  if (sourceBadge) {
    sourceBadge.textContent = data.source === 'youtube' ? '▶ YouTube' : '☁ SoundCloud';
    sourceBadge.className   = `source-badge ${data.source}`;
  }

  if (currentToken) {
    downloadBtn.href     = `${BACKEND}/download/${currentToken}`;
    downloadBtn.download = `${currentTitle}.mp3`;
  }
}

async function doSearch(q) {
  q = (q || searchInput.value).trim();
  if (!q) return;
  searchInput.value = q;

  showView('search');

  if (searchController) { searchController.abort(); }
  searchController = new AbortController();

  skeletonEl.classList.remove('hidden');
  resultCard.classList.add('hidden');
  errorMsg.classList.add('hidden');
  relatedSection.classList.add('hidden');
  if (historySection) historySection.style.display = 'none';

  audio.pause();
  audio.src = '';
  playBtn.disabled = true;
  retryCount = 0;
  shouldAutoPlay = true;
  preloadedQuery = null;
  preloadedUrl   = null;

  try {
    const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(q)}`, {
      signal: searchController.signal,
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Gagal fetch');

    currentToken  = data.stream_token;
    currentThumb  = data.thumbnail || '';
    currentTitle  = data.title;
    currentArtist = data.artist || '';
    currentQuery  = q;

    skeletonEl.classList.add('hidden');
    resultCard.classList.remove('hidden');

    updateCardUI(data);
    addHistory(q);
    setupMediaSession();

    // Init NoSleep pas user pertama kali mulai play (butuh gesture)
    initNoSleep();
    await requestWakeLock();

    await loadStreamUrl();

    // Load related songs di background
    loadRelated(q, data.artist);

  } catch(err) {
    if (err.name === 'AbortError') return;
    console.error('[Search]', err);
    skeletonEl.classList.add('hidden');
    errorMsg.classList.remove('hidden');
    renderHistory();
  }
}

function clearSearch() {
  searchInput.value = '';
  resultCard.classList.add('hidden');
  errorMsg.classList.add('hidden');
  skeletonEl.classList.add('hidden');
  relatedSection.classList.add('hidden');
  renderHistory();
}

// ─── Stream URL ────────────────────────────────────────────────────────────────
async function loadStreamUrl() {
  const res  = await fetch(`${BACKEND}/get-stream-url/${currentToken}`);
  const data = await res.json();
  if (!data.url) throw new Error('Stream URL kosong');

  audio.src = data.url;
  playBtn.disabled = false;

  if (shouldAutoPlay) {
    shouldAutoPlay = false;
    audio.play().catch(e => {
      if (e.name !== 'AbortError') console.warn('[AutoPlay]', e.message);
    });
  }
}

// ─── Audio error retry ─────────────────────────────────────────────────────────
audio.addEventListener('error', async () => {
  if (!currentToken) return;
  if (retryCount >= MAX_RETRY) {
    showToast('Stream gagal, coba cari ulang 😞');
    return;
  }
  retryCount++;
  console.warn(`[Audio] error, retry ${retryCount}/${MAX_RETRY}`);
  try {
    shouldAutoPlay = true;
    await loadStreamUrl();
  } catch {
    showToast('Gagal reconnect stream');
  }
});

// ─── Player controls ───────────────────────────────────────────────────────────
function safePlay() {
  // Resume AudioContext kalau suspended (browser policy)
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  audio.play().catch(e => {
    if (e.name !== 'AbortError') console.warn('[Play]', e.message);
  });
}

function togglePlay() {
  if (audio.paused) safePlay();
  else audio.pause();
}

function setPlayIcons(playing) {
  const pause = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const play  = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  playBtn.innerHTML   = playing ? pause : play;
  npPlayBtn.innerHTML = playing ? pause : play;
}

audio.addEventListener('play', () => {
  setPlayIcons(true);
  nowPlayingBar.classList.add('show');
  retryCount = 0;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

audio.addEventListener('pause', () => {
  setPlayIcons(false);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressFill.style.width      = pct + '%';
  progressThumb.style.left      = pct + '%';
  npProgressFill.style.width    = pct + '%';
  timeCurrent.textContent       = formatTime(audio.currentTime);
  timeDuration.textContent      = formatTime(audio.duration);
  npTimeCurrent.textContent     = formatTime(audio.currentTime);
  npTimeDuration.textContent    = formatTime(audio.duration);
  checkPreloadTrigger();
});

audio.addEventListener('ended', () => {
  setPlayIcons(false);
  if (isLooping) {
    audio.currentTime = 0; safePlay();
  } else if (relatedQueue.length) {
    // Auto-next ke related song
    nextRelated();
  }
});

window.addEventListener('beforeunload', () => { audio.pause(); audio.src = ''; });

// ─── Seekbar — mouse + touch ───────────────────────────────────────────────────
function seekTo(clientX, bar) {
  if (!audio.duration || isNaN(audio.duration)) return;
  const rect = bar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}
progressBar.addEventListener('click', e => seekTo(e.clientX, progressBar));
progressBar.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
progressBar.addEventListener('touchmove', e => { e.preventDefault(); seekTo(e.touches[0].clientX, progressBar); }, { passive: false });

npProgressBar.addEventListener('click', e => seekTo(e.clientX, npProgressBar));
npProgressBar.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
npProgressBar.addEventListener('touchmove', e => { e.preventDefault(); seekTo(e.touches[0].clientX, npProgressBar); }, { passive: false });

// ─── Mute, Loop ───────────────────────────────────────────────────────────────
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  audio.muted = isMuted;
  muteBtn.classList.toggle('active', isMuted);
});

function toggleLoop() {
  isLooping = !isLooping;
  audio.loop = isLooping;
  loopBtn.classList.toggle('active', isLooping);
  npLoopBtn.classList.toggle('active', isLooping);
}
function toggleLoopNp() { toggleLoop(); }
loopBtn.addEventListener('click', toggleLoop);

playBtn.addEventListener('click', togglePlay);
npPlayBtn.addEventListener('click', togglePlay);

// ─── Search events ─────────────────────────────────────────────────────────────
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { clearTimeout(debounceTimer); doSearch(); }
});
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) return;
  debounceTimer = setTimeout(() => doSearch(q), 500);
});
searchInput.addEventListener('focus', () => {
  showView('search');
});

// ─── MediaSession ──────────────────────────────────────────────────────────────
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  currentTitle,
    artist: currentArtist,
    artwork: currentThumb ? [{ src: currentThumb, sizes: '600x600', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play',       () => safePlay());
  navigator.mediaSession.setActionHandler('pause',      () => audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack',  () => nextRelated());
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (d.seekTime !== undefined) audio.currentTime = d.seekTime;
  });
}

// ─── Utils ─────────────────────────────────────────────────────────────────────
function formatTime(s) {
  if (isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}
function formatDuration(ms) {
  return ms ? formatTime(Math.floor(ms / 1000)) : '';
}

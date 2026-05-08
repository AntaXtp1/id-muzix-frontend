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
let relatedQueue     = [];
let preloadedQuery   = null;
let preloadedUrl     = null;
let isPreloading     = false;

// ─── NoSleep / Anti-throttle ───────────────────────────────────────────────────
let audioCtx   = null;
let silentNode = null;

function initNoSleep() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    silentNode = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.001;
    silentNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    silentNode.start();
  } catch(e) {
    console.warn('[NoSleep] AudioContext gagal:', e.message);
  }
}

let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => console.log('[WakeLock] released'));
  } catch(e) {
    console.warn('[WakeLock] gagal:', e.message);
  }
}

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
  if (h < 11)      greetingTime.textContent = 'Pagi';
  else if (h < 15) greetingTime.textContent = 'Siang';
  else if (h < 18) greetingTime.textContent = 'Sore';
  else             greetingTime.textContent = 'Malam';
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

// ─── Trending ─────────────────────────────────────────────────────────────────
async function loadTrending() {
  if (trendSkeleton) trendSkeleton.style.display = 'grid';

  try {
    const res = await fetch(`${BACKEND}/trending`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');

    if (trendSkeleton) trendSkeleton.style.display = 'none';

    // Top 3 → hero cards
    const heroes = data.slice(0, 3);
    trendingHeroes.innerHTML = heroes.map((item, idx) => `
      <div class="trend-hero" data-query="${item.query.replace(/"/g,'&quot;')}">
        ${item.thumbnail
          ? `<img class="trend-hero-img" src="${item.thumbnail}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''
        }
        <div class="trend-hero-img-placeholder" style="${item.thumbnail ? 'display:none' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/>
          </svg>
        </div>
        <div class="trend-hero-body">
          <div class="trend-hero-rank">#${item.rank || (idx + 1)}</div>
          <div class="trend-hero-title">${escapeHtml(item.title)}</div>
          <div class="trend-hero-artist">${escapeHtml(item.artist || '')}</div>
        </div>
      </div>
    `).join('');

    trendingHeroes.querySelectorAll('.trend-hero').forEach(el => {
      // FIX Bug2: playTrack langsung, tanpa pindah view
      el.addEventListener('click', () => playTrack(el.dataset.query));
    });

    // 4-20 → list
    const rest = data.slice(3);
    trendingList.innerHTML = rest.map((item, i) => `
      <div class="trending-row" data-query="${item.query.replace(/"/g,'&quot;')}" style="animation-delay:${i*0.04}s">
        <div class="tr-rank">${item.rank || (i + 4)}</div>
        ${item.thumbnail
          ? `<img class="tr-thumb" src="${item.thumbnail}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'tr-thumb-placeholder\\'><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><path d=\\'M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z\\'/></svg></div>'">`
          : `<div class="tr-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`
        }
        <div class="tr-info">
          <div class="tr-title">${escapeHtml(item.title)}</div>
          <div class="tr-artist">${escapeHtml(item.artist || '')}</div>
        </div>
      </div>
    `).join('');

    trendingList.querySelectorAll('.trending-row').forEach(el => {
      // FIX Bug2: playTrack langsung, tanpa pindah view
      el.addEventListener('click', () => playTrack(el.dataset.query));
    });

  } catch(e) {
    console.warn('[Trending] gagal:', e.message);
    if (trendSkeleton) trendSkeleton.style.display = 'none';
    // Tampilkan pesan error ringan di trending section
    if (trendingHeroes) {
      trendingHeroes.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:13px">Gagal memuat trending, coba refresh 🔄</div>`;
    }
  }
}

// ─── Escape HTML helper ────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Core: fetch stream URL dan set ke audio element ──────────────────────────
// FIX Autoplay Bug: TIDAK audio.src='' dulu, langsung replace saat URL siap
// Ini penting karena audio.src='' bikin browser reset autoplay permission state
async function loadStreamUrl() {
  const res  = await fetch(`${BACKEND}/get-stream-url/${currentToken}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data      = await res.json();
  const streamUrl = data.url || data.audio || data.stream_url || '';
  if (!streamUrl) throw new Error('Stream URL kosong');

  // Set src langsung (tanpa clear dulu) lalu load
  audio.src = streamUrl;
  audio.load();
  playBtn.disabled = false;

  if (shouldAutoPlay) {
    shouldAutoPlay = false;
    // Tunggu canplay biar browser siap, baru play — hindari NotAllowedError
    const tryPlay = () => {
      audio.play().catch(e => {
        if (e.name !== 'AbortError') console.warn('[AutoPlay]', e.message);
      });
      audio.removeEventListener('canplay', tryPlay);
    };
    // Kalau sudah bisa diplay langsung, langsung play
    if (audio.readyState >= 2) {
      audio.play().catch(e => {
        if (e.name !== 'AbortError') console.warn('[AutoPlay readyState]', e.message);
      });
    } else {
      audio.addEventListener('canplay', tryPlay, { once: true });
    }
  }
}

// ─── playTrack: main lagu TANPA pindah view ───────────────────────────────────
// Dipakai oleh: trending click, related click, next/shuffle
// Berbeda dari doSearch — tidak showView('search'), tidak stop audio duluan,
// hanya update now-playing bar sambil lagu sebelumnya masih jalan
let playTrackController = null;

async function playTrack(q, knownMeta = null) {
  q = q.trim();
  if (!q) return;

  // Abort fetch sebelumnya kalau ada (bukan audio, hanya HTTP request)
  if (playTrackController) playTrackController.abort();
  playTrackController = new AbortController();

  retryCount     = 0;
  shouldAutoPlay = true;
  preloadedQuery = null;
  preloadedUrl   = null;

  // Kalau ada meta yang sudah diketahui (dari trending cache), update UI dulu
  // sebelum fetch selesai biar UX lebih snappy
  if (knownMeta) {
    currentTitle  = knownMeta.title  || '';
    currentArtist = knownMeta.artist || '';
    currentThumb  = knownMeta.thumbnail || '';
    _updateNowPlayingBar();
  }

  // Tandai loading di now-playing bar
  nowPlayingBar.classList.add('show', 'loading');

  try {
    const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(q)}`, {
      signal: playTrackController.signal,
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Gagal fetch');

    currentToken  = data.stream_token;
    currentThumb  = data.thumbnail || '';
    currentTitle  = data.title;
    currentArtist = data.artist || '';
    currentQuery  = q;

    nowPlayingBar.classList.remove('loading');

    // Update now-playing bar + card search kalau lagi di view search
    _updateNowPlayingBar();
    updateCardUI(data);
    addHistory(q);
    setupMediaSession();
    initNoSleep();
    await requestWakeLock();

    // FIX Autoplay: loadStreamUrl tidak audio.src='' — langsung replace
    await loadStreamUrl();

    loadRelated(q, data.artist);

  } catch(err) {
    nowPlayingBar.classList.remove('loading');
    if (err.name === 'AbortError') return;
    console.error('[playTrack]', err);
    showToast('Gagal memutar lagu 😞');
  }
}

// Update hanya elemen now-playing bar (mini bar bawah)
function _updateNowPlayingBar() {
  if (currentThumb) {
    npThumb.src           = currentThumb;
    npThumb.style.display = '';
  } else {
    npThumb.src           = '';
    npThumb.style.display = 'none';
  }
  npTitle.textContent  = currentTitle;
  npArtist.textContent = currentArtist;
  nowPlayingBar.classList.add('show');
}

// ─── checkPreloadTrigger — preload lagu berikutnya saat 75% berjalan ──────────
async function checkPreloadTrigger() {
  if (!audio.duration || isNaN(audio.duration)) return;
  if (isPreloading || preloadedUrl) return;
  if (!relatedQueue.length) return;

  const pct = audio.currentTime / audio.duration;
  if (pct < 0.75) return;

  isPreloading = true;
  const nextItem = relatedQueue[0];

  try {
    const res  = await fetch(`${BACKEND}/search?q=${encodeURIComponent(nextItem.query)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.stream_token && !data.error) {
      const streamRes  = await fetch(`${BACKEND}/get-stream-url/${data.stream_token}`);
      const streamData = await streamRes.json();
      const url        = streamData.url || streamData.audio || '';

      if (url) {
        preloadAudio.src = url;
        preloadedQuery   = nextItem.query;
        preloadedUrl     = url;
        console.log('[Preload] ✓', nextItem.query);
      }
    }
  } catch(e) {
    console.warn('[Preload] gagal:', e.message);
  } finally {
    isPreloading = false;
  }
}

// ─── Auto-next / shuffle by related ───────────────────────────────────────────
async function loadRelated(query, artist) {
  try {
    const url  = `${BACKEND}/related?q=${encodeURIComponent(query)}&artist=${encodeURIComponent(artist || '')}`;
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
        ? `<img class="related-thumb" src="${s.thumbnail}" alt="" loading="lazy" onerror="this.style.background='var(--surface2)';this.removeAttribute('src')">`
        : `<div class="related-thumb" style="background:var(--surface2)"></div>`
      }
      <div class="related-info">
        <div class="related-title">${escapeHtml(s.title)}</div>
        <div class="related-artist">${escapeHtml(s.artist || '')}</div>
      </div>
    </div>
  `).join('');
  relatedList.querySelectorAll('.related-item').forEach(el => {
    el.addEventListener('click', () => playTrack(el.dataset.query));
  });
}

// FIX: nextRelated pakai playTrack (tidak stop audio, tidak pindah view)
function nextRelated(shuffle = false) {
  if (!relatedQueue.length) {
    showToast('Belum ada lagu terkait', 'info');
    return;
  }
  const idx  = shuffle ? Math.floor(Math.random() * relatedQueue.length) : 0;
  const next = relatedQueue.splice(idx, 1)[0];

  if (!shuffle && preloadedQuery && preloadedUrl && preloadedQuery === next.query) {
    // Langsung set preloaded URL, skip fetch
    audio.src = preloadedUrl;
    audio.load();
    shouldAutoPlay = true;
    const tryPlay = () => {
      audio.play().catch(() => {});
      audio.removeEventListener('canplay', tryPlay);
    };
    audio.readyState >= 2 ? audio.play().catch(() => {}) : audio.addEventListener('canplay', tryPlay, { once: true });
    preloadedQuery   = null;
    preloadedUrl     = null;
    preloadAudio.src = '';
    // Fetch meta di background untuk update UI
    playTrack(next.query);
  } else {
    playTrack(next.query, next); // kirim knownMeta biar UI update duluan
  }
}

// ─── Search (untuk search bar manual) ─────────────────────────────────────────
function updateCardUI(data) {
  thumbWrap.innerHTML = currentThumb
    ? `<img class="card-thumb" src="${currentThumb}" alt="${escapeHtml(currentTitle)}" onerror="this.style.display='none'">`
    : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/></svg></div>`;

  cardTitle.textContent  = currentTitle;
  cardArtist.textContent = currentArtist;
  cardMeta.textContent   = formatDuration(data.duration);

  // FIX: set npThumb hanya kalau ada thumbnail (hindari broken img)
  if (currentThumb) {
    npThumb.src   = currentThumb;
    npThumb.style.display = '';
  } else {
    npThumb.src   = '';
    npThumb.style.display = 'none';
  }

  npTitle.textContent  = currentTitle;
  npArtist.textContent = currentArtist;

  if (sourceBadge) {
    sourceBadge.textContent = data.source === 'youtube' ? '▶ YouTube' : '☁ SoundCloud';
    sourceBadge.className   = `source-badge ${data.source}`;
  }

  if (currentToken) {
    downloadBtn.href     = `${BACKEND}/download/${currentToken}`;
    downloadBtn.download = `${currentTitle}.mp3`;
  }
}

// doSearch: dipakai HANYA untuk search bar manual
// Perbedaan dari playTrack:
//   - showView('search') untuk tampilkan hasil
//   - update searchInput
//   - TIDAK stop audio yang sedang jalan (Bug4 fix)
async function doSearch(q) {
  q = (q || searchInput.value).trim();
  if (!q) return;
  searchInput.value = q;

  showView('search');

  // FIX Bug4: TIDAK audio.pause() / audio.src = '' di sini
  // Audio yang sedang jalan tetap jalan selama ngetik/search
  // Lagu baru akan play otomatis setelah stream URL siap via loadStreamUrl

  if (searchController) searchController.abort();
  searchController = new AbortController();

  skeletonEl.classList.remove('hidden');
  resultCard.classList.add('hidden');
  errorMsg.classList.add('hidden');
  relatedSection.classList.add('hidden');
  if (historySection) historySection.style.display = 'none';

  retryCount     = 0;
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
    initNoSleep();
    await requestWakeLock();

    // FIX Autoplay: loadStreamUrl handle play — audio lama otomatis tergantikan
    await loadStreamUrl();

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
  progressFill.style.width   = pct + '%';
  progressThumb.style.left   = pct + '%';
  npProgressFill.style.width = pct + '%';
  timeCurrent.textContent    = formatTime(audio.currentTime);
  timeDuration.textContent   = formatTime(audio.duration);
  npTimeCurrent.textContent  = formatTime(audio.currentTime);
  npTimeDuration.textContent = formatTime(audio.duration);
  checkPreloadTrigger(); // FIX: function sekarang ada, ga bakal error lagi
});

audio.addEventListener('ended', () => {
  setPlayIcons(false);
  if (isLooping) {
    audio.currentTime = 0; safePlay();
  } else if (relatedQueue.length) {
    nextRelated(false); // auto-next berurutan saat lagu habis
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
  isMuted     = !isMuted;
  audio.muted = isMuted;
  muteBtn.classList.toggle('active', isMuted);
});

function toggleLoop() {
  isLooping  = !isLooping;
  audio.loop = isLooping;
  loopBtn.classList.toggle('active', isLooping);
  npLoopBtn.classList.toggle('active', isLooping);
}
function toggleLoopNp() { toggleLoop(); }
loopBtn.addEventListener('click', toggleLoop);

playBtn.addEventListener('click', togglePlay);
npPlayBtn.addEventListener('click', togglePlay);

// FIX: Shuffle button → random pick; Now playing shuffle button juga random
shuffleBtn.addEventListener('click', () => nextRelated(true));
npShuffleBtn.addEventListener('click', () => nextRelated(true));

// ─── Search events ─────────────────────────────────────────────────────────────
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    doSearch();
  }
});

// FIX Bug4: input event TIDAK auto-trigger doSearch
// Cukup tampilkan view search (biar user lihat history/chip) tanpa stop lagu
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  showView('search'); // tampilkan halaman search saat ngetik
  const q = searchInput.value.trim();
  if (!q) {
    renderHistory();
    resultCard.classList.add('hidden');
    skeletonEl.classList.add('hidden');
    errorMsg.classList.add('hidden');
  }
  // Hapus debounce auto-search — lagu tidak stop saat ngetik
  // User harus tekan Enter atau klik chip history untuk trigger search
});

searchInput.addEventListener('focus', () => {
  showView('search');
  renderHistory();
});

// ─── MediaSession ──────────────────────────────────────────────────────────────
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:   currentTitle,
    artist:  currentArtist,
    artwork: currentThumb ? [{ src: currentThumb, sizes: '500x500', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play',      () => safePlay());
  navigator.mediaSession.setActionHandler('pause',     () => audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextRelated(false));
  navigator.mediaSession.setActionHandler('seekto', d => {
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

// ─── Init ──────────────────────────────────────────────────────────────────────
// Load trending saat halaman pertama kali dibuka
loadTrending();

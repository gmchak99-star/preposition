(function () {
  'use strict';
  var S = window.SITE;
  var byKey = {};
  S.pages.forEach(function (p) { byKey[p.key] = p; });
  var partById = {};
  S.parts.forEach(function (p) { partById[p.id] = p; });

  /* ---------- storage ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function em(s) { return esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>'); }
  var MODE_NAME = { ko: '한국어+영어', en: '영어만' };
  var REPEATS = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500];
  var SLEEPS = [0, 15, 30, 60, 90];
  function trainPanel(key) {
    var T = window.TRAIN && window.TRAIN[key]; if (!T) return '';
    var h = '<div class="corebox"><h3>🧠 1단계 · 원형(Core) — 이 그림만 머리에 남겨요</h3><ul class="tcore">';
    T.core.forEach(function (c) { h += '<li>' + esc(c) + '</li>'; });
    h += '</ul><p class="tg">한국어 뜻은 외우지 않아요. 이 이미지는 이해를 돕는 비유예요.</p></div>';
    h += '<details class="train"><summary>2·3단계 훈련 펼치기</summary><div class="tbody">';
    h += '<h3>2단계 · 한국어 해석 대신 장면을 떠올리기</h3>';
    T.drill.forEach(function (d) {
      h += '<div class="drill"><p class="den">' + esc(d.en) + '</p><p class="dno">❌ 한국어: “' + esc(d.no) + '” (X)</p><p class="dyes">⭕ 뇌 훈련: ' + esc(d.yes) + '</p></div>';
    });
    h += '<h3>3단계 · 반대말(대조군)로 감각 튕겨 보기</h3>';
    T.contrast.forEach(function (c) {
      h += '<div class="contrast"><p><span>' + esc(c.a) + '</span> <b>↔</b> <span>' + esc(c.b) + '</span></p><p class="cn">' + esc(c.note) + '</p></div>';
    });
    return h + '</div></details>';
  }
  function iconRow(word) {
    var ws = word.split(' · '), o = '';
    ws.forEach(function (w) { var s = window.ICONS && window.ICONS[w.trim()]; if (s) o += '<figure class="ico">' + s + '<figcaption>' + esc(w.trim()) + '</figcaption></figure>'; });
    return o ? '<div class="icons">' + o + '</div>' : '';
  }
  function pageTitle(p) { return p.label + ' ' + p.num + ' ' + p.word; }

  /* ---------- state ---------- */
  var st = {
    key: null, mode: null, units: [], u: 0, played: 0, wantPlay: false,
    speed: LS.get('ep_speed', 1),
    repeat: LS.get('ep_repeat2', 100),   // 0 = infinite, default 100
    loop: LS.get('ep_loop', false),
    auto: LS.get('ep_auto', true),
    compact: LS.get('ep_compact', null),
    sleepMin: 0, sleepEnd: 0,
    viewKey: null
  };
  if (st.compact === null) st.compact = window.innerWidth < 760;
  var audio = new Audio();
  audio.preload = 'auto';
  try { audio.preservesPitch = true; audio.webkitPreservesPitch = true; audio.mozPreservesPitch = true; } catch (e) {}
  var timer = null, pendingStart = null, sleepTimer = null;

  /* ---------- navigation ---------- */
  function renderToc() {
    var h = '<button id="tocClose" class="toc-close" type="button">✕ 목차 숨기기</button>';
    S.parts.forEach(function (part) {
      h += '<div class="tp">' + esc(part.title) + '</div>';
      S.pages.filter(function (p) { return p.part === part.id; }).forEach(function (p) {
        h += '<a href="#' + p.key + '" data-key="' + p.key + '"><b>' + p.num + '</b>' + esc(p.word) +
          (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') + '</a>';
      });
    });
    h += '<div class="offline"><div>비행기 모드나 데이터 없이 들으려면 음성을 저장해 두세요. (약 50MB)</div>' +
      '<button class="chip" id="offBtn" type="button">음성 전부 오프라인 저장</button> <span id="offMsg"></span></div>';
    $('toc').innerHTML = h;
  }
  function markToc() {
    var links = $('toc').querySelectorAll('a[data-key]');
    for (var i = 0; i < links.length; i++) {
      var k = links[i].getAttribute('data-key');
      links[i].classList.toggle('on', k === st.viewKey);
      var dot = links[i].querySelector('.dot');
      if (dot) dot.remove();
      if (k === st.key) { var d = document.createElement('span'); d.className = 'dot'; d.title = '재생 중인 페이지'; links[i].insertBefore(d, links[i].querySelector('small')); }
    }
  }

  function renderPage(key) {
    var p = byKey[key] || S.pages[0];
    st.viewKey = p.key;
    var part = partById[p.part];
    var last = LS.get('ep_last', null);
    var h = '';
    if (last && byKey[last.key] && !st.key) {
      var lp = byKey[last.key];
      h += '<div class="resume"><span>이어서 듣기 · <b>' + esc(pageTitle(lp)) + '</b> · ' + MODE_NAME[last.mode] + ' · ' + (last.u + 1) + '번째 문장부터</span>' +
        '<button class="chip" id="resumeBtn">이어서 재생</button></div>';
    }
    h += '<p class="partname">' + esc(part.title) + '</p>';
    h += '<header class="ph"><span class="no">' + esc(p.label) + ' ' + p.num + '</span><h1>' + esc(p.word) + '</h1></header>';
    if (p.sub) h += '<p class="subtitle">' + esc(p.sub) + '</p>';
    h += '<p class="disc">💡 “왜 이런 뜻?”은 이해를 돕기 위한 이미지 해석이에요. 단어의 뜻은 영영사전과 대조했지만, 그림 설명은 외우기 쉽게 만든 비유예요.</p>';
    h += '<div class="audiobar">' +
      '<button class="abtn" data-mode="ko" aria-label="한국어와 영어 음성 재생">▶ 한국어+영어 <small>한국어 → 영어</small></button>' +
      '<button class="abtn alt" data-mode="en" aria-label="영어만 음성 재생">▶ 영어만</button>' +
      '<button class="kotgl" id="koTgl" aria-pressed="false">한국번역</button></div>';
    h += iconRow(p.word);
    h += trainPanel(p.key);
    h += '<p class="core"><span class="tag">핵심 그림</span>' + em(p.core) + '</p>';
    p.groups.forEach(function (g, gi) {
      h += '<article class="grp"><h3><span class="gn">' + (gi + 1) + '</span>' + esc(g.title) + '</h3>';
      h += (g.gflag ? '<p class="gflag"><b class="star">*</b> ⚠ 확인 필요 · ' + esc(g.gflag) + '</p>' : '') + '<p class="why"><span class="tag">왜 이런 뜻?</span>' + em(g.why) + '</p>' + (g.ver ? '<p class="ver">✔ 검증 · ' + em(g.ver) + '</p>' : '') + '<ul class="ex">';
      g.rows.forEach(function (r) {
        h += '<li data-i="' + r.i + '"' + (r.flag ? ' class="flagged"' : '') + '><span class="en">' + esc(r.en) + (r.flag ? ' <b class="star">*</b>' : '') + '</span><span class="ko">' + esc(r.ko) + '</span>' + (r.flag ? '<span class="flag">⚠ 확인 필요 · ' + esc(r.flag) + '</span>' : '') + '</li>';
      });
      h += '</ul></article>';
    });
    if (p.note) h += '<p class="note">확인 메모 · ' + em(p.note) + '</p>';
    var idx = S.pages.indexOf(p);
    h += '<div class="pager">' +
      (idx > 0 ? '<a href="#' + S.pages[idx - 1].key + '">← ' + esc(pageTitle(S.pages[idx - 1])) + '</a>' : '<span></span>') +
      (idx < S.pages.length - 1 ? '<a href="#' + S.pages[idx + 1].key + '">' + esc(pageTitle(S.pages[idx + 1])) + ' →</a>' : '<span></span>') + '</div>';
    $('content').innerHTML = h;
    window.scrollTo(0, 0);
    markToc();
    setToc(false);
    LS.set('ep_view', p.key);
    setTimeout(applyKo, 0);
    highlight();
  }

  function route() {
    var k = (location.hash || '').replace('#', '');
    renderPage(byKey[k] ? k : (LS.get('ep_view', 'p01')));
  }

  /* ---------- units / positions ---------- */
  function buildUnits(key, mode) {
    var p = byKey[key], out = [];
    p.groups.forEach(function (g) {
      g.rows.forEach(function (r) {
        var t = mode === 'ko' ? r.ko_t : r.en_t;
        if (t) out.push({ i: r.i, s: t[0], e: t[1], en: r.en, ko: r.ko });
      });
    });
    return out;
  }
  function posMap() { return LS.get('ep_pos', {}); }
  function savePos() {
    if (!st.key) return;
    var m = posMap(); m[st.key + '|' + st.mode] = st.u; LS.set('ep_pos', m);
    LS.set('ep_last', { key: st.key, mode: st.mode, u: st.u });
  }

  /* ---------- playback core ---------- */
  function applyRate() {
    audio.defaultPlaybackRate = st.speed;
    audio.playbackRate = st.speed;
  }
  function seek(t) {
    if (audio.readyState >= 1) { try { audio.currentTime = t; } catch (e) {} }
    else { pendingStart = t; }
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!st.units.length || audio.paused) return;
    var un = st.units[st.u];
    var ms = Math.max(30, ((un.e - audio.currentTime) / st.speed) * 1000 + 15);
    timer = setTimeout(check, ms);
  }
  function check() {
    if (!st.units.length || audio.paused) return;
    var un = st.units[st.u];
    if (audio.currentTime >= un.e - 0.02) advance(); else schedule();
  }
  function goUnit(u) {
    st.u = u; st.played = 0;
    seek(st.units[u].s);
    updateUI();
    savePos();
    if (audio.paused && st.wantPlay) play();
  }
  function pageIndex() { return S.pages.indexOf(byKey[st.key]); }
  function goNextPage(fromAuto) {
    var idx = pageIndex();
    var nxt = S.pages[idx + 1];
    if (!nxt) { return false; }
    var follow = (st.viewKey === st.key);
    var mode = st.mode, was = st.wantPlay || fromAuto;
    load(nxt.key, mode, 0, was);
    if (follow) { if (location.hash !== '#' + nxt.key) location.hash = '#' + nxt.key; }
    toast('다음 페이지로 넘어갔어요 · ' + pageTitle(nxt));
    return true;
  }
  function advance() {
    var target = st.repeat === 0 ? Infinity : st.repeat;
    st.played++;
    if (st.played < target) { seek(st.units[st.u].s); updateUI(); return; }
    st.played = 0;
    if (st.u + 1 < st.units.length) { st.u++; seek(st.units[st.u].s); updateUI(); savePos(); return; }
    if (st.loop) { st.u = 0; seek(st.units[0].s); updateUI(); savePos(); return; }
    if (st.auto && goNextPage(true)) return;
    st.wantPlay = false; audio.pause(); st.u = 0; savePos(); seek(st.units[0].s); updateUI();
    toast('끝까지 들었어요. 다음에는 처음부터 시작해요.');
  }
  function play() {
    st.wantPlay = true;
    applyRate();
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () { updateUI(); });
  }
  function pause() { st.wantPlay = false; audio.pause(); savePos(); updateUI(); }
  function toggle() { if (!st.key) return; if (audio.paused) play(); else pause(); }
  function prev() { if (!st.key) return; goUnit(Math.max(0, st.u - 1)); }
  function next() {
    if (!st.key) return;
    if (st.u + 1 < st.units.length) { goUnit(st.u + 1); return; }
    if (st.auto) { if (!goNextPage(false)) toast('마지막 페이지예요.'); }
    else toast('이 페이지의 마지막 문장이에요.');
  }

  function load(key, mode, startU, autoplay) {
    var same = (st.key === key && st.mode === mode && audio.getAttribute('src'));
    st.key = key; st.mode = mode;
    st.units = buildUnits(key, mode);
    if (!st.units.length) { toast('이 페이지에는 재생할 음성이 없어요.'); return; }
    st.u = Math.min(Math.max(0, startU || 0), st.units.length - 1);
    st.played = 0; st.wantPlay = !!autoplay;
    $('player').hidden = false;
    applyCompact();
    if (!same) {
      audio.src = 'audio/' + key + '_' + mode + '.mp3';
      pendingStart = st.units[st.u].s;
      audio.load();
    } else {
      seek(st.units[st.u].s);
    }
    applyRate();
    if (autoplay) play();
    updateUI(); savePos(); markToc();
    setMediaSession();
  }

  audio.addEventListener('loadedmetadata', function () {
    applyRate();
    if (pendingStart !== null) { try { audio.currentTime = pendingStart; } catch (e) {} pendingStart = null; }
  });
  audio.addEventListener('timeupdate', function () {
    if (st.sleepEnd && Date.now() >= st.sleepEnd) { sleepDone(); return; }
    if (!st.units.length) return;
    var un = st.units[st.u];
    if (un && audio.currentTime >= un.e - 0.02) advance();
  });
  audio.addEventListener('play', function () { updateUI(); schedule(); setPlaybackState(); });
  audio.addEventListener('pause', function () { updateUI(); setPlaybackState(); });
  audio.addEventListener('ended', function () { if (st.key && st.wantPlay) advance(); });
  audio.addEventListener('ratechange', function () { schedule(); });
  audio.addEventListener('error', function () { if (!st.key) return; toast('음성 파일을 불러오지 못했어요.'); });

  /* ---------- sleep timer ---------- */
  function sleepLabel() {
    if (!st.sleepEnd) return '⏲ 타이머 끔';
    var left = Math.max(0, Math.ceil((st.sleepEnd - Date.now()) / 60000));
    return '⏲ ' + left + '분 뒤 끔';
  }
  function setSleep(min) {
    st.sleepMin = min;
    clearTimeout(sleepTimer);
    if (!min) { st.sleepEnd = 0; }
    else {
      st.sleepEnd = Date.now() + min * 60000;
      sleepTimer = setTimeout(sleepDone, min * 60000 + 50);
    }
    $('bSleep').textContent = sleepLabel();
  }
  function sleepDone() {
    if (!st.sleepEnd) return;
    setSleep(0);
    pause();
    toast('타이머가 끝나서 멈췄어요.');
  }
  setInterval(function () { if (st.sleepEnd) { if (Date.now() >= st.sleepEnd) sleepDone(); else $('bSleep').textContent = sleepLabel(); } }, 15000);

  /* ---------- UI ---------- */
  function highlight(scroll) {
    var lis = $('content').querySelectorAll('.ex li');
    for (var i = 0; i < lis.length; i++) lis[i].classList.remove('playing');
    if (!st.key || st.viewKey !== st.key || !st.units.length) return;
    var un = st.units[st.u];
    var li = $('content').querySelector('.ex li[data-i="' + un.i + '"]');
    if (li) {
      li.classList.add('playing');
      if (scroll && $('fs').hidden) li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function repLabel() { return st.repeat === 0 ? '∞' : st.repeat; }
  function updateUI() {
    updateSettingsUI();
    if (!st.key) return;
    var p = byKey[st.key], un = st.units[st.u];
    var playing = !audio.paused;
    $('pTitle').textContent = pageTitle(p) + ' · ' + MODE_NAME[st.mode];
    $('pTitle').setAttribute('href', '#' + p.key);
    $('pCount').textContent = (st.u + 1) + ' / ' + st.units.length + ' · 반복 ' + (st.played + 1) + '/' + repLabel();
    $('pText').textContent = un.en;
    $('bPlay').textContent = playing ? '⏸' : '▶';
    $('bPlay').setAttribute('aria-label', playing ? '일시정지' : '재생');
    $('fPlay').textContent = playing ? '⏸' : '▶';
    $('fsEn').textContent = un.en;
    $('fsKo').textContent = un.ko;
    $('fsMeta').textContent = pageTitle(p) + ' · ' + MODE_NAME[st.mode] + ' · ' + (st.u + 1) + '/' + st.units.length + ' · 반복 ' + (st.played + 1) + '/' + repLabel();
    highlight(playing);
    setMediaSession();
  }
  function updateSettingsUI() {
    $('rVal').textContent = st.repeat === 0 ? '∞' : st.repeat + '회';
    $('rInf').setAttribute('aria-pressed', st.repeat === 0 ? 'true' : 'false');
    $('bLoop').setAttribute('aria-pressed', st.loop ? 'true' : 'false');
    $('bAuto').setAttribute('aria-pressed', st.auto ? 'true' : 'false');
    $('bSleep').textContent = sleepLabel();
    var sp = document.querySelectorAll('.speed');
    for (var i = 0; i < sp.length; i++) sp[i].setAttribute('aria-pressed', parseFloat(sp[i].getAttribute('data-rate')) === st.speed ? 'true' : 'false');
  }
  function applyCompact() {
    $('player').classList.toggle('compact', !!st.compact);
    $('bMore').textContent = st.compact ? '설정 ▴' : '설정 ▾';
    $('bMore').setAttribute('aria-expanded', st.compact ? 'false' : 'true');
  }

  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    var t = $('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button id="toastAct">' + esc(actionLabel) + '</button>' : '');
    t.hidden = false;
    if (actionLabel) $('toastAct').onclick = function () { t.hidden = true; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
  }

  /* ---------- media session (lock screen / background) ---------- */
  function setMediaSession() {
    if (!('mediaSession' in navigator) || !st.key || !window.MediaMetadata) return;
    var p = byKey[st.key], un = st.units[st.u];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: un ? un.en : p.word,
        artist: pageTitle(p) + ' · ' + MODE_NAME[st.mode],
        album: '영어 그림 풀이',
        artwork: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }]
      });
    } catch (e) {}
  }
  function setPlaybackState() {
    if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'; } catch (e) {} }
  }
  if ('mediaSession' in navigator) {
    var acts = {
      play: function () { play(); }, pause: function () { pause(); },
      previoustrack: function () { prev(); }, nexttrack: function () { next(); },
      seekbackward: function () { prev(); }, seekforward: function () { next(); }
    };
    Object.keys(acts).forEach(function (a) { try { navigator.mediaSession.setActionHandler(a, acts[a]); } catch (e) {} });
  }

  /* ---------- fullscreen reading mode ---------- */
  var wakeLock = null;
  function openFs() {
    if (!st.key) return;
    var el = $('fs');
    el.hidden = false;
    try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) {}
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {}); } catch (e) {}
    updateUI();
  }
  function closeFs() {
    var el = $('fs');
    if (el.hidden) return;
    el.hidden = true;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
    highlight(true);
  }
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && !$('fs').hidden) closeFs(); });
  document.addEventListener('webkitfullscreenchange', function () { if (!document.webkitFullscreenElement && !$('fs').hidden) closeFs(); });
  $('fs').addEventListener('dblclick', function (e) { if (!e.target.closest('button')) closeFs(); });
  var lastTap = 0;
  $('fs').addEventListener('touchend', function (e) {
    if (e.target.closest('button')) return;
    var now = Date.now();
    if (now - lastTap < 350) { closeFs(); e.preventDefault(); lastTap = 0; } else { lastTap = now; }
  }, { passive: false });

  /* ---------- table of contents drawer ---------- */
  function setToc(open) {
    $('toc').hidden = !open; $('tocBack').hidden = !open;
    $('tocBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var on = $('toc').querySelector('a.on'); if (on) on.scrollIntoView({ block: 'center' }); }
  }

  /* ---------- offline save ---------- */
  function saveOffline() {
    var msg = $('offMsg');
    if (!window.caches || !/^https?:$/.test(location.protocol)) { msg.textContent = '이 주소에서는 저장할 수 없어요. (https로 열어야 해요)'; return; }
    var urls = [];
    S.pages.forEach(function (p) { ['ko', 'en'].forEach(function (m) { urls.push('audio/' + p.key + '_' + m + '.mp3'); }); });
    var done = 0, failed = 0;
    $('offBtn').disabled = true;
    caches.open('ep-audio-v1').then(function (cache) {
      var i = 0;
      function step() {
        if (i >= urls.length) {
          msg.textContent = failed ? ('저장 완료 (' + failed + '개 실패, 다시 눌러 보세요)') : '모두 저장했어요. 이제 오프라인에서도 들을 수 있어요.';
          $('offBtn').disabled = false; return;
        }
        var u = urls[i++];
        cache.match(u).then(function (hit) {
          if (hit) return;
          return fetch(u).then(function (r) { if (!r.ok) throw new Error('x'); return cache.put(u, r); });
        }).catch(function () { failed++; }).then(function () { done++; msg.textContent = done + ' / ' + urls.length + ' 저장 중…'; step(); });
      }
      step();
    }).catch(function () { msg.textContent = '저장할 수 없었어요.'; $('offBtn').disabled = false; });
  }

  /* ---------- events ---------- */
  function startPage(key, mode, fromU) {
    var saved = posMap()[key + '|' + mode];
    var n = buildUnits(key, mode).length;
    var u = 0, resumed = false;
    if (typeof fromU === 'number') u = fromU;
    else if (typeof saved === 'number' && saved > 0 && saved < n) { u = saved; resumed = true; }
    load(key, mode, u, true);
    if (resumed) toast('멈춘 곳(' + (u + 1) + '번째 문장)부터 이어서 재생해요.', '처음부터', function () { goUnit(0); });
  }

  function applyKo() {
    var show = LS.get('ep_showko', '0') === '1';
    document.documentElement.classList.toggle('hideko', !show);
    var t = document.getElementById('koTgl');
    if (t) { t.setAttribute('aria-pressed', show ? 'true' : 'false'); t.textContent = show ? '한국번역 숨기기' : '한국번역'; t.classList.toggle('on', show); }
  }
  applyKo();
  $('content').addEventListener('click', function (e) {
    if (e.target.id === 'koTgl') { LS.set('ep_showko', LS.get('ep_showko', '0') === '1' ? '0' : '1'); applyKo(); return; }
    var b = e.target.closest('.abtn');
    if (b && st.viewKey) {
      var mode = b.getAttribute('data-mode');
      LS.set('ep_mode', mode);
      if (st.key === st.viewKey && st.mode === mode) { toggle(); return; }
      startPage(st.viewKey, mode); return;
    }
    if (e.target.id === 'resumeBtn') {
      var last = LS.get('ep_last', null);
      if (last) { location.hash = '#' + last.key; setTimeout(function () { load(last.key, last.mode, last.u, true); }, 30); }
      return;
    }
    var li = e.target.closest('.ex li');
    if (li && st.viewKey) {
      var i = parseInt(li.getAttribute('data-i'), 10);
      var mode2 = (st.key === st.viewKey) ? st.mode : (LS.get('ep_mode', 'ko'));
      var units = buildUnits(st.viewKey, mode2);
      var u = -1;
      for (var k = 0; k < units.length; k++) if (units[k].i === i) { u = k; break; }
      if (u < 0) { toast('이 문장은 음성이 없어요.'); return; }
      if (st.key === st.viewKey && st.mode === mode2) { st.wantPlay = true; goUnit(u); play(); }
      else startPage(st.viewKey, mode2, u);
    }
  });
  $('toc').addEventListener('click', function (e) {
    if (e.target.closest('#tocClose')) setToc(false);
    else if (e.target.closest('#offBtn')) saveOffline();
  });

  $('bPlay').onclick = toggle; $('fPlay').onclick = toggle;
  $('bPrev').onclick = prev; $('fPrev').onclick = prev;
  $('bNext').onclick = next; $('fNext').onclick = next;
  $('bRestart').onclick = function () { if (st.key) { st.wantPlay = true; goUnit(0); play(); } };
  $('bFull').onclick = openFs;
  $('bMore').onclick = function () { st.compact = !st.compact; LS.set('ep_compact', st.compact); applyCompact(); };
  $('bClose').onclick = function () {
    pause(); closeFs(); $('player').hidden = true; st.key = null; st.units = [];
    audio.removeAttribute('src'); audio.load(); markToc(); highlight();
  };
  function stepRepeat(dir) {
    var cur = st.repeat === 0 ? REPEATS[REPEATS.length - 1] : st.repeat, i;
    if (dir < 0) { for (i = REPEATS.length - 1; i >= 0; i--) if (REPEATS[i] < cur) { cur = REPEATS[i]; break; } if (i < 0) cur = REPEATS[0]; }
    else { for (i = 0; i < REPEATS.length; i++) if (REPEATS[i] > cur) { cur = REPEATS[i]; break; } if (i >= REPEATS.length) cur = REPEATS[REPEATS.length - 1]; }
    st.repeat = cur; LS.set('ep_repeat2', st.repeat); st.played = 0; updateUI();
  }
  $('rMinus').onclick = function () { stepRepeat(-1); };
  $('rPlus').onclick = function () { stepRepeat(1); };
  $('rInf').onclick = function () { st.repeat = st.repeat === 0 ? 100 : 0; LS.set('ep_repeat2', st.repeat); st.played = 0; updateUI(); };
  $('bLoop').onclick = function () { st.loop = !st.loop; LS.set('ep_loop', st.loop); updateUI(); };
  $('bAuto').onclick = function () { st.auto = !st.auto; LS.set('ep_auto', st.auto); updateUI(); };
  $('bSleep').onclick = function () {
    var i = SLEEPS.indexOf(st.sleepMin); setSleep(SLEEPS[(i + 1) % SLEEPS.length]);
    toast(st.sleepMin ? ('타이머 ' + st.sleepMin + '분: 그때 멈춰요.') : '타이머를 껐어요.');
  };
  var sp = document.querySelectorAll('.speed');
  for (var i = 0; i < sp.length; i++) sp[i].onclick = function () {
    st.speed = parseFloat(this.getAttribute('data-rate')); LS.set('ep_speed', st.speed); applyRate(); schedule(); updateUI();
  };
  $('tocBtn').onclick = function () { setToc($('toc').hidden); };
  $('tocBack').onclick = function () { setToc(false); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeFs(); setToc(false); return; }
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (!st.key) return;
    if (e.key === ' ' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', savePos);
  document.addEventListener('visibilitychange', function () { if (document.hidden) savePos(); });
  window.addEventListener('beforeunload', savePos);

  /* ---------- init ---------- */
  renderToc();
  route();
  applyRate();
  applyCompact();
  updateSettingsUI();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }
})();

/* 기합 — 공통 기능: 저장 · 테마 · 소리 · 알림 · 화면 켜짐 · 전체화면 */
(function () {
  const K = {};
  // 사이트 뿌리 경로 (/shared/core.js 의 한 칸 위) — 하위 폴더에 올려도 동작
  K.root = new URL('..', document.currentScript.src).pathname;

  /* ---------- 저장 (localStorage, 실패해도 앱은 돌아가게) ---------- */
  K.get = (key, fallback) => {
    try { const v = localStorage.getItem('kihap:' + key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  };
  K.set = (key, value) => {
    try { localStorage.setItem('kihap:' + key, JSON.stringify(value)); } catch (e) {}
  };

  /* ---------- 테마 ---------- */
  K.applyTheme = () => {
    const t = K.get('theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };
  K.isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  K.toggleTheme = () => { K.set('theme', K.isDark() ? 'light' : 'dark'); K.applyTheme(); };
  K.applyTheme();

  /* ---------- 소리 (WebAudio 로 직접 만들어서 파일이 필요 없음) ---------- */
  let ctx = null;
  K.muted = () => K.get('mute', false);
  K.setMuted = m => K.set('mute', !!m);
  function ac() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // 첫 터치에서 오디오를 깨워 둠 (아이폰 정책)
  addEventListener('pointerdown', () => ac(), { once: true });

  function tone(freq, dur, opt = {}) {
    if (K.muted()) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + (opt.delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);
    const vol = opt.vol == null ? .35 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + .01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + .05);
  }
  function noise(dur, opt = {}) {
    if (K.muted()) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + (opt.delay || 0);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.cut || 900;
    const g = a.createGain(); g.gain.value = opt.vol || .9;
    s.connect(f).connect(g).connect(a.destination);
    s.start(t0);
  }
  K.sound = {
    beep: () => tone(880, .12, { type: 'square', vol: .2 }),
    go: () => tone(1320, .35, { type: 'square', vol: .25 }),
    tick: () => tone(1800, .03, { type: 'square', vol: .12 }),
    tock: () => tone(1200, .03, { type: 'square', vol: .1 }),
    whistle() {           // 호루라기: 높은 소리 + 떨림
      if (K.muted()) return; const a = ac(); if (!a) return;
      const t0 = a.currentTime, o = a.createOscillator(), g = a.createGain(), l = a.createOscillator(), lg = a.createGain();
      o.type = 'sine'; o.frequency.value = 2900; l.frequency.value = 28; lg.gain.value = 140;
      l.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(.3, t0 + .02);
      g.gain.setValueAtTime(.3, t0 + .55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + .7);
      o.connect(g).connect(a.destination); o.start(t0); l.start(t0); o.stop(t0 + .75); l.stop(t0 + .75);
    },
    end() {               // 끝: 세 번 울림
      [0, .25, .5].forEach(d => tone(988, .22, { type: 'square', vol: .25, delay: d }));
      tone(1319, .6, { type: 'square', vol: .25, delay: .75 });
    },
    boom() { noise(1.4, { cut: 700, vol: 1 }); tone(90, .9, { type: 'sine', to: 30, vol: .6 }); },
    pop: () => tone(600, .08, { type: 'triangle', to: 1200, vol: .25 }),
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? .7 : .16, { type: 'square', vol: .2, delay: i * .14 })); },
    roll() { for (let i = 0; i < 8; i++) tone(300 + Math.random() * 500, .04, { type: 'triangle', vol: .15, delay: i * .06 }); }
  };

  /* ---------- 음성 안내 ---------- */
  K.say = text => {
    if (K.muted() || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
  };

  /* ---------- 알림 문구 ---------- */
  K.toast = (msg, ms = 1800) => {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
  };

  /* ---------- 수업 중 화면 꺼짐 막기 ---------- */
  let lock = null;
  K.keepAwake = async on => {
    try {
      if (on && 'wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch (e) {}
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && K._wantAwake) K.keepAwake(true); });

  K.fullscreen = el => {
    el = el || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  /* ---------- 기타 ---------- */
  K.rand = (a, b) => a + Math.random() * (b - a);
  K.randInt = (a, b) => Math.floor(K.rand(a, b + 1));
  K.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  K.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.fmt = ms => {               // 밀리초 → m:ss
    const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  };
  K.markLast = (id, label) => K.set('last', { id, label, at: Date.now() });

  // 로고: 도복 띠 매듭 모양 (기합 고유 마크)
  K.logo = `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="16" fill="#16213a"/>
    <rect x="8" y="27" width="48" height="10" rx="3" fill="#d8323c"/>
    <path d="M27 37 L20 54 L27 52 L31 38 Z M37 37 L44 54 L37 52 L33 38 Z" fill="#d8323c"/>
    <rect x="25" y="24" width="14" height="16" rx="4" fill="#ff5d66"/>
    <circle cx="32" cy="13" r="4" fill="#f4f1ea"/>
  </svg>`;

  /* ---------- 공통 윗줄 (← 홈 · 제목 · 소리 · 테마 · 추가 버튼) ---------- */
  K.topbar = (title, extraHTML = '') => {
    const h = document.createElement('header');
    h.className = 'topbar';
    h.innerHTML = `<a class="btn icon" href="${K.root}" aria-label="홈으로">←</a>
      <h1 class="grow tb-title">${title}</h1>${extraHTML}
      <button class="btn icon" data-k="mute" aria-label="소리 끄기/켜기"></button>
      <button class="btn icon" data-k="theme" aria-label="밝게/어둡게"></button>`;
    document.body.prepend(h);
    const m = h.querySelector('[data-k=mute]'), t = h.querySelector('[data-k=theme]');
    const sync = () => { m.textContent = K.muted() ? '🔇' : '🔊'; t.textContent = K.isDark() ? '☀️' : '🌙'; };
    m.onclick = () => { K.setMuted(!K.muted()); sync(); K.toast(K.muted() ? '소리 꺼짐' : '소리 켜짐'); };
    t.onclick = () => { K.toggleTheme(); sync(); };
    sync();
    return h;
  };

  /* ---------- 확인 창 · 모달 ---------- */
  K.modal = (html, onMount) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal card" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { back.remove(); removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    addEventListener('keydown', esc);
    document.body.appendChild(back);
    const first = back.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
    if (onMount) onMount(back.querySelector('.modal'), close);
    return close;
  };
  K.confirm = (msg, okLabel = '확인') => new Promise(res => {
    K.modal(`<p style="margin:0;font-weight:700;font-size:1.05rem">${msg}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" data-ok>${okLabel}</button></div>`,
      (m, close) => { m.querySelector('[data-ok]').onclick = () => { close(); res(true); }; m.closest('.modal-back').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.classList.contains('modal-back')) res(false); }); });
  });

  /* ---------- 오프라인 저장 ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register(K.root + 'sw.js').catch(() => {}));
  }

  window.Kihap = K;
})();

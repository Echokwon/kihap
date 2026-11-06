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

  /* 소리 엔진: 전자음(삐삐) 대신 실제 도구 소리를 흉내 냄
   * 우드블록 · 심판 호루라기 · 복싱 종 · 마림바 · 주사위 · 폭발.
   * 모든 소리는 작은 방 울림(리버브)과 압축기를 거쳐 스피커로 나가요. */
  let bus = null;
  function out() {
    const a = ac(); if (!a) return null;
    if (bus) return bus;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
    const master = a.createGain(); master.gain.value = .9;
    // 짧은 방 울림 (소리가 '뚝' 끊기지 않고 공간에서 울리는 느낌)
    const len = Math.floor(a.sampleRate * .9), ir = a.createBuffer(2, len, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const verb = a.createConvolver(); verb.buffer = ir;
    const wet = a.createGain(); wet.gain.value = .18;
    const dry = a.createGain();
    dry.connect(master); dry.connect(verb); verb.connect(wet).connect(master);
    master.connect(comp).connect(a.destination);
    bus = dry; return bus;
  }
  const now = (d = 0) => ac().currentTime + d;
  function env(g, t0, peak, attack, decay, hold = 0) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    if (hold) g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay);
  }
  function osc(type, freq, t0, stop, dest) { const a = ac(), o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(dest); o.start(t0); o.stop(stop); return o; }
  let noiseBuf = null;
  function noiseSrc(t0, dur, dest) {
    const a = ac();
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start(t0, Math.random()); s.stop(t0 + dur); return s;
  }
  const play = fn => (...args) => { if (K.muted()) return; const b = out(); if (b) try { fn(b, ...args); } catch (e) { console.warn('[기합 소리]', e); } };

  // 우드블록: 딱! (나무 두드리는 소리)
  const wood = (b, freq, vol, d = 0) => {
    const a = ac(), t = now(d);
    const g = a.createGain(); env(g, t, vol, .002, .09); g.connect(b);
    const o = osc('sine', freq, t, t + .12, g); o.frequency.exponentialRampToValueAtTime(freq * .82, t + .08);
    const g2 = a.createGain(); env(g2, t, vol * .5, .001, .025); g2.connect(b);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2.4; bp.Q.value = 6; bp.connect(g2);
    noiseSrc(t, .04, bp);
  };
  // 마림바 한 음 (기본음 + 4배 배음이 빨리 사라짐)
  const mallet = (b, freq, vol, d = 0, len = .9) => {
    const a = ac(), t = now(d);
    const g = a.createGain(); env(g, t, vol, .003, len); g.connect(b);
    osc('sine', freq, t, t + len + .1, g);
    const g2 = a.createGain(); env(g2, t, vol * .35, .002, .12); g2.connect(b);
    osc('sine', freq * 3.93, t, t + .2, g2);
    const g3 = a.createGain(); env(g3, t, vol * .12, .002, .3); g3.connect(b);
    osc('triangle', freq * 2, t, t + .4, g3);
  };
  // 금속 종 (불규칙 배음으로 진짜 종처럼)
  const bell = (b, freq, vol, d = 0) => {
    const a = ac(), t = now(d);
    [[1, 1, 2.2], [2.76, .5, 1.1], [5.4, .28, .6], [8.93, .15, .35], [1.5, .2, .9]].forEach(([r, v, len]) => {
      const g = a.createGain(); env(g, t, vol * v, .002, len); g.connect(b); osc('sine', freq * r, t, t + len + .1, g);
    });
    const g = a.createGain(); env(g, t, vol * .4, .001, .03); g.connect(b);
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; hp.connect(g); noiseSrc(t, .04, hp);
  };
  // 전자 타이머 '삑' (각진 전자음 대신 둥근 소리)
  const chirp = (b, freq, vol, dur, d = 0) => {
    const a = ac(), t = now(d);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 3; lp.connect(b);
    const g = a.createGain(); env(g, t, vol, .006, .05, dur); g.connect(lp);
    osc('triangle', freq, t, t + dur + .1, g);
    const g2 = a.createGain(); env(g2, t, vol * .25, .006, .05, dur); g2.connect(lp);
    osc('sine', freq * 2, t, t + dur + .1, g2);
  };

  K.sound = {
    beep: play(b => chirp(b, 1046, .32, .09)),                         // 카운트다운 3·2·1
    go: play(b => chirp(b, 1568, .36, .42)),                           // 출발
    tick: play(b => wood(b, 1250, .5)),                                // 째깍
    tock: play(b => wood(b, 880, .45)),                                // 짹
    pop: play(b => mallet(b, 784, .32, 0, .35)),                       // 버튼 확인음
    whistle: play((b, long = .55) => {                                 // 심판 호루라기 (구슬이 떨리는 소리)
      const a = ac(), t = now();
      const g = a.createGain(); env(g, t, .22, .03, .12, long); g.connect(b);
      const am = a.createGain(); am.gain.value = .55; am.connect(g);
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.type = 'square'; lfo.frequency.value = 38; lg.gain.value = .45;
      lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + long + .3);
      const o1 = osc('sine', 2650, t, t + long + .3, am); o1.frequency.linearRampToValueAtTime(2900, t + .06);
      const o2 = osc('sine', 2690, t, t + long + .3, am); o2.frequency.linearRampToValueAtTime(2940, t + .06);
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2900; bp.Q.value = 5;
      const ng = a.createGain(); env(ng, t, .12, .03, .12, long); bp.connect(ng).connect(b); noiseSrc(t, long + .3, bp);
    }),
    end: play(b => { [0, .32, .64].forEach(d => bell(b, 690, .32, d)); }), // 복싱 종 땡땡땡
    boom: play(b => {                                                  // 폭발
      const a = ac(), t = now();
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(140, t + 1.4);
      const g = a.createGain(); env(g, t, 1, .004, 1.5); lp.connect(g).connect(b); noiseSrc(t, 1.6, lp);
      const g2 = a.createGain(); env(g2, t, .9, .004, .7); g2.connect(b);
      const o = osc('sine', 110, t, t + .9, g2); o.frequency.exponentialRampToValueAtTime(32, t + .6);
    }),
    fanfare: play(b => {                                               // 성공: 마림바 아르페지오
      [[523.3, 0], [659.3, .09], [784, .18], [1046.5, .27], [1318.5, .36]].forEach(([f, d], i) => mallet(b, f, i === 4 ? .3 : .26, d, i === 4 ? 1.2 : .6));
    }),
    roll: play(b => {                                                  // 주사위 굴러가는 소리
      let d = 0; for (let i = 0; i < 9; i++) { d += .035 + i * .012 + Math.random() * .03; wood(b, 1600 + Math.random() * 1400, .16 + Math.random() * .1, d); }
    })
  };

  /* ---------- 음성 안내 (기본은 꺼짐 · 설정한 화면에서만 켜짐) ---------- */
  K.say = (text, force) => {
    if (!force && !K.get('voice', false)) return;
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
  K.fmt = ms => {               // 밀리초를 m:ss 로
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

  /* ---------- 공통 윗줄 (홈 · 제목 · 소리 · 테마 · 추가 버튼) ---------- */
  K.topbar = (title, extraHTML = '', iconName = '') => {
    const I = n => K.icon ? K.icon(n) : '';
    const h = document.createElement('header');
    h.className = 'topbar';
    h.innerHTML = `<a class="btn icon" href="${K.root}" aria-label="홈으로">${I('arrow-left')}</a>
      <h1 class="grow tb-title">${iconName ? `<span class="tb-ic">${I(iconName)}</span>` : ''}${title}</h1>${extraHTML}
      <button class="btn icon" data-k="mute" aria-label="소리 끄기/켜기"></button>
      <button class="btn icon" data-k="theme" aria-label="밝게/어둡게"></button>`;
    document.body.prepend(h);
    const m = h.querySelector('[data-k=mute]'), t = h.querySelector('[data-k=theme]');
    const sync = () => { m.innerHTML = I(K.muted() ? 'volume-x' : 'volume-2'); t.innerHTML = I(K.isDark() ? 'sun' : 'moon'); };
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

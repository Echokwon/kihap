/* 기합 — 출석 체크: 번호 · 명단 · QR · 얼굴 · 오늘 현황 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  const CDN = {
    human: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.esm.js',
    humanModels: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/',
    jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    qrgen: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
  };
  K.topbar('📋 출석 체크', `<button class="btn icon" id="fsBtn" aria-label="전체 화면">⛶</button>`);
  $('fsBtn').onclick = () => K.fullscreen();
  K.markLast('attend', '출석 체크');

  const loadScript = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('불러오기 실패')); document.head.appendChild(s); });

  /* ---------- 공통: 출석 처리 ---------- */
  const recent = [];
  function attend(s, how) {
    const fresh = D.checkIn(s.id);
    if (fresh) { recent.unshift({ s, how, t: D.hm() }); K.sound.fanfare(); if (K.get('att:voice', true)) K.say(s.name + ', 반가워요!'); }
    else K.sound.beep();
    renderRecent();
    return fresh;
  }
  function renderRecent() {
    const today = D.attendedOn();
    const list = recent.length ? recent.slice(0, 12) : Object.entries(today).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 12).map(([id, t]) => ({ s: D.student(id), t })).filter(x => x.s);
    $('recent').innerHTML = list.length ? list.map(r => `<div class="it"><b>${esc(r.s.name)}</b>${D.beltChip(r.s.belt)}<span class="muted">${r.t}</span></div>`).join('')
      : '<p class="muted" style="margin:0">아직 없어요</p>';
  }

  /* ---------- 탭 ---------- */
  let tab = 'pin';
  const ENTER = {}, LEAVE = {};
  function show(t) {
    if (LEAVE[tab]) LEAVE[tab]();
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    document.querySelectorAll('.tabp').forEach(p => p.hidden = p.id !== 't-' + t);
    if (ENTER[t]) ENTER[t]();
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });
  D.onChange(() => { if (tab === 'list') ENTER.list(); if (tab === 'today') ENTER.today(); renderRecent(); });

  /* ================= 🔢 번호 입력 (입구 태블릿용) ================= */
  (function () {
    let pin = '', clearT = null;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
    $('keypad').innerHTML = keys.map(k => `<button data-k="${k}" class="${/\d/.test(k) ? '' : 'fn'}" aria-label="${k === 'C' ? '모두 지우기' : k === '⌫' ? '한 칸 지우기' : k}">${k === 'C' ? '지우기' : k}</button>`).join('');
    const dots = () => $('dots').querySelectorAll('i').forEach((d, i) => { d.textContent = pin[i] ? '●' : ''; d.classList.toggle('f', !!pin[i]); });
    function greet(cls, text) {
      const g = $('greet'); g.className = 'greet ' + cls; g.innerHTML = text;
      clearTimeout(clearT); clearT = setTimeout(() => { g.className = 'greet'; g.textContent = ''; }, 3500);
    }
    function submit() {
      const s = D.students().find(x => x.pin === pin);
      if (!s) { greet('bad', '없는 번호예요. 다시 눌러 주세요'); K.sound.beep(); $('dots').classList.remove('shake'); void $('dots').offsetWidth; $('dots').classList.add('shake'); }
      else if (attend(s, '번호')) greet('ok', `${esc(s.name)} 출석! 👏<br><small style="font-size:.5em">이번 달 ${D.monthCount(s.id)}번째</small>`);
      else greet('dup', `${esc(s.name)}, 이미 출석했어요 😊`);
      pin = ''; setTimeout(dots, 250);
    }
    function press(k) {
      if (k === 'C') pin = ''; else if (k === '⌫') pin = pin.slice(0, -1);
      else if (pin.length < 4) { pin += k; K.sound.tick(); }
      dots(); if (pin.length === 4) submit();
    }
    $('keypad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
    addEventListener('keydown', e => {
      if (tab !== 'pin' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Escape') press('C');
    });
    ENTER.pin = () => { $('kTitle').textContent = D.data.dojo ? `${D.data.dojo} · 출석번호 4자리` : '출석번호 4자리를 눌러 주세요'; renderRecent(); };
  })();

  /* ================= ✅ 명단 체크 (선생님용) ================= */
  (function () {
    let cls = '';
    ENTER.list = () => {
      const classes = D.classes();
      $('lCls').innerHTML = `<button class="chip ${!cls ? 'on' : ''}" data-c="">전체</button>` + classes.map(c => `<button class="chip ${cls === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
      const today = D.attendedOn();
      const list = D.students().filter(s => !cls || s.cls === cls);
      $('lCount').textContent = `출석 ${list.filter(s => today[s.id]).length} / ${list.length}명`;
      $('names').innerHTML = list.length ? list.map(s => `<button class="name-btn ${today[s.id] ? 'on' : ''}" data-id="${s.id}">${esc(s.name)}<small>${today[s.id] ? today[s.id] + ' 출석' : esc(D.className(s.cls) || s.belt || '')}</small></button>`).join('')
        : `<div class="box empty" style="grid-column:1/-1"><b>🧒</b>원생이 없어요. <a href="../manage/">원생 관리</a>에서 먼저 등록해 주세요.</div>`;
    };
    $('lCls').addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) { cls = c.dataset.c; ENTER.list(); } });
    $('names').addEventListener('click', e => {
      const b = e.target.closest('.name-btn'); if (!b) return;
      const s = D.student(b.dataset.id);
      if (D.attendedOn()[s.id]) { D.cancelCheckIn(s.id); K.sound.pop(); } else attend(s, '명단');
    });
  })();

  /* ---------- 카메라 공통 ---------- */
  async function listCams(sel) {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const saved = K.get('att:cam', '');
      sel.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === saved ? 'selected' : ''}>${esc(d.label || '카메라 ' + (i + 1))}</option>`).join('') || '<option value="">기본 카메라</option>';
    } catch (e) {}
  }
  async function openCam(sel, facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('이 브라우저는 카메라를 쓸 수 없어요 (https 주소에서 열어 주세요)');
    const id = sel.value;
    const stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id }, width: { ideal: 1280 } } : { facingMode: facing, width: { ideal: 1280 } }, audio: false });
    if (id) K.set('att:cam', id);
    listCams(sel);
    return stream;
  }
  function makeVideo(box, stream) {
    let v = box.querySelector('video');
    if (!v) { v = document.createElement('video'); v.playsInline = true; v.muted = true; box.prepend(v); }
    v.srcObject = stream; return v.play().then(() => v);
  }
  const stopStream = s => s && s.getTracks().forEach(t => t.stop());
  const cooldown = {};   // 같은 아이가 카메라 앞에 계속 있어도 한 번만
  const cool = id => { const t = Date.now(); if (cooldown[id] && t - cooldown[id] < 8000) return false; cooldown[id] = t; return true; };

  /* ================= 📷 QR 출석 ================= */
  (function () {
    let stream = null, video = null, loop = 0, detector = null, cv = null;
    function msg(t, ok) { $('qrMsg').textContent = t; $('qrMsg').className = 'cam-msg' + (ok ? ' ok' : ''); }
    async function start() {
      try {
        stop(); $('qrOff').hidden = true; msg('카메라를 켜는 중…');
        stream = await openCam($('qrDev'), 'environment');
        video = await makeVideo($('qrCam'), stream);
        if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
        if (!detector) await loadScript(CDN.jsqr);
        cv = cv || document.createElement('canvas');
        msg('QR 카드를 네모 안에 비춰 주세요'); K._wantAwake = true; K.keepAwake(true);
        scan();
      } catch (e) { $('qrOff').hidden = false; $('qrOff').textContent = '😢 ' + (e.message || '카메라를 켤 수 없어요'); }
    }
    async function scan() {
      if (!stream) return;
      let text = null;
      try {
        if (detector) { const r = await detector.detect(video); if (r[0]) text = r[0].rawValue; }
        else if (window.jsQR && video.videoWidth) {
          const w = 480, h = Math.round(480 * video.videoHeight / video.videoWidth);
          cv.width = w; cv.height = h; const c = cv.getContext('2d', { willReadFrequently: true });
          c.drawImage(video, 0, 0, w, h); const r = jsQR(c.getImageData(0, 0, w, h).data, w, h); if (r) text = r.data;
        }
      } catch (e) {}
      if (text) handle(text);
      loop = setTimeout(scan, 250);
    }
    function handle(text) {
      const m = /^kihap:(.+)$/.exec(text.trim());
      const s = m && D.student(m[1]);
      if (!s) { msg('기합 출석 카드가 아니에요'); return; }
      if (!cool(s.id)) return;
      msg(attend(s, 'QR') ? `${s.name} 출석! 👏` : `${s.name}, 이미 출석했어요`, true);
    }
    function stop() { clearTimeout(loop); stopStream(stream); stream = null; $('qrOff').hidden = false; $('qrOff').textContent = '📷 ‘카메라 켜기’를 눌러 주세요'; }
    $('qrStart').onclick = start; $('qrStop').onclick = stop;
    ENTER.qr = () => listCams($('qrDev'));
    LEAVE.qr = stop;

    $('qrPrint').onclick = async () => {
      const list = D.students(); if (!list.length) { K.toast('원생을 먼저 등록해 주세요'); return; }
      try { await loadScript(CDN.qrgen); } catch (e) { K.toast('QR 만들기 도구를 불러오지 못했어요 (인터넷 확인)'); return; }
      $('printCards').innerHTML = list.map(s => { const q = qrcode(0, 'M'); q.addData('kihap:' + s.id); q.make();
        return `<div class="qcard">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}<b>${esc(s.name)}</b><span>${esc(D.data.dojo || '기합')} · 번호 ${esc(s.pin)}</span></div>`; }).join('');
      setTimeout(() => print(), 100);
    };
  })();

  /* ================= 🙂 얼굴 인식 ================= */
  (function () {
    let human = null, stream = null, video = null, running = false, busy = false;
    const th = () => Number(K.get('att:faceTh', 0.6));
    $('faceTh').value = th(); $('faceTh').onchange = e => K.set('att:faceTh', +e.target.value);
    function msg(t, ok) { $('faceMsg').textContent = t; $('faceMsg').className = 'cam-msg' + (ok ? ' ok' : ''); }
    const norm = v => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); };
    const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

    async function ensureHuman() {
      if (human) return human;
      msg('얼굴 인식 모델을 받는 중… (처음 한 번만)');
      const { Human } = await import(CDN.human);
      human = new Human({
        modelBasePath: CDN.humanModels, backend: 'webgl', cacheSensitivity: 0, debug: false,
        face: { enabled: true, detector: { rotation: false, maxDetected: 1, minConfidence: 0.5 }, mesh: { enabled: true }, iris: { enabled: false },
          description: { enabled: true }, emotion: { enabled: false }, antispoof: { enabled: true }, liveness: { enabled: true } },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }
      });
      await human.load(); await human.warmup();
      return human;
    }
    async function detect() {
      const r = await human.detect(video);
      const f = r.face && r.face[0];
      return f && f.embedding && f.embedding.length ? { emb: norm(Array.from(f.embedding)), real: f.real == null ? 1 : f.real, live: f.live == null ? 1 : f.live, box: f.box } : null;
    }
    async function start() {
      try {
        stop(); $('faceOff').hidden = true;
        await ensureHuman();
        msg('카메라를 켜는 중…');
        stream = await openCam($('faceDev'), 'user');
        video = await makeVideo($('faceCam'), stream);
        running = true; K._wantAwake = true; K.keepAwake(true);
        const n = D.students().filter(s => s.face).length;
        msg(n ? '카메라를 바라봐 주세요' : '등록된 얼굴이 없어요. 오른쪽에서 먼저 등록해 주세요');
        loop();
      } catch (e) { running = false; $('faceOff').hidden = false; $('faceOff').textContent = '😢 ' + (e.message || '시작할 수 없어요'); }
    }
    async function loop() {
      if (!running) return;
      if (!busy) {
        busy = true;
        try {
          const f = await detect();
          if (f) {
            if (f.real < 0.5 || f.live < 0.5) msg('진짜 얼굴을 보여 주세요 (사진·화면은 안 돼요)');
            else {
              let best = null, score = 0;
              D.students().forEach(s => { if (!s.face) return; const c = cos(f.emb, s.face); if (c > score) { score = c; best = s; } });
              if (best && score >= th()) { if (cool(best.id)) msg(attend(best, '얼굴') ? `${best.name} 출석! 👏` : `${best.name}, 이미 출석했어요`, true); }
              else msg('누구인지 모르겠어요. 번호로 출석해 주세요');
            }
          }
        } catch (e) {}
        busy = false;
      }
      setTimeout(loop, 500);
    }
    function stop() { running = false; stopStream(stream); stream = null; $('faceOff').hidden = false; $('faceOff').textContent = '🙂 ‘얼굴 인식 시작’을 눌러 주세요'; }

    async function register() {
      const s = D.student($('faceWho').value); if (!s) { K.toast('원생을 골라 주세요'); return; }
      if (!running) { await start(); if (!running) return; }
      const wasRunning = running; running = false;   // 등록 중엔 인식 멈춤
      const samples = [];
      for (let i = 0; i < 12 && samples.length < 3; i++) {
        msg(`${s.name} 등록 중… ${samples.length + 1}/3 (정면을 봐 주세요)`);
        await new Promise(r => setTimeout(r, 450));
        const f = await detect().catch(() => null);
        if (f && f.real >= 0.5) { samples.push(f.emb); K.sound.tick(); }
      }
      if (samples.length < 3) { msg('얼굴이 잘 안 보여요. 밝은 곳에서 다시 해 주세요'); }
      else {
        const avg = norm(samples[0].map((_, i) => (samples[0][i] + samples[1][i] + samples[2][i]) / 3));
        D.upsertStudent({ id: s.id, face: avg.map(x => Math.round(x * 10000) / 10000) });
        msg(`${s.name} 얼굴 등록 완료!`, true); K.sound.fanfare(); faceInfo();
      }
      running = wasRunning; if (running) setTimeout(loop, 1500);
    }
    function faceInfo() {
      const list = D.students(), n = list.filter(s => s.face).length;
      $('faceWho').innerHTML = list.map(s => `<option value="${s.id}">${esc(s.name)} ${s.face ? '✅' : ''}</option>`).join('') || '<option value="">원생이 없어요</option>';
      $('faceInfo').textContent = `얼굴 등록 ${n} / ${list.length}명`;
    }
    $('faceStart').onclick = start; $('faceStop').onclick = stop; $('faceReg').onclick = register;
    ENTER.face = () => { faceInfo(); listCams($('faceDev')); };
    LEAVE.face = stop;
  })();

  /* ================= 📋 오늘 현황 ================= */
  ENTER.today = () => {
    const today = D.attendedOn(), all = D.students();
    const came = all.filter(s => today[s.id]).sort((a, b) => today[a.id].localeCompare(today[b.id]));
    const absent = all.filter(s => !today[s.id]);
    const byCls = D.classes().map(c => { const l = all.filter(s => s.cls === c.id); return `<div class="stat"><b>${l.filter(s => today[s.id]).length}/${l.length}</b><span>${esc(c.name)}</span></div>`; }).join('');
    $('t-today').innerHTML = `
      <div class="stats"><div class="stat"><b>${came.length}/${all.length}</b><span>${D.day()} 출석</span></div>${byCls}</div>
      <div class="att-grid split">
        <div class="box"><h2 style="font-size:1.3rem;margin-bottom:8px">출석 (${came.length})</h2><div class="today-list">
          ${came.map(s => `<div class="it"><b>${esc(s.name)}</b><span class="muted">${esc(D.className(s.cls))}</span><span>${today[s.id]}</span><button class="btn sm" data-x="${s.id}">취소</button></div>`).join('') || '<p class="muted">아직 아무도 안 왔어요</p>'}
        </div></div>
        <div class="box"><h2 style="font-size:1.3rem;margin-bottom:8px">아직 안 온 원생 (${absent.length})</h2><div class="today-list">
          ${absent.map(s => `<div class="it"><b>${esc(s.name)}</b><span class="muted">${esc(D.className(s.cls))}</span><span class="muted">${esc(s.phone || '')}</span><button class="btn sm" data-in="${s.id}">출석</button></div>`).join('') || '<p class="muted">모두 왔어요 🎉</p>'}
        </div></div>
      </div>
      <label class="check"><input type="checkbox" id="voiceOn" ${K.get('att:voice', true) ? 'checked' : ''}> 출석할 때 이름 불러 주기 (음성)</label>`;
    $('t-today').querySelectorAll('[data-x]').forEach(b => b.onclick = () => D.cancelCheckIn(b.dataset.x));
    $('t-today').querySelectorAll('[data-in]').forEach(b => b.onclick = () => attend(D.student(b.dataset.in), '수동'));
    $('voiceOn').onchange = e => K.set('att:voice', e.target.checked);
  };

  show('pin');
})();

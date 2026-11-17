/* 기합 — 출석 체크: 번호 · 명단 · QR · 얼굴 · 오늘 현황 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  const CDN = {
    human: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.esm.js',
    humanModels: 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/',
    jsqr: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    qrgen: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
  };
  const I = (n, c) => K.icon(n, c);
  K.topbar('출석 체크', `<button class="btn icon" id="fsBtn" aria-label="전체 화면">${I('maximize')}</button>`, 'clipboard-check');
  $('fsBtn').onclick = () => K.fullscreen();
  K.markLast('attend', '출석 체크');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 바깥 도구(QR 읽기 · QR 만들기) 불러오기
  // · 받는 중에 또 부르면 같은 결과를 함께 기다린다 (태그만 보고 '다 받았다'고 넘어가면 아직 없는 함수를 불러 오류가 남)
  // · 실패한 <script> 는 지워서, 인터넷이 돌아온 뒤 다시 누르면 새로 받는다
  // · crossOrigin 을 붙여야 서비스 워커가 받은 파일을 저장해 둘 수 있다 (한 번 쓴 뒤로는 인터넷이 끊겨도 동작)
  const loading = {};
  const loadScript = src => loading[src] || (loading[src] = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
    s.onload = () => ok();
    s.onerror = () => { s.remove(); delete loading[src]; no(new Error('인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요')); };
    document.head.appendChild(s);
  }));

  /* ---------- 공통: 출석 처리 ---------- */
  let ext = 0;        // 다른 화면이 저장해서 기록을 새로 읽은 횟수 (방금 한 저장이 거절됐는지 알아보는 데 씀)
  function attend(s) {
    const n = ext; let fresh = D.checkIn(s.id);
    // 그사이 다른 화면이 저장했으면 db.js 가 이번 기록을 버리고 새로 읽는다 → 새 기록 위에 한 번 더 남김 (아이가 다시 찍지 않아도 되게)
    if (n !== ext) { fresh = D.checkIn(s.id); K.toast(fresh ? '다른 화면의 기록을 새로 불러온 뒤 출석을 기록했습니다' : '다른 화면의 기록을 새로 불러왔습니다', 3000); }
    if (fresh) { K.sound.fanfare(); if (K.get('att:voice', false)) K.say(s.name + ', 출석했습니다', true); }
    else K.sound.beep();
    renderRecent();
    return fresh;
  }
  // 방금 출석: 따로 적어 두지 않고 오늘 기록에서 바로 만든다 → 취소 · 새로 고침 · 다른 화면의 출석이 그대로 반영됨
  function renderRecent() {
    // 같은 분에 찍힌 기록은 나중 것이 위로 오게, 먼저 뒤집은 다음 시각 순으로 정렬
    const list = Object.entries(D.attendedOn()).reverse().sort((a, b) => b[1].localeCompare(a[1])).map(([id, t]) => ({ s: D.student(id), t })).filter(x => x.s).slice(0, 12);
    $('recent').innerHTML = list.length ? list.map(r => `<div class="it"><b>${esc(r.s.name)}</b>${D.beltChip(r.s.belt)}<span class="muted t">${r.t}</span></div>`).join('')
      : '<p class="muted" style="margin:0">아직 출석한 원생이 없습니다</p>';
  }

  /* ---------- 탭 ---------- */
  let tab = '';
  const ENTER = {}, LEAVE = {}, REFRESH = {};      // REFRESH: 기록이 바뀌었을 때 그 탭에서 다시 그릴 것
  function show(t) {
    if (t === tab) return;                       // 보고 있는 탭을 또 눌러도 카메라가 꺼지지 않게
    if (LEAVE[tab]) LEAVE[tab]();
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    document.querySelectorAll('.tabp').forEach(p => p.hidden = p.id !== 't-' + t);
    if (ENTER[t]) ENTER[t]();
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });
  D.onChange((d, external) => { if (external) ext++; if (REFRESH[tab]) REFRESH[tab](); });

  /* ================= 번호 입력 (입구 태블릿용) ================= */
  (function () {
    let pin = '', clearT = null;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'B'];
    $('keypad').innerHTML = keys.map(k => `<button data-k="${k}" class="${/\d/.test(k) ? '' : 'fn'}" aria-label="${k === 'C' ? '모두 지우기' : k === 'B' ? '한 칸 지우기' : k}">${k === 'C' ? '지우기' : k === 'B' ? I('undo-2') : k}</button>`).join('');
    const dots = () => $('dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('f', !!pin[i]));
    function greet(cls, text) {
      const g = $('greet'); g.className = 'greet ' + cls; g.innerHTML = text;
      clearTimeout(clearT); clearT = setTimeout(() => { g.className = 'greet'; g.textContent = ''; }, 3500);
    }
    function submit() {
      const s = D.students().find(x => x.pin === pin);
      if (!s) { greet('bad', '등록되지 않은 번호입니다'); K.sound.beep(); $('dots').classList.remove('shake'); void $('dots').offsetWidth; $('dots').classList.add('shake'); }
      else if (attend(s)) greet('ok', `${esc(s.name)} 출석<small>이번 달 ${D.monthCount(s.id)}번째 · ${D.hm()}</small>`);
      else greet('dup', `${esc(s.name)}<small>오늘 이미 출석했습니다</small>`);
      pin = ''; setTimeout(dots, 250);
    }
    function press(k) {
      if (k === 'C') pin = ''; else if (k === 'B') pin = pin.slice(0, -1);
      else if (pin.length < 4) { pin += k; K.sound.tick(); }
      dots(); if (pin.length === 4) submit();
    }
    $('keypad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
    addEventListener('keydown', e => {
      if (tab !== 'pin' || K.typing()) return;
      if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('B'); else if (e.key === 'Escape') press('C');
    });
    ENTER.pin = REFRESH.pin = () => { $('kTitle').textContent = D.data.dojo ? `${D.data.dojo} · 출석번호 4자리` : '출석번호 4자리를 입력하세요'; renderRecent(); };
  })();

  /* ================= 명단 체크 (선생님용) ================= */
  (function () {
    let cls = '';
    ENTER.list = REFRESH.list = () => {
      const classes = D.classes();
      if (cls && !classes.some(c => c.id === cls)) cls = '';      // 고르던 반이 지워졌으면 전체로
      $('lCls').innerHTML = `<button class="chip ${!cls ? 'on' : ''}" data-c="">전체</button>` + classes.map(c => `<button class="chip ${cls === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
      const today = D.attendedOn();
      const list = D.students().filter(s => !cls || s.cls === cls);
      $('lCount').textContent = `출석 ${list.filter(s => today[s.id]).length} / ${list.length}명`;
      $('names').innerHTML = list.length ? list.map(s => `<button class="name-btn ${today[s.id] ? 'on' : ''}" data-id="${s.id}">${esc(s.name)}<small>${today[s.id] ? today[s.id] + ' 출석' : esc(D.className(s.cls) || s.belt || '')}</small></button>`).join('')
        : `<div class="box empty" style="grid-column:1/-1"><div>${I('users', 'xl')}</div>등록된 원생이 없습니다. <a href="../manage/">원생 관리</a>에서 먼저 등록해 주세요.</div>`;
    };
    $('lCls').addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (c) { cls = c.dataset.c; ENTER.list(); } });
    $('names').addEventListener('click', e => {
      const b = e.target.closest('.name-btn'); if (!b) return;
      const s = D.student(b.dataset.id); if (!s) return;
      if (D.attendedOn()[s.id]) { D.cancelCheckIn(s.id); K.sound.pop(); } else attend(s);
    });
  })();

  /* ---------- 카메라 공통 ---------- */
  // 고른 카메라는 QR · 얼굴 따로 기억한다. 직접 고른 적이 없으면 기본 방향(QR 은 뒤쪽, 얼굴은 앞쪽)으로 켠다.
  const CAM = { environment: { key: 'att:cam:qr', side: '뒤쪽' }, user: { key: 'att:cam:face', side: '앞쪽' } };
  // 카메라 목록 그리기. on = 지금 켜져 있는 카메라 {id, label} — 있으면 그것을, 없으면 직접 골라 둔 카메라를 고른 상태로 보여 줌
  async function listCams(sel, facing, on) {
    const n = sel._n = (sel._n || 0) + 1;
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId); } catch (e) {}
    if (sel._n !== n) return;                    // 그사이 더 나중에 부른 것이 있으면 그쪽 결과만 씀
    const want = on ? on.id : K.get(CAM[facing].key, '');
    const cur = devs.find(d => d.deviceId === want) || (on && on.label ? devs.find(d => d.label === on.label) : null);
    sel.innerHTML = `<option value="">자동 (${CAM[facing].side} 카메라)</option>` + devs.map((d, i) => `<option value="${esc(d.deviceId)}" ${d === cur ? 'selected' : ''}>${esc(d.label || '카메라 ' + (i + 1))}</option>`).join('');
  }
  async function openCam(sel, facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('이 브라우저에서는 카메라를 쓸 수 없습니다 (https 주소에서 열어 주세요)');
    const key = CAM[facing].key, id = K.get(key, '');
    const ask = v => navigator.mediaDevices.getUserMedia({ video: Object.assign(v, { width: { ideal: 1280 } }), audio: false });
    let stream = null;
    // 골라 둔 카메라가 없어졌으면(기기를 바꿨거나 브라우저가 번호를 새로 매김) 기억을 지우고 기본 방향으로 켠다
    if (id) try { stream = await ask({ deviceId: { exact: id } }); } catch (e) { if (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError') throw e; K.set(key, ''); }
    if (!stream) stream = await ask({ facingMode: facing });
    const t = stream.getVideoTracks()[0], st = t && t.getSettings ? t.getSettings() : {};
    listCams(sel, facing, { id: st.deviceId || '', label: t ? t.label : '' });      // 실제로 켜진 카메라를 목록에서 골라 보여 줌
    return stream;
  }
  function makeVideo(box, stream) {
    let v = box.querySelector('video');
    if (!v) { v = document.createElement('video'); v.playsInline = true; v.muted = true; box.prepend(v); }
    v.srcObject = stream; return v.play().then(() => v);
  }
  const stopStream = s => s && s.getTracks().forEach(t => t.stop());
  // 끌 때 영상도 비운다 (그대로 두면 마지막 장면이 멈춘 채 화면에 남음)
  const clearVideo = box => { const v = box.querySelector('video'); if (v) { v.pause(); v.srcObject = null; } };
  const camErr = e => ({ NotAllowedError: '카메라 사용이 허용되지 않았습니다. 브라우저 설정에서 이 사이트의 카메라를 허용해 주세요', NotFoundError: '카메라를 찾을 수 없습니다', NotReadableError: '다른 프로그램이 카메라를 쓰고 있어 켤 수 없습니다' })[e && e.name] || (e && e.message) || '카메라를 켤 수 없습니다';
  const offMsg = (id, icon, text) => { const el = $(id); el.hidden = false; el.innerHTML = I(icon) + `<span>${esc(text)}</span>`; };
  const cooldown = {};   // 같은 아이가 카메라 앞에 계속 있어도 한 번만
  const cool = id => { const t = Date.now(); if (cooldown[id] && t - cooldown[id] < 8000) return false; cooldown[id] = t; return true; };

  /* ================= QR 출석 ================= */
  (function () {
    let stream = null, video = null, timer = 0, detector = null, cv = null, starting = null, seen = 0;
    let gen = 0;                                   // 켜고 끌 때마다 올라가는 번호: 기다리는 사이 끄기 · 탭 이동이 있었는지 알아봄
    let native = 'BarcodeDetector' in window;      // 기기에 든 QR 인식을 쓸지 (오류가 나면 false 로 바꾸고 jsQR 로 읽음)
    const IDLE = 'QR 카드를 네모 안에 비춰 주세요';
    function msg(t, ok) { $('qrMsg').textContent = t; $('qrMsg').className = 'cam-msg' + (ok ? ' ok' : ''); }
    const lock = on => { $('qrStart').disabled = on; $('qrDev').disabled = on; };
    // 켜는 중에 또 누르면 카메라가 두 번 열려 하나는 끌 수 없게 된다 → 진행 중인 시작을 그대로 돌려줌
    const start = () => starting || (starting = run().finally(() => { starting = null; lock(false); }));
    async function run() {
      stop(); lock(true);
      const my = gen;
      try {
        $('qrOff').hidden = true; msg('카메라를 켜는 중…');
        const st = await openCam($('qrDev'), 'environment');
        if (my !== gen) return stopStream(st);     // 허용 창이 떠 있는 동안 끄기를 눌렀거나 다른 탭으로 감 → 켜지 않음
        stream = st; video = await makeVideo($('qrCam'), st);
        if (my !== gen) return;
        if (native && !detector) {
          try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
          if (!detector) native = false;
        }
        if (!detector) await loadScript(CDN.jsqr);
        if (my !== gen) return;
        cv = cv || document.createElement('canvas');
        msg(IDLE); seen = 0; K._wantAwake = true; K.keepAwake(true);
        scan(my);
      } catch (e) { if (my === gen) { stop(); offMsg('qrOff', 'camera', camErr(e)); } }      // 실패하면 카메라도 끔 (오류 문구 뒤에서 켜진 채 남지 않게)
    }
    async function scan(my) {
      if (my !== gen) return;
      let text = null;
      try {
        if (detector) {
          try { const r = await detector.detect(video); if (r[0]) text = r[0].rawValue; }
          catch (e) {
            // 영상은 나오는데 기기의 QR 인식이 오류를 내면(일부 안드로이드) 직접 읽는 방식(jsQR)으로 바꾼다
            if (video.readyState >= 2) { detector = null; native = false; loadScript(CDN.jsqr).catch(er => { if (my === gen) msg(er.message); }); }
          }
        } else if (window.jsQR && video.videoWidth) {
          const w = 480, h = Math.round(480 * video.videoHeight / video.videoWidth);
          cv.width = w; cv.height = h; const c = cv.getContext('2d', { willReadFrequently: true });
          c.drawImage(video, 0, 0, w, h); const r = jsQR(c.getImageData(0, 0, w, h).data, w, h); if (r) text = r.data;
        }
      } catch (e) {}
      if (my !== gen) return;
      if (text) { seen = Date.now(); handle(text); }
      else if (seen && Date.now() - seen > 3000) { seen = 0; msg(IDLE); }      // 카드가 사라진 지 3초: 앞사람 이름을 지우고 안내로 돌아감
      timer = setTimeout(() => scan(my), 250);
    }
    function handle(text) {
      const m = /^kihap:(.+)$/.exec(text.trim());
      const s = m && D.student(m[1]);
      if (!s) { msg('기합 출석 카드가 아닙니다'); return; }
      // 퇴원 처리한 원생의 카드는 출석으로 기록하지 않는다
      if (s.active === false) { msg(`${s.name} · 퇴원 처리된 카드라 출석할 수 없습니다`); if (cool('out:' + s.id)) K.sound.beep(); return; }
      if (!cool(s.id)) return;
      msg(attend(s) ? `${s.name} 출석` : `${s.name} · 이미 출석했습니다`, true);
    }
    function stop() {
      gen++; clearTimeout(timer); stopStream(stream); stream = null; clearVideo($('qrCam'));
      offMsg('qrOff', 'camera', '‘카메라 켜기’를 누르면 시작합니다'); msg(IDLE);
    }
    $('qrStart').onclick = start; $('qrStop').onclick = stop;
    // 카메라를 고르면 기억해 두고, 켜져 있으면 그 카메라로 바로 다시 켠다 (‘자동’을 고르면 기억을 지움)
    $('qrDev').onchange = () => { K.set(CAM.environment.key, $('qrDev').value); if (stream) start(); };
    ENTER.qr = () => listCams($('qrDev'), 'environment');
    LEAVE.qr = stop;

    let printing = false;      // 도구를 받는 동안 또 누르면 인쇄 창이 두 번 뜨므로 한 번만
    $('qrPrint').onclick = async () => {
      if (printing) return;
      const list = D.students(); if (!list.length) { K.toast('원생을 먼저 등록해 주세요'); return; }
      printing = true;
      try {
        await loadScript(CDN.qrgen);
        $('printCards').innerHTML = list.map(s => { const q = qrcode(0, 'M'); q.addData('kihap:' + s.id); q.make();
          return `<div class="qcard">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}<b>${esc(s.name)}</b><span>${esc(D.data.dojo || '기합')} · 번호 ${esc(s.pin)}</span></div>`; }).join('');
      } catch (e) { printing = false; K.toast('QR 생성 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요'); return; }      // 실패해도 버튼이 잠긴 채 남지 않게
      setTimeout(() => { printing = false; print(); }, 100);
    };
  })();

  /* ================= 얼굴 인식 ================= */
  (function () {
    let human = null, humanP = null, stream = null, video = null, running = false, busy = false, starting = null;
    let gen = 0;          // 켜고 끌 때마다 올라가는 번호 (기다리는 사이 끄기 · 탭 이동이 있었는지 알아봄)
    let regOn = false;    // 얼굴 등록 중 — 그동안 인식은 쉬고, 등록이 끝나면 저절로 이어짐
    let hold = 0;         // 이 시각까지는 인식을 쉼 (등록 완료 문구가 잠깐 보이게)
    let seen = 0;         // 마지막으로 얼굴이 보인 시각
    const th = () => Number(K.get('att:faceTh', 0.6));
    $('faceTh').value = th(); $('faceTh').onchange = e => K.set('att:faceTh', +e.target.value);
    function msg(t, ok) { $('faceMsg').textContent = t; $('faceMsg').className = 'cam-msg' + (ok ? ' ok' : ''); }
    const norm = v => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); };
    const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const idle = () => D.students().some(s => s.face) ? '카메라를 바라봐 주세요' : '등록된 얼굴이 없습니다. 오른쪽에서 먼저 등록해 주세요';
    const lock = on => { $('faceStart').disabled = on; $('faceDev').disabled = on; };

    // 인식 모델은 한 번만 만든다 (받는 중에 또 부르면 같은 것을 기다리고, 실패하면 다음에 다시 시도)
    function ensureHuman() {
      return humanP || (humanP = (async () => {
        const { Human } = await import(CDN.human);
        const h = new Human({
          modelBasePath: CDN.humanModels, backend: 'webgl', cacheSensitivity: 0, debug: false,
          face: { enabled: true, detector: { rotation: false, maxDetected: 1, minConfidence: 0.5 }, mesh: { enabled: true }, iris: { enabled: false },
            description: { enabled: true }, emotion: { enabled: false }, antispoof: { enabled: true }, liveness: { enabled: true } },
          body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }
        });
        await h.load(); await h.warmup();
        return human = h;
      })().catch(e => { humanP = null; throw new Error('얼굴 인식 모델을 준비하지 못했습니다. 인터넷 연결을 확인해 주세요' + (e && e.message ? ` (${e.message})` : '')); }));
    }
    async function detect() {
      const r = await human.detect(video);
      const f = r.face && r.face[0];
      // Human 은 점수가 0 으로 반올림되면 real · live 칸을 아예 빼고 돌려준다 → 칸이 없으면 통과가 아니라 0(가짜)으로 본다
      return f && f.embedding && f.embedding.length ? { emb: norm(Array.from(f.embedding)), real: f.real || 0, live: f.live || 0, box: f.box } : null;
    }
    // 시작하는 중(모델을 받는 몇 초 포함)에 또 누르면 카메라와 모델이 두 벌 만들어진다 → 진행 중인 시작을 그대로 돌려줌
    const start = () => starting || (starting = run().finally(() => { starting = null; lock(false); }));
    async function run() {
      stop(); lock(true);
      const my = gen;
      try {
        $('faceOff').hidden = true;
        if (!human) msg('얼굴 인식 모델을 내려받는 중…');
        await ensureHuman();
        if (my !== gen) return;
        msg('카메라를 켜는 중…');
        const st = await openCam($('faceDev'), 'user');
        if (my !== gen) return stopStream(st);
        stream = st; video = await makeVideo($('faceCam'), st);
        if (my !== gen) return;
        running = true; K._wantAwake = true; K.keepAwake(true);
        msg(idle()); seen = 0;
        loop(my);
      } catch (e) { if (my === gen) { stop(); offMsg('faceOff', 'scan-face', camErr(e)); } }
    }
    async function loop(my) {
      if (my !== gen) return;
      if (!busy && !regOn && Date.now() >= hold) {
        busy = true;
        try {
          const f = await detect();
          if (my !== gen) return;
          if (!f) { if (seen && Date.now() - seen > 3000) { seen = 0; msg(idle()); } }      // 3초 동안 아무도 없으면 앞사람 이름을 지우고 안내로
          else {
            seen = Date.now();
            if (f.real < 0.5 || f.live < 0.5) msg('사진이나 화면이 아닌 실제 얼굴을 비춰 주세요');
            else {
              let best = null, score = 0, second = 0;      // 가장 닮은 원생과, 그다음으로 닮은 원생의 점수
              D.students().forEach(s => { if (!s.face) return; const c = cos(f.emb, s.face); if (c > score) { second = score; score = c; best = s; } else if (c > second) second = c; });
              // 두 원생이 비슷하게 나오면(차이 0.04 미만) 엉뚱한 아이가 출석 처리될 수 있으므로 번호로 안내한다
              if (best && score >= th() && score - second >= 0.04) { if (cool(best.id)) msg(attend(best) ? `${best.name} 출석` : `${best.name} · 이미 출석했습니다`, true); }
              else msg('인식하지 못했습니다. 번호로 출석해 주세요');
            }
          }
        } catch (e) {} finally { busy = false; }
      }
      if (my === gen) setTimeout(() => loop(my), 500);
    }
    function stop() {
      gen++; running = false; stopStream(stream); stream = null; clearVideo($('faceCam'));
      offMsg('faceOff', 'scan-face', '‘얼굴 인식 시작’을 누르면 시작합니다'); msg('카메라를 바라봐 주세요');
    }

    async function register() {
      if (regOn) return;                                   // 등록 중에 또 누르면 겹쳐서 찍지 않게
      const s = D.student($('faceWho').value); if (!s) { K.toast('원생을 골라 주세요'); return; }
      regOn = true; $('faceReg').disabled = true;
      try {
        if (!running) { await start(); if (!running) return; }
        const my = gen;                                    // 등록 도중 끄기 · 탭 이동이 있으면 번호가 달라진다 → 그만두고, 인식을 다시 켜지도 않음
        while (busy) await wait(50);                       // 돌고 있던 인식 한 번이 끝나길 기다림
        const samples = [];
        for (let i = 0; i < 12 && samples.length < 3 && my === gen; i++) {
          msg(`${s.name} 등록 중 ${samples.length + 1}/3 · 정면을 봐 주세요`);
          await wait(450);
          if (my !== gen) break;
          const f = await detect().catch(() => null);
          if (my === gen && f && f.real >= 0.5) { samples.push(f.emb); K.sound.tick(); }
        }
        if (my !== gen) return;
        if (samples.length < 3) msg('얼굴이 잘 보이지 않습니다. 밝은 곳에서 다시 시도해 주세요');
        else {
          const avg = norm(samples[0].map((_, i) => (samples[0][i] + samples[1][i] + samples[2][i]) / 3));
          const n = ext; D.upsertStudent({ id: s.id, face: avg.map(x => Math.round(x * 10000) / 10000) });
          if (n === ext) { msg(`${s.name} 얼굴 등록 완료`, true); K.sound.fanfare(); }
          else msg('저장하지 못했습니다. 다시 등록해 주세요');      // 다른 화면이 그사이 저장해 이번 저장이 거절된 경우
          faceInfo();
        }
        seen = Date.now(); hold = Date.now() + 1500;       // 완료 문구가 잠깐 보이도록 인식은 1.5초 뒤부터 이어감
      } finally { regOn = false; $('faceReg').disabled = false; }
    }
    function faceInfo() {
      const list = D.students(), n = list.filter(s => s.face).length, sel = $('faceWho'), cur = sel.value;
      // 이름이 같은 아이를 구분할 수 있게 출석번호를 함께 보여 준다
      const html = list.map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.pin || '번호 없음')}${s.face ? ' (등록됨)' : ''}</option>`).join('') || '<option value="">원생이 없습니다</option>';
      // 내용이 달라졌을 때만 다시 그리고(출석이 찍힐 때마다 그리면 펼쳐 둔 목록이 닫힘), 다시 그려도 고르던 원생은 그대로 둔다.
      // 등록 뒤 첫 원생으로 돌아가 버리면 다음 등록이 엉뚱한 아이의 얼굴을 덮어쓰게 된다.
      if (sel._html !== html) { sel.innerHTML = sel._html = html; if (list.some(s => s.id === cur)) sel.value = cur; }
      $('faceInfo').textContent = `얼굴 등록 ${n} / ${list.length}명`;
    }
    $('faceStart').onclick = start; $('faceStop').onclick = stop; $('faceReg').onclick = register;
    $('faceDev').onchange = () => { K.set(CAM.user.key, $('faceDev').value); if (running && !regOn) start(); };
    ENTER.face = () => { faceInfo(); listCams($('faceDev'), 'user'); };
    LEAVE.face = stop;
    REFRESH.face = faceInfo;
  })();

  /* ================= 오늘 현황 ================= */
  ENTER.today = REFRESH.today = () => {
    const today = D.attendedOn(), all = D.students();
    const came = all.filter(s => today[s.id]).sort((a, b) => today[a.id].localeCompare(today[b.id]));
    const absent = all.filter(s => !today[s.id]);
    const byCls = D.classes().map(c => { const l = all.filter(s => s.cls === c.id); return `<div class="stat"><b>${l.filter(s => today[s.id]).length}/${l.length}</b><span>${esc(c.name)}</span></div>`; }).join('');
    $('t-today').innerHTML = `
      <div class="stats"><div class="stat"><b>${came.length}/${all.length}</b><span>${D.day()} 출석</span></div>${byCls}</div>
      <div class="att-grid split">
        <div class="box"><h2 style="font-size:1.3rem;margin-bottom:8px">출석 (${came.length})</h2><div class="today-list">
          ${came.map(s => `<div class="it"><b>${esc(s.name)}</b><span class="muted">${esc(D.className(s.cls))}</span><span class="t">${today[s.id]}</span><button class="btn sm" data-x="${s.id}">취소</button></div>`).join('') || '<p class="muted">아직 출석한 원생이 없습니다</p>'}
        </div></div>
        <div class="box"><h2 style="font-size:1.3rem;margin-bottom:8px">아직 안 온 원생 (${absent.length})</h2><div class="today-list">
          ${absent.map(s => `<div class="it"><b>${esc(s.name)}</b><span class="muted">${esc(D.className(s.cls))}</span><span class="muted">${esc(s.phone || '')}</span><button class="btn sm" data-in="${s.id}">출석</button></div>`).join('') || '<p class="muted">전원 출석했습니다</p>'}
        </div></div>
      </div>
      <label class="check"><input type="checkbox" id="voiceOn" ${K.get('att:voice', false) ? 'checked' : ''}> 출석할 때 이름을 음성으로 읽기</label>`;
    $('t-today').querySelectorAll('[data-x]').forEach(b => b.onclick = () => D.cancelCheckIn(b.dataset.x));
    $('t-today').querySelectorAll('[data-in]').forEach(b => b.onclick = () => { const s = D.student(b.dataset.in); if (s) attend(s); });
    $('voiceOn').onchange = e => K.set('att:voice', e.target.checked);
  };

  show('pin');
})();

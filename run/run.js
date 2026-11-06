/* 기합 — 모션 달리기
 * 카메라 앞 제자리 달리기: 무릎이 번갈아 올라가면 한 걸음, 엉덩이가 훅 올라가면 점프.
 * 카메라가 없으면 왼쪽·오른쪽 방향키를 번갈아 누르거나 화면 버튼. */
(function () {
  const K = Kihap, $ = id => document.getElementById(id);
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  K.topbar('모션 달리기', `<button class="btn icon" id="fsBtn" aria-label="전체 화면">${K.icon('maximize')}</button>`, 'footprints');
  $('fsBtn').onclick = () => K.fullscreen($('arena'));
  K.markLast('run', '모션 달리기');

  /* ---------- 게임 상수 ---------- */
  const MAX_V = 10;          // 최고 속도 (m/s)
  const STEP_GAIN = 1.6;     // 한 걸음마다 붙는 속도
  const DRAG = 3.0;          // 초당 줄어드는 속도
  const JUMP_V = 6, GRAV = 16;               // 체공 약 0.75초 (카메라 지연을 생각해 넉넉히)
  const HURDLE_H = 0.45, HURDLE_HIT = 0.3, HURDLE_HALF = 0.3;   // 보이는 높이 · 실제 걸리는 높이

  /* ---------- 상태 ---------- */
  const G = {
    phase: 'menu',          // menu · count · play · end
    secs: K.get('run:secs', 30),
    input: 'key',           // key · cam
    t: 0, dist: 0, v: 0, y: 0, vy: 0, run: 0,
    stun: 0, hurdles: [], nextHurdle: 25, cleared: 0, hits: 0, steps: 0,
    lastSide: '', shake: 0, best: 0
  };
  window.RunGame = G;

  /* ---------- 캔버스 ---------- */
  const cv = $('cv'), cx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function fit() {
    const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  new ResizeObserver(fit).observe(cv); fit();

  /* ---------- 입력: 걸음 · 점프 ---------- */
  function step(side) {
    if (G.phase !== 'play') return;
    if (side && side === G.lastSide) return;       // 같은 발 연속은 무시 (번갈아야 함)
    G.lastSide = side || (G.lastSide === 'L' ? 'R' : 'L');
    G.steps++;
    G.v = Math.min(MAX_V, G.v + STEP_GAIN * (G.stun > 0 ? .4 : 1));
    if (G.steps % 2) K.sound.tock();
  }
  function jump() {
    if (G.phase !== 'play' || G.y > 0.01) return;
    G.vy = JUMP_V; K.sound.pop();
  }
  G.step = step; G.jump = jump;

  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { step('L'); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'l' || k === 'L') { step('R'); e.preventDefault(); }
    else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') { if (G.phase === 'play') { jump(); e.preventDefault(); } }
  });
  const pad = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  pad('padL', () => step('L')); pad('padR', () => step('R')); pad('padJ', jump);

  /* ---------- 카메라 · 자세 인식 ---------- */
  let landmarker = null, video = $('video'), stream = null, camLoop = 0, lastVideoT = -1;
  const P = { side: '', base: null, torso: 0.25, lastJump: 0, seen: 0 };
  async function loadPose() {
    if (landmarker) return landmarker;
    const vision = await import(MP);
    const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5 });
    try { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('CPU')); }
    return landmarker;
  }
  async function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('이 브라우저는 카메라를 쓸 수 없어요');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream; await video.play();
    $('cam').hidden = false;
    detect();
  }
  function stopCam() { cancelAnimationFrame(camLoop); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('cam').hidden = true; }

  const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  function detect() {
    camLoop = requestAnimationFrame(detect);
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoT) return;
    lastVideoT = video.currentTime;
    let res; try { res = landmarker.detectForVideo(video, performance.now()); } catch (e) { return; }
    const lm = res.landmarks && res.landmarks[0];
    drawSkeleton(lm);
    if (!lm) { camTip('사람이 보이지 않습니다'); return; }
    const vis = i => (lm[i].visibility == null ? 1 : lm[i].visibility);
    if ([23, 24, 25, 26].some(i => vis(i) < .5)) { camTip('몸 전체가 보이도록 2~3m 뒤로'); return; }
    camTip('인식됨 · 제자리 달리기');
    const hipY = (lm[23].y + lm[24].y) / 2, shY = (lm[11].y + lm[12].y) / 2;
    const torso = Math.max(.05, hipY - shY);
    P.torso = P.torso * .9 + torso * .1;
    // 걸음: 두 무릎 높이 차이가 몸통 길이의 일정 비율을 넘으면 그쪽 발이 올라간 것
    const d = (lm[25].y - lm[26].y) / P.torso;      // + 이면 오른 무릎(26)이 더 높음 (화면 y 는 아래가 +)
    const side = d > .14 ? 'R' : d < -.14 ? 'L' : '';
    if (side && side !== P.side) { P.side = side; step(side); }
    // 점프: 엉덩이 높이가 평소(천천히 따라가는 기준선)보다 훅 올라가면
    if (P.base == null) P.base = hipY;
    const rise = (P.base - hipY) / P.torso, now = performance.now();
    if (rise > .22 && now - P.lastJump > 650) { P.lastJump = now; jump(); }
    if (rise < .1) P.base = P.base * .95 + hipY * .05;   // 서 있을 때만 기준선 갱신
  }
  function camTip(t) { if ($('camTip').textContent !== t) $('camTip').textContent = t; }
  const sk = $('sk'), skx = sk.getContext('2d');
  function drawSkeleton(lm) {
    const w = sk.width = sk.clientWidth, h = sk.height = sk.clientHeight;
    skx.clearRect(0, 0, w, h); if (!lm) return;
    skx.lineWidth = 3; skx.strokeStyle = '#7dffb0'; skx.fillStyle = '#ff5d66';
    BONES.forEach(([a, b]) => { skx.beginPath(); skx.moveTo(lm[a].x * w, lm[a].y * h); skx.lineTo(lm[b].x * w, lm[b].y * h); skx.stroke(); });
    [11, 12, 23, 24, 25, 26, 27, 28].forEach(i => { skx.beginPath(); skx.arc(lm[i].x * w, lm[i].y * h, 4, 0, 7); skx.fill(); });
  }

  /* ---------- 진행 ---------- */
  function show(id, on) { $(id).hidden = !on; }
  function hint(t) { $('hint').hidden = !t; if (t) $('hint').textContent = t; }
  function bigText(t) { const b = $('big'); b.textContent = t; b.classList.remove('pop'); void b.offsetWidth; if (t) b.classList.add('pop'); }
  function floatText(t, x, y) {
    const f = document.createElement('div'); f.className = 'float'; f.textContent = t;
    f.style.left = x + 'px'; f.style.top = y + 'px'; $('arena').appendChild(f); setTimeout(() => f.remove(), 1000);
  }

  function reset() {
    Object.assign(G, { t: G.secs, dist: 0, v: 0, y: 0, vy: 0, run: 0, stun: 0, hurdles: [], nextHurdle: 22, cleared: 0, hits: 0, steps: 0, lastSide: '', shake: 0, best: 0 });
    P.side = ''; P.base = null; hudSec = -1;
  }
  let countT = 0;
  function begin() {
    reset(); G.phase = 'count';
    show('menu', false); show('result', false); show('hud', true);
    hint(G.input === 'cam' ? '몸 전체가 보이도록 2~3m 뒤에 서세요' : '왼쪽·오른쪽 방향키를 번갈아 누르면 달립니다 · 스페이스 = 점프');
    K._wantAwake = true; K.keepAwake(true);
    let n = 3; bigText(n); K.sound.beep();
    clearInterval(countT);
    countT = setInterval(() => {
      n--;
      if (n > 0) { bigText(n); K.sound.beep(); }
      else { clearInterval(countT); bigText('GO'); K.sound.go(); G.phase = 'play'; setTimeout(() => { if (G.phase === 'play') bigText(''); }, 700); setTimeout(() => { if (G.phase === 'play') hint(''); }, 4000); }
    }, 1000);
    updateHud();
  }
  function finish() {
    G.phase = 'end'; bigText('끝'); K.sound.end(); hint('');
    setTimeout(() => { bigText(''); openResult(); }, 1100);
  }

  /* ---------- 순위 ---------- */
  const boardKey = () => 'run:board:' + G.secs;
  const board = () => K.get(boardKey(), []);
  let savedIdx = -1;
  function renderBoard(highlight) {
    const b = board();
    $('rBoard').innerHTML = b.length ? b.map((r, i) => `<li class="${i === highlight ? 'me' : ''}"><span>${i + 1}</span><b>${K.esc(r.name)}</b><span>${r.m}m</span></li>`).join('')
      : '<li><span></span><b class="muted">아직 기록이 없습니다</b><span></span></li>';
  }
  function openResult() {
    const m = Math.round(G.dist), b = board();
    const rank = b.filter(r => r.m >= m).length;          // 들어갈 자리
    $('rTitle').innerHTML = rank === 0 && m > 0 ? K.icon('medal') + '신기록' : '완주';
    $('rDist').textContent = m + 'm';
    $('rSub').textContent = `${G.secs}초 · 허들 ${G.cleared}개 넘음 · ${G.hits}번 걸림 · 최고 ${Math.round(G.best * 3.6)}km/h`;
    savedIdx = -1;
    const canSave = m > 0 && rank < 10;
    $('nameRow').hidden = !canSave;
    $('rName').value = K.get('run:name', '');
    renderBoard(-1);
    show('result', true);
    if (rank === 0 && m > 0) K.sound.fanfare();
    if (canSave) setTimeout(() => $('rName').focus(), 50);
  }
  function saveScore() {
    const name = $('rName').value.trim() || '이름 없음';
    K.set('run:name', name);
    const b = board(), rec = { name, m: Math.round(G.dist), d: new Date().toISOString().slice(0, 10) };
    b.push(rec); b.sort((a, c) => c.m - a.m);
    const top = b.slice(0, 10); K.set(boardKey(), top);
    savedIdx = top.indexOf(rec);
    $('nameRow').hidden = true; renderBoard(savedIdx); K.sound.pop();
  }
  $('rSave').onclick = saveScore;
  $('rName').addEventListener('keydown', e => { if (e.key === 'Enter') saveScore(); });
  $('again').onclick = begin;
  $('toMenu').onclick = () => { G.phase = 'menu'; show('result', false); show('hud', false); show('menu', true); hint(''); };
  $('showBoard').onclick = () => {
    show('menu', false); $('rTitle').innerHTML = `${K.icon('trophy')}${G.secs}초 순위`; $('rDist').textContent = ''; $('rSub').textContent = '';
    $('nameRow').hidden = true; renderBoard(-1); show('result', true);
  };

  /* ---------- 메뉴 ---------- */
  function syncModes() { document.querySelectorAll('#modes .chip').forEach(c => c.classList.toggle('on', +c.dataset.s === G.secs)); }
  $('modes').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; G.secs = +c.dataset.s; K.set('run:secs', G.secs); syncModes(); };
  syncModes();
  $('startKey').onclick = () => { G.input = 'key'; stopCam(); $('pads').hidden = false; begin(); };
  $('startCam').onclick = async () => {
    const btn = $('startCam'); btn.disabled = true; $('menuTip').textContent = '인식 모델을 내려받는 중입니다 (처음 한 번만)';
    try {
      await loadPose(); await startCam();
      G.input = 'cam'; $('pads').hidden = true; begin();
    } catch (e) {
      $('menuTip').innerHTML = `카메라를 쓸 수 없습니다 (${K.esc(e.message || e.name || '오류')}).<br>‘카메라 없이 하기’를 눌러 주세요.`;
    } finally { btn.disabled = false; }
  };

  /* ---------- 한 프레임 ---------- */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (G.phase === 'play') update(dt);
    else if (G.phase === 'count' || G.phase === 'end') { G.v = Math.max(0, G.v - DRAG * 2 * dt); G.dist += G.v * dt; }
    draw(dt);
    requestAnimationFrame(frame);
  }
  function update(dt) {
    G.t -= dt;
    if (G.t <= 0) { G.t = 0; updateHud(); finish(); return; }
    G.v = Math.max(0, G.v - DRAG * dt);
    if (G.stun > 0) G.stun -= dt;
    G.best = Math.max(G.best, G.v);
    G.dist += G.v * dt; G.run += G.v * dt * 1.7;
    // 점프
    if (G.y > 0 || G.vy > 0) { G.vy -= GRAV * dt; G.y = Math.max(0, G.y + G.vy * dt); if (G.y === 0) G.vy = 0; }
    // 허들 만들기 (앞쪽에)
    while (G.nextHurdle < G.dist + 40) { G.hurdles.push({ x: G.nextHurdle, hit: false, ok: false }); G.nextHurdle += K.rand(16, 30); }
    // 부딪힘 · 넘음
    G.hurdles.forEach(h => {
      if (h.hit || h.ok) return;
      if (Math.abs(h.x - G.dist) < HURDLE_HALF && G.y < HURDLE_HIT) {
        h.hit = true; G.hits++; G.v *= .3; G.stun = .5; G.shake = .35; K.sound.beep();
        floatText('걸림', playerX() - 30, groundY() - H * .35);
      } else if (G.dist > h.x + HURDLE_HALF) {
        h.ok = true; G.cleared++; K.sound.tick();
        floatText('통과', playerX() - 30, groundY() - H * .4);
      }
    });
    G.hurdles = G.hurdles.filter(h => h.x > G.dist - 20);
    updateHud();
  }
  let hudSec = -1;
  function updateHud() {
    const s = Math.ceil(G.t);
    if (s !== hudSec) { hudSec = s; $('hTime').textContent = s; if (G.phase === 'play' && s <= 3 && s > 0) K.sound.beep(); }
    $('hDist').textContent = Math.round(G.dist) + 'm';
    $('hSpeed').textContent = Math.round(G.v * 3.6);
    $('hBar').style.width = (100 * G.v / MAX_V) + '%';
  }

  /* ---------- 그리기 ---------- */
  const groundY = () => H * .8;
  const ppm = () => H / 8.5;                 // 1m 가 몇 픽셀인지
  const playerX = () => W * .24;
  function draw(dt) {
    if (!W) return;
    const gY = groundY(), m = ppm();
    let sx = 0, sy = 0;
    if (G.shake > 0) { G.shake -= dt; sx = (Math.random() - .5) * 14; sy = (Math.random() - .5) * 10; }
    cx.save(); cx.translate(sx, sy);

    // 하늘
    const sky = cx.createLinearGradient(0, 0, 0, gY);
    sky.addColorStop(0, '#8fd0ff'); sky.addColorStop(1, '#fff1d6');
    cx.fillStyle = sky; cx.fillRect(-20, -20, W + 40, gY + 20);
    // 해
    cx.fillStyle = '#ffd25a'; cx.beginPath(); cx.arc(W * .82, H * .18, H * .08, 0, 7); cx.fill();
    // 구름 (아주 천천히)
    cx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 0.31 * W - G.dist * m * .05) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * .15, y = H * (.12 + (i % 2) * .1);
      cloud(x, y, H * .05);
    }
    // 먼 산 (느리게)
    layer(m * .12, gY - H * .05, H * .3, '#9cc7b4', 420, 1);
    // 가까운 언덕
    layer(m * .35, gY - H * .01, H * .16, '#6fae7f', 260, 2);
    // 트랙
    cx.fillStyle = '#d8653a'; cx.fillRect(-20, gY, W + 40, H - gY + 20);
    cx.fillStyle = '#c4532b'; cx.fillRect(-20, gY, W + 40, H * .02);
    cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.lineWidth = 3;
    [.35, .7].forEach(f => { cx.beginPath(); cx.moveTo(0, gY + (H - gY) * f); cx.lineTo(W, gY + (H - gY) * f); cx.stroke(); });
    // 10m 표시
    cx.fillStyle = '#fff'; cx.font = `700 ${Math.round(H * .035)}px "Barlow Condensed", "Pretendard Variable", sans-serif`; cx.textAlign = 'center';
    const first = Math.floor((G.dist - playerX() / m) / 10) * 10;
    for (let d = first; d < G.dist + (W - playerX()) / m + 10; d += 10) {
      if (d <= 0) continue;
      const x = playerX() + (d - G.dist) * m;
      cx.fillRect(x - 2, gY, 4, (H - gY) * .35);
      cx.fillText(d + 'm', x, gY + (H - gY) * .62);
    }
    // 허들
    G.hurdles.forEach(h => {
      const hx = playerX() + (h.x - G.dist) * m;
      hurdle(hx, gY, m, h.hit);
      // 다가오는 허들 위에 "점프" 신호
      const ahead = h.x - G.dist;
      if (G.phase === 'play' && !h.hit && !h.ok && ahead > 0 && ahead < Math.max(6, G.v * .9)) {
        cx.font = `800 ${Math.round(m * .34)}px "Pretendard Variable", sans-serif`; cx.textAlign = 'center';
        cx.lineWidth = 5; cx.strokeStyle = '#16213a'; cx.fillStyle = ahead < Math.max(3, G.v * .45) ? '#ffd25a' : '#ffffff';
        const by = gY - HURDLE_H * m - m * .35 - Math.abs(Math.sin(G.run * 3)) * m * .12;
        cx.strokeText('점프', hx, by); cx.fillText('점프', hx, by);
      }
    });
    // 그림자 + 캐릭터
    const py = gY - G.y * m;
    cx.fillStyle = 'rgba(0,0,0,.18)';
    cx.beginPath(); cx.ellipse(playerX(), gY + 4, m * .35 * (1 - Math.min(.5, G.y)), m * .08, 0, 0, 7); cx.fill();
    runner(playerX(), py, m);
    // 속도 줄
    if (G.v > 6) {
      cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { const y = py - m * (.4 + i * .25), len = m * (G.v - 5) * .25; const x = playerX() - m * .6 - ((G.run * 40 + i * 37) % 30); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - len, y); cx.stroke(); }
    }
    cx.restore();
  }
  function cloud(x, y, r) { cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.arc(x + r * 1.1, y - r * .4, r * 1.2, 0, 7); cx.arc(x + r * 2.2, y, r, 0, 7); cx.fill(); }
  function layer(speed, base, amp, color, wave, seed) {
    const off = (G.dist * speed) % wave;
    cx.fillStyle = color; cx.beginPath(); cx.moveTo(-20, base + 40);
    for (let x = -20; x <= W + 20; x += 10) {
      const t = (x + off) / wave * Math.PI * 2;
      cx.lineTo(x, base - amp * (.55 + .3 * Math.sin(t + seed) + .15 * Math.sin(t * 2.3 + seed * 2)));
    }
    cx.lineTo(W + 20, base + 40); cx.closePath(); cx.fill();
  }
  function hurdle(x, gY, m, hit) {
    if (x < -m || x > W + m) return;
    const h = HURDLE_H * m, w = m * .5;
    cx.save(); cx.translate(x, gY);
    if (hit) cx.rotate(.5);
    cx.fillStyle = '#ffffff'; cx.fillRect(-w / 2, -h, m * .07, h); cx.fillRect(w / 2 - m * .07, -h, m * .07, h);
    for (let i = 0; i < 4; i++) { cx.fillStyle = i % 2 ? '#ffffff' : '#d8323c'; cx.fillRect(-w / 2 + (w / 4) * i, -h, w / 4, m * .12); }
    cx.restore();
  }
  // 도복 입은 꼬마 (기합 오리지널)
  function runner(x, y, m) {
    const air = G.y > .02, ph = G.run * 2.4;
    const swing = air ? 0 : Math.sin(ph) * Math.min(1, G.v / 4 + .15);
    const hip = { x, y: y - m * .62 }, shoulder = { x: x + m * .06, y: y - m * 1.05 };
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    const limb = (ox, oy, a1, a2, l1, l2, col, wdt) => {
      const kx = ox + Math.sin(a1) * l1, ky = oy + Math.cos(a1) * l1;
      const fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
      cx.strokeStyle = col; cx.lineWidth = wdt; cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(kx, ky); cx.lineTo(fx, fy); cx.stroke();
    };
    const L = m * .32, legW = m * .16;
    // 뒷다리 · 뒷팔 (조금 어둡게)
    if (air) limb(hip.x, hip.y, -.9, .6, L, L, '#d9d4c8', legW);
    else limb(hip.x, hip.y, -swing * .9, -swing * .9 + (swing > 0 ? .9 : .2), L, L, '#d9d4c8', legW);
    limb(shoulder.x, shoulder.y, swing * 1.1, swing * 1.1 - 1.2, m * .22, m * .2, '#d9d4c8', m * .12);
    // 몸통 (도복)
    cx.fillStyle = '#ffffff'; cx.strokeStyle = '#16213a'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(hip.x - m * .17, shoulder.y - m * .04, m * .36, hip.y - shoulder.y + m * .1, m * .1); cx.fill(); cx.stroke();
    // 띠
    cx.fillStyle = '#d8323c'; cx.fillRect(hip.x - m * .18, hip.y - m * .1, m * .38, m * .08);
    cx.fillRect(hip.x - m * .26, hip.y - m * .08, m * .1, m * .05 + Math.sin(ph * 2) * m * .02);
    // 앞다리 · 앞팔
    if (air) limb(hip.x, hip.y, .7, -.5, L, L, '#ffffff', legW);
    else limb(hip.x, hip.y, swing * .9, swing * .9 + (swing < 0 ? .9 : .2), L, L, '#ffffff', legW);
    limb(shoulder.x, shoulder.y, -swing * 1.1, -swing * 1.1 - 1.2, m * .22, m * .2, '#ffffff', m * .12);
    // 머리
    const hx = shoulder.x + m * .04, hy = shoulder.y - m * .26;
    cx.fillStyle = '#ffd9b3'; cx.beginPath(); cx.arc(hx, hy, m * .22, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = '#2b1d14'; cx.beginPath(); cx.arc(hx - m * .02, hy - m * .06, m * .21, Math.PI * 1.05, Math.PI * 1.95); cx.fill();
    // 머리띠 (휘날림)
    cx.fillStyle = '#d8323c'; cx.fillRect(hx - m * .22, hy - m * .1, m * .44, m * .07);
    cx.beginPath(); cx.moveTo(hx - m * .2, hy - m * .08); cx.lineTo(hx - m * .5, hy - m * .14 + Math.sin(ph * 3) * m * .05); cx.lineTo(hx - m * .48, hy - m * .02); cx.closePath(); cx.fill();
    // 눈 · 입
    cx.fillStyle = '#16213a'; cx.beginPath(); cx.arc(hx + m * .1, hy + m * .02, m * .03, 0, 7); cx.fill();
    cx.lineWidth = 2; cx.beginPath(); cx.arc(hx + m * .08, hy + m * .08, m * .06, .1, Math.PI * .7); cx.stroke();
  }
  // 오래된 브라우저용
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };

  requestAnimationFrame(frame);
  addEventListener('beforeunload', stopCam);
})();

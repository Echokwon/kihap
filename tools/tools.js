/* 기합 — 수업 도구 8가지 */
(function () {
  const K = Kihap, $ = id => document.getElementById(id), now = () => performance.now();
  const num = (id, min, max, def) => { let v = parseFloat($(id).value); if (!isFinite(v)) v = def; return Math.min(max, Math.max(min, v)); };
  const awake = () => { K._wantAwake = true; K.keepAwake(true); };

  const TOOLS = [
    { id: 'timer', ic: '⏲️', name: '타이머', go: 'timerGo' },
    { id: 'interval', ic: '🔁', name: '인터벌', go: 'ivGo' },
    { id: 'stopwatch', ic: '⏱️', name: '스톱워치', go: 'swGo' },
    { id: 'dice', ic: '🎲', name: '주사위', go: 'diceGo' },
    { id: 'draw', ic: '🎯', name: '랜덤 뽑기', go: 'drawGo' },
    { id: 'bracket', ic: '🏆', name: '토너먼트', go: null },
    { id: 'signal', ic: '🚥', name: '반응 신호', go: 'sigGo' },
    { id: 'bomb', ic: '💣', name: '폭탄 돌리기', go: 'bombGo' }
  ];
  const leave = {};   // 다른 도구로 갈 때 멈춰야 하는 것들

  /* ================= 화면 전환 ================= */
  $('tabs').innerHTML = TOOLS.map(t => `<a href="#${t.id}" data-id="${t.id}">${t.ic} ${t.name}</a>`).join('');
  let cur = null;
  function route() {
    const id = (location.hash.slice(1) || 'timer');
    const t = TOOLS.find(x => x.id === id) || TOOLS[0];
    if (cur && cur !== t.id && leave[cur]) leave[cur]();
    cur = t.id;
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'p-' + t.id);
    document.querySelectorAll('#tabs a').forEach(a => a.removeAttribute('aria-current'));
    const on = document.querySelector(`#tabs a[data-id="${t.id}"]`);
    if (on) { on.setAttribute('aria-current', 'page'); on.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    $('tbTitle').textContent = t.ic + ' ' + t.name;
    document.title = t.name + ' · 기합';
    K.markLast(t.id, t.name);
  }
  addEventListener('hashchange', route);

  // 스페이스바 = 지금 도구의 시작 버튼
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) return;
    const t = TOOLS.find(x => x.id === cur);
    if (t && t.go) { e.preventDefault(); $(t.go).click(); }
  });

  const syncBtns = () => { $('muteBtn').textContent = K.muted() ? '🔇' : '🔊'; $('themeBtn').textContent = K.isDark() ? '☀️' : '🌙'; };
  $('muteBtn').onclick = () => { K.setMuted(!K.muted()); syncBtns(); K.toast(K.muted() ? '소리 꺼짐' : '소리 켜짐'); };
  $('themeBtn').onclick = () => { K.toggleTheme(); syncBtns(); };
  $('fsBtn').onclick = () => { const p = document.querySelector('.panel:not([hidden]) .stage'); K.fullscreen(p); };
  syncBtns();

  const chipGroup = (id, onPick) => {
    const box = $(id);
    box.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
      onPick(b.dataset.v, b);
    });
  };

  /* ================= ⏲️ 타이머 ================= */
  (function () {
    const C = 2 * Math.PI * 90, ring = $('timerRing'), stage = $('timerStage');
    ring.style.strokeDasharray = C;
    let total = K.get('timer:total', 60000), remain = total, running = false, endAt = 0, iv = null, lastSec = null;
    const PRESETS = [[10, '10초'], [30, '30초'], [60, '1분'], [120, '2분'], [180, '3분'], [300, '5분'], [600, '10분']];
    $('timerPresets').innerHTML = PRESETS.map(([s, l]) => `<button class="chip" data-v="${s}">${l}</button>`).join('');
    chipGroup('timerPresets', v => setTotal(+v * 1000));

    function render() {
      $('timerText').textContent = K.fmt(remain);
      ring.style.strokeDashoffset = C * (1 - (total ? remain / total : 0));
      stage.classList.toggle('warn', running && remain <= 10000);
      $('timerGo').textContent = running ? '멈춤' : (remain < total && remain > 0 ? '계속' : '시작');
    }
    function setTotal(ms) {
      stop(); total = Math.max(1000, ms); remain = total; K.set('timer:total', total);
      $('timerMin').value = Math.floor(total / 60000); $('timerSec').value = Math.floor(total / 1000) % 60;
      stage.classList.remove('flash'); render();
    }
    function tick() {
      remain = endAt - now();
      const s = Math.ceil(remain / 1000);
      if (s !== lastSec) { lastSec = s; if (s > 0 && s <= 3) K.sound.beep(); }
      if (remain <= 0) { remain = 0; stop(); K.sound.end(); stage.classList.remove('flash'); void stage.offsetWidth; stage.classList.add('flash'); }
      render();
    }
    function start() { if (remain <= 0) remain = total; running = true; endAt = now() + remain; lastSec = null; stage.classList.remove('flash'); iv = setInterval(tick, 100); awake(); K.sound.pop(); render(); }
    function stop() { running = false; clearInterval(iv); render(); }
    $('timerGo').onclick = () => running ? stop() : start();
    $('timerReset').onclick = () => { stop(); remain = total; stage.classList.remove('flash'); render(); };
    $('timerSet').onclick = () => setTotal((num('timerMin', 0, 99, 1) * 60 + num('timerSec', 0, 59, 0)) * 1000);
    setTotal(total);
  })();

  /* ================= 🔁 인터벌 ================= */
  (function () {
    const stage = $('ivStage');
    const NAMES = { prep: '준비', work: '운동!', rest: '휴식', done: '끝! 수고했어요' };
    const PRESETS = [['타바타', 10, 20, 10, 8], ['30/30 ×6', 10, 30, 30, 6], ['40/20 ×5', 10, 40, 20, 5], ['1분/30초 ×5', 10, 60, 30, 5]];
    $('ivPresets').innerHTML = PRESETS.map((p, i) => `<button class="chip" data-v="${i}">${p[0]}</button>`).join('');
    chipGroup('ivPresets', i => { const p = PRESETS[i]; ['ivPrep', 'ivWork', 'ivRest', 'ivRounds'].forEach((id, k) => $(id).value = p[k + 1]); reset(); });

    const saved = K.get('iv:cfg', null);
    if (saved) ['ivPrep', 'ivWork', 'ivRest', 'ivRounds'].forEach((id, k) => $(id).value = saved[k]);

    let plan = [], idx = 0, remain = 0, running = false, endAt = 0, iv = null, lastSec = null;
    function build() {
      const prep = num('ivPrep', 0, 300, 10), work = num('ivWork', 1, 3600, 20), rest = num('ivRest', 0, 3600, 10), R = Math.round(num('ivRounds', 1, 99, 8));
      K.set('iv:cfg', [prep, work, rest, R]);
      plan = [];
      if (prep > 0) plan.push({ type: 'prep', dur: prep * 1000, round: 0 });
      for (let r = 1; r <= R; r++) {
        plan.push({ type: 'work', dur: work * 1000, round: r });
        if (rest > 0 && r < R) plan.push({ type: 'rest', dur: rest * 1000, round: r });
      }
      plan.R = R;
    }
    function render() {
      const p = plan[idx];
      const type = !p ? 'done' : (!running && idx === 0 && remain === p.dur ? 'idle' : p.type);
      stage.dataset.phase = type === 'idle' ? 'idle' : type;
      $('ivPhase').textContent = type === 'idle' ? '준비됐나요?' : NAMES[type];
      $('ivText').textContent = p ? K.fmt(remain) : '0:00';
      $('ivRound').textContent = p && p.round === 0 ? `총 ${plan.R} 라운드` : `라운드 ${p ? p.round : plan.R} / ${plan.R}`;
      $('ivBar').style.width = p ? (100 * (1 - remain / p.dur)) + '%' : '100%';
      $('ivGo').textContent = running ? '멈춤' : (type === 'idle' || type === 'done' ? '시작' : '계속');
    }
    function enter(i) {
      idx = i; const p = plan[idx];
      if (!p) { stop(); K.sound.end(); if ($('ivVoice').checked) K.say('끝! 수고했어요'); render(); return; }
      remain = p.dur; endAt = now() + remain; lastSec = null;
      if (p.type === 'work') { K.sound.go(); if ($('ivVoice').checked) K.say('운동'); }
      else if (p.type === 'rest') { K.sound.whistle(); if ($('ivVoice').checked) K.say('휴식'); }
      else if ($('ivVoice').checked) K.say('준비');
    }
    function tick() {
      remain = endAt - now();
      const s = Math.ceil(remain / 1000);
      if (s !== lastSec) { lastSec = s; if (s > 0 && s <= 3) K.sound.beep(); }
      if (remain <= 0) enter(idx + 1);
      render();
    }
    function start() {
      if (!plan[idx]) reset();
      const fresh = idx === 0 && remain === plan[0].dur;
      running = true; iv = setInterval(tick, 100); awake();
      if (fresh) enter(0); else endAt = now() + remain;
      render();
    }
    function stop() { running = false; clearInterval(iv); render(); }
    function reset() { stop(); build(); idx = 0; remain = plan[0].dur; render(); }
    $('ivGo').onclick = () => running ? stop() : start();
    $('ivReset').onclick = reset;
    ['ivPrep', 'ivWork', 'ivRest', 'ivRounds'].forEach(id => $(id).addEventListener('change', () => { if (!running) reset(); }));
    reset();
  })();

  /* ================= ⏱️ 스톱워치 ================= */
  (function () {
    let acc = 0, startT = 0, running = false, raf = 0, laps = [];
    const elapsed = () => acc + (running ? now() - startT : 0);
    const fmt = ms => { const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000), m = Math.floor(s / 60);
      return { main: (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'), cs: '.' + String(cs).padStart(2, '0') }; };
    function render() {
      const f = fmt(elapsed());
      $('swText').innerHTML = `${f.main}<small>${f.cs}</small>`;
      $('swGo').textContent = running ? '정지' : (acc > 0 ? '계속' : '시작');
      $('swLap').disabled = !running;
    }
    function loop() { render(); if (running) raf = requestAnimationFrame(loop); }
    $('swGo').onclick = () => {
      if (running) { acc += now() - startT; running = false; cancelAnimationFrame(raf); }
      else { startT = now(); running = true; awake(); loop(); }
      K.sound.pop(); render();
    };
    $('swLap').onclick = () => {
      const t = elapsed(), prev = laps.length ? laps[laps.length - 1] : 0; laps.push(t);
      const a = fmt(t), d = fmt(t - prev);
      $('swLaps').insertAdjacentHTML('afterbegin', `<li><span>${laps.length}번째</span><span>+${d.main}${d.cs}</span><span>${a.main}${a.cs}</span></li>`);
      K.sound.tick();
    };
    $('swReset').onclick = () => { running = false; cancelAnimationFrame(raf); acc = 0; laps = []; $('swLaps').innerHTML = ''; render(); };
    render();
  })();

  /* ================= 🎲 주사위 ================= */
  (function () {
    const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const DEF = ['팔굽혀펴기 10회', '스쿼트 15회', '점핑잭 20회', '버피 5회', '앞차기 20회', '쉬어요 🎉'];
    let mode = K.get('dice:mode', 'num'), count = K.get('dice:count', 1), rolling = false;
    $('diceFaces').value = K.get('dice:faces', DEF).join('\n');
    const faces = () => { const f = $('diceFaces').value.split('\n').map(s => s.trim()).filter(Boolean); return f.length ? f : DEF; };
    $('diceFaces').addEventListener('input', () => K.set('dice:faces', faces()));

    const dieHTML = v => mode === 'num'
      ? `<div class="die"><div class="pips ${v === 1 ? 'one' : ''}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div></div>`
      : `<div class="die ex">${K.esc(v)}</div>`;
    const pick = () => mode === 'num' ? K.randInt(1, 6) : faces()[K.randInt(0, faces().length - 1)];
    function show(vals, anim) {
      $('diceRow').innerHTML = vals.map(dieHTML).join('');
      if (anim) $('diceRow').querySelectorAll('.die').forEach(d => d.classList.add('rolling'));
    }
    function sync() {
      document.querySelectorAll('#diceMode .chip').forEach(c => c.classList.toggle('on', c.dataset.v === mode));
      document.querySelectorAll('#diceCount .chip').forEach(c => c.classList.toggle('on', +c.dataset.v === count));
      $('diceFacesWrap').hidden = mode !== 'ex';
      show(Array.from({ length: count }, () => mode === 'num' ? 6 : '?'));
      $('diceResult').textContent = '';
    }
    chipGroup('diceMode', v => { mode = v; K.set('dice:mode', v); sync(); });
    chipGroup('diceCount', v => { count = +v; K.set('dice:count', count); sync(); });
    $('diceGo').onclick = () => {
      if (rolling) return; rolling = true; $('diceResult').textContent = '';
      K.sound.roll();
      let n = 0; const t = setInterval(() => {
        show(Array.from({ length: count }, pick));
        if (++n >= 8) {
          clearInterval(t);
          const vals = Array.from({ length: count }, pick); show(vals, true);
          $('diceResult').textContent = mode === 'num' ? (count > 1 ? `합계 ${vals.reduce((a, b) => a + b, 0)}` : `${vals[0]}!`) : vals.join(' + ');
          K.sound.pop(); rolling = false;
        }
      }, 70);
    };
    sync();
  })();

  /* ================= 🎯 랜덤 뽑기 · 팀 나누기 ================= */
  (function () {
    const TEAM_COLORS = ['#d8323c', '#2457c5', '#18995a', '#e8a500', '#8a3ffc', '#0f8b8d', '#c2410c', '#be185d', '#475569', '#65a30d'];
    $('drawNames').value = K.get('draw:names', '');
    let used = new Set(K.get('draw:used', [])), busy = false;
    const names = () => [...new Set($('drawNames').value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
    const saveUsed = () => K.set('draw:used', [...used]);
    function info() {
      const all = names(), left = all.filter(n => !used.has(n)).length;
      $('drawInfo').textContent = all.length ? `명단 ${all.length}명 · ${$('drawNoRepeat').checked ? `아직 안 뽑힌 사람 ${left}명` : '매번 전체에서 뽑아요'}` : '이름을 먼저 넣어 주세요.';
    }
    $('drawNames').addEventListener('input', () => { K.set('draw:names', $('drawNames').value); info(); });
    $('drawNoRepeat').addEventListener('change', info);
    $('drawResetUsed').onclick = () => { used.clear(); saveUsed(); info(); K.toast('뽑힌 기록을 지웠어요'); };

    $('drawGo').onclick = () => {
      if (busy) return;
      const all = names(); if (!all.length) { K.toast('이름을 먼저 넣어 주세요'); $('drawNames').focus(); return; }
      const noRep = $('drawNoRepeat').checked;
      let pool = noRep ? all.filter(n => !used.has(n)) : all;
      if (!pool.length) { used.clear(); saveUsed(); pool = all; K.toast('모두 한 번씩 뽑혔어요. 처음부터 다시!'); }
      const n = Math.min(Math.round(num('drawN', 1, 50, 1)), pool.length);
      const winners = K.shuffle(pool).slice(0, n);
      const show = $('drawShow'); $('drawTeams').innerHTML = ''; busy = true;
      let step = 0; const steps = 18;
      (function spin() {
        show.className = 'draw-show spin'; show.textContent = all[K.randInt(0, all.length - 1)]; K.sound.tick();
        if (++step < steps) return setTimeout(spin, 40 + step * step * 1.1);
        show.className = 'draw-show hit';
        show.innerHTML = n === 1 ? K.esc(winners[0]) : `<div class="draw-many">${winners.map(w => `<span>${K.esc(w)}</span>`).join('')}</div>`;
        K.sound.fanfare();
        if (noRep) { winners.forEach(w => used.add(w)); saveUsed(); }
        busy = false; info();
      })();
    };

    $('teamGo').onclick = () => {
      const all = names(); const T = Math.round(num('teamN', 2, 10, 2));
      if (all.length < T) { K.toast(`팀 ${T}개를 만들려면 ${T}명 이상 필요해요`); return; }
      const teams = Array.from({ length: T }, () => []);
      K.shuffle(all).forEach((n, i) => teams[i % T].push(n));
      $('drawShow').className = 'draw-show'; $('drawShow').textContent = `${T}팀 완성!`;
      $('drawTeams').innerHTML = teams.map((t, i) => `<div class="team" style="background:${TEAM_COLORS[i]}"><h3>${i + 1}팀</h3><ul>${t.map(n => `<li>${K.esc(n)}</li>`).join('')}</ul></div>`).join('');
      K.sound.fanfare();
    };
    info();
  })();

  /* ================= 🏆 토너먼트 ================= */
  (function () {
    $('brNames').value = K.get('br:names', '');
    $('brNames').addEventListener('input', () => K.set('br:names', $('brNames').value));
    let rounds = [];
    const roundName = m => m === 1 ? '결승' : m === 2 ? '준결승' : (m * 2) + '강';

    function make() {
      let list = [...new Set($('brNames').value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))];
      if (list.length < 2) { K.toast('2명 이상 넣어 주세요'); return; }
      if (list.length > 64) { K.toast('64명까지 돼요'); list = list.slice(0, 64); }
      if ($('brShuffle').checked) list = K.shuffle(list);
      let size = 1; while (size < list.length) size *= 2;
      const slots = list.concat(Array(size - list.length).fill(null));
      // 1번 vs 꼴찌 방식으로 짝지어서 부전승이 서로 만나지 않게
      const first = [];
      for (let i = 0; i < size / 2; i++) first.push({ a: slots[i], b: slots[size - 1 - i], w: null });
      rounds = [first];
      for (let m = size / 4; m >= 1; m /= 2) rounds.push(Array.from({ length: m }, () => ({ a: null, b: null, w: null })));
      recompute(); render();
    }
    function recompute() {
      rounds[0].forEach(m => { if (m.a == null || m.b == null) m.w = m.a == null ? m.b : m.a; });  // 부전승
      for (let r = 1; r < rounds.length; r++) rounds[r].forEach((m, i) => {
        m.a = rounds[r - 1][2 * i].w; m.b = rounds[r - 1][2 * i + 1].w;
        if (m.w != null && m.w !== m.a && m.w !== m.b) m.w = null;
        if (m.a == null || m.b == null) m.w = null;
      });
    }
    function btn(m, r, i, side) {
      const v = m[side], other = side === 'a' ? m.b : m.a;
      const bye = r === 0 && v != null && other == null;
      if (v == null) return `<button disabled>${r === 0 ? '부전승' : '—'}</button>`;
      const cls = m.w == null ? '' : (m.w === v ? 'win' : 'lose');
      return `<button class="${cls}" data-r="${r}" data-i="${i}" data-s="${side}" ${bye || other == null ? 'disabled' : ''}>${K.esc(v)}</button>`;
    }
    function render() {
      $('bracket').innerHTML = rounds.map((ms, r) => `<div class="round"><h3>${roundName(ms.length)}</h3>${ms.map((m, i) => `<div class="match">${btn(m, r, i, 'a')}${btn(m, r, i, 'b')}</div>`).join('')}</div>`).join('');
      const champ = rounds.length && rounds[rounds.length - 1][0].w;
      $('champ').hidden = !champ;
      if (champ) $('champ').innerHTML = `🏆 ${K.esc(champ)}<small>우승을 축하해요!</small>`;
    }
    $('bracket').addEventListener('click', e => {
      const b = e.target.closest('button[data-r]'); if (!b) return;
      const m = rounds[+b.dataset.r][+b.dataset.i], v = m[b.dataset.s];
      const before = rounds[rounds.length - 1][0].w;
      m.w = m.w === v ? null : v;
      recompute(); render();
      const after = rounds[rounds.length - 1][0].w;
      if (after && !before) K.sound.fanfare(); else K.sound.pop();
    });
    $('brMake').onclick = make;
  })();

  /* ================= 🚥 반응 신호 ================= */
  (function () {
    const stage = $('sigStage');
    const COLORS = [['#18995a', '달려!'], ['#d8323c', '멈춰!'], ['#e8a500', '앉아!'], ['#2457c5', '점프!']];
    let labels = K.get('sig:labels', COLORS.map(c => c[1]));
    const ARROWS = [['←', '왼쪽'], ['→', '오른쪽'], ['↑', '앞으로'], ['↓', '뒤로']];
    let mode = 'color', running = false, to = null, last = -1;

    function legend() {
      $('sigLegend').innerHTML = mode === 'color'
        ? COLORS.map((c, i) => `<label><i style="background:${c[0]}"></i><input data-i="${i}" value="${K.esc(labels[i])}" aria-label="색 ${i + 1} 뜻"></label>`).join('')
        : '';
    }
    $('sigLegend').addEventListener('input', e => { const i = e.target.dataset.i; if (i == null) return; labels[+i] = e.target.value; K.set('sig:labels', labels); });
    chipGroup('sigMode', v => { stop(); mode = v; legend(); idle(); });

    function paint(bg, fg, big, sub) {
      stage.style.background = bg || ''; stage.style.color = fg || '';
      $('sigBig').textContent = big; $('sigSub').textContent = sub || '';
    }
    function idle() { paint('', '', '준비', mode === 'go' ? '시작을 누르면 "준비…" 뒤에 출발!' : '시작을 누르세요'); }
    const pickNew = n => { let i; do { i = K.randInt(0, n - 1); } while (n > 1 && i === last); last = i; return i; };
    function next() {
      if (!running) return;
      let say = '';
      if (mode === 'color') { const i = pickNew(4); paint(COLORS[i][0], '#fff', labels[i] || ' ', ''); say = labels[i]; }
      else if (mode === 'arrow') { const i = pickNew(4); paint('var(--navy)', '#fff', ARROWS[i][0], ARROWS[i][1]); say = ARROWS[i][1]; }
      else if (mode === 'number') { const i = pickNew(5); paint('var(--navy)', '#fff', String(i + 1), `${i + 1}명씩 모여!`); say = (i + 1) + '명'; }
      K.sound.pop(); if ($('sigVoice').checked && say) K.say(say);
      schedule(next);
    }
    function schedule(fn) {
      let a = num('sigMin', .5, 30, 1.5), b = num('sigMax', .5, 30, 4); if (b < a) [a, b] = [b, a];
      to = setTimeout(fn, K.rand(a, b) * 1000);
    }
    function start() {
      running = true; awake(); $('sigGo').textContent = '멈춤';
      if (mode === 'go') {
        paint('var(--yellow)', '#1b1300', '준비…', '신호를 기다려요'); K.sound.beep(); if ($('sigVoice').checked) K.say('준비');
        schedule(() => { if (!running) return; paint('var(--green)', '#fff', '출발!', ''); K.sound.whistle(); running = false; $('sigGo').textContent = '다시'; });
      } else next();
    }
    function stop() { running = false; clearTimeout(to); $('sigGo').textContent = '시작'; }
    $('sigGo').onclick = () => { if (running) { stop(); idle(); } else start(); };
    leave.signal = () => { stop(); idle(); };
    legend(); idle();
  })();

  /* ================= 💣 폭탄 돌리기 ================= */
  (function () {
    const stage = $('bombStage');
    let lit = false, startT = 0, dur = 0, to = null;
    const msg = t => $('bombMsg').textContent = t;
    function tickLoop() {
      if (!lit) return;
      const p = Math.min(1, (now() - startT) / dur);
      if (p >= 1) return boom();
      (p > .5 ? K.sound.tick : K.sound.tock)();
      const gap = 1000 - 860 * p;
      stage.style.setProperty('--shake', Math.max(.08, .5 - .42 * p) + 's');
      to = setTimeout(tickLoop, Math.min(gap, Math.max(0, startT + dur - now())));
    }
    function boom() {
      lit = false; clearTimeout(to); stage.dataset.st = 'boom';
      K.sound.boom(); msg('펑! 💥 폭탄을 든 사람은 벌칙 운동!');
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      $('bombGo').textContent = '다시 불 붙이기';
    }
    function light() {
      let a = num('bombMin', 3, 300, 10), b = num('bombMax', 3, 300, 30); if (b < a) [a, b] = [b, a];
      dur = K.rand(a, b) * 1000; startT = now(); lit = true; stage.dataset.st = 'lit'; awake();
      msg('째깍째깍… 빨리 넘겨요!'); $('bombGo').textContent = '불 붙는 중…'; tickLoop();
    }
    function stop() { lit = false; clearTimeout(to); stage.dataset.st = 'idle'; msg('폭탄을 옆 사람에게 넘겨요!'); $('bombGo').textContent = '불 붙이기'; }
    $('bombGo').onclick = () => { if (!lit) light(); };
    $('bombStop').onclick = stop;
    leave.bomb = stop;
  })();

  route();
})();

/* 기합 — 겨루기 스코어보드: 청 vs 홍 · 3라운드 · 2선승 */
(function () {
  const K = Kihap, $ = id => document.getElementById(id), now = () => performance.now();
  K.topbar('📊 스코어보드', `<button class="btn icon" id="fsBtn" aria-label="전체 화면">⛶</button>`);
  K.markLast('scoreboard', '스코어보드');

  const NAME = { b: '청', r: '홍' };
  let cfg = Object.assign({ round: 120, rest: 60 }, K.get('sb:cfg', {}));
  const fresh = () => ({ names: { b: '청', r: '홍' }, score: { b: 0, r: 0 }, gam: { b: 0, r: 0 }, round: 1, wins: { b: 0, r: 0 }, phase: 'ready', remain: cfg.round * 1000, log: [], winner: null });
  let S = Object.assign(fresh(), K.get('sb:state', {}));
  if (S.phase === 'fight' || S.phase === 'rest') S.paused = true;   // 새로 열면 멈춘 상태로
  let history = [], running = false, endAt = 0, iv = null, lastSec = null;

  const save = () => K.set('sb:state', S);
  const snap = () => { history.push(JSON.stringify(S)); if (history.length > 200) history.shift(); };

  /* ---------- 그리기 ---------- */
  function render() {
    ['b', 'r'].forEach(s => {
      const up = s.toUpperCase();
      $('s' + up).textContent = S.score[s];
      $('g' + up).textContent = '감점 ' + S.gam[s];
      $('w' + up).querySelectorAll('i').forEach((i, k) => i.classList.toggle('on', k < S.wins[s]));
      if (document.activeElement !== $('n' + up)) $('n' + up).value = S.names[s];
    });
    $('roundLbl').textContent = S.phase === 'done' ? '경기 끝' : `${S.round} 라운드`;
    const P = { ready: '준비', fight: running ? '경기 중' : '멈춤', rest: running ? '쉬는 시간' : '쉬는 시간 · 멈춤', done: '경기 끝' };
    $('phase').textContent = P[S.phase]; $('phase').dataset.p = S.phase;
    $('clock').textContent = K.fmt(S.remain);
    $('clock').classList.toggle('warn', S.phase === 'fight' && S.remain <= 10000);
    $('clock').classList.toggle('rest', S.phase === 'rest');
    $('hist').innerHTML = S.log.map(K.esc).join('<br>');
    $('go').textContent = S.phase === 'done' ? '경기 끝' : running ? '⏸ 멈춤' : (S.phase === 'ready' ? '▶ 시작' : '▶ 계속');
    $('go').disabled = S.phase === 'done';
    $('endRound').disabled = S.phase !== 'fight';
    $('undo').disabled = !history.length;
    const w = $('winner');
    w.hidden = !S.winner;
    if (S.winner) w.innerHTML = `<span>${NAME[S.winner]} 승리 · ${S.wins.b} : ${S.wins.r}</span><b style="color:${S.winner === 'b' ? '#6ea0ff' : '#ff6b73'}">🏆 ${K.esc(S.names[S.winner])}</b><span>‘경기 새로 시작’을 누르면 다음 경기</span>`;
  }
  const bump = s => { const el = $('s' + s.toUpperCase()); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };

  /* ---------- 점수 ---------- */
  function add(s, n) {
    if (S.phase === 'done') return;
    if (n < 0 && S.score[s] <= 0) return;
    snap(); S.score[s] = Math.max(0, S.score[s] + n); save(); render(); bump(s);
    n > 0 ? K.sound.pop() : K.sound.tick();
  }
  function gamjeom(s) {
    if (S.phase === 'done') return;
    const o = s === 'b' ? 'r' : 'b';
    snap(); S.gam[s]++; S.score[o]++; save(); render(); bump(o); K.sound.whistle();
    K.toast(`${NAME[s]} 감점 → ${NAME[o]} +1`);
  }
  document.querySelectorAll('.pads').forEach(p => {
    const s = p.dataset.side;
    p.innerHTML = [1, 2, 3, 4, 5].map(n => `<button data-n="${n}" aria-label="${NAME[s]} +${n}">+${n}</button>`).join('') +
      `<button class="minus" data-n="-1" aria-label="${NAME[s]} −1">−1</button><button class="gamb" data-g aria-label="${NAME[s]} 감점">감점</button>`;
    p.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.g != null) gamjeom(s); else add(s, +b.dataset.n);
    });
  });
  ['b', 'r'].forEach(s => $('n' + s.toUpperCase()).addEventListener('input', e => { S.names[s] = e.target.value.trim() || NAME[s]; save(); }));

  /* ---------- 시계 ---------- */
  function startClock() {
    running = true; S.paused = false; endAt = now() + S.remain; lastSec = null;
    clearInterval(iv); iv = setInterval(tick, 100); K._wantAwake = true; K.keepAwake(true); render();
  }
  function stopClock() { running = false; clearInterval(iv); S.paused = true; save(); render(); }
  function tick() {
    S.remain = Math.max(0, endAt - now());
    const sec = Math.ceil(S.remain / 1000);
    if (sec !== lastSec) { lastSec = sec; if (S.phase === 'fight' && sec > 0 && sec <= 10) K.sound.beep(); if (S.phase === 'rest' && sec > 0 && sec <= 3) K.sound.beep(); }
    if (S.remain <= 0) {
      running = false; clearInterval(iv);
      if (S.phase === 'fight') { K.sound.end(); endRound(); }
      else if (S.phase === 'rest') { K.sound.whistle(); S.phase = 'ready'; S.remain = cfg.round * 1000; save(); K.toast(`${S.round} 라운드 준비!`); }
    }
    render();
  }
  $('go').onclick = () => {
    if (S.phase === 'done') return;
    if (running) return stopClock();
    if (S.phase === 'ready') { S.phase = 'fight'; K.sound.whistle(); }
    startClock();
  };

  /* ---------- 라운드 ---------- */
  function endRound() {
    running = false; clearInterval(iv);
    const { b, r } = S.score;
    if (b !== r) return roundWin(b > r ? 'b' : 'r', '점수');
    render();
    K.modal(`<h2>${S.round}라운드 동점 (${b} : ${r})</h2><p class="hint" style="margin:0">심판 판정으로 이긴 쪽을 골라 주세요 (우세승).</p>
      <div class="row"><button class="btn big" style="flex:1;background:var(--chung);border-color:var(--chung);color:#fff" data-w="b">청 ${K.esc(S.names.b)}</button>
      <button class="btn big" style="flex:1;background:var(--hong);border-color:var(--hong);color:#fff" data-w="r">홍 ${K.esc(S.names.r)}</button></div>`,
    (m, close) => m.querySelectorAll('[data-w]').forEach(btn => btn.onclick = () => { close(); roundWin(btn.dataset.w, '우세'); }));
  }
  function roundWin(s, how) {
    snap();
    S.wins[s]++;
    S.log.push(`${S.round}R ${S.score.b}:${S.score.r} → ${NAME[s]} ${how}승`);
    if (S.wins[s] >= 2 || S.round >= 3) {
      S.phase = 'done'; S.winner = S.wins.b > S.wins.r ? 'b' : 'r'; S.remain = 0;
      K.sound.fanfare();
    } else {
      S.round++; S.score = { b: 0, r: 0 }; S.gam = { b: 0, r: 0 };
      S.phase = 'rest'; S.remain = cfg.rest * 1000;
      K.toast(`${NAME[s]} ${S.round - 1}라운드 승! 쉬는 시간`);
      if (cfg.rest > 0) startClock(); else { S.phase = 'ready'; S.remain = cfg.round * 1000; }
    }
    save(); render();
  }
  $('endRound').onclick = async () => { if (S.phase !== 'fight') return; if (running) stopClock(); if (await K.confirm(`${S.round}라운드를 지금 끝낼까요? (${S.score.b} : ${S.score.r})`, '라운드 끝')) { K.sound.end(); endRound(); } };

  /* ---------- 되돌리기 · 리셋 · 설정 ---------- */
  function undo() {
    if (!history.length) return;
    if (running) { running = false; clearInterval(iv); }
    S = JSON.parse(history.pop()); S.paused = true; save(); render(); K.toast('되돌렸어요');
  }
  $('undo').onclick = undo;
  $('reset').onclick = async () => {
    if (S.phase !== 'ready' || S.round > 1 || S.score.b || S.score.r) { if (!(await K.confirm('경기를 처음부터 다시 시작할까요? (선수 이름은 그대로)', '새로 시작'))) return; }
    running = false; clearInterval(iv);
    const names = S.names; S = fresh(); S.names = names; history = []; save(); render();
  };
  $('settings').onclick = () => K.modal(`<h2>시간 설정</h2>
      <div class="grid2"><label class="field">라운드 (초)<input id="cR" type="number" min="10" max="600" value="${cfg.round}" inputmode="numeric"></label>
      <label class="field">쉬는 시간 (초)<input id="cS" type="number" min="0" max="300" value="${cfg.rest}" inputmode="numeric"></label></div>
      <div class="chips">${[[60, 30], [90, 30], [120, 60], [180, 60]].map(([a, b]) => `<button class="chip" data-p="${a},${b}">${K.fmt(a * 1000)} / 휴식 ${b}초</button>`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="cOk">저장</button></div>`,
    (m, close) => {
      m.querySelectorAll('[data-p]').forEach(c => c.onclick = () => { const [a, b] = c.dataset.p.split(','); m.querySelector('#cR').value = a; m.querySelector('#cS').value = b; });
      m.querySelector('#cOk').onclick = () => {
        cfg.round = Math.min(600, Math.max(10, +m.querySelector('#cR').value || 120));
        cfg.rest = Math.min(300, Math.max(0, +m.querySelector('#cS').value || 0));
        K.set('sb:cfg', cfg);
        if (S.phase === 'ready') { S.remain = cfg.round * 1000; save(); }
        close(); render(); K.toast('저장했어요');
      };
    });

  $('fsBtn').onclick = () => K.fullscreen($('board').parentElement);

  /* ---------- 키보드 ---------- */
  const KEYS = { q: ['b', 1], w: ['b', 2], e: ['b', 3], r: ['b', 4], t: ['b', 5], a: ['b', -1], y: ['r', 1], u: ['r', 2], i: ['r', 3], o: ['r', 4], p: ['r', 5], l: ['r', -1] };
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal-back') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) { e.preventDefault(); add(...KEYS[k]); }
    else if (k === 'z') gamjeom('b');
    else if (k === 'm') gamjeom('r');
    else if (e.code === 'Space') { e.preventDefault(); $('go').click(); }
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (k === 'f') $('fsBtn').click();
  });

  render();
})();

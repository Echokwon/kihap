/* 기합 — 겨루기 스코어보드: 청 vs 홍 · 3라운드 · 2선승 */
(function () {
  const K = Kihap, $ = id => document.getElementById(id), now = () => performance.now();
  K.topbar('스코어보드', `<button class="btn icon" id="fsBtn" aria-label="전체 화면">${K.icon('maximize')}</button>`, 'chart-column');
  K.markLast('scoreboard', '스코어보드');

  const NAME = { b: '청', r: '홍' };
  let cfg = Object.assign({ round: 120, rest: 60 }, K.get('sb:cfg', {}));
  const fresh = () => ({ names: { b: '청', r: '홍' }, score: { b: 0, r: 0 }, gam: { b: 0, r: 0 }, round: 1, wins: { b: 0, r: 0 }, phase: 'ready', remain: cfg.round * 1000, log: [], winner: null });
  let S = Object.assign(fresh(), K.get('sb:state', {}));
  if (S.phase === 'fight' || S.phase === 'rest') S.paused = true;   // 새로 열면 멈춘 상태로
  let history = [], running = false, endAt = 0, iv = null, lastSec = null;

  const save = () => K.set('sb:state', S);
  // 되돌리기 기록. 점수·감점은 그 숫자만 적어 두고(되돌려도 시계·진행·이름은 그대로),
  // 라운드 결과는 그 라운드가 끝난 순간을 통째로 적어 둔다(되돌릴 때 이름만 지금 것을 유지)
  const keep = h => { history.push(h); if (history.length > 200) history.shift(); };
  const snapPt = () => keep({ t: 'pt', score: { ...S.score }, gam: { ...S.gam } });
  const snapRound = () => keep({ t: 'round', s: JSON.stringify(S) });

  /* ---------- 그리기 ---------- */
  // 내용이 달라졌을 때만 다시 쓴다. 시계가 0.1초마다 화면을 고치는데, 그때마다 버튼 속을 새로 만들면
  // 아이콘 위에서 마우스를 누르고 있는 사이에 그 아이콘이 사라져 클릭이 먹지 않는다
  const put = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
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
    put($('hist'), S.log.map(K.esc).join('<br>'));
    put($('go'), S.phase === 'done' ? '경기 끝' : running ? K.icon('pause') + '멈춤' : K.icon('play') + (S.phase === 'ready' ? '시작' : '계속'));
    $('go').disabled = S.phase === 'done';
    $('endRound').disabled = S.phase !== 'fight';
    $('undo').disabled = !history.length;
    const w = $('winner');
    w.hidden = !S.winner;
    if (S.winner) put(w, `<span>${NAME[S.winner]} 승리 · ${S.wins.b} : ${S.wins.r}</span><b style="color:${S.winner === 'b' ? '#6ea0ff' : '#ff6b73'}">${K.icon('trophy')}${K.esc(S.names[S.winner])}</b><span>‘경기 새로 시작’을 누르면 다음 경기</span>`);
  }
  const bump = s => { const el = $('s' + s.toUpperCase()); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };

  /* ---------- 점수 ---------- */
  function add(s, n) {
    if (S.phase === 'done') return;
    if (n < 0 && S.score[s] <= 0) return;
    snapPt(); S.score[s] = Math.max(0, S.score[s] + n); save(); render(); bump(s);
    n > 0 ? K.sound.pop() : K.sound.tick();
  }
  function gamjeom(s) {
    if (S.phase === 'done') return;
    const o = s === 'b' ? 'r' : 'b';
    snapPt(); S.gam[s]++; S.score[o]++; save(); render(); bump(o); K.sound.whistle();
    K.toast(`${NAME[s]} 감점 · ${NAME[o]} +1`);
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
  ['b', 'r'].forEach(s => {
    const el = $('n' + s.toUpperCase());
    el.addEventListener('input', e => { S.names[s] = e.target.value.trim() || NAME[s]; save(); });
    // 이름을 다 쓰고 Enter 를 누르면 칸에서 빠져나옴 (칸 안에 있는 동안에는 단축키가 글자로 들어가므로). 한글 조합 중의 Enter 는 제외
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) el.blur(); });
  });

  /* ---------- 시계 ---------- */
  function startClock() {
    running = true; S.paused = false; endAt = now() + S.remain; lastSec = null;
    clearInterval(iv); iv = setInterval(tick, 100); K._wantAwake = true; K.keepAwake(true); save(); render();
  }
  function stopClock() { if (running) S.remain = Math.max(0, endAt - now()); running = false; clearInterval(iv); S.paused = true; save(); render(); }
  function tick() {
    S.remain = Math.max(0, endAt - now());
    const sec = Math.ceil(S.remain / 1000);
    if (sec !== lastSec) {
      lastSec = sec; if (S.phase === 'fight' && sec > 0 && sec <= 10) K.sound.beep(); if (S.phase === 'rest' && sec > 0 && sec <= 3) K.sound.beep();
      save();                                    // 1초에 한 번 저장: 경기 중에 새로 고쳐도 시계가 앞으로 되돌아가지 않게
    }
    if (S.remain <= 0) {
      running = false; clearInterval(iv);
      if (S.phase === 'fight') { K.sound.end(); endRound(); }
      else if (S.phase === 'rest') { K.sound.whistle(); S.phase = 'ready'; S.remain = cfg.round * 1000; save(); K.toast(`${S.round}라운드 준비`); }
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
    S.paused = true; save(); render();
    // 동점은 꼭 골라야 하는 창이라 바깥을 누르거나 Esc 로는 닫히지 않는다.
    // 점수가 잘못 들어가 동점이 된 경우를 위해 ‘점수 고치기’를 둔다 (고르지 않고 닫힘 · 라운드는 멈춘 채 그대로)
    K.modal(`<h2>${S.round}라운드 동점 (${b} : ${r})</h2><p class="hint" style="margin:0">심판 판정으로 이긴 쪽을 골라 주세요 (우세승). 점수가 잘못 들어갔다면 ‘점수 고치기’를 누르세요.</p>
      <div class="row"><button class="btn big" style="flex:1;background:var(--chung);border-color:var(--chung);color:#fff" data-w="b">청 ${K.esc(S.names.b)}</button>
      <button class="btn big" style="flex:1;background:var(--hong);border-color:var(--hong);color:#fff" data-w="r">홍 ${K.esc(S.names.r)}</button></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>점수 고치기</button></div>`,
    (m, close) => {
      m.querySelectorAll('[data-w]').forEach(btn => btn.onclick = () => { close(); roundWin(btn.dataset.w, '우세'); });
      // 초점을 창으로 옮겨 둠: 키보드만 쓰는 전체 화면에서 Tab 한 번에 창 안의 버튼으로 가고, 스페이스가 엉뚱한 버튼을 누르지 않게
      m.tabIndex = -1; m.style.outline = 'none'; setTimeout(() => m.focus(), 30);
    },
    { dismiss: false, onClose: why => { if (why === 'cancel') K.toast(S.remain > 0 ? '점수를 고친 뒤 ‘라운드 끝내기’를 누르세요' : '점수를 고친 뒤 ‘계속’(스페이스)을 누르면 라운드가 끝납니다', 4500); } });
  }
  function roundWin(s, how) {
    snapRound();
    S.wins[s]++;
    S.log.push(`${S.round}R ${S.score.b}:${S.score.r} · ${NAME[s]} ${how}승`);
    if (S.wins[s] >= 2 || S.round >= 3) {
      S.phase = 'done'; S.winner = S.wins.b > S.wins.r ? 'b' : 'r'; S.remain = 0;
      K.sound.fanfare();
    } else {
      S.round++; S.score = { b: 0, r: 0 }; S.gam = { b: 0, r: 0 };
      S.phase = 'rest'; S.remain = cfg.rest * 1000;
      K.toast(`${NAME[s]} ${S.round - 1}라운드 승 · 쉬는 시간`);
      if (cfg.rest > 0) startClock(); else { S.phase = 'ready'; S.remain = cfg.round * 1000; }
    }
    save(); render();
  }
  $('endRound').onclick = async () => {
    if (S.phase !== 'fight') return;
    const was = running; if (was) stopClock();   // 물어보는 동안에는 시계를 세워 둠
    if (await K.confirm(`${S.round}라운드를 지금 끝낼까요? (${S.score.b} : ${S.score.r})`, '라운드 끝')) { K.sound.end(); endRound(); }
    else if (was && S.phase === 'fight' && !running) startClock();   // 취소하면 하던 경기를 그대로 이어 감
  };

  /* ---------- 되돌리기 · 리셋 · 설정 ---------- */
  // 되돌리는 것은 방금 한 그 일 하나뿐. 선수 이름은 어떤 경우에도 되돌리지 않는다
  function undo() {
    const h = history.pop(); if (!h) return;
    if (h.t === 'pt') {                          // 점수 · −1 · 감점: 숫자만 되돌림. 시계는 계속 가고 진행 상태도 그대로
      S.score = h.score; S.gam = h.gam; K.toast('점수를 되돌렸습니다');
    } else {                                     // 라운드 결과: 그 라운드가 끝난 순간으로 돌아가 멈춰 있음
      if (running) { running = false; clearInterval(iv); }
      const names = S.names; S = JSON.parse(h.s); S.names = names; S.paused = true;
      K.toast(`${S.round}라운드 결과를 되돌렸습니다`);
    }
    save(); render();
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
    if (K.typing() || document.querySelector('.modal-back') || e.ctrlKey || e.metaKey || e.altKey) return;
    // 글자 키는 눌린 자리(e.code: KeyQ …)로 읽는다. 한글 입력 상태에서는 e.key 가 'ㅂ' 이나 'Process' 로 와서 단축키가 먹지 않기 때문
    const k = /^Key[A-Z]$/.test(e.code || '') ? e.code[3].toLowerCase() : (e.key && e.key.length === 1 ? e.key.toLowerCase() : '');
    const act = KEYS[k] ? () => add(...KEYS[k]) : k === 'z' ? () => gamjeom('b') : k === 'm' ? () => gamjeom('r')
      : e.code === 'Space' || e.key === ' ' ? () => $('go').click() : e.key === 'Backspace' ? undo : k === 'f' ? () => $('fsBtn').click() : null;
    if (!act) return;
    e.preventDefault();
    if (!e.repeat) act();                        // 키를 누르고 있어도 한 번만 (점수가 줄줄이 올라가거나 시계가 켜졌다 꺼졌다 하지 않게)
  });

  render();
})();

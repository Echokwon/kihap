/* 기합 — 품새 채점: 공인 품새 · 자유 품새, 심판 1/3/5명 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  K.topbar('🥋 품새 채점');
  K.markLast('poomsae', '품새 채점');

  /* ---------- 채점 규칙 (점수는 0.1 단위 정수로 저장해서 소수 오차를 막음) ---------- */
  const RULES = {
    std: {
      name: '공인 품새',
      parts: [{ k: 'acc', name: '정확성', max: 4.0 }, { k: 'pre', name: '표현성', max: 6.0 }],
      pre: [['속도와 힘', 5, 20, 10], ['강약과 리듬', 5, 20, 10], ['기의 표현', 5, 20, 10]],   // [이름, 최소, 최대, 기본] (0.1 단위)
      tie: '표현성'
    },
    free: {
      name: '자유 품새',
      parts: [{ k: 'tec', name: '기술', max: 6.0 }, { k: 'pre', name: '표현', max: 4.0 }],
      tec: [['뛰어옆차기 높이', 0, 12, 6], ['뛰어앞차기 발차기 수', 0, 12, 6], ['회전 발차기', 0, 12, 6], ['연속 겨루기 발차기', 0, 12, 6], ['아크로바틱', 0, 12, 6]],
      pre: [['창의성', 0, 10, 5], ['조화', 0, 10, 5], ['기의 표현', 0, 10, 5], ['음악·안무', 0, 10, 5]],
      tie: '기술'
    }
  };
  const f1 = n => (n / 10).toFixed(1), f2 = n => (Math.round(n * 100) / 100).toFixed(2);

  /* ---------- 상태 ---------- */
  const qs = new URLSearchParams(location.search);
  let mode = qs.get('mode') === 'free' ? 'free' : (qs.get('mode') === 'std' ? 'std' : K.get('ps:mode', 'std'));
  let P = null, tab = 'list', judge = 0, showMode = 'rank', showDiv = '', resDiv = '';
  const load = () => { P = Object.assign({ judges: 3, list: [], cur: '' }, K.get('ps:' + mode, {})); };
  const save = () => K.set('ps:' + mode, P);
  load();
  const R = () => RULES[mode];
  const cur = () => P.list.find(c => c.id === P.cur) || P.list[0];
  const divs = () => [...new Set(P.list.map(c => c.div).filter(Boolean))];

  function newSheet() {
    return mode === 'std' ? { d: [], p: R().pre.map(x => x[3]), done: false } : { t: R().tec.map(x => x[3]), p: R().pre.map(x => x[3]), done: false };
  }
  function sheet(c, j) { c.sheets = c.sheets || []; if (!c.sheets[j]) c.sheets[j] = newSheet(); return c.sheets[j]; }
  // 심판 한 명의 영역별 점수 (실수 값)
  function judgeParts(s) {
    const sum = a => a.reduce((x, y) => x + y, 0);
    return mode === 'std' ? { acc: Math.max(0, 40 - sum(s.d)) / 10, pre: sum(s.p) / 10 } : { tec: sum(s.t) / 10, pre: sum(s.p) / 10 };
  }
  // 선수 최종 점수: 심판 5명이면 영역마다 가장 높은·낮은 점수를 빼고 평균
  function result(c) {
    const N = P.judges, sheets = Array.from({ length: N }, (_, j) => (c.sheets || [])[j]);
    const done = sheets.filter(s => s && s.done).length;
    if (done < N) return { ready: false, done, N };
    const per = sheets.map(judgeParts), parts = {}, dropped = {};
    R().parts.forEach(({ k }) => {
      const vals = per.map(p => p[k]);
      let use = vals.map((v, i) => i), drop = [];
      if (N === 5) {
        const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
        drop = [order[0], order[4]]; use = order.slice(1, 4);
      }
      parts[k] = use.reduce((a, i) => a + vals[i], 0) / use.length;
      dropped[k] = drop;
    });
    const ded = mode === 'free' ? (c.ded || []).reduce((a, b) => a + b, 0) / 10 : 0;
    const total = Math.round((R().parts.reduce((a, { k }) => a + Math.round(parts[k] * 100) / 100, 0) - ded) * 100) / 100;
    return { ready: true, per, parts, dropped, ded, total: Math.max(0, total), N };
  }
  // div: null = 전체, 문자열 = 그 부문만 ('' = 부문 없는 선수)
  function ranking(div) {
    const list = P.list.filter(c => div == null || (c.div || '') === div).map(c => ({ c, r: result(c) }));
    const done = list.filter(x => x.r.ready), wait = list.filter(x => !x.r.ready);
    const tk = mode === 'std' ? 'pre' : 'tec', ok = mode === 'std' ? 'acc' : 'pre';
    const key = x => [x.r.total, Math.round(x.r.parts[tk] * 100), Math.round(x.r.parts[ok] * 100)];
    done.sort((a, b) => { const A = key(a), B = key(b); return B[0] - A[0] || B[1] - A[1] || B[2] - A[2]; });
    done.forEach((x, i) => {
      const p = done[i - 1];
      x.rank = p && key(p).join() === key(x).join() ? p.rank : i + 1;
      x.tie = (p && p.rank === x.rank) || (done[i + 1] && key(done[i + 1]).join() === key(x).join());
    });
    return { done, wait };
  }

  /* ---------- 상단: 종목 · 심판 수 ---------- */
  function renderTop() {
    document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.m === mode));
    $('judgeN').innerHTML = [1, 3, 5].map(n => `<button class="chip ${P.judges === n ? 'on' : ''}" data-n="${n}">심판 ${n}명</button>`).join('');
    $('rule').textContent = (P.judges === 5 ? '심판 5명: 영역마다 가장 높은 점수와 가장 낮은 점수를 빼고 나머지 3명 평균. ' : `심판 ${P.judges}명: 영역마다 ${P.judges > 1 ? '평균' : '그대로'}. `) +
      `동점이면 ${R().tie} 점수가 높은 선수가 앞, 그래도 같으면 공동 순위.`;
  }
  $('modeSeg').onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return;
    mode = b.dataset.m; K.set('ps:mode', mode); load(); judge = 0; resDiv = ''; showDiv = '';
    history.replaceState(null, '', '?mode=' + mode); renderAll();
  };
  $('judgeN').onclick = e => { const c = e.target.closest('[data-n]'); if (!c) return; P.judges = +c.dataset.n; if (judge >= P.judges) judge = 0; save(); renderAll(); };

  /* ---------- 탭 ---------- */
  const RENDER = {};
  function show(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    document.querySelectorAll('.tabp').forEach(p => p.hidden = p.id !== 't-' + t);
    RENDER[t]();
  }
  $('tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
  function renderAll() { renderTop(); RENDER[tab](); }

  /* ================= 👥 선수 명단 ================= */
  RENDER.list = function () {
    const el = $('t-list');
    el.innerHTML = `
      <div class="box" style="display:grid;gap:10px">
        <h2 style="font-size:1.3rem">${R().name} 선수 추가</h2>
        <div class="add-row">
          <label class="field">이름<input id="aName" placeholder="김민준"></label>
          <label class="field">소속<input id="aTeam" placeholder="한빛 태권도"></label>
          <label class="field">부문<input id="aDiv" list="divList" placeholder="초등부 고학년"><datalist id="divList">${divs().map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
          <button class="btn primary" id="aAdd">추가</button>
        </div>
        <div class="row"><button class="btn" id="aBulk">📋 여러 명 한꺼번에</button><button class="btn danger" id="aClear" ${P.list.length ? '' : 'disabled'}>${R().name} 명단·점수 모두 지우기</button></div>
      </div>
      ${P.list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>이름</th><th>소속</th><th>부문</th><th>채점</th><th></th></tr></thead><tbody>
        ${P.list.map((c, i) => { const r = result(c); return `<tr><td>${i + 1}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.team || '')}</td><td>${esc(c.div || '')}</td>
          <td>${r.ready ? `<span class="pill ok">${f2(r.total)}</span>` : `<span class="pill">${r.done}/${r.N}</span>`}</td>
          <td><button class="btn sm" data-go="${c.id}">채점</button> <button class="btn sm danger" data-del="${c.id}" aria-label="${esc(c.name)} 삭제">삭제</button></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="box empty"><b>👥</b>선수를 추가하면 채점을 시작할 수 있어요.</div>`}`;
    const addOne = () => {
      const name = $('aName').value.trim(); if (!name) { K.toast('이름을 넣어 주세요'); $('aName').focus(); return; }
      P.list.push({ id: D.uid(), name, team: $('aTeam').value.trim(), div: $('aDiv').value.trim(), sheets: [], ded: [] });
      save(); const team = $('aTeam').value, div = $('aDiv').value; RENDER.list(); $('aTeam').value = team; $('aDiv').value = div; $('aName').focus();
    };
    $('aAdd').onclick = addOne;
    $('aName').onkeydown = e => { if (e.key === 'Enter') addOne(); };
    $('aBulk').onclick = () => K.modal(`<h2>여러 명 한꺼번에</h2><p class="hint" style="margin:0">한 줄에 한 명: <b>이름, 소속, 부문</b> (엑셀에서 복사해도 돼요)</p>
      <label class="field">명단<textarea id="bT" rows="8" placeholder="김민준, 한빛 태권도, 초등부&#10;이서연, 바른 태권도, 초등부"></textarea></label>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="bGo">추가</button></div>`,
    (m, close) => m.querySelector('#bGo').onclick = () => {
      const rows = m.querySelector('#bT').value.split('\n').map(l => l.split(/[,\t]/).map(x => x.trim())).filter(r => r[0]);
      rows.forEach(([name, team, div]) => P.list.push({ id: D.uid(), name, team: team || '', div: div || '', sheets: [], ded: [] }));
      save(); close(); RENDER.list(); K.toast(`${rows.length}명 추가했어요`);
    });
    $('aClear').onclick = async () => { if (await K.confirm(`${R().name} 선수 명단과 점수를 모두 지울까요?`, '모두 지우기')) { P.list = []; P.cur = ''; save(); RENDER.list(); } };
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { P.cur = b.dataset.go; judge = 0; save(); show('score'); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const c = P.list.find(x => x.id === b.dataset.del);
      if (await K.confirm(`${esc(c.name)} 선수를 지울까요? 점수도 함께 지워져요.`, '지우기')) { P.list = P.list.filter(x => x !== c); save(); RENDER.list(); }
    });
  };

  /* ================= ✍️ 채점 ================= */
  RENDER.score = function () {
    const el = $('t-score'), c = cur();
    if (!c) { el.innerHTML = `<div class="box empty"><b>✍️</b>‘선수 명단’에서 선수를 먼저 추가해 주세요.</div>`; return; }
    P.cur = c.id;
    const s = sheet(c, judge), jp = judgeParts(s), r = result(c), idx = P.list.indexOf(c);
    const item = (grp, i, [name, min, max]) => `<div class="item"><span>${name}</span><button data-st="${grp},${i},-1" aria-label="${name} 0.1 내리기">−</button><b>${f1(s[grp][i])}</b><button data-st="${grp},${i},1" aria-label="${name} 0.1 올리기">+</button>
      <input type="range" min="${min}" max="${max}" step="1" value="${s[grp][i]}" data-rg="${grp},${i}" aria-label="${name}"></div>`;
    const sheetHTML = mode === 'std' ? `
      <div class="comp"><div class="comp-head"><h3>정확성 <small class="muted">(4.0에서 빼기)</small></h3><b>${jp.acc.toFixed(1)}</b></div>
        <div class="ded-btns"><button class="btn big" data-ded="1">작은 실수<br>−0.1</button><button class="btn big primary" data-ded="3">큰 실수<br>−0.3</button><button class="btn big" data-dedu ${s.d.length ? '' : 'disabled'} aria-label="실수 되돌리기">↶</button></div>
        <div class="ded-log">${s.d.length ? `작은 실수 ${s.d.filter(x => x === 1).length}번 · 큰 실수 ${s.d.filter(x => x === 3).length}번` : '실수 없음'}</div></div>
      <div class="comp"><div class="comp-head"><h3>표현성 <small class="muted">(항목당 0.5~2.0)</small></h3><b>${jp.pre.toFixed(1)}</b></div>
        ${R().pre.map((x, i) => item('p', i, x)).join('')}</div>` : `
      <div class="comp"><div class="comp-head"><h3>기술 <small class="muted">(항목당 0.0~1.2)</small></h3><b>${jp.tec.toFixed(1)}</b></div>
        ${R().tec.map((x, i) => item('t', i, x)).join('')}</div>
      <div class="comp"><div class="comp-head"><h3>표현 <small class="muted">(항목당 0.0~1.0)</small></h3><b>${jp.pre.toFixed(1)}</b></div>
        ${R().pre.map((x, i) => item('p', i, x)).join('')}</div>`;
    const jTotal = R().parts.reduce((a, { k }) => a + jp[k], 0);

    el.innerHTML = `
      <div class="score-grid">
        <div class="box" style="display:grid;gap:12px">
          <div class="who"><button class="btn icon" id="prevC" ${idx > 0 ? '' : 'disabled'} aria-label="이전 선수">‹</button>
            <select class="search" id="pickC" aria-label="선수">${P.list.map(x => `<option value="${x.id}" ${x === c ? 'selected' : ''}>${esc(x.name)}${x.div ? ' · ' + esc(x.div) : ''}${result(x).ready ? ' ✓' : ''}</option>`).join('')}</select>
            <button class="btn icon" id="nextC" ${idx < P.list.length - 1 ? '' : 'disabled'} aria-label="다음 선수">›</button></div>
          <div><div class="who-name">${esc(c.name)}</div><div class="hint">${esc([c.team, c.div].filter(Boolean).join(' · '))}</div></div>
          <div class="judges" role="tablist">${Array.from({ length: P.judges }, (_, j) => `<button role="tab" data-j="${j}" aria-selected="${j === judge}" class="${c.sheets && c.sheets[j] && c.sheets[j].done ? 'done' : ''}">심판 ${j + 1}</button>`).join('')}</div>
          ${sheetHTML}
          <div class="sheet-total"><span>심판 ${judge + 1} 합계 <b>${jTotal.toFixed(1)}</b></span>
            <button class="btn ${s.done ? '' : 'primary'} big" id="submit">${s.done ? '✓ 제출됨 (다시 고치기)' : '제출'}</button></div>
        </div>
        <div style="display:grid;gap:14px">
          ${mode === 'free' ? `<div class="box" style="display:grid;gap:8px"><h3 style="font-size:1.2rem">주심 감점 (선수 전체 점수에서 빼기)</h3>
            <div class="row"><button class="btn" data-cd="1">−0.1</button><button class="btn" data-cd="3">−0.3</button><button class="btn" data-cdu ${(c.ded || []).length ? '' : 'disabled'}>↶ 되돌리기</button>
            <b>감점 ${f1((c.ded || []).reduce((a, b) => a + b, 0))}</b></div><p class="hint">예: 시간 초과·경계선 벗어남 등</p></div>` : ''}
          ${summary(c, r)}
        </div>
      </div>`;

    $('pickC').onchange = e => { P.cur = e.target.value; judge = 0; save(); RENDER.score(); };
    $('prevC').onclick = () => { P.cur = P.list[idx - 1].id; judge = 0; save(); RENDER.score(); };
    $('nextC').onclick = () => { P.cur = P.list[idx + 1].id; judge = 0; save(); RENDER.score(); };
    el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { judge = +b.dataset.j; RENDER.score(); });
    const edit = fn => { if (s.done) { K.toast('제출된 점수예요. ‘다시 고치기’를 눌러 주세요'); return; } fn(); save(); RENDER.score(); };
    el.querySelectorAll('[data-ded]').forEach(b => b.onclick = () => edit(() => { s.d.push(+b.dataset.ded); K.sound.tick(); }));
    const du = el.querySelector('[data-dedu]'); if (du) du.onclick = () => edit(() => s.d.pop());
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => edit(() => {
      const [g, i, d] = b.dataset.st.split(','), def = (g === 't' ? R().tec : R().pre)[+i];
      s[g][+i] = Math.min(def[2], Math.max(def[1], s[g][+i] + +d));
    }));
    el.querySelectorAll('[data-rg]').forEach(rg => rg.onchange = () => edit(() => { const [g, i] = rg.dataset.rg.split(','); s[g][+i] = +rg.value; }));
    el.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { c.ded = c.ded || []; c.ded.push(+b.dataset.cd); save(); RENDER.score(); });
    const cdu = el.querySelector('[data-cdu]'); if (cdu) cdu.onclick = () => { c.ded.pop(); save(); RENDER.score(); };
    $('submit').onclick = () => {
      s.done = !s.done; save();
      if (s.done) {
        K.sound.pop();
        const next = Array.from({ length: P.judges }, (_, j) => j).find(j => !(c.sheets[j] && c.sheets[j].done));
        if (next != null) judge = next; else { K.sound.fanfare(); K.toast(`${c.name} 채점 완료: ${f2(result(c).total)}`); }
      }
      RENDER.score();
    };
  };
  function summary(c, r) {
    const parts = R().parts;
    const rows = Array.from({ length: P.judges }, (_, j) => {
      const s = (c.sheets || [])[j], jp = s ? judgeParts(s) : null;
      return `<tr><td>심판 ${j + 1} ${s && s.done ? '✓' : ''}</td>${parts.map(({ k }) => `<td class="num ${r.ready && r.dropped[k].includes(j) ? 'drop' : ''}">${jp && s.done ? jp[k].toFixed(1) : '—'}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="box" style="display:grid;gap:10px">
      <h3 style="font-size:1.2rem">점수 계산 ${P.judges === 5 ? '<small class="muted">(줄 그은 점수는 뺀 점수)</small>' : ''}</h3>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>심판</th>${parts.map(p => `<th class="num">${p.name}</th>`).join('')}</tr></thead><tbody>${rows}
        ${r.ready ? `<tr><td><b>평균</b></td>${parts.map(({ k }) => `<td class="num"><b>${f2(r.parts[k])}</b></td>`).join('')}</tr>` : ''}</tbody></table></div>
      <div class="final">${r.ready ? `최종 점수<b>${f2(r.total)}</b>${r.ded ? `<span>감점 −${r.ded.toFixed(1)} 포함</span>` : ''}` : `채점 중 · ${r.done} / ${r.N} 제출<b>—</b>`}</div></div>`;
  }

  /* ================= 🏅 결과 ================= */
  RENDER.result = function () {
    const el = $('t-result'), ds = divs();
    if (resDiv && !ds.includes(resDiv)) resDiv = '';
    const { done, wait } = ranking(resDiv || null), parts = R().parts;
    el.innerHTML = `
      <div class="toolbar"><div class="chips grow">${['', ...ds].map(d => `<button class="chip ${d === resDiv ? 'on' : ''}" data-d="${esc(d)}">${d ? esc(d) : '전체'}</button>`).join('')}</div>
        <button class="btn" id="csv" ${P.list.length ? '' : 'disabled'}>⬇ 엑셀(CSV)</button></div>
      ${done.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>순위</th><th>이름</th><th>소속</th><th>부문</th>${parts.map(p => `<th class="num">${p.name}</th>`).join('')}${mode === 'free' ? '<th class="num">감점</th>' : ''}<th class="num">총점</th></tr></thead><tbody>
        ${done.map(x => `<tr class="${x.rank === 1 ? 'rank1' : ''}"><td><b>${x.rank}위</b>${x.tie ? ' <span class="pill">공동</span>' : ''}</td><td><b>${esc(x.c.name)}</b></td><td>${esc(x.c.team || '')}</td><td>${esc(x.c.div || '')}</td>
          ${parts.map(({ k }) => `<td class="num">${f2(x.r.parts[k])}</td>`).join('')}${mode === 'free' ? `<td class="num">${x.r.ded ? '−' + x.r.ded.toFixed(1) : ''}</td>` : ''}<td class="num"><b>${f2(x.r.total)}</b></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="box empty"><b>🏅</b>아직 채점이 끝난 선수가 없어요.</div>`}
      ${wait.length ? `<p class="hint">채점 중: ${wait.map(x => `${esc(x.c.name)} (${x.r.done}/${x.r.N})`).join(', ')}</p>` : ''}
      <p class="hint">${$('rule').textContent}</p>`;
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { resDiv = b.dataset.d; RENDER.result(); });
    $('csv').onclick = () => {
      const rows = [['종목', '부문', '순위', '이름', '소속', ...parts.map(p => p.name), ...(mode === 'free' ? ['감점'] : []), '총점']];
      // 부문마다 따로 순위
      ds.concat(P.list.some(c => !c.div) ? [''] : []).forEach(d => {
        const { done: dn, wait: wt } = ranking(d);
        dn.forEach(x => rows.push([R().name, d, x.rank + (x.tie ? ' (공동)' : ''), x.c.name, x.c.team, ...parts.map(({ k }) => f2(x.r.parts[k])), ...(mode === 'free' ? [x.r.ded.toFixed(1)] : []), f2(x.r.total)]));
        wt.forEach(x => rows.push([R().name, d, '채점 중', x.c.name, x.c.team, ...parts.map(() => ''), ...(mode === 'free' ? [''] : []), '']));
      });
      D.download(`${R().name}_결과_${D.day()}.csv`, D.csv(rows), 'text/csv');
    };
  };

  /* ================= 📺 결과 발표 ================= */
  RENDER.show = function () {
    const el = $('t-show'), ds = divs();
    if (showDiv && !ds.includes(showDiv)) showDiv = '';
    el.innerHTML = `
      <div class="toolbar no-print">
        <div class="seg"><button data-sm="rank" aria-selected="${showMode === 'rank'}">순위</button><button data-sm="cur" aria-selected="${showMode === 'cur'}">지금 선수 점수</button></div>
        <select class="search" id="sDiv" style="width:auto" aria-label="부문">${['', ...ds].map(d => `<option value="${esc(d)}" ${d === showDiv ? 'selected' : ''}>${d ? esc(d) : '전체'}</option>`).join('')}</select>
        <span class="grow"></span><button class="btn" id="sFs">⛶ 전체 화면</button>
      </div>
      <div class="show" id="stage"></div>`;
    const st = $('stage');
    if (showMode === 'rank') {
      const { done } = ranking(showDiv || null);
      st.innerHTML = `<h2>🏆 ${esc(showDiv || R().name)} 결과</h2>` + (done.length
        ? `<div class="podium">${done.slice(0, 8).map((x, i) => `<div class="pod ${x.rank === 1 ? 'r1' : ''}" style="animation-delay:${(Math.min(done.length, 8) - i) * .25}s"><span class="rk">${x.rank === 1 ? '🥇' : x.rank === 2 ? '🥈' : x.rank === 3 ? '🥉' : x.rank}</span><span class="nm">${esc(x.c.name)}<small>${esc(x.c.team || '')}</small></span><span class="sc">${f2(x.r.total)}</span></div>`).join('')}</div>`
        : `<p style="text-align:center;opacity:.7">채점이 끝난 선수가 아직 없어요</p>`);
    } else {
      const c = cur(), r = c && result(c);
      st.innerHTML = c ? `<div class="cur-big"><div class="tm">${esc([c.team, c.div].filter(Boolean).join(' · ') || R().name)}</div><div class="nm">${esc(c.name)}</div>
        <div class="sc">${r.ready ? f2(r.total) : '채점 중'}</div>
        ${r.ready ? `<div class="parts">${R().parts.map(({ k, name }) => `<span>${name}<b>${f2(r.parts[k])}</b></span>`).join('')}${r.ded ? `<span>감점<b>−${r.ded.toFixed(1)}</b></span>` : ''}</div>` : `<div class="tm">${r.done} / ${r.N} 심판 제출</div>`}</div>`
        : `<p style="text-align:center">선수가 없어요</p>`;
    }
    el.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { showMode = b.dataset.sm; RENDER.show(); });
    $('sDiv').onchange = e => { showDiv = e.target.value; RENDER.show(); };
    $('sFs').onclick = () => K.fullscreen(st);
  };

  // 다른 탭에서 채점하면 결과 발표 화면도 바로 바뀌게
  addEventListener('storage', e => { if (e.key === 'kihap:ps:' + mode) { load(); renderAll(); } });

  renderTop(); show('list');
})();

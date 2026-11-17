/* 기합 — 원생 관리: 명단 · 회비 · 띠 · 출석 현황 · 설정 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  const I = (n, c) => K.icon(n, c);
  K.topbar('원생 관리', '', 'users');
  K.markLast('manage', '원생 관리');

  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const clsOptions = sel => `<option value="">반 없음</option>` + D.classes().map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const beltOptions = sel => D.BELTS.map(b => `<option ${b === sel ? 'selected' : ''}>${b}</option>`).join('');
  const OUT = '<span class="pill">퇴원</span>';

  /* ---------- 탭 ---------- */
  let tab = K.get('manage:tab', 'roster');
  const RENDER = {};
  function show(t) {
    if (!RENDER[t]) t = 'roster';
    tab = t; K.set('manage:tab', t);
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    document.querySelectorAll('.tabp').forEach(p => p.hidden = p.id !== 't-' + t);
    RENDER[t]();
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });

  // 기록이 바뀌면 보고 있는 탭을 다시 그린다. 단, 입력칸 하나를 고쳐 저장할 때(quiet)는 그리지 않는다 —
  // 탭을 통째로 새로 그리면 바로 이어서 누른 버튼·입력칸이 사라져 그 클릭이 먹히지 않고 초점도 달아나기 때문.
  // 다른 화면에서 바뀐 것(external)은 언제나 새로 그린다.
  let quiet = false, ext = 0;
  D.onChange((d, external) => { if (external) ext++; if ((!quiet || external) && RENDER[tab]) RENDER[tab](); });
  const saveQuiet = () => { quiet = true; try { return D.save(); } finally { quiet = false; } };
  // fn 안에서 한 저장이 받아들여졌는지. 다른 화면이 그사이 저장했으면 db.js 가 기록을 새로 읽고 안내를 띄우므로,
  // 그때는 ‘저장했습니다’ 같은 안내로 덮어쓰지 않는다.
  const kept = fn => { const n = ext; fn(); return n === ext; };

  // 달 입력칸. YYYY-MM 꼴일 때만 받아들인다 (크롬은 연도를 치는 도중에도 0002-11 같은 값으로 change 를 보냄).
  // 입력칸 자체는 다시 만들지 않으므로 치는 도중에 초점이 사라지지 않고, 칸을 떠날 때 틀린 값이 남아 있으면 보고 있는 달로 되돌린다.
  const isYm = v => /^20\d\d-(0[1-9]|1[0-2])$/.test(v);
  function monthInput(inp, get, set) {
    inp.oninput = inp.onchange = () => { if (isYm(inp.value) && inp.value !== get()) set(inp.value); };
    inp.onblur = () => { if (inp.value !== get()) inp.value = get(); };
  }

  /* ================= 원생 명단 ================= */
  const roster = { q: '', cls: '', all: false };
  RENDER.roster = function () {
    const el = $('t-roster');
    if (!el.dataset.ready) {
      el.dataset.ready = 1;
      el.innerHTML = `
        <div class="stats" id="rStats"></div>
        <div class="toolbar">
          <input class="search grow" id="rQ" type="search" placeholder="이름·번호·연락처 검색" aria-label="검색">
          <select class="search" id="rCls" style="width:auto" aria-label="반"></select>
          <label class="check"><input type="checkbox" id="rAll"> 퇴원생도 보기</label>
          <button class="btn" id="rPaste">${I('copy')}명단 한꺼번에 넣기</button>
          <button class="btn primary" id="rAdd">${I('plus')}원생 추가</button>
        </div>
        <div id="rList"></div>`;
      $('rQ').oninput = e => { roster.q = e.target.value.trim(); RENDER.roster(); };
      $('rCls').onchange = e => { roster.cls = e.target.value; RENDER.roster(); };
      $('rAll').onchange = e => { roster.all = e.target.checked; RENDER.roster(); };
      $('rAdd').onclick = () => editStudent(null);
      $('rPaste').onclick = bulkAdd;
    }
    if (roster.cls && !D.classes().some(c => c.id === roster.cls)) roster.cls = '';      // 고르던 반이 지워졌으면 ‘모든 반’으로
    $('rCls').innerHTML = `<option value="">모든 반</option>` + D.classes().map(c => `<option value="${c.id}" ${c.id === roster.cls ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const m = D.ym(), active = D.students();
    const paid = active.filter(s => D.feeOf(s.id, m)).length;
    const today = Object.keys(D.attendedOn()).length;
    $('rStats').innerHTML = `
      <div class="stat"><b>${active.length}</b><span>재원생</span></div>
      <div class="stat"><b>${today}</b><span>오늘 출석</span></div>
      <div class="stat"><b>${paid}/${active.length}</b><span>이번 달 회비 납부</span></div>
      <div class="stat"><b>${D.classes().length}</b><span>반</span></div>`;

    const q = roster.q.toLowerCase();
    const list = D.students(roster.all).filter(s =>
      (!roster.cls || s.cls === roster.cls) &&
      (!q || [s.name, s.pin, s.phone, s.parent].some(v => String(v || '').toLowerCase().includes(q))));
    if (!D.data.students.length) {
      $('rList').innerHTML = `<div class="box empty"><div>${I('users', 'xl')}</div>등록된 원생이 없습니다.<br>‘원생 추가’ 또는 ‘명단 한꺼번에 넣기’로 시작하세요.</div>`;
      return;
    }
    $('rList').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>이름</th><th>출석번호</th><th>반</th><th>띠</th><th>이번 달 출석</th><th>회비</th><th>보호자 연락처</th></tr></thead><tbody>
      ${list.map(s => `<tr class="click" data-id="${s.id}">
        <td><b>${esc(s.name)}</b> ${s.active === false ? OUT : ''}</td>
        <td>${esc(s.pin || '')}</td><td>${esc(D.className(s.cls))}</td><td>${D.beltChip(s.belt)}</td>
        <td>${D.monthCount(s.id)}일</td>
        <td>${D.feeOf(s.id, m) ? '<span class="pill ok">납부</span>' : '<span class="pill bad">미납</span>'}</td>
        <td>${esc(s.phone || '')}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">검색 결과가 없어요</td></tr>`}
      </tbody></table></div>`;
    $('rList').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editStudent(tr.dataset.id));
  };

  function editStudent(id) {
    const s = id ? D.student(id) : { name: '', pin: D.nextPin(), cls: roster.cls || '', belt: '흰띠', phone: '', parent: '', birth: '', fee: '', memo: '', active: true };
    if (!s) return;
    const hist = id ? D.beltHistory(id) : [];
    K.modal(`
      <h2>${id ? esc(s.name) + ' 정보' : '원생 추가'}</h2>
      <div class="grid2">
        <label class="field">이름 *<input id="fName" value="${esc(s.name)}" required></label>
        <label class="field">출석번호 (4자리)<input id="fPin" value="${esc(s.pin || '')}" inputmode="numeric" maxlength="4" pattern="\\d{4}"></label>
        <label class="field">반<select id="fCls">${clsOptions(s.cls)}</select></label>
        <label class="field">띠<select id="fBelt">${beltOptions(s.belt || '흰띠')}</select></label>
        <label class="field">생년월일<input id="fBirth" type="date" value="${esc(s.birth || '')}"></label>
        <label class="field">월 회비 (원)<input id="fFee" type="number" inputmode="numeric" value="${esc(s.fee || '')}" placeholder="${esc(D.data.defaultFee || '')}"></label>
        <label class="field">보호자 이름<input id="fParent" value="${esc(s.parent || '')}"></label>
        <label class="field">보호자 연락처<input id="fPhone" type="tel" value="${esc(s.phone || '')}" placeholder="010-0000-0000"></label>
      </div>
      <label class="field">메모<textarea id="fMemo" rows="3">${esc(s.memo || '')}</textarea></label>
      ${id ? `<label class="check"><input type="checkbox" id="fActive" ${s.active !== false ? 'checked' : ''}> 재원 중</label>
      <div class="hint">등록일 ${esc(s.joined || '')} · 마지막 출석 ${esc(D.lastSeen(id) || '없음')} · 얼굴 ${s.face ? '등록됨' : '미등록'}</div>
      ${hist.length ? `<div class="hist"><b class="hint">띠 기록</b>${hist.map(h => `${D.beltChip(h.belt)}<span class="hint">${h.date}</span>`).join(' ')}</div>` : ''}` : ''}
      <div class="row" style="justify-content:space-between">
        ${id ? '<button class="btn danger" id="fDel">삭제</button>' : '<span></span>'}
        <div class="row"><button class="btn" data-close>취소</button><button class="btn primary" id="fSave">저장</button></div>
      </div>`, (m, close) => {
      m.querySelector('#fSave').onclick = () => {
        const name = m.querySelector('#fName').value.trim();
        const pin = m.querySelector('#fPin').value.trim();
        if (!name) { K.toast('이름을 넣어 주세요'); return; }
        if (pin && !/^\d{4}$/.test(pin)) { K.toast('출석번호는 숫자 4자리입니다'); return; }
        if (pin && D.pinTaken(pin, id)) { K.toast('이미 사용 중인 출석번호입니다'); return; }
        const cur = id ? D.student(id) : null;      // 창을 연 뒤 다른 화면에서 바뀌었을 수 있으니 지금 기록을 다시 본다
        if (id && !cur) { close(); K.toast('다른 화면에서 삭제된 원생입니다'); return; }
        const belt = m.querySelector('#fBelt').value;
        const beltChanged = id && belt !== cur.belt;
        const v = { id: id || undefined, name, pin: pin || D.nextPin(), cls: m.querySelector('#fCls').value, belt,
          birth: m.querySelector('#fBirth').value, fee: m.querySelector('#fFee').value, parent: m.querySelector('#fParent').value.trim(),
          phone: m.querySelector('#fPhone').value.trim(), memo: m.querySelector('#fMemo').value };
        if (id) v.active = m.querySelector('#fActive').checked;
        let saved;
        // 저장이 거절되면(다른 화면이 그사이 저장) 창을 그대로 둔다 → 안내를 보고 ‘저장’을 한 번 더 누르면 됨.
        // 새 원생이면 미리 넣어 둔 출석번호를 그사이 다른 원생이 받았을 수 있으니 번호도 새로 채워 둔다.
        if (!kept(() => { saved = D.upsertStudent(v); })) { if (!id && D.pinTaken(v.pin)) m.querySelector('#fPin').value = D.nextPin(); return; }
        if (beltChanged || !id) D.promote(saved.id, belt);
        close(); K.toast(id ? '저장했습니다' : `${name} 추가 · 출석번호 ${saved.pin}`);
      };
      const del = m.querySelector('#fDel');
      if (del) del.onclick = async () => {
        close();
        if (await K.confirm(`${esc(s.name)} 원생을 완전히 지울까요?<br><span class="hint">출석·회비·띠 기록도 함께 지워져요. 그만둔 원생은 ‘재원 중’ 체크만 끄는 걸 추천해요.</span>`, '지우기') && kept(() => D.removeStudent(id))) K.toast('삭제했습니다');
      };
    });
  }

  // 한 줄을 [이름, 연락처]로 나눈다. 줄 끝에 전화번호처럼 생긴 부분(0 이나 + 로 시작, 숫자 9~13개)이 띄어쓰기로 붙어 있으면 그것을 떼어 내고,
  // 아니면 쉼표·탭 뒤의 칸을 연락처로 본다. (‘김민준 2’ 처럼 이름 뒤에 붙인 짧은 숫자는 이름으로 남김)
  function splitLine(line) {
    const p = line.split(/[,\t]/).map(x => x.trim());
    const m = /^(.*?\S)\s+((?:\+\d|0)[\d\s().-]{6,}\d)$/.exec(p[0]), n = m ? m[2].replace(/\D/g, '').length : 0;
    return n >= 9 && n <= 13 ? [m[1], m[2]] : [p[0], p[1] || ''];
  }
  function bulkAdd() {
    K.modal(`<h2>명단 한꺼번에 넣기</h2>
      <p class="hint">한 줄에 한 명씩 적습니다. 보호자 연락처는 이름 뒤에 <b>쉼표 · 탭 · 띄어쓰기</b> 중 하나로 띄워 붙이면 됩니다 (없어도 됩니다). 엑셀에서 복사해 붙여 넣어도 됩니다.</p>
      <label class="field">명단<textarea id="bText" rows="8" placeholder="김민준, 010-1234-5678&#10;이서연&#10;박도윤	010-2222-3333&#10;강지호 010-9999-0000"></textarea></label>
      <label class="field">반<select id="bCls">${clsOptions(roster.cls)}</select></label>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="bGo">추가</button></div>`,
    (m, close) => m.querySelector('#bGo').onclick = () => {
      const lines = m.querySelector('#bText').value.split('\n').map(splitLine).filter(p => p[0]);
      if (!lines.length) { K.toast('추가할 이름을 한 줄에 한 명씩 적어 주세요'); return; }
      const cls = m.querySelector('#bCls').value;
      D.save();      // 여러 번 저장하는 작업이라, 다른 화면에서 바뀐 기록이 있으면 여기서 먼저 새로 읽어 둔다 (중간에 한 명만 빠지지 않게)
      lines.forEach(([name, phone]) => { const s = D.upsertStudent({ name, phone, cls, belt: '흰띠' }); D.data.belts.push({ id: D.uid(), sid: s.id, belt: '흰띠', date: D.day() }); });
      D.save(); close(); K.toast(`${lines.length}명 추가했습니다`);
    });
  }

  /* ================= 회비 ================= */
  let feeMonth = D.ym(), feeRows = [];
  RENDER.fees = function () {
    const el = $('t-fees');
    // 윗줄(달 입력칸)은 한 번만 만들고 아래 내용만 다시 그린다 — 입력칸까지 새로 만들면 연도를 치는 도중에 초점이 사라진다
    if (!el.dataset.ready) {
      el.dataset.ready = 1;
      el.innerHTML = `
        <div class="toolbar">
          <label class="field" style="flex:none">달<input type="month" id="fm" value="${feeMonth}"></label>
          <span class="grow"></span>
          <button class="btn" id="feeCsv">${I('download')}엑셀(CSV)로 받기</button>
        </div>
        <div id="feeBody"></div>`;
      monthInput($('fm'), () => feeMonth, v => { feeMonth = v; RENDER.fees(); });
      $('feeCsv').onclick = () => D.download(`회비_${feeMonth}.csv`, D.csv([['이름', '반', '금액', '상태', '방법', '날짜']].concat(feeRows.map(({ s, f, amt }) => [s.name, D.className(s.cls), f ? f.amount : amt, f ? '납부' : '미납', f ? f.method : '', f ? f.date : '']))), 'text/csv');
    }
    // 그 달의 명단 = 지금 다니는 원생 + (퇴원했더라도) 그 달 회비를 낸 원생.
    // 재원생만 보여 주면 퇴원 처리하는 순간 지난 달의 받은 금액 · CSV 에서 그 원생이 빠져 합계가 줄어든다.
    const paidIds = new Set(D.data.fees.filter(f => f.ym === feeMonth).map(f => f.sid));
    const list = D.students(true).filter(s => s.active !== false || paidIds.has(s.id));
    const rows = feeRows = list.map(s => ({ s, f: D.feeOf(s.id, feeMonth), amt: Number(s.fee || D.data.defaultFee || 0) }));
    const paid = rows.filter(r => r.f), unpaid = rows.filter(r => !r.f);
    const sum = paid.reduce((a, r) => a + Number(r.f.amount || 0), 0), due = unpaid.reduce((a, r) => a + r.amt, 0);
    const body = $('feeBody');
    body.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${paid.length}명</b><span>납부</span></div>
        <div class="stat"><b style="color:var(--red)">${unpaid.length}명</b><span>미납</span></div>
        <div class="stat"><b>${won(sum)}</b><span>받은 금액</span></div>
        <div class="stat"><b>${won(due)}</b><span>받을 금액</span></div>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>반</th><th>금액</th><th>상태</th><th>방법 · 날짜</th><th></th></tr></thead><tbody>
      ${unpaid.concat(paid).map(({ s, f, amt }) => `<tr>
        <td><b>${esc(s.name)}</b> ${s.active === false ? OUT : ''}</td><td>${esc(D.className(s.cls))}</td>
        <td>${won(f ? f.amount : amt)}</td>
        <td>${f ? '<span class="pill ok">납부</span>' : '<span class="pill bad">미납</span>'}</td>
        <td class="muted">${f ? esc(f.method) + ' · ' + esc(f.date) : ''}</td>
        <td>${f ? `<button class="btn sm" data-un="${s.id}">취소</button>` : `<button class="btn sm primary" data-pay="${s.id}">납부</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">월 회비는 원생 정보에서 사람마다 정하거나, ‘반 · 설정’에서 기본 회비를 정할 수 있습니다. 퇴원한 원생은 그 달에 낸 기록이 있을 때만 함께 보입니다.</p>`
      : `<div class="box empty"><div>${I('wallet', 'xl')}</div>원생을 먼저 등록해 주세요.</div>`}`;
    body.querySelectorAll('[data-un]').forEach(b => b.onclick = () => D.unpay(b.dataset.un, feeMonth));
    body.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      const s = D.student(b.dataset.pay); if (!s) return;
      const amt = Number(s.fee || D.data.defaultFee || 0);
      K.modal(`<h2>${esc(s.name)} · ${feeMonth} 회비</h2>
        <label class="field">금액 (원)<input id="pA" type="number" inputmode="numeric" value="${amt || ''}"></label>
        <div class="chips" id="pM">${['카드', '계좌이체', '현금', '지역화폐'].map((x, i) => `<button class="chip ${i === 0 ? 'on' : ''}">${x}</button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="pGo">납부 처리</button></div>`,
      (m, close) => {
        m.querySelector('#pM').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; m.querySelectorAll('#pM .chip').forEach(x => x.classList.toggle('on', x === c)); };
        m.querySelector('#pGo').onclick = () => { if (kept(() => D.pay(s.id, feeMonth, Number(m.querySelector('#pA').value) || 0, m.querySelector('#pM .on').textContent))) K.sound.pop(); close(); };
      });
    });
  };

  /* ================= 띠 · 심사 ================= */
  let upAt = 0;      // 승급 · 승급 취소 버튼을 마지막으로 누른 시각
  // 버튼을 연달아 두 번 누르면(더블 클릭) 두 단계가 올라가 버린다 → 0.6초 안의 두 번째 누름은 무시
  const twice = () => { const t = Date.now(); if (t - upAt < 600) return true; upAt = t; return false; };
  RENDER.belts = function () {
    const el = $('t-belts'), today = D.day();
    // 지난 기간은 꽉 찬 달 수로 센다 (8/31 → 11/1 은 2개월). 이번 달에 같은 날짜가 없으면 말일을 같은 날로 본다 (1/31 → 2/28 은 1개월)
    const months = d => {
      const a = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ''); if (!a) return 999;
      const b = new Date(), last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
      return Math.max(0, (b.getFullYear() - a[1]) * 12 + (b.getMonth() + 1 - a[2]) - (b.getDate() < Math.min(+a[3], last) ? 1 : 0));
    };
    const gap = Number(K.get('belt:gap', 3));
    // undo: 마지막 승급이 오늘이면 ‘승급 취소’를 보여 준다 (잘못 누른 것을 바로 되돌릴 수 있게)
    const rows = D.students().map(s => { const h = D.beltHistory(s.id); const last = h.length ? h[h.length - 1].date : s.joined; return { s, last, m: months(last), undo: h.length > 1 && h[h.length - 1].date === today }; });
    const due = rows.filter(r => r.m >= gap && D.BELTS.indexOf(r.s.belt) < D.BELTS.length - 1);
    const counts = D.BELTS.map(b => [b, rows.filter(r => (r.s.belt || '흰띠') === b).length]).filter(x => x[1]);
    el.innerHTML = `
      <div class="box"><div class="hist">${counts.map(([b, n]) => `${D.beltChip(b)}<b>${n}</b>&nbsp;`).join('') || '<span class="muted">원생이 없어요</span>'}</div></div>
      <div class="toolbar"><h2 class="grow" style="font-size:1.4rem">심사 대상 <span class="pill">${due.length}명</span></h2>
        <label class="field" style="flex:none">마지막 승급 후<select id="bg">${[1, 2, 3, 4, 6].map(n => `<option value="${n}" ${n === gap ? 'selected' : ''}>${n}개월 이상</option>`).join('')}</select></label>
        <button class="btn primary" id="bAll" ${due.length ? '' : 'disabled'}>심사 대상 모두 승급</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>반</th><th>지금 띠</th><th>마지막 승급</th><th>지난 기간</th><th></th></tr></thead><tbody>
        ${rows.sort((a, b) => b.m - a.m).map(({ s, last, m, undo }) => {
          const next = D.BELTS[D.BELTS.indexOf(s.belt || '흰띠') + 1];
          return `<tr><td><b>${esc(s.name)}</b> ${m >= gap && next ? '<span class="pill bad">심사 대상</span>' : ''}</td><td>${esc(D.className(s.cls))}</td><td>${D.beltChip(s.belt || '흰띠')}</td>
          <td class="muted">${esc(last || '')}</td><td>${m === 999 ? '' : m + '개월'}</td>
          <td>${next ? `<button class="btn sm" data-up="${s.id}">${next}로 승급</button>` : '최고 단계'}${undo ? ` <button class="btn sm" data-undo="${s.id}">${I('undo-2')}승급 취소</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="box empty"><div>${I('belt', 'xl')}</div>원생을 먼저 등록해 주세요.</div>`}`;
    $('bg').onchange = e => { K.set('belt:gap', +e.target.value); RENDER.belts(); };
    // 한 단계 올리고 안내 문구를 돌려준다 (올릴 단계가 없으면 빈 문자열)
    const up = sid => { const s = D.student(sid), next = s && D.BELTS[D.BELTS.indexOf(s.belt || '흰띠') + 1]; if (next) D.promote(sid, next); return next ? `${s.name} ${next} 승급` : ''; };
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      if (twice()) return;
      let done = '';
      if (kept(() => { done = up(b.dataset.up); }) && done) { K.sound.fanfare(); K.toast(done + ' · 잘못 눌렀다면 ‘승급 취소’를 누르세요', 3000); }
    });
    el.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => {
      if (twice()) return;
      const s = D.student(b.dataset.undo); let ok = false;
      if (s && kept(() => { ok = D.demote(s.id); }) && ok) K.toast(`${s.name} 승급을 취소했습니다 (다시 ${s.belt})`);
    });
    $('bAll').onclick = async () => { if (await K.confirm(`심사 대상 ${due.length}명을 한 단계씩 올릴까요?`, '모두 승급') && kept(() => due.forEach(r => up(r.s.id)))) { K.sound.fanfare(); K.toast(`${due.length}명 승급 완료`); } };
  };

  /* ================= 출석 현황 (달력 표) ================= */
  let attMonth = D.ym(), attCsv = () => {};
  RENDER.att = function () {
    const el = $('t-att');
    if (!el.dataset.ready) {      // 윗줄(달 입력칸)은 한 번만 만든다 — 회비 탭과 같은 이유
      el.dataset.ready = 1;
      el.innerHTML = `
        <div class="toolbar">
          <label class="field" style="flex:none">달<input type="month" id="am" value="${attMonth}"></label>
          <span class="grow"></span><button class="btn" id="attCsv">${I('download')}엑셀(CSV)로 받기</button>
        </div>
        <div id="attBody"></div>`;
      monthInput($('am'), () => attMonth, v => { attMonth = v; RENDER.att(); });
      $('attCsv').onclick = () => attCsv();
    }
    const [y, mo] = attMonth.split('-').map(Number), days = new Date(y, mo, 0).getDate();
    const list = D.students(true).filter(s => s.active !== false || D.monthCount(s.id, attMonth));
    const dk = d => attMonth + '-' + D.pad(d);
    const dow = d => new Date(y, mo - 1, d).getDay();
    const total = Array.from({ length: days }, (_, i) => Object.keys(D.data.att[dk(i + 1)] || {}).length);
    $('attBody').innerHTML = list.length ? `<div class="table-wrap"><table class="tbl grid-att"><thead><tr><th>이름</th>
        ${Array.from({ length: days }, (_, i) => `<th class="d ${[0, 6].includes(dow(i + 1)) ? 'we' : ''}">${i + 1}</th>`).join('')}<th>합계</th></tr></thead><tbody>
        ${list.map(s => `<tr><td><b>${esc(s.name)}</b></td>${Array.from({ length: days }, (_, i) => { const t = (D.data.att[dk(i + 1)] || {})[s.id]; return `<td class="d ${t ? 'on' : ''}" title="${t || ''}"></td>`; }).join('')}<td><b>${D.monthCount(s.id, attMonth)}</b></td></tr>`).join('')}
        <tr><td class="muted">하루 인원</td>${total.map(n => `<td class="d muted">${n || ''}</td>`).join('')}<td></td></tr>
      </tbody></table></div>` : `<div class="box empty"><div>${I('calendar-days', 'xl')}</div>출석 기록이 없습니다.</div>`;
    attCsv = () => D.download(`출석_${attMonth}.csv`, D.csv([['이름'].concat(Array.from({ length: days }, (_, i) => i + 1), ['합계'])]
      .concat(list.map(s => [s.name].concat(Array.from({ length: days }, (_, i) => (D.data.att[dk(i + 1)] || {})[s.id] || ''), [D.monthCount(s.id, attMonth)])))), 'text/csv');
  };

  /* ================= 반 · 설정 ================= */
  RENDER.settings = function () {
    const el = $('t-settings'), d = D.data;
    el.innerHTML = `
      <div class="box" style="display:grid;gap:12px">
        <h2 style="font-size:1.4rem">도장 정보</h2>
        <div class="grid2">
          <label class="field">도장 이름<input id="sDojo" value="${esc(d.dojo || '')}" placeholder="예: 한빛 태권도"></label>
          <label class="field">기본 월 회비 (원)<input id="sFee" type="number" inputmode="numeric" value="${esc(d.defaultFee || '')}" placeholder="예: 150000"></label>
        </div>
      </div>
      <div class="box">
        <div class="toolbar"><h2 class="grow" style="font-size:1.4rem">반</h2><button class="btn primary" id="cAdd">${I('plus')}반 추가</button></div>
        <div id="cList">${d.classes.map(c => `<div class="cls-row" data-id="${c.id}">
          <input class="n" value="${esc(c.name)}" aria-label="반 이름"><input class="t" type="time" value="${esc(c.time || '')}" aria-label="시작 시간">
          <span class="pill">${D.students().filter(s => s.cls === c.id).length}명</span><button class="btn sm danger" data-del>삭제</button></div>`).join('') || '<p class="muted">반이 없어요. 예: ‘1부 (오후 2시)’, ‘유치부’</p>'}</div>
      </div>
      <div class="box" style="display:grid;gap:10px">
        <h2 style="font-size:1.4rem">백업 · 옮기기</h2>
        <p class="hint">모든 기록은 <b>이 기기의 브라우저에만</b> 저장됩니다. 브라우저 데이터를 지우면 함께 사라지므로 백업 파일을 주기적으로 받아 두세요. 다른 기기로 옮길 때도 이 파일을 사용합니다.</p>
        <p class="hint">백업 파일에는 원생 · 반 · 출석 · 회비 · 띠 · 차량 기록과 함께 <b>월간 계획표 · 품새 대회 기록 · 달리기 순위</b>도 들어 있습니다. 얼굴을 등록했다면 얼굴 특징값(숫자)도 들어 있으니 파일을 안전한 곳에 보관하세요.</p>
        <div class="row"><button class="btn primary" id="sBak">${I('download')}백업 파일 받기</button>
          <label class="btn">${I('upload')}백업 파일로 되돌리기<input type="file" id="sRes" accept=".json,application/json" hidden></label>
          <button class="btn" id="sCsv">${I('download')}명단 엑셀(CSV)</button></div>
      </div>
      <div class="box danger-zone" style="display:grid;gap:10px">
        <h2 style="font-size:1.4rem;color:var(--red)">원생 데이터 모두 지우기</h2>
        <p class="hint">원생 · 반 · 출석 · 회비 · 띠 · 차량 기록과 도장 이름 · 기본 회비가 지워집니다 (등록한 얼굴 포함). 월간 계획표 · 품새 대회 기록 · 달리기 순위는 지워지지 않습니다. 되돌릴 수 없습니다.</p>
        <div><button class="btn danger" id="sWipe">모두 지우기</button></div>
      </div>`;
    // 입력칸 하나를 고친 것(도장 이름 · 기본 회비 · 반 이름 · 시작 시간)은 저장만 하고 탭은 그대로 둔다 (saveQuiet).
    // 탭을 새로 그리는 것은 반이 늘거나 줄 때와 다른 화면에서 바뀌었을 때뿐.
    $('sDojo').onchange = e => { d.dojo = e.target.value.trim(); if (saveQuiet()) K.toast('저장했습니다'); };
    $('sFee').onchange = e => { d.defaultFee = Number(e.target.value) || 0; if (saveQuiet()) K.toast('저장했습니다'); };
    $('cAdd').onclick = () => { d.classes.push({ id: D.uid(), name: `${d.classes.length + 1}부`, time: '' }); D.save(); };
    el.querySelectorAll('.cls-row').forEach(r => {
      const c = d.classes.find(x => x.id === r.dataset.id);
      r.querySelector('.n').onchange = e => { c.name = e.target.value.trim() || c.name; e.target.value = c.name; saveQuiet(); };
      r.querySelector('.t').onchange = e => { c.time = e.target.value; saveQuiet(); };
      r.querySelector('[data-del]').onclick = async () => {
        if (!(await K.confirm(`‘${esc(c.name)}’ 반을 지울까요? 이 반 원생은 ‘반 없음’이 돼요.`, '지우기'))) return;
        d.classes = d.classes.filter(x => x.id !== c.id); d.students.forEach(s => { if (s.cls === c.id) s.cls = ''; }); D.save();
      };
    });
    $('sBak').onclick = () => D.download(`기합_백업_${D.day()}.json`, D.exportJSON());
    $('sRes').onchange = async e => {
      const inp = e.target, f = inp.files[0]; if (!f) return;
      inp.value = '';      // 칸을 비워 두어야 취소하거나 실패한 뒤 같은 파일을 다시 골라도 change 가 난다
      if (!(await K.confirm('지금 기록을 백업 파일 내용으로 바꿀까요?<br><span class="hint">원생 기록과 월간 계획표 · 품새 대회 기록 · 달리기 순위가 백업을 받은 때의 내용으로 돌아갑니다.</span>', '되돌리기'))) return;
      try { D.importJSON(await f.text()); K.toast('복원했습니다'); } catch (err) { K.toast('읽을 수 없는 파일입니다: ' + err.message, 3000); }
    };
    // 출석번호(0001)와 줄표 없이 적은 전화번호(0101234…)는 엑셀이 앞의 0 을 지우지 않게 D.xl 을 거친다
    $('sCsv').onclick = () => D.download(`원생명단_${D.day()}.csv`, D.csv([['이름', '출석번호', '반', '띠', '생년월일', '보호자', '연락처', '등록일', '상태', '메모']]
      .concat(D.students(true).map(s => [s.name, D.xl(s.pin), D.className(s.cls), s.belt, s.birth, s.parent, D.xl(s.phone), s.joined, s.active === false ? '퇴원' : '재원', s.memo]))), 'text/csv');
    $('sWipe').onclick = async () => {
      if (!(await K.confirm('원생 · 출석 · 회비 · 띠 · 차량 기록을 모두 지울까요?<br><span class="hint">되돌릴 수 없습니다. 먼저 백업 파일을 받아 두세요.</span>', '모두 지우기'))) return;
      D.importJSON(JSON.stringify({ students: [] })); K.toast('원생 데이터를 모두 삭제했습니다');
    };
  };

  show(tab);
})();

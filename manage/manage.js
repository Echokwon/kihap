/* 기합 — 원생 관리: 명단 · 회비 · 띠 · 출석 현황 · 설정 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  K.topbar('🧒 원생 관리');
  K.markLast('manage', '원생 관리');

  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const clsOptions = sel => `<option value="">반 없음</option>` + D.classes().map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const beltOptions = sel => D.BELTS.map(b => `<option ${b === sel ? 'selected' : ''}>${b}</option>`).join('');

  /* ---------- 탭 ---------- */
  let tab = K.get('manage:tab', 'roster');
  const RENDER = {};
  function show(t) {
    tab = t; K.set('manage:tab', t);
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
    document.querySelectorAll('.tabp').forEach(p => p.hidden = p.id !== 't-' + t);
    RENDER[t]();
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t); });
  D.onChange(() => RENDER[tab]());

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
          <button class="btn" id="rPaste">📋 명단 한꺼번에 넣기</button>
          <button class="btn primary" id="rAdd">+ 원생 추가</button>
        </div>
        <div id="rList"></div>`;
      $('rQ').oninput = e => { roster.q = e.target.value.trim(); RENDER.roster(); };
      $('rCls').onchange = e => { roster.cls = e.target.value; RENDER.roster(); };
      $('rAll').onchange = e => { roster.all = e.target.checked; RENDER.roster(); };
      $('rAdd').onclick = () => editStudent(null);
      $('rPaste').onclick = bulkAdd;
    }
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
      $('rList').innerHTML = `<div class="box empty"><b>🧒</b>아직 원생이 없어요.<br>‘+ 원생 추가’나 ‘명단 한꺼번에 넣기’로 시작하세요.</div>`;
      return;
    }
    $('rList').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>이름</th><th>출석번호</th><th>반</th><th>띠</th><th>이번 달 출석</th><th>회비</th><th>보호자 연락처</th></tr></thead><tbody>
      ${list.map(s => `<tr class="click" data-id="${s.id}">
        <td><b>${esc(s.name)}</b> ${s.active === false ? '<span class="pill">퇴원</span>' : ''}</td>
        <td>${esc(s.pin || '')}</td><td>${esc(D.className(s.cls))}</td><td>${D.beltChip(s.belt)}</td>
        <td>${D.monthCount(s.id)}일</td>
        <td>${D.feeOf(s.id, m) ? '<span class="pill ok">납부</span>' : '<span class="pill bad">미납</span>'}</td>
        <td>${esc(s.phone || '')}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">검색 결과가 없어요</td></tr>`}
      </tbody></table></div>`;
    $('rList').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editStudent(tr.dataset.id));
  };

  function editStudent(id) {
    const s = id ? D.student(id) : { name: '', pin: D.nextPin(), cls: roster.cls || '', belt: '흰띠', phone: '', parent: '', birth: '', fee: '', memo: '', active: true };
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
      <div class="hint">등록일 ${esc(s.joined || '')} · 마지막 출석 ${esc(D.lastSeen(id) || '없음')} · 얼굴 ${s.face ? '등록됨 ✅' : '미등록'}</div>
      ${hist.length ? `<div class="hist"><b class="hint">띠 기록</b>${hist.map(h => `${D.beltChip(h.belt)}<span class="hint">${h.date}</span>`).join(' ')}</div>` : ''}` : ''}
      <div class="row" style="justify-content:space-between">
        ${id ? '<button class="btn danger" id="fDel">삭제</button>' : '<span></span>'}
        <div class="row"><button class="btn" data-close>취소</button><button class="btn primary" id="fSave">저장</button></div>
      </div>`, (m, close) => {
      m.querySelector('#fSave').onclick = () => {
        const name = m.querySelector('#fName').value.trim();
        const pin = m.querySelector('#fPin').value.trim();
        if (!name) { K.toast('이름을 넣어 주세요'); return; }
        if (pin && !/^\d{4}$/.test(pin)) { K.toast('출석번호는 숫자 4자리예요'); return; }
        if (pin && D.pinTaken(pin, id)) { K.toast('이미 쓰는 출석번호예요'); return; }
        const belt = m.querySelector('#fBelt').value;
        const beltChanged = id && belt !== s.belt;
        const v = { id: id || undefined, name, pin: pin || D.nextPin(), cls: m.querySelector('#fCls').value, belt,
          birth: m.querySelector('#fBirth').value, fee: m.querySelector('#fFee').value, parent: m.querySelector('#fParent').value.trim(),
          phone: m.querySelector('#fPhone').value.trim(), memo: m.querySelector('#fMemo').value };
        if (id) v.active = m.querySelector('#fActive').checked;
        const saved = D.upsertStudent(v);
        if (beltChanged || !id) D.promote(saved.id, belt);
        close(); K.toast(id ? '저장했어요' : `${name} 추가! 출석번호 ${saved.pin}`);
      };
      const del = m.querySelector('#fDel');
      if (del) del.onclick = async () => {
        close();
        if (await K.confirm(`${esc(s.name)} 원생을 완전히 지울까요?<br><span class="hint">출석·회비·띠 기록도 함께 지워져요. 그만둔 원생은 ‘재원 중’ 체크만 끄는 걸 추천해요.</span>`, '지우기')) { D.removeStudent(id); K.toast('지웠어요'); }
      };
    });
  }

  function bulkAdd() {
    K.modal(`<h2>명단 한꺼번에 넣기</h2>
      <p class="hint">엑셀에서 복사해 붙여 넣어도 돼요. 한 줄에 한 명, <b>이름, 보호자 연락처</b> 순서 (연락처는 없어도 돼요).</p>
      <label class="field">명단<textarea id="bText" rows="8" placeholder="김민준, 010-1234-5678&#10;이서연&#10;박도윤	010-2222-3333"></textarea></label>
      <label class="field">반<select id="bCls">${clsOptions(roster.cls)}</select></label>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="bGo">추가</button></div>`,
    (m, close) => m.querySelector('#bGo').onclick = () => {
      const lines = m.querySelector('#bText').value.split('\n').map(l => l.split(/[,\t]/).map(x => x.trim())).filter(p => p[0]);
      const cls = m.querySelector('#bCls').value;
      lines.forEach(([name, phone]) => { const s = D.upsertStudent({ name, phone: phone || '', cls, belt: '흰띠' }); D.data.belts.push({ id: D.uid(), sid: s.id, belt: '흰띠', date: D.day() }); });
      D.save(); close(); K.toast(`${lines.length}명 추가했어요`);
    });
  }

  /* ================= 회비 ================= */
  let feeMonth = D.ym();
  RENDER.fees = function () {
    const el = $('t-fees');
    const list = D.students();
    const rows = list.map(s => ({ s, f: D.feeOf(s.id, feeMonth), amt: Number(s.fee || D.data.defaultFee || 0) }));
    const paid = rows.filter(r => r.f), unpaid = rows.filter(r => !r.f);
    const sum = paid.reduce((a, r) => a + Number(r.f.amount || 0), 0), due = unpaid.reduce((a, r) => a + r.amt, 0);
    el.innerHTML = `
      <div class="toolbar">
        <label class="field" style="flex:none">달<input type="month" id="fm" value="${feeMonth}"></label>
        <span class="grow"></span>
        <button class="btn" id="feeCsv">⬇ 엑셀(CSV)로 받기</button>
      </div>
      <div class="stats">
        <div class="stat"><b>${paid.length}명</b><span>납부</span></div>
        <div class="stat"><b style="color:var(--red)">${unpaid.length}명</b><span>미납</span></div>
        <div class="stat"><b>${won(sum)}</b><span>받은 금액</span></div>
        <div class="stat"><b>${won(due)}</b><span>받을 금액</span></div>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>반</th><th>금액</th><th>상태</th><th>방법 · 날짜</th><th></th></tr></thead><tbody>
      ${unpaid.concat(paid).map(({ s, f, amt }) => `<tr>
        <td><b>${esc(s.name)}</b></td><td>${esc(D.className(s.cls))}</td>
        <td>${won(f ? f.amount : amt)}</td>
        <td>${f ? '<span class="pill ok">납부</span>' : '<span class="pill bad">미납</span>'}</td>
        <td class="muted">${f ? esc(f.method) + ' · ' + esc(f.date) : ''}</td>
        <td>${f ? `<button class="btn sm" data-un="${s.id}">취소</button>` : `<button class="btn sm primary" data-pay="${s.id}">납부</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">월 회비는 원생 정보에서 사람마다 정하거나, ‘반 · 설정’에서 기본 회비를 정할 수 있어요.</p>`
      : `<div class="box empty"><b>💰</b>원생을 먼저 등록해 주세요.</div>`}`;
    $('fm').onchange = e => { feeMonth = e.target.value || D.ym(); RENDER.fees(); };
    $('feeCsv').onclick = () => D.download(`회비_${feeMonth}.csv`, D.csv([['이름', '반', '금액', '상태', '방법', '날짜']].concat(rows.map(({ s, f, amt }) => [s.name, D.className(s.cls), f ? f.amount : amt, f ? '납부' : '미납', f ? f.method : '', f ? f.date : '']))), 'text/csv');
    el.querySelectorAll('[data-un]').forEach(b => b.onclick = () => D.unpay(b.dataset.un, feeMonth));
    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      const s = D.student(b.dataset.pay), amt = Number(s.fee || D.data.defaultFee || 0);
      K.modal(`<h2>${esc(s.name)} · ${feeMonth} 회비</h2>
        <label class="field">금액 (원)<input id="pA" type="number" inputmode="numeric" value="${amt || ''}"></label>
        <div class="chips" id="pM">${['카드', '계좌이체', '현금', '지역화폐'].map((x, i) => `<button class="chip ${i === 0 ? 'on' : ''}">${x}</button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-close>취소</button><button class="btn primary" id="pGo">납부 처리</button></div>`,
      (m, close) => {
        m.querySelector('#pM').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; m.querySelectorAll('#pM .chip').forEach(x => x.classList.toggle('on', x === c)); };
        m.querySelector('#pGo').onclick = () => { D.pay(s.id, feeMonth, Number(m.querySelector('#pA').value) || 0, m.querySelector('#pM .on').textContent); close(); K.sound.pop(); };
      });
    });
  };

  /* ================= 띠 · 심사 ================= */
  RENDER.belts = function () {
    const el = $('t-belts');
    const months = d => { if (!d) return 999; const a = new Date(d), b = new Date(); return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); };
    const gap = Number(K.get('belt:gap', 3));
    const rows = D.students().map(s => { const h = D.beltHistory(s.id); const last = h.length ? h[h.length - 1].date : s.joined; return { s, last, m: months(last) }; });
    const due = rows.filter(r => r.m >= gap && D.BELTS.indexOf(r.s.belt) < D.BELTS.length - 1);
    const counts = D.BELTS.map(b => [b, rows.filter(r => (r.s.belt || '흰띠') === b).length]).filter(x => x[1]);
    el.innerHTML = `
      <div class="box"><div class="hist">${counts.map(([b, n]) => `${D.beltChip(b)}<b>${n}</b>&nbsp;`).join('') || '<span class="muted">원생이 없어요</span>'}</div></div>
      <div class="toolbar"><h2 class="grow" style="font-size:1.4rem">심사 대상 <span class="pill">${due.length}명</span></h2>
        <label class="field" style="flex:none">마지막 승급 후<select id="bg">${[1, 2, 3, 4, 6].map(n => `<option value="${n}" ${n === gap ? 'selected' : ''}>${n}개월 이상</option>`).join('')}</select></label>
        <button class="btn primary" id="bAll" ${due.length ? '' : 'disabled'}>심사 대상 모두 승급</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>반</th><th>지금 띠</th><th>마지막 승급</th><th>지난 기간</th><th></th></tr></thead><tbody>
        ${rows.sort((a, b) => b.m - a.m).map(({ s, last, m }) => {
          const next = D.BELTS[D.BELTS.indexOf(s.belt || '흰띠') + 1];
          return `<tr><td><b>${esc(s.name)}</b> ${m >= gap && next ? '<span class="pill bad">심사 대상</span>' : ''}</td><td>${esc(D.className(s.cls))}</td><td>${D.beltChip(s.belt || '흰띠')}</td>
          <td class="muted">${esc(last || '')}</td><td>${m === 999 ? '' : m + '개월'}</td>
          <td>${next ? `<button class="btn sm" data-up="${s.id}">→ ${next}</button>` : '최고 단계'}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="box empty"><b>🥋</b>원생을 먼저 등록해 주세요.</div>`}`;
    $('bg').onchange = e => { K.set('belt:gap', +e.target.value); RENDER.belts(); };
    const up = sid => { const s = D.student(sid); const next = D.BELTS[D.BELTS.indexOf(s.belt || '흰띠') + 1]; if (next) D.promote(sid, next); };
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { up(b.dataset.up); K.sound.fanfare(); });
    $('bAll').onclick = async () => { if (await K.confirm(`심사 대상 ${due.length}명을 한 단계씩 올릴까요?`, '모두 승급')) { due.forEach(r => up(r.s.id)); K.sound.fanfare(); K.toast(`${due.length}명 승급!`); } };
  };

  /* ================= 출석 현황 (달력 표) ================= */
  let attMonth = D.ym();
  RENDER.att = function () {
    const el = $('t-att');
    const [y, mo] = attMonth.split('-').map(Number), days = new Date(y, mo, 0).getDate();
    const list = D.students(true).filter(s => s.active !== false || D.monthCount(s.id, attMonth));
    const dk = d => attMonth + '-' + D.pad(d);
    const dow = d => new Date(y, mo - 1, d).getDay();
    const total = Array.from({ length: days }, (_, i) => Object.keys(D.data.att[dk(i + 1)] || {}).length);
    el.innerHTML = `
      <div class="toolbar">
        <label class="field" style="flex:none">달<input type="month" id="am" value="${attMonth}"></label>
        <span class="grow"></span><button class="btn" id="attCsv">⬇ 엑셀(CSV)로 받기</button>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="tbl grid-att"><thead><tr><th>이름</th>
        ${Array.from({ length: days }, (_, i) => `<th class="d ${[0, 6].includes(dow(i + 1)) ? 'we' : ''}">${i + 1}</th>`).join('')}<th>합계</th></tr></thead><tbody>
        ${list.map(s => `<tr><td><b>${esc(s.name)}</b></td>${Array.from({ length: days }, (_, i) => { const t = (D.data.att[dk(i + 1)] || {})[s.id]; return `<td class="d ${t ? 'on' : ''}" title="${t || ''}">${t ? '●' : ''}</td>`; }).join('')}<td><b>${D.monthCount(s.id, attMonth)}</b></td></tr>`).join('')}
        <tr><td class="muted">하루 인원</td>${total.map(n => `<td class="d muted">${n || ''}</td>`).join('')}<td></td></tr>
      </tbody></table></div>` : `<div class="box empty"><b>📅</b>출석 기록이 없어요.</div>`}`;
    $('am').onchange = e => { attMonth = e.target.value || D.ym(); RENDER.att(); };
    $('attCsv').onclick = () => D.download(`출석_${attMonth}.csv`, D.csv([['이름'].concat(Array.from({ length: days }, (_, i) => i + 1), ['합계'])]
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
        <div class="toolbar"><h2 class="grow" style="font-size:1.4rem">반</h2><button class="btn primary" id="cAdd">+ 반 추가</button></div>
        <div id="cList">${d.classes.map(c => `<div class="cls-row" data-id="${c.id}">
          <input class="n" value="${esc(c.name)}" aria-label="반 이름"><input class="t" type="time" value="${esc(c.time || '')}" aria-label="시작 시간">
          <span class="pill">${D.students().filter(s => s.cls === c.id).length}명</span><button class="btn sm danger" data-del>삭제</button></div>`).join('') || '<p class="muted">반이 없어요. 예: ‘1부 (오후 2시)’, ‘유치부’</p>'}</div>
      </div>
      <div class="box" style="display:grid;gap:10px">
        <h2 style="font-size:1.4rem">백업 · 옮기기</h2>
        <p class="hint">지금은 모든 기록이 <b>이 기기 브라우저에만</b> 저장돼요. 브라우저 기록을 지우면 사라지니 가끔 백업 파일을 받아 두세요. 다른 기기로 옮길 때도 이 파일을 쓰면 돼요.</p>
        <div class="row"><button class="btn primary" id="sBak">⬇ 백업 파일 받기</button>
          <label class="btn">⬆ 백업 파일로 되돌리기<input type="file" id="sRes" accept=".json,application/json" hidden></label>
          <button class="btn" id="sCsv">⬇ 명단 엑셀(CSV)</button></div>
      </div>
      <div class="box danger-zone" style="display:grid;gap:10px">
        <h2 style="font-size:1.4rem;color:var(--red)">모든 데이터 지우기</h2>
        <p class="hint">원생·출석·회비·띠·차량 기록이 모두 지워져요. 되돌릴 수 없어요.</p>
        <div><button class="btn danger" id="sWipe">모두 지우기</button></div>
      </div>`;
    $('sDojo').onchange = e => { d.dojo = e.target.value.trim(); D.save(); K.toast('저장했어요'); };
    $('sFee').onchange = e => { d.defaultFee = Number(e.target.value) || 0; D.save(); K.toast('저장했어요'); };
    $('cAdd').onclick = () => { d.classes.push({ id: D.uid(), name: `${d.classes.length + 1}부`, time: '' }); D.save(); };
    el.querySelectorAll('.cls-row').forEach(r => {
      const c = d.classes.find(x => x.id === r.dataset.id);
      r.querySelector('.n').onchange = e => { c.name = e.target.value.trim() || c.name; D.save(); };
      r.querySelector('.t').onchange = e => { c.time = e.target.value; D.save(); };
      r.querySelector('[data-del]').onclick = async () => {
        if (!(await K.confirm(`‘${esc(c.name)}’ 반을 지울까요? 이 반 원생은 ‘반 없음’이 돼요.`, '지우기'))) return;
        d.classes = d.classes.filter(x => x.id !== c.id); d.students.forEach(s => { if (s.cls === c.id) s.cls = ''; }); D.save();
      };
    });
    $('sBak').onclick = () => D.download(`기합_백업_${D.day()}.json`, D.exportJSON());
    $('sRes').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await K.confirm('지금 데이터를 백업 파일 내용으로 바꿀까요?', '되돌리기'))) return;
      try { D.importJSON(await f.text()); K.toast('되돌렸어요'); } catch (err) { K.toast('읽을 수 없는 파일이에요: ' + err.message, 3000); }
    };
    $('sCsv').onclick = () => D.download(`원생명단_${D.day()}.csv`, D.csv([['이름', '출석번호', '반', '띠', '생년월일', '보호자', '연락처', '등록일', '상태', '메모']]
      .concat(D.students(true).map(s => [s.name, s.pin, D.className(s.cls), s.belt, s.birth, s.parent, s.phone, s.joined, s.active === false ? '퇴원' : '재원', s.memo]))), 'text/csv');
    $('sWipe').onclick = async () => {
      if (!(await K.confirm('정말 모든 데이터를 지울까요? 먼저 백업 파일을 받아 두는 걸 추천해요.', '모두 지우기'))) return;
      D.importJSON(JSON.stringify({ students: [] })); K.toast('모두 지웠어요');
    };
  };

  show(tab);
})();

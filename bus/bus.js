/* 기합 — 차량 운행표: 운행(호차·시간) → 정류장 순서 → 탈 아이들, 그리고 운행 중 탑승 체크 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  K.topbar('🚐 차량 운행표');
  K.markLast('bus', '차량 운행표');
  const R = () => D.data.bus.routes;
  let rid = K.get('bus:route', ''), mode = 'edit';
  const route = () => R().find(r => r.id === rid);
  const rideKey = () => 'bus:ride:' + D.day() + ':' + rid;

  function renderTabs() {
    if (!route() && R().length) rid = R()[0].id;
    $('routes').innerHTML = R().map(r => `<button role="tab" data-id="${r.id}" aria-selected="${r.id === rid}">${esc(r.name)}</button>`).join('') || '<span class="muted">운행을 추가해 주세요 →</span>';
  }
  $('routes').onclick = e => { const b = e.target.closest('[data-id]'); if (b) { rid = b.dataset.id; K.set('bus:route', rid); mode = 'edit'; render(); } };
  $('addRoute').onclick = () => {
    const n = R().length + 1;
    const r = { id: D.uid(), name: `${n}호차 · 하원`, stops: [{ id: D.uid(), name: '도장 출발', time: '', sids: [] }] };
    R().push(r); D.save(); rid = r.id; K.set('bus:route', rid); mode = 'edit'; render();
  };

  function render() {
    renderTabs();
    const r = route();
    if (!r) { $('view').innerHTML = `<div class="box empty"><b>🚐</b>운행이 없어요. ‘+ 운행 추가’를 눌러 1호차부터 만들어 보세요.<br><span class="hint">예: 1호차 · 등원 2시 / 1호차 · 하원 5시</span></div>`; return; }
    mode === 'drive' ? drive(r) : edit(r);
  }

  /* ================= 편집 ================= */
  function edit(r) {
    const used = new Set(R().filter(x => x.id === r.id).flatMap(x => x.stops.flatMap(s => s.sids)));
    const studs = D.students(), free = studs.filter(s => !used.has(s.id));
    const total = r.stops.reduce((a, s) => a + s.sids.length, 0);
    $('view').innerHTML = `
      <div class="box toolbar">
        <label class="field grow">운행 이름<input id="rName" value="${esc(r.name)}"></label>
        <button class="btn primary big" id="drive">▶ 운행 시작</button>
        <button class="btn" id="print">🖨 인쇄</button>
        <button class="btn" id="dup">복제</button>
        <button class="btn danger" id="del">삭제</button>
      </div>
      <p class="hint no-print">정류장 ${r.stops.length}곳 · 탑승 ${total}명 · ▲▼로 순서를 바꿔요. 아이 이름 옆 ✕로 빼요.</p>
      <div class="stops">${r.stops.map((s, i) => `
        <div class="stop" data-i="${i}"><div class="stop-n"></div><div class="stop-body">
          <div class="stop-head">
            <input class="tm" type="time" value="${esc(s.time)}" aria-label="시간">
            <input class="nm" value="${esc(s.name)}" placeholder="정류장 이름 (예: 한빛아파트 정문)" aria-label="정류장 이름">
            <button class="btn sm" data-mv="-1" ${i ? '' : 'disabled'} aria-label="위로">▲</button>
            <button class="btn sm" data-mv="1" ${i < r.stops.length - 1 ? '' : 'disabled'} aria-label="아래로">▼</button>
            <button class="btn sm danger" data-rm aria-label="정류장 삭제">삭제</button>
          </div>
          <div class="kids">${s.sids.map(id => D.student(id)).filter(Boolean).map(k => `<span class="kid">${esc(k.name)}<button data-out="${k.id}" aria-label="${esc(k.name)} 빼기">✕</button></span>`).join('')}
            ${free.length ? `<select data-add aria-label="아이 추가"><option value="">+ 아이 추가</option>${free.map(k => `<option value="${k.id}">${esc(k.name)}${k.cls ? ' (' + esc(D.className(k.cls)) + ')' : ''}</option>`).join('')}</select>` : ''}
          </div></div></div>`).join('')}
      </div>
      <div class="row no-print"><button class="btn" id="addStop">+ 정류장 추가</button></div>
      ${studs.length ? `<p class="hint no-print">이 운행에 안 탄 원생: ${free.map(k => esc(k.name)).join(', ') || '없음'}</p>` : `<p class="hint">원생을 먼저 <a href="../manage/">원생 관리</a>에서 등록하면 정류장에 넣을 수 있어요.</p>`}`;

    $('rName').onchange = e => { r.name = e.target.value.trim() || r.name; D.save(); renderTabs(); };
    $('drive').onclick = () => { mode = 'drive'; render(); K._wantAwake = true; K.keepAwake(true); };
    $('print').onclick = () => print();
    $('dup').onclick = () => { const c = JSON.parse(JSON.stringify(r)); c.id = D.uid(); c.name = r.name + ' (복사)'; c.stops.forEach(s => s.id = D.uid()); R().push(c); D.save(); rid = c.id; render(); };
    $('del').onclick = async () => { if (await K.confirm(`‘${esc(r.name)}’ 운행을 지울까요?`, '지우기')) { D.data.bus.routes = R().filter(x => x.id !== r.id); D.save(); rid = ''; render(); } };
    $('addStop').onclick = () => { r.stops.push({ id: D.uid(), name: '', time: '', sids: [] }); D.save(); render(); const ins = document.querySelectorAll('.stop .nm'); ins[ins.length - 1].focus(); };

    document.querySelectorAll('.stop').forEach(el => {
      const i = +el.dataset.i, s = r.stops[i];
      el.querySelector('.tm').onchange = e => { s.time = e.target.value; D.save(); };
      el.querySelector('.nm').onchange = e => { s.name = e.target.value.trim(); D.save(); };
      el.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const j = i + +b.dataset.mv; [r.stops[i], r.stops[j]] = [r.stops[j], r.stops[i]]; D.save(); render(); });
      el.querySelector('[data-rm]').onclick = async () => { if (!s.sids.length || await K.confirm(`이 정류장의 아이 ${s.sids.length}명도 함께 빠져요. 지울까요?`, '지우기')) { r.stops.splice(i, 1); D.save(); render(); } };
      el.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { s.sids = s.sids.filter(x => x !== b.dataset.out); D.save(); render(); });
      const add = el.querySelector('[data-add]');
      if (add) add.onchange = () => { if (add.value) { s.sids.push(add.value); D.save(); render(); } };
    });
  }

  /* ================= 운행 모드 (기사님·인솔 선생님용) ================= */
  function drive(r) {
    const ride = K.get(rideKey(), {}), came = D.attendedOn();
    const isDrop = /하원/.test(r.name);   // 하원 운행이면 오늘 출석 안 한 아이 표시
    const all = r.stops.flatMap(s => s.sids).filter(id => D.student(id));
    const done = all.filter(id => ride[id]).length;
    $('view').innerHTML = `
      <div class="box" style="display:grid;gap:10px">
        <div class="toolbar"><h2 class="grow" style="font-size:1.6rem">${esc(r.name)} · ${D.day()}</h2>
          <button class="btn" id="reset">체크 지우기</button><button class="btn dark" id="back">편집으로</button></div>
        <div class="progress"><i style="width:${all.length ? 100 * done / all.length : 0}%"></i></div>
        <b>${isDrop ? '내림' : '탑승'} ${done} / ${all.length}명</b>
      </div>
      <div class="stops drive">${r.stops.map(s => {
        const kids = s.sids.map(id => D.student(id)).filter(Boolean);
        const fin = kids.length && kids.every(k => ride[k.id] || (isDrop && !came[k.id]));
        return `<div class="stop ${fin ? 'done' : ''}"><div class="stop-n"></div><div class="stop-body">
          <h3>${esc(s.time || '')} ${esc(s.name || '정류장')}</h3>
          <div class="kids">${kids.map(k => `<button class="ride ${ride[k.id] ? 'on' : ''} ${isDrop && !came[k.id] ? 'away' : ''}" data-id="${k.id}">${ride[k.id] ? '✓ ' : ''}${esc(k.name)}${isDrop && !came[k.id] ? ' · 오늘 결석' : ''}</button>`).join('') || '<span class="muted">타는 아이 없음</span>'}
            ${kids.some(k => k.phone) ? `<span class="hint">${kids.filter(k => k.phone).map(k => `<a href="tel:${esc(k.phone)}">📞 ${esc(k.name)}</a>`).join(' · ')}</span>` : ''}</div>
        </div></div>`; }).join('')}
      </div>`;
    $('back').onclick = () => { mode = 'edit'; render(); };
    $('reset').onclick = async () => { if (await K.confirm('오늘 이 운행의 체크를 모두 지울까요?', '지우기')) { K.set(rideKey(), {}); render(); } };
    document.querySelectorAll('.ride').forEach(b => b.onclick = () => {
      const v = K.get(rideKey(), {}); v[b.dataset.id] = !v[b.dataset.id]; if (!v[b.dataset.id]) delete v[b.dataset.id];
      K.set(rideKey(), v); K.sound[v[b.dataset.id] ? 'pop' : 'tick'](); render();
      const left = all.filter(id => !v[id] && !(isDrop && !came[id])).length;
      if (!left && all.length) { K.sound.fanfare(); K.toast('모두 확인했어요! 운행 끝 🎉'); }
    });
  }

  render();
})();

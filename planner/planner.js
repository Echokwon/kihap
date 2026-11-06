/* 기합 — 월간 계획표 */
(function () {
  const K = Kihap, D = KihapDB, $ = id => document.getElementById(id), esc = K.esc;
  K.topbar('🗓️ 월간 계획표');
  K.markLast('planner', '월간 계획표');
  const H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

  const TAGS = [['', '표시'], ['심사', '#d8323c'], ['행사', '#e8a500'], ['대회', '#2457c5'], ['휴관', '#6b7280']];
  const THEMES = [['dojang', '도장'], ['spring', '새싹'], ['ocean', '바다'], ['candy', '사탕']];
  let month = D.ym();
  const key = m => 'plan:' + m;
  const blank = () => ({ title: '수업 계획', days: {}, tags: {}, goal: '', notice: '' });
  const getPlan = m => Object.assign(blank(), K.get(key(m), {}));
  let plan = getPlan(month);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => K.set(key(month), plan), 300); };

  $('themes').innerHTML = THEMES.map(([v, n]) => `<button class="chip" data-v="${v}">${n}</button>`).join('');
  function setTheme(v) { K.set('plan:theme', v); $('sheet').dataset.theme = v; document.querySelectorAll('#themes .chip').forEach(c => c.classList.toggle('on', c.dataset.v === v)); }
  $('themes').onclick = e => { const c = e.target.closest('.chip'); if (c) setTheme(c.dataset.v); };

  function render() {
    $('month').value = month;
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
    const cells = Math.ceil((first + days) / 7) * 7, today = D.day();
    let html = ['일', '월', '화', '수', '목', '금', '토'].map((d, i) => `<div class="dow ${i === 0 ? 'sun' : ''}">${d}</div>`).join('');
    for (let i = 0; i < cells; i++) {
      const d = i - first + 1, dow = i % 7;
      if (d < 1 || d > days) { html += `<div class="day out"></div>`; continue; }
      const k = month + '-' + D.pad(d), tag = plan.tags[k] || '', color = (TAGS.find(t => t[0] === tag) || TAGS[0])[1];
      html += `<div class="day ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${k === today ? 'today' : ''}">
        <div class="day-top"><span class="day-num">${d}</span><button class="tag ${tag ? 'set' : ''}" data-k="${k}" style="${tag ? 'background:' + color : ''}" aria-label="${d}일 표시 바꾸기">${tag || '표시'}</button></div>
        <div class="day-txt" contenteditable="plaintext-only" data-k="${k}" spellcheck="false" aria-label="${d}일 계획">${esc(plan.days[k] || '')}</div></div>`;
    }
    $('sheet').innerHTML = `
      <div class="sh-head"><div class="sh-month">${m}월</div>
        <div style="flex:1;display:grid"><div class="sh-dojo" contenteditable="plaintext-only" data-f="dojo" spellcheck="false">${esc(D.data.dojo || '우리 도장')} · ${y}</div>
        <div class="sh-title" contenteditable="plaintext-only" data-f="title" spellcheck="false">${esc(plan.title)}</div></div>
        <div class="legend">${TAGS.slice(1).map(([n, c]) => `<span style="background:${c}">${n}</span>`).join('')}</div></div>
      <div class="cal">${html}</div>
      <div class="sh-foot">
        <div class="note"><h3>🎯 이달의 목표</h3><div contenteditable="plaintext-only" data-f="goal" spellcheck="false">${esc(plan.goal)}</div></div>
        <div class="note"><h3>📢 알림</h3><div contenteditable="plaintext-only" data-f="notice" spellcheck="false">${esc(plan.notice)}</div></div>
      </div>`;
  }
  // contenteditable="plaintext-only" 를 못 쓰는 브라우저(파이어폭스)는 그냥 true 로
  const fixCE = () => { const t = document.createElement('div'); t.contentEditable = 'plaintext-only'; if (t.contentEditable !== 'plaintext-only') $('sheet').querySelectorAll('[contenteditable]').forEach(e => e.contentEditable = 'true'); };

  $('sheet').addEventListener('input', e => {
    const el = e.target.closest('[contenteditable]'); if (!el) return;
    const v = el.innerText.replace(/\n$/, '');
    if (el.dataset.k) plan.days[el.dataset.k] = v;
    else if (el.dataset.f === 'dojo') return;    // 도장 이름은 원생 관리 설정에서
    else plan[el.dataset.f] = v;
    save();
  });
  $('sheet').addEventListener('click', e => {
    const b = e.target.closest('.tag'); if (!b) return;
    const cur = plan.tags[b.dataset.k] || '', i = TAGS.findIndex(t => t[0] === cur), nx = TAGS[(i + 1) % TAGS.length];
    if (nx[0]) plan.tags[b.dataset.k] = nx[0]; else delete plan.tags[b.dataset.k];
    b.textContent = nx[0] || '표시'; b.classList.toggle('set', !!nx[0]); b.style.background = nx[0] ? nx[1] : '';
    save();
  });

  function go(m) { K.set(key(month), plan); month = m; plan = getPlan(month); render(); fixCE(); }
  const shift = n => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); go(D.ym(d)); };
  $('prev').onclick = () => shift(-1); $('next').onclick = () => shift(1);
  $('month').onchange = e => e.target.value && go(e.target.value);

  $('copyPrev').onclick = async () => {
    const [y, m] = month.split('-').map(Number), pm = D.ym(new Date(y, m - 2, 1)), p = getPlan(pm);
    if (!Object.keys(p.days).length) { K.toast('지난달 계획이 비어 있어요'); return; }
    if (!(await K.confirm('지난달 요일별 계획을 이번 달 같은 요일·같은 주차에 복사할까요? 지금 쓴 내용은 덮어써요.', '복사'))) return;
    // 같은 "n번째 무슨 요일" 로 옮김
    const [py, pmo] = pm.split('-').map(Number), days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m - 1, d), nth = Math.ceil(d / 7), dow = dt.getDay();
      const pd = new Date(py, pmo - 1, 1); const off = (dow - pd.getDay() + 7) % 7 + 1 + (nth - 1) * 7;
      const pk = pm + '-' + D.pad(off);
      if (p.days[pk]) plan.days[month + '-' + D.pad(d)] = p.days[pk];
    }
    plan.goal = plan.goal || p.goal; save(); render(); fixCE(); K.toast('복사했어요');
  };

  $('print').onclick = () => { K.set(key(month), plan); print(); };
  $('png').onclick = async () => {
    K.toast('이미지 만드는 중…');
    try {
      if (!window.html2canvas) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = H2C; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
      const el = $('sheet'); el.classList.add('exporting'); document.activeElement.blur();
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true });
      el.classList.remove('exporting');
      canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `계획표_${month}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); K.toast('저장했어요 (밴드·카톡에 올려 보세요)'); });
    } catch (e) { $('sheet').classList.remove('exporting'); K.toast('이미지 저장 도구를 불러오지 못했어요. 인쇄 → PDF 저장을 써 주세요', 3000); }
  };

  setTheme(K.get('plan:theme', 'dojang'));
  render(); fixCE();
})();

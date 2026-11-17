/* 기합 — 도장 데이터 (원생 · 반 · 출석 · 회비 · 띠 · 차량)
 * 지금은 이 기기(localStorage)에만 저장. 나중에 서버(Supabase)로 옮길 때 이 파일만 바꾸면 되게 한 곳에 모아 둠. */
(function () {
  const K = window.Kihap;
  const KEY = 'db';
  const BELTS = ['흰띠', '노란띠', '주황띠', '초록띠', '파란띠', '보라띠', '갈색띠', '빨간띠', '품띠', '1단', '2단', '3단', '4단'];
  const BELT_COLORS = { '흰띠': '#f2f2f2', '노란띠': '#f5c400', '주황띠': '#f08a24', '초록띠': '#2e9e4f', '파란띠': '#2a62d6', '보라띠': '#7a3fc4', '갈색띠': '#7a4a24', '빨간띠': '#d8323c', '품띠': 'linear-gradient(90deg,#d8323c 50%,#111 50%)', '1단': '#111', '2단': '#111', '3단': '#111', '4단': '#111' };

  const empty = () => ({
    v: 1,
    dojo: '',                       // 도장 이름
    students: [],                   // {id,name,pin,cls,belt,phone,parent,birth,joined,fee,memo,active,face}
    classes: [],                    // {id,name,time}
    att: {},                        // {'2026-11-06': {studentId: '15:02'}}
    fees: [],                       // {id,sid,ym,amount,method,date}
    belts: [],                      // {id,sid,belt,date}
    bus: { routes: [] }             // routes: {id,name,stops:[{id,name,time,sids:[]}]}
  });

  const REV = 'db:rev';             // 저장할 때마다 1씩 올리는 번호 — 다른 화면이 그사이 저장했는지 알아내는 데 씀
  let db = null, rev = 0;
  // 모양이 틀린 항목(손으로 고친 백업 파일 등)은 빈 값으로 바꿔서 화면이 멈추지 않게
  function fix(o) {
    const e = empty();
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = e;
    for (const k in e) if (o[k] == null || typeof o[k] !== typeof e[k] || Array.isArray(o[k]) !== Array.isArray(e[k])) o[k] = e[k];
    if (!Array.isArray(o.bus.routes)) o.bus.routes = [];
    o.bus.routes.forEach(r => { if (!Array.isArray(r.stops)) r.stops = []; r.stops.forEach(s => { if (!Array.isArray(s.sids)) s.sids = []; }); });
    return o;
  }
  function load() {
    db = fix(K.get(KEY, null));
    rev = K.get(REV, 0);
    return db;
  }
  const listeners = [];
  // external = true 는 '다른 화면에서 바뀌어서 새로 읽었다'는 뜻
  const notify = external => listeners.forEach(f => { try { f(db, external); } catch (e) {} });
  function save() {
    const cur = K.get(REV, 0);
    if (cur !== rev) {
      // 이 화면이 읽은 뒤에 다른 화면이 저장했다. 여기서 그대로 저장하면 그쪽 기록(예: 그사이 출석)이 지워지므로
      // 새 기록을 다시 읽고, 이 화면에서 방금 한 변경 하나만 포기한다.
      load(); notify(true);
      K.toast('다른 화면에서 바뀐 기록이 있어 새로 불러왔습니다. 방금 한 작업은 다시 해 주세요', 5000);
      return false;
    }
    const ok = K.set(KEY, db);
    if (ok) { rev = cur + 1; K.set(REV, rev); }
    notify(false);
    return ok;
  }
  const reload = () => { load(); notify(true); };
  // 다른 탭(예: 출석 화면과 원생관리)에서 바뀌면 다시 읽기
  addEventListener('storage', e => { if (e.key === 'kihap:' + KEY || e.key === null) reload(); });
  // '뒤로'로 돌아온 화면은 예전에 읽어 둔 내용을 그대로 들고 있으므로 다시 읽기
  addEventListener('pageshow', e => { if (e.persisted) reload(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && K.get(REV, 0) !== rev) reload(); });

  // 백업 파일에 넣지 않는 것: 원생 데이터 자체(따로 담음), 기기마다 다른 설정, 그날만 쓰는 임시 기록
  const NO_BACKUP = /^(db|db:rev|last|theme|mute|sb:state|draw:used|att:cam.*|bus:ride:.*)$/;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const day = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const ym = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const hm = (d = new Date()) => pad(d.getHours()) + ':' + pad(d.getMinutes());

  const D = {
    BELTS, BELT_COLORS, uid, day, ym, hm, pad,
    get data() { return db || load(); },
    save,
    onChange(f) { listeners.push(f); },      // f(data, external)

    /* 원생 */
    students(all) { const s = D.data.students; return (all ? s : s.filter(x => x.active !== false)).slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')); },
    student: id => D.data.students.find(s => s.id === id),
    nextPin() {
      const used = new Set(D.data.students.map(s => s.pin));
      for (let i = 1; i < 10000; i++) { const p = String(i).padStart(4, '0'); if (!used.has(p)) return p; }
      return '';
    },
    upsertStudent(s) {
      const list = D.data.students;
      if (!s.id) { s.id = uid(); s.joined = s.joined || day(); s.active = s.active !== false; if (!s.pin) s.pin = D.nextPin(); list.push(s); }
      else { const i = list.findIndex(x => x.id === s.id); if (i >= 0) list[i] = Object.assign(list[i], s); }
      save(); return s;
    },
    removeStudent(id) {
      const d = D.data;
      d.students = d.students.filter(s => s.id !== id);
      for (const k in d.att) delete d.att[k][id];
      d.fees = d.fees.filter(f => f.sid !== id); d.belts = d.belts.filter(b => b.sid !== id);
      d.bus.routes.forEach(r => r.stops.forEach(st => st.sids = st.sids.filter(x => x !== id)));
      save();
    },
    pinTaken: (pin, exceptId) => D.data.students.some(s => s.pin === pin && s.id !== exceptId),

    /* 반 */
    classes: () => D.data.classes,
    className: id => (D.data.classes.find(c => c.id === id) || {}).name || '',

    /* 출석 */
    checkIn(sid, when = new Date()) {
      const k = day(when); const a = D.data.att; a[k] = a[k] || {};
      if (a[k][sid]) return false;
      a[k][sid] = hm(when); save(); return true;
    },
    cancelCheckIn(sid, k = day()) { if (D.data.att[k]) { delete D.data.att[k][sid]; save(); } },
    attendedOn: (k = day()) => D.data.att[k] || {},
    monthCount(sid, m = ym()) { let n = 0; for (const k in D.data.att) if (k.startsWith(m) && D.data.att[k][sid]) n++; return n; },
    lastSeen(sid) { const ks = Object.keys(D.data.att).filter(k => D.data.att[k][sid]).sort(); return ks[ks.length - 1] || ''; },

    /* 회비 */
    feeOf: (sid, m) => D.data.fees.find(f => f.sid === sid && f.ym === m),
    pay(sid, m, amount, method) { D.data.fees = D.data.fees.filter(f => !(f.sid === sid && f.ym === m)); D.data.fees.push({ id: uid(), sid, ym: m, amount, method, date: day() }); save(); },
    unpay(sid, m) { D.data.fees = D.data.fees.filter(f => !(f.sid === sid && f.ym === m)); save(); },

    /* 띠 */
    promote(sid, belt, date = day()) { D.data.belts.push({ id: uid(), sid, belt, date }); const s = D.student(sid); if (s) s.belt = belt; save(); },
    beltHistory: sid => D.data.belts.filter(b => b.sid === sid).sort((a, b) => a.date.localeCompare(b.date)),
    // 마지막 승급 한 번 되돌리기 (띠 기록의 마지막 줄을 지우고 그 전 띠로)
    demote(sid) {
      const h = D.beltHistory(sid); if (h.length < 2) return false;
      const last = h[h.length - 1], prev = h[h.length - 2];
      D.data.belts = D.data.belts.filter(b => b.id !== last.id);
      const s = D.student(sid); if (s) s.belt = prev.belt;
      save(); return true;
    },
    beltChip(b) {
      const c = BELT_COLORS[b] || '#ccc', dark = ['흰띠', '노란띠'].includes(b);
      return `<span class="belt" style="--belt:${c};color:${dark ? '#222' : '#fff'}">${K.esc(b || '—')}</span>`;
    },

    /* 백업 — 원생 데이터에 더해, 다른 화면의 기록(월간 계획표 · 품새 대회 · 달리기 순위 · 각종 설정)도 extras 에 함께 담음 */
    exportJSON() {
      const extras = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k || !k.startsWith('kihap:')) continue;
        const name = k.slice(6); if (!NO_BACKUP.test(name)) extras[name] = localStorage.getItem(k);
      }
      return JSON.stringify(Object.assign({ exportedAt: new Date().toISOString(), app: 'kihap' }, D.data, { extras }), null, 1);
    },
    importJSON(text) {
      const o = JSON.parse(text);
      if (!o || !Array.isArray(o.students)) throw new Error('기합 백업 파일이 아니에요');
      const extras = o.extras;
      delete o.exportedAt; delete o.app; delete o.extras;
      db = fix(Object.assign(empty(), o)); rev = K.get(REV, 0); save();
      if (extras && typeof extras === 'object') for (const name in extras) {
        if (NO_BACKUP.test(name) || typeof extras[name] !== 'string') continue;
        try { localStorage.setItem('kihap:' + name, extras[name]); } catch (e) {}
      }
    },
    // 엑셀이 '0001' 을 숫자 1 로 바꾸지 않게 (CSV 에 넣을 때만 씀)
    xl: v => /^0\d+$/.test(String(v == null ? '' : v)) ? '="' + v + '"' : v,
    download(name, text, type = 'application/json') {
      const blob = new Blob([text], { type }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    // 엑셀에서 바로 열리는 CSV (한글 안 깨지게 BOM 붙임)
    csv(rows) { return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }
  };
  load();
  window.KihapDB = D;
})();

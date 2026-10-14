(() => {
  'use strict';

  /* ===== 상수 ===== */
  const STORAGE_KEY = 'ohneul-chimgim.v1';
  const CATS = {
    work:   { label: '업무',      icon: '💼' },
    home:   { label: '집안일',    icon: '🏠' },
    kids:   { label: '아이',      icon: '🧒' },
    health: { label: '운동·건강', icon: '💪' },
    self:   { label: '나',        icon: '🌿' }
  };
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const PRESETS = [
    { name: '운동 30분',          cat: 'health' },
    { name: '스트레칭 10분',      cat: 'health' },
    { name: '설거지',             cat: 'home' },
    { name: '빨래 돌리기',        cat: 'home' },
    { name: '청소기 돌리기',      cat: 'home' },
    { name: '아이 숙제 봐주기',   cat: 'kids' },
    { name: '내일 준비물 챙기기', cat: 'kids' },
    { name: '수업 자료 점검',     cat: 'work' },
    { name: '책 읽기 15분',       cat: 'self' }
  ];

  /* ===== 상태 ===== */
  let state = load();
  let currentDate = toKey(new Date());
  let filter = 'all';
  let tab = 'today';
  let formDays = [0, 1, 2, 3, 4, 5, 6];
  let lastDeleted = null;
  let toastTimer = null;

  /* ===== 저장 ===== */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return { tasks: s.tasks || [], routines: s.routines || [], log: s.log || {} };
      }
    } catch (e) { /* 무시 */ }
    return { tasks: [], routines: [], log: {} };
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
    }
  }

  /* ===== 날짜 도우미 ===== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
  function todayKey() { return toKey(new Date()); }
  function label(k) {
    const d = fromKey(k);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DAY_NAMES[d.getDay()] + ')';
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ===== DOM 도우미 (innerHTML 미사용 → 입력값 안전) ===== */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(c => {
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(c));
    });
    return e;
  }
  const $ = id => document.getElementById(id);
  // null/false 자식은 건너뛰고 붙인다 (replaceChildren에 null을 넘기면 'null' 글자가 찍힘)
  function setChildren(el, ...kids) {
    el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
  }

  /* ===== 데이터 계산 ===== */
  function routinesFor(key) {
    const wd = fromKey(key).getDay();
    return state.routines.filter(r => r.days.includes(wd) && r.createdAt <= key);
  }
  function isRoutineDone(r, key) { return (state.log[key] || []).includes(r.id); }
  function tasksFor(key) { return state.tasks.filter(t => t.date === key); }

  function stats(key) {
    const ts = tasksFor(key);
    const rs = routinesFor(key);
    const total = ts.length + rs.length;
    const done = ts.filter(t => t.done).length + rs.filter(r => isRoutineDone(r, key)).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function streak(r) {
    let n = 0;
    let k = todayKey();
    for (let i = 0; i < 400; i++) {
      if (k < r.createdAt) break;
      if (r.days.includes(fromKey(k).getDay())) {
        if (isRoutineDone(r, k)) n++;
        else if (k !== todayKey()) break;
      }
      k = addDays(k, -1);
    }
    return n;
  }

  function sortItems(a, b) {
    // 시간 있는 것 먼저(시간순), 그다음 중요도
    const ta = a.time || '99:99', tb = b.time || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (b.pri || 0) - (a.pri || 0);
  }

  /* ===== 토스트 ===== */
  function toast(msg, undoFn) {
    const t = $('toast');
    t.replaceChildren(h('span', { text: msg }));
    if (undoFn) t.append(h('button', { type: 'button', text: '되돌리기', onclick: () => { undoFn(); hideToast(); } }));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() { $('toast').hidden = true; }

  /* ===== 렌더: 오늘 ===== */
  function renderToday() {
    const isToday = currentDate === todayKey();
    $('dateLabel').replaceChildren(label(currentDate), isToday ? h('span', { class: 'badge-today', text: '오늘' }) : '');
    $('goToday').hidden = isToday;

    renderSummary();
    renderCarry();
    renderTodayRoutines();
    renderTasks();
  }

  function renderSummary() {
    const s = stats(currentDate);
    const box = $('summary');
    const ts = tasksFor(currentDate);
    const rs = routinesFor(currentDate);

    let msg;
    if (s.total === 0) msg = '아직 비어 있어요. 꼭 할 일 3개만 먼저 적어 볼까요?';
    else if (s.pct === 0) msg = '작게 시작해요. 가장 쉬운 것 하나부터!';
    else if (s.pct < 50) msg = '좋은 출발이에요. 이 흐름 그대로 가요.';
    else if (s.pct < 100) msg = '절반을 넘었어요. 거의 다 왔어요!';
    else msg = '오늘 할 일을 모두 끝냈어요. 수고했어요! 🎉';

    // 지금 먼저 할 일: 안 끝난 항목 중 시간 → 중요도 순
    const pending = [
      ...ts.filter(t => !t.done).map(t => ({ text: t.text, time: t.time, pri: t.pri })),
      ...rs.filter(r => !isRoutineDone(r, currentDate)).map(r => ({ text: r.name, time: r.time, pri: 1 }))
    ].sort(sortItems);

    box.className = 'card summary' + (s.total > 0 && s.pct === 100 ? ' all-done' : '');
    setChildren(box,
      h('p', { class: 'big' }, s.done + ' / ' + s.total + ' ', h('small', { text: '완료 · 남은 일 ' + (s.total - s.done) + '개' })),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(s.pct), 'aria-label': '오늘 진행률' },
        h('div', { style: 'width:' + s.pct + '%' })),
      h('p', { class: 'msg', text: msg }),
      pending.length ? h('p', { class: 'next-up', text: '👉 지금 먼저: ' + (pending[0].time ? pending[0].time + ' ' : '') + pending[0].text }) : null
    );
  }

  function renderCarry() {
    const box = $('carry');
    const overdue = state.tasks.filter(t => t.date < currentDate && !t.done);
    if (currentDate !== todayKey() || overdue.length === 0) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(
      h('p', { text: '지난 날 못 끝낸 할 일이 ' + overdue.length + '개 있어요.' }),
      h('button', {
        class: 'btn btn-primary btn-block', type: 'button',
        text: '오늘로 가져오기',
        onclick: () => {
          overdue.forEach(t => { t.date = currentDate; });
          save(); render();
          toast(overdue.length + '개를 오늘로 가져왔어요.');
        }
      })
    );
  }

  function renderTodayRoutines() {
    const ul = $('todayRoutines');
    const rs = routinesFor(currentDate).sort(sortItems);
    if (rs.length === 0) {
      ul.replaceChildren(h('li', { class: 'empty' },
        state.routines.length === 0
          ? '아직 루틴이 없어요. ‘🔁 루틴 관리’에서 운동·집안일을 추가해 보세요.'
          : '이 날은 예정된 루틴이 없어요.'));
      return;
    }
    ul.replaceChildren(...rs.map(r => {
      const done = isRoutineDone(r, currentDate);
      const st = streak(r);
      return row({
        done,
        text: r.name,
        cat: r.cat,
        time: r.time,
        extra: st >= 2 ? h('span', { class: 'tag tag-streak', text: '🔥 ' + st + '일 연속' }) : null,
        onToggle: () => toggleRoutine(r.id)
      });
    }));
  }

  function renderTasks() {
    const ul = $('taskList');
    let ts = tasksFor(currentDate).sort((a, b) => (a.done - b.done) || sortItems(a, b));
    if (filter === 'todo') ts = ts.filter(t => !t.done);
    if (ts.length === 0) {
      ul.replaceChildren(h('li', { class: 'empty', text: filter === 'todo' ? '남은 할 일이 없어요. 👏' : '아직 할 일이 없어요. 위에서 추가해 보세요.' }));
      return;
    }
    ul.replaceChildren(...ts.map(t => row({
      done: t.done,
      text: t.text,
      cat: t.cat,
      time: t.time,
      high: t.pri === 2,
      onToggle: () => toggleTask(t.id),
      onDelete: () => deleteTask(t.id)
    })));
  }

  function row(o) {
    const c = CATS[o.cat] || CATS.self;
    return h('li', { class: 'item' + (o.done ? ' is-done' : '') + (o.high && !o.done ? ' high' : '') },
      h('button', {
        class: 'check', type: 'button', role: 'checkbox',
        'aria-checked': String(!!o.done),
        'aria-label': o.text + (o.done ? ' 완료 취소' : ' 완료로 표시'),
        text: o.done ? '✓' : '',
        onclick: o.onToggle
      }),
      h('div', { class: 'item-body' },
        h('div', { class: 'item-text', text: o.text }),
        h('div', { class: 'meta' },
          h('span', { class: 'tag', text: c.icon + ' ' + c.label }),
          o.time ? h('span', { class: 'tag', text: '⏰ ' + o.time }) : null,
          o.high ? h('span', { class: 'tag tag-streak', text: '⭐ 꼭' }) : null,
          o.extra || null)),
      o.onDelete
        ? h('button', { class: 'del', type: 'button', text: '삭제', 'aria-label': o.text + ' 삭제', onclick: o.onDelete })
        : h('span')
    );
  }

  /* ===== 동작: 할 일 ===== */
  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    save(); render();
  }
  function deleteTask(id) {
    const i = state.tasks.findIndex(x => x.id === id);
    if (i < 0) return;
    const removed = state.tasks.splice(i, 1)[0];
    save(); render();
    toast('할 일을 삭제했어요.', () => { state.tasks.push(removed); save(); render(); });
  }
  function toggleRoutine(id) {
    const arr = state.log[currentDate] || [];
    state.log[currentDate] = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
    save(); render();
  }

  /* ===== 렌더: 루틴 관리 ===== */
  function renderPresets() {
    $('presets').replaceChildren(...PRESETS.map(p => h('button', {
      type: 'button', class: 'chip',
      text: (CATS[p.cat].icon) + ' ' + p.name,
      onclick: () => {
        $('routineName').value = p.name;
        $('routineCat').value = p.cat;
        $('routineName').focus();
      }
    })));
  }

  function renderDayPicker() {
    $('dayPicker').replaceChildren(...DAY_NAMES.map((n, i) => h('button', {
      type: 'button', class: 'day-btn',
      'aria-pressed': String(formDays.includes(i)),
      'aria-label': n + '요일',
      text: n,
      onclick: () => {
        formDays = formDays.includes(i) ? formDays.filter(d => d !== i) : [...formDays, i];
        renderDayPicker();
      }
    })));
  }

  function daysText(days) {
    if (days.length === 7) return '매일';
    const s = [...days].sort().join('');
    if (s === '12345') return '평일';
    if (s === '06') return '주말';
    return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_NAMES[d]).join('·');
  }

  function renderRoutineList() {
    const ul = $('routineList');
    if (state.routines.length === 0) {
      ul.replaceChildren(h('li', { class: 'empty', text: '아직 만든 루틴이 없어요. 위에서 빠른 추가를 눌러 보세요.' }));
      return;
    }
    ul.replaceChildren(...state.routines.map(r => {
      const c = CATS[r.cat] || CATS.self;
      const st = streak(r);
      return h('li', { class: 'item', style: 'grid-template-columns:1fr auto' },
        h('div', { class: 'item-body' },
          h('div', { class: 'item-text', text: r.name }),
          h('div', { class: 'meta' },
            h('span', { class: 'tag', text: c.icon + ' ' + c.label }),
            h('span', { class: 'tag', text: '📅 ' + daysText(r.days) }),
            r.time ? h('span', { class: 'tag', text: '⏰ ' + r.time }) : null,
            st >= 2 ? h('span', { class: 'tag tag-streak', text: '🔥 ' + st + '일 연속' }) : null)),
        h('button', {
          class: 'del', type: 'button', text: '삭제', 'aria-label': r.name + ' 루틴 삭제',
          onclick: () => {
            if (!confirm('‘' + r.name + '’ 루틴을 삭제할까요?\n지난 기록도 함께 사라져요.')) return;
            state.routines = state.routines.filter(x => x.id !== r.id);
            Object.keys(state.log).forEach(k => { state.log[k] = state.log[k].filter(x => x !== r.id); });
            save(); render();
          }
        }));
    }));
  }

  /* ===== 렌더: 이번 주 ===== */
  function weekDays(key) {
    const d = fromKey(key);
    const mondayOffset = (d.getDay() + 6) % 7;
    const monday = addDays(key, -mondayOffset);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  function renderWeek() {
    const days = weekDays(currentDate);
    const tk = todayKey();

    const bars = days.map(k => {
      const s = stats(k);
      const future = k > tk;
      return h('button', {
        type: 'button',
        class: 'wbar' + (future ? ' future' : '') + (k === currentDate ? ' sel' : ''),
        'aria-label': label(k) + ' ' + (s.total ? s.done + '/' + s.total + ' 완료' : '일정 없음') + ', 이 날로 이동',
        onclick: () => { currentDate = k; setTab('today'); }
      },
        h('div', { class: 'track' }, h('div', { class: 'fill', style: 'height:' + s.pct + '%' })),
        h('div', { class: 'dn', text: DAY_NAMES[fromKey(k).getDay()] }),
        h('div', { class: 'cnt', text: s.total ? s.done + '/' + s.total : '-' }));
    });
    $('weekChart').replaceChildren(h('div', { class: 'week-bars' }, bars));

    // 인사이트
    const past = days.filter(k => k <= tk);
    let tTotal = 0, tDone = 0;
    past.forEach(k => { const s = stats(k); tTotal += s.total; tDone += s.done; });
    const weekPct = tTotal ? Math.round(tDone / tTotal * 100) : 0;

    let best = null;
    past.forEach(k => {
      const s = stats(k);
      if (s.total > 0 && (!best || s.pct > best.pct)) best = { k, pct: s.pct };
    });

    const insights = [];
    insights.push(h('li', { text: tTotal ? '이번 주 지금까지 ' + tTotal + '개 중 ' + tDone + '개 완료 (' + weekPct + '%)' : '이번 주는 아직 기록된 일정이 없어요.' }));
    if (best) insights.push(h('li', { text: '가장 잘한 날: ' + label(best.k) + ' (' + best.pct + '%)' }));

    // 루틴별 이번 주 달성
    const rrows = state.routines.map(r => {
      let sched = 0, done = 0;
      past.forEach(k => {
        if (k >= r.createdAt && r.days.includes(fromKey(k).getDay())) {
          sched++;
          if (isRoutineDone(r, k)) done++;
        }
      });
      return { r, sched, done, rate: sched ? done / sched : null };
    }).filter(x => x.sched > 0);

    const worst = rrows.filter(x => x.rate < 1).sort((a, b) => a.rate - b.rate)[0];
    if (worst) insights.push(h('li', { text: '이번 주 자주 놓친 루틴: ‘' + worst.r.name + '’ (' + worst.done + '/' + worst.sched + '). 시간대를 바꿔 보는 것도 방법이에요.' }));
    else if (rrows.length) insights.push(h('li', { text: '이번 주 루틴을 하나도 놓치지 않았어요! 👏' }));

    const box = $('weekInsights');
    setChildren(box,
      h('p', { class: 'insight-title', text: '이번 주 요약' }),
      h('ul', { class: 'insight-list' }, insights),
      rrows.length
        ? h('table', { class: 'rtable' },
            h('thead', {}, h('tr', {}, h('th', { text: '루틴' }), h('th', { text: '이번 주' }), h('th', { text: '연속' }))),
            h('tbody', {}, rrows.map(x => h('tr', {},
              h('td', { text: x.r.name }),
              h('td', { text: x.done + '/' + x.sched }),
              h('td', { text: streak(x.r) + '일' })))))
        : null
    );
  }

  /* ===== 탭 / 전체 렌더 ===== */
  function setTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    ['today', 'routines', 'week'].forEach(t => { $('tab-' + t).hidden = t !== name; });
    render();
    window.scrollTo({ top: 0 });
  }

  function render() {
    if (tab === 'today') renderToday();
    else if (tab === 'routines') renderRoutineList();
    else renderWeek();
  }

  /* ===== 이벤트 연결 ===== */
  function init() {
    // 분류 선택지
    const opts = Object.entries(CATS).map(([v, c]) => h('option', { value: v, text: c.icon + ' ' + c.label }));
    $('taskCat').replaceChildren(...opts.map(o => o.cloneNode(true)));
    $('routineCat').replaceChildren(...opts);

    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

    $('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); render(); });
    $('nextDay').addEventListener('click', () => { currentDate = addDays(currentDate, 1); render(); });
    $('goToday').addEventListener('click', () => { currentDate = todayKey(); render(); });

    document.querySelectorAll('.filters .chip').forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      document.querySelectorAll('.filters .chip').forEach(x => {
        const on = x === b;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-pressed', String(on));
      });
      renderTasks();
    }));

    $('taskForm').addEventListener('submit', e => {
      e.preventDefault();
      const text = $('taskText').value.trim();
      if (!text) return;
      state.tasks.push({
        id: uid(), date: currentDate, text,
        cat: $('taskCat').value, pri: Number($('taskPri').value),
        time: $('taskTime').value || '', done: false
      });
      save();
      $('taskText').value = '';
      $('taskTime').value = '';
      $('taskPri').value = '1';
      $('taskText').focus();
      render();
    });

    $('routineForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('routineName').value.trim();
      if (!name) return;
      if (formDays.length === 0) { toast('반복할 요일을 하나 이상 골라 주세요.'); return; }
      state.routines.push({
        id: uid(), name,
        cat: $('routineCat').value,
        time: $('routineTime').value || '',
        days: [...formDays],
        createdAt: todayKey()
      });
      save();
      $('routineName').value = '';
      $('routineTime').value = '';
      toast('루틴을 추가했어요. ‘오늘’ 화면에서 확인해 보세요.');
      render();
    });

    $('daysAll').addEventListener('click', () => { formDays = [0, 1, 2, 3, 4, 5, 6]; renderDayPicker(); });
    $('daysWeekday').addEventListener('click', () => { formDays = [1, 2, 3, 4, 5]; renderDayPicker(); });
    $('daysWeekend').addEventListener('click', () => { formDays = [0, 6]; renderDayPicker(); });

    renderPresets();
    renderDayPicker();
    render();
  }

  init();
})();

const $ = (sel, root = document) => root.querySelector(sel);
const icon = (name, cls = 'i') => `<svg class="${cls}"><use href="#i-${name}" /></svg>`;
const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATUS_CLASS = {
  Preparing: 'is-active',
  Waiting: 'is-waiting',
  Queued: 'is-queued',
  Staged: 'is-done',
};

export function createUI({ tasks, kpi, onSelect }) {
  const detail = $('#detail');
  const steps = $('#steps');
  const currentCard = $('#current-card');
  const upcoming = $('#upcoming');
  const search = $('#search');
  const results = $('#search-results');

  // ---------- KPI ----------
  const shown = {};
  function setKpi(id, value, { format = (v) => v, delta, sub } = {}) {
    const card = $(`#${id}`);
    const el = $('[data-value]', card);
    const from = shown[id] ?? value;
    shown[id] = value;
    if (from !== value) {
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 600);
      el.textContent = format(Math.round(from + (value - from) * k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (delta !== undefined) $('[data-delta]', card).innerHTML = `${icon('arrow-up', 'i i-xs')}${delta}`;
    if (sub !== undefined) $('[data-sub]', card).textContent = sub;
  }

  function renderKpis() {
    setKpi('kpi-pending', kpi.pending, { delta: `${kpi.pendingDelta}%` });
    setKpi('kpi-ready', kpi.ready, { delta: `${kpi.readyDelta}%`, sub: `out of ${kpi.readyGoal} today` });
    setKpi('kpi-forklifts', kpi.forklifts, { delta: kpi.forkliftDelta, sub: `of ${kpi.forkliftTotal} available` });
    setKpi('kpi-rate', kpi.rate, {
      format: (v) => `${v}%`,
      delta: `${kpi.rateDelta}%`,
      sub: `target ${kpi.rateTarget}%`,
    });
    const circumference = 2 * Math.PI * 17;
    const donut = $('[data-donut]');
    donut.style.strokeDasharray = `${circumference}`;
    donut.style.strokeDashoffset = `${circumference * (1 - kpi.rate / 100)}`;
  }

  // ---------- 注文詳細 ----------
  function renderDetail(task, clockMinutes) {
    const pct = Math.round((task.ready / task.total) * 100);
    const [h, m] = task.eta.split(':').map(Number);
    const left = h * 60 + m - clockMinutes;
    const leftText = left > 0 ? ` (${Math.floor(left / 60)}h ${left % 60}m)` : '';
    const priorityClass = task.priority === 'High' ? 'prio-high' : task.priority === 'Low' ? 'prio-low' : 'prio-mid';
    detail.innerHTML = `
      <div class="detail-head">
        <span class="detail-icon">${icon('package')}</span>
        <h2>Order #${escape(task.order)}</h2>
        <span class="badge ${STATUS_CLASS[task.status]}">${escape(task.status)}</span>
        <button class="icon-btn close" type="button" aria-label="Close" data-close>${icon('x')}</button>
      </div>
      <dl class="facts">
        <dt>Customer</dt><dd>${escape(task.customer)}</dd>
        <dt>Destination</dt><dd>${escape(task.destination)}</dd>
        <dt>Priority</dt><dd class="${priorityClass}">${task.priority === 'High' ? icon('arrow-up', 'i i-xs') : ''}${escape(task.priority)}</dd>
        <dt>Order type</dt><dd>${escape(task.type)}</dd>
      </dl>
      <div class="progress-block">
        <p>Preparation progress</p>
        <strong>${task.ready} / ${task.total} pallets</strong>
        <div class="bar-row"><div class="bar"><span style="width:${pct}%"></span></div><b>${pct}%</b></div>
      </div>
      <ul class="rows">
        <li>${icon('pin')}<span>Picking zone</span><b>${escape(task.zone)}</b></li>
        <li>${icon('pallet')}<span>Pallets</span><b>${task.total} (${task.ready} ready)</b></li>
        <li>${icon('clipboard')}<span>Items</span><b>${task.skus} SKUs · ${task.units} units</b></li>
        <li>${icon('user')}<span>Assigned to</span><b><i class="mini-avatar">${escape(task.team.split(' ')[1][0])}</i>${escape(task.team)}</b></li>
        <li>${icon('clock')}<span>ETA to ship</span><b>Today ${escape(task.eta)}${leftText}</b></li>
      </ul>
      <button class="primary" type="button" data-focus>View details ${icon('chevron-right')}</button>`;
  }

  // ---------- 下部パネル ----------
  function renderBottom(current, completed) {
    const pct = current.ready / current.total;
    const loading = completed ? 'in progress' : 'pending';
    steps.style.setProperty('--fill', `${completed ? 50 + 25 * 0.5 : pct * 50}%`);
    steps.innerHTML = `
      <li class="${completed ? 'done' : 'active'}">
        <span class="dot">${completed ? icon('check') : icon('package')}</span>
        <b>Preparing</b><small>${current.ready} / ${current.total} pallets</small>
        <small class="${completed ? '' : 'accent'}">${completed ? 'Done' : 'In progress'}</small>
      </li>
      <li class="${completed ? 'active' : ''}">
        <span class="dot">${icon('truck')}</span>
        <b>Loading</b><small>${loading === 'pending' ? 'Pending' : '<span class="accent">In progress</span>'}</small>
        <small>Est. ${escape(current.eta)}</small>
      </li>
      <li>
        <span class="dot">${icon('check')}</span>
        <b>Dispatched</b><small>Pending</small><small>Est. ${escape(current.dispatch)}</small>
      </li>`;

    const p = Math.round(pct * 100);
    currentCard.dataset.id = current.id;
    currentCard.innerHTML = `
      <span class="crate"></span>
      <span class="current-body">
        <b>${escape(current.id)}</b>
        <small>${escape(current.zone)}</small>
        <small>${current.ready} of ${current.total} pallets</small>
        <span class="bar-row"><span class="bar"><span style="width:${p}%"></span></span><b>${p}%</b></span>
      </span>
      ${icon('chevron-right')}`;

    const queue = tasks.filter((t) => t !== current && t.status !== 'Staged');
    $('#upcoming-title').textContent = `Upcoming Tasks (${queue.length})`;
    upcoming.innerHTML = queue
      .map(
        (t) => `
        <li><button type="button" data-id="${escape(t.id)}">
          <b>${escape(t.id)}</b><span>${escape(t.zone)}</span><span>${t.total} pallets</span>
          <em class="badge ${STATUS_CLASS[t.status]}">${escape(t.status)}</em>
        </button></li>`,
      )
      .join('');
  }

  // ---------- 操作 ----------
  detail.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) showDetail(false);
    if (e.target.closest('[data-focus]')) onSelect(detail.dataset.id, { focus: true });
  });
  upcoming.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) onSelect(btn.dataset.id, { focus: true });
  });
  currentCard.addEventListener('click', () => onSelect(currentCard.dataset.id, { focus: true }));
  $('#view-all').addEventListener('click', () => {
    search.focus();
    showResults('');
  });

  function matches(q) {
    const s = q.trim().toLowerCase();
    return tasks.filter(
      (t) => !s || [t.id, t.order, t.zone, t.customer, t.destination].some((v) => v.toLowerCase().includes(s)),
    );
  }
  function showResults(q) {
    const list = matches(q);
    results.hidden = false;
    results.innerHTML = list.length
      ? list
          .map(
            (t) =>
              `<button type="button" data-id="${escape(t.id)}"><b>${escape(t.id)}</b><span>${escape(t.zone)} · ${escape(t.customer)}</span><em class="badge ${STATUS_CLASS[t.status]}">${escape(t.status)}</em></button>`,
          )
          .join('')
      : '<p class="empty">No matching tasks</p>';
  }
  search.addEventListener('input', () => showResults(search.value));
  search.addEventListener('focus', () => showResults(search.value));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hit = matches(search.value)[0];
      if (hit) pick(hit.id);
    }
    if (e.key === 'Escape') search.blur();
  });
  search.addEventListener('blur', () => setTimeout(() => (results.hidden = true), 150));
  results.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) pick(btn.dataset.id);
  });
  function pick(id) {
    search.value = '';
    results.hidden = true;
    search.blur();
    onSelect(id, { focus: true });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
    }
  });

  // 参照画像（sample.jpg）を重ねて見比べる
  const overlay = $('#ref-overlay');
  $('#ref-toggle').addEventListener('click', () => {
    overlay.hidden = !overlay.hidden;
    $('#ref-toggle').classList.toggle('on', !overlay.hidden);
  });
  $('#ref-opacity').addEventListener('input', (e) => {
    $('#ref-image').style.opacity = e.target.value / 100;
  });

  function showDetail(visible) {
    detail.classList.toggle('hidden', !visible);
    window.dispatchEvent(new Event('detail-toggle'));
  }

  function setClock(text) {
    $('#clock').textContent = text;
  }

  return {
    renderKpis,
    renderBottom,
    renderDetail(task, clockMinutes) {
      detail.dataset.id = task.id;
      renderDetail(task, clockMinutes);
    },
    showDetail,
    isDetailVisible: () => !detail.classList.contains('hidden'),
    setClock,
  };
}

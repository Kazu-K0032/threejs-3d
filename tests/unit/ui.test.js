import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../../src/ui.js';
import { cloneKpi, cloneTasks } from '../helpers/fixtures.js';
import { mountDashboardDom } from '../helpers/dom.js';

const $ = (selector) => document.querySelector(selector);
const text = (selector) => $(selector).textContent.replace(/\s+/g, ' ').trim();
const CLOCK_12_24 = 12 * 60 + 24;

function setup() {
  mountDashboardDom();
  const tasks = cloneTasks();
  const kpi = cloneKpi();
  const onSelect = vi.fn();
  const ui = createUI({ tasks, kpi, onSelect });
  return { ui, tasks, kpi, onSelect };
}

// KPI の数字は 600 ms かけて動くため、時計を進めて終わらせる
const finishAnimation = () => vi.advanceTimersByTimeAsync(700);

const type = (value) => {
  const input = $('#search');
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const press = (key) => $('#search').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const resultIds = () => [...document.querySelectorAll('#search-results [data-id]')].map((el) => el.dataset.id);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('KPI', () => {
  it('4 つのカードに、値・増減・補足を出す', async () => {
    const { ui } = setup();
    ui.renderKpis();
    await finishAnimation();
    expect(text('#kpi-pending [data-value]')).toBe('128');
    expect(text('#kpi-pending [data-delta]')).toBe('12%');
    expect(text('#kpi-ready [data-value]')).toBe('86');
    expect(text('#kpi-ready [data-sub]')).toBe('out of 120 today');
    expect(text('#kpi-forklifts [data-value]')).toBe('4');
    expect(text('#kpi-forklifts [data-sub]')).toBe('of 6 available');
    expect(text('#kpi-rate [data-value]')).toBe('72%');
    expect(text('#kpi-rate [data-sub]')).toBe('target 80%');
  });

  it('準備率のドーナツは、準備率の分だけ円周を残す', () => {
    const { ui, kpi } = setup();
    ui.renderKpis();
    const circumference = 2 * Math.PI * 17;
    const style = $('[data-donut]').getAttribute('style');
    expect(parseFloat(style.match(/stroke-dasharray:\s*([\d.]+)/)[1])).toBeCloseTo(circumference, 3);
    expect(parseFloat(style.match(/stroke-dashoffset:\s*([\d.]+)/)[1])).toBeCloseTo(
      circumference * (1 - kpi.rate / 100),
      3,
    );
  });

  it('値が変わると、数字が新しい値になり、カードが光る', async () => {
    const { ui, kpi } = setup();
    ui.renderKpis();
    await finishAnimation();
    expect($('#kpi-ready').classList.contains('flash')).toBe(false);
    kpi.ready = 90;
    ui.renderKpis();
    expect($('#kpi-ready').classList.contains('flash')).toBe(true);
    await finishAnimation();
    expect(text('#kpi-ready [data-value]')).toBe('90');
  });

  it('値が変わっていないカードは、光らない', async () => {
    const { ui } = setup();
    ui.renderKpis();
    await finishAnimation();
    ui.renderKpis();
    expect($('#kpi-pending').classList.contains('flash')).toBe(false);
  });
});

describe('注文詳細', () => {
  it('顧客・配送先・種類・進捗・ゾーン・担当・出荷予定を出す', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[0], CLOCK_12_24);
    const detail = text('#detail');
    expect(detail).toContain('Order #SO-45821');
    expect(detail).toContain('Summit Retail Co.');
    expect(detail).toContain('Los Angeles, CA');
    expect(detail).toContain('3 / 5 pallets');
    expect(detail).toContain('60%');
    expect(detail).toContain('A2-03');
    expect(detail).toContain('5 (3 ready)');
    expect(detail).toContain('24 SKUs · 120 units');
    expect(detail).toContain('Team Blue');
    expect(detail).toContain('Today 14:30 (2h 6m)');
  });

  it('進捗バーの幅は、準備率（%）である', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[0], CLOCK_12_24);
    expect($('#detail .bar > span').getAttribute('style')).toContain('width:60%');
  });

  it('担当のアバターには、担当名の頭文字を出す', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[3], CLOCK_12_24);
    expect(text('#detail .mini-avatar')).toBe('O');
  });

  it.each([
    [0, 'prio-high', 'High'],
    [1, 'prio-mid', 'Medium'],
    [2, 'prio-low', 'Low'],
  ])('優先度の色分け: tasks[%i] は %s', (index, className, label) => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[index], CLOCK_12_24);
    const priority = [...document.querySelectorAll('#detail .facts dd')][2];
    expect(priority.classList.contains(className)).toBe(true);
    expect(priority.textContent).toContain(label);
  });

  it('ETA を過ぎたら、残り時間のかっこを出さない', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[0], 15 * 60);
    const etaRow = [...document.querySelectorAll('#detail .rows li')].at(-1).textContent;
    expect(etaRow).toContain('Today 14:30');
    expect(etaRow).not.toContain('(');
  });

  it('文字列は HTML として解釈せず、そのまま表示する', () => {
    const { ui, tasks } = setup();
    tasks[0].customer = '<img src=x onerror=alert(1)>';
    ui.renderDetail(tasks[0], CLOCK_12_24);
    expect($('#detail img')).toBeNull();
    expect(text('#detail')).toContain('<img src=x onerror=alert(1)>');
  });

  it('表示するタスクの id を、パネルに持たせる', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[1], CLOCK_12_24);
    expect($('#detail').dataset.id).toBe(tasks[1].id);
  });

  it('状態のバッジは、状態に応じた色分けのクラスを持つ', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[0], CLOCK_12_24);
    expect($('#detail .badge').classList.contains('is-active')).toBe(true);
    ui.renderDetail(tasks[1], CLOCK_12_24);
    expect($('#detail .badge').classList.contains('is-waiting')).toBe(true);
    ui.renderDetail(tasks[2], CLOCK_12_24);
    expect($('#detail .badge').classList.contains('is-queued')).toBe(true);
  });
});

describe('注文詳細の開閉', () => {
  it('showDetail(false) で隠れ、detail-toggle を 1 回通知する', () => {
    const { ui } = setup();
    const listener = vi.fn();
    window.addEventListener('detail-toggle', listener);
    ui.showDetail(false);
    expect($('#detail').classList.contains('hidden')).toBe(true);
    expect(ui.isDetailVisible()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('detail-toggle', listener);
  });

  it('showDetail(true) で再び見える', () => {
    const { ui } = setup();
    ui.showDetail(false);
    ui.showDetail(true);
    expect(ui.isDetailVisible()).toBe(true);
  });

  it('× ボタンで閉じる', () => {
    const { ui, tasks } = setup();
    ui.renderDetail(tasks[0], CLOCK_12_24);
    $('#detail [data-close]').click();
    expect(ui.isDetailVisible()).toBe(false);
  });

  it('View details ボタンは、表示中のタスクをカメラの移動つきで選ぶ', () => {
    const { ui, tasks, onSelect } = setup();
    ui.renderDetail(tasks[2], CLOCK_12_24);
    $('#detail [data-focus]').click();
    expect(onSelect).toHaveBeenCalledWith(tasks[2].id, { focus: true });
  });
});

describe('下部パネル', () => {
  it('進行中は、準備済みの割合に合わせて線が伸び、Preparing が進行中になる', () => {
    const { ui, tasks } = setup();
    ui.renderBottom(tasks[0], false);
    expect($('#steps').getAttribute('style')).toContain('--fill: 30%');
    const [preparing, loading] = document.querySelectorAll('#steps li');
    expect(preparing.classList.contains('active')).toBe(true);
    expect(loading.classList.contains('active')).toBe(false);
    expect(preparing.textContent).toContain('3 / 5 pallets');
  });

  it('完了後は、Preparing が完了になり、Loading が進行中になる', () => {
    const { ui, tasks } = setup();
    tasks[0].ready = tasks[0].total;
    ui.renderBottom(tasks[0], true);
    const [preparing, loading] = document.querySelectorAll('#steps li');
    expect(preparing.classList.contains('done')).toBe(true);
    expect(loading.classList.contains('active')).toBe(true);
    expect($('#steps').getAttribute('style')).toContain('--fill: 62.5%');
  });

  it('Current Task に、id・ゾーン・進捗・準備率を出す', () => {
    const { ui, tasks } = setup();
    ui.renderBottom(tasks[0], false);
    const card = text('#current-card');
    expect(card).toContain('PICK-7843');
    expect(card).toContain('A2-03');
    expect(card).toContain('3 of 5 pallets');
    expect(card).toContain('60%');
  });

  it('Upcoming Tasks は、進行中と Staged を除いた件数と一覧を出す', () => {
    const { ui, tasks } = setup();
    ui.renderBottom(tasks[0], false);
    expect(text('#upcoming-title')).toBe('Upcoming Tasks (3)');
    expect(document.querySelectorAll('#upcoming button')).toHaveLength(3);
    tasks[2].status = 'Staged';
    ui.renderBottom(tasks[0], false);
    expect(text('#upcoming-title')).toBe('Upcoming Tasks (2)');
    expect([...document.querySelectorAll('#upcoming button')].map((b) => b.dataset.id)).toEqual([
      'PICK-7844',
      'PICK-7846',
    ]);
  });

  it('一覧の行を押すと、そのタスクをカメラの移動つきで選ぶ', () => {
    const { ui, tasks, onSelect } = setup();
    ui.renderBottom(tasks[0], false);
    $('#upcoming [data-id="PICK-7845"]').click();
    expect(onSelect).toHaveBeenCalledWith('PICK-7845', { focus: true });
  });

  it('Current Task のカードを押すと、進行中のタスクを選ぶ', () => {
    const { ui, tasks, onSelect } = setup();
    ui.renderBottom(tasks[0], false);
    $('#current-card').click();
    expect(onSelect).toHaveBeenCalledWith('PICK-7843', { focus: true });
  });
});

describe('検索', () => {
  it('入力すると、id・ゾーン・顧客名・配送先・注文番号のどれかに一致するタスクを出す', () => {
    setup();
    type('a2');
    expect(resultIds()).toEqual(['PICK-7843', 'PICK-7844']);
    type('northline');
    expect(resultIds()).toEqual(['PICK-7845']);
    type('las vegas');
    expect(resultIds()).toEqual(['PICK-7846']);
    type('so-45822');
    expect(resultIds()).toEqual(['PICK-7844']);
  });

  it('大文字・小文字を区別しない', () => {
    setup();
    type('CEDAR');
    expect(resultIds()).toEqual(['PICK-7846']);
  });

  it('空の入力では、すべてのタスクを出す', () => {
    setup();
    type('');
    expect(resultIds()).toHaveLength(4);
  });

  it('一致が無ければ、その旨を出す', () => {
    setup();
    type('zzz');
    expect(resultIds()).toEqual([]);
    expect(text('#search-results .empty')).toBe('No matching tasks');
  });

  it('Enter で、最初の一致を選び、入力欄を空にして一覧を閉じる', () => {
    const { onSelect } = setup();
    type('a2');
    press('Enter');
    expect(onSelect).toHaveBeenCalledWith('PICK-7843', { focus: true });
    expect($('#search').value).toBe('');
    expect($('#search-results').hidden).toBe(true);
  });

  it('一致が無いときの Enter は、何も選ばない', () => {
    const { onSelect } = setup();
    type('zzz');
    press('Enter');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('一覧の行を押すと、そのタスクを選ぶ', () => {
    const { onSelect } = setup();
    type('a2');
    $('#search-results [data-id="PICK-7844"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('PICK-7844', { focus: true });
  });

  it('フォーカスを外すと、一覧が閉じる', async () => {
    setup();
    type('a2');
    expect($('#search-results').hidden).toBe(false);
    $('#search').dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(200);
    expect($('#search-results').hidden).toBe(true);
  });

  it('/ キーで、検索欄にフォーカスが移る', () => {
    setup();
    expect(document.activeElement).not.toBe($('#search'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }));
    expect(document.activeElement).toBe($('#search'));
  });
});

describe('参照画像（sample.jpg）の重ね表示', () => {
  it('Reference ボタンで、重ね表示と押下の見た目を切り替える', () => {
    setup();
    expect($('#ref-overlay').hidden).toBe(true);
    $('#ref-toggle').click();
    expect($('#ref-overlay').hidden).toBe(false);
    expect($('#ref-toggle').classList.contains('on')).toBe(true);
    $('#ref-toggle').click();
    expect($('#ref-overlay').hidden).toBe(true);
    expect($('#ref-toggle').classList.contains('on')).toBe(false);
  });

  it('スライダーで、重ねた画像の不透明度を変える', () => {
    setup();
    const slider = $('#ref-opacity');
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ref-image').style.opacity).toBe('0.3');
  });
});

describe('時計', () => {
  it('setClock で、画面の時刻を書き換える', () => {
    const { ui } = setup();
    ui.setClock('13:05');
    expect(text('#clock')).toBe('13:05');
  });
});

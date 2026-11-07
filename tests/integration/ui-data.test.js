import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Operations } from '../../src/sim.js';
import { buildWarehouse } from '../../src/scene/warehouse.js';
import { createUI } from '../../src/ui.js';
import { mountDashboardDom } from '../helpers/dom.js';
import { cloneKpi, cloneTasks, runUntil } from '../helpers/fixtures.js';

const text = (selector) => document.querySelector(selector).textContent.replace(/\s+/g, ' ').trim();
const CLOCK = 12 * 60 + 24;

// main.js と同じく、選択された id のタスクを注文詳細に出す
function setup() {
  mountDashboardDom();
  const tasks = cloneTasks();
  const world = buildWarehouse(new THREE.Scene());
  const operations = new Operations({ world, tasks });
  const ui = createUI({
    tasks,
    kpi: cloneKpi(),
    onSelect: (id) =>
      ui.renderDetail(
        tasks.find((t) => t.id === id),
        CLOCK,
      ),
  });
  return { tasks, operations, ui };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UI と、データ・シミュレーションの結び付き', () => {
  it('どのタスクも、注文詳細と下部パネルに、自分の値で表示できる', () => {
    const { tasks, ui } = setup();
    for (const task of tasks) {
      ui.renderDetail(task, CLOCK);
      ui.renderBottom(task, false);
      expect(text('#detail')).toContain(`Order #${task.order}`);
      expect(text('#detail')).toContain(task.customer);
      expect(text('#detail')).toContain(task.zone);
      expect(text('#current-card')).toContain(task.id);
    }
  });

  it('検索で選んだタスクの注文詳細が、そのタスクの値で出る', () => {
    const { ui } = setup();
    const input = document.querySelector('#search');
    input.value = 'phoenix';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(text('#detail')).toContain('Northline Outfitters');
    expect(ui.isDetailVisible()).toBe(true);
  });

  it('運搬が進むたびに、注文詳細の進捗が最新の値になる', () => {
    const { tasks, operations, ui } = setup();
    operations.on('progress', (task) => ui.renderDetail(task, CLOCK));
    runUntil(operations, () => tasks[0].ready === 4);
    expect(text('#detail')).toContain('4 / 5 pallets');
    expect(text('#detail')).toContain('80%');
    runUntil(operations, () => tasks[0].ready === 5);
    expect(text('#detail')).toContain('5 / 5 pallets');
    expect(text('#detail')).toContain('100%');
  });

  it('タスクが完了すると、下部パネルが Loading へ進み、Upcoming から外れる', () => {
    const { tasks, operations, ui } = setup();
    operations.on('complete', (task) => ui.renderBottom(task, true));
    runUntil(operations, () => tasks[0].status === 'Staged');
    const [preparing, loading] = document.querySelectorAll('#steps li');
    expect(preparing.classList.contains('done')).toBe(true);
    expect(loading.classList.contains('active')).toBe(true);
    expect(text('#upcoming-title')).toBe('Upcoming Tasks (3)');
  });
});

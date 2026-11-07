import { describe, expect, it } from 'vitest';
import { CLOCK_START, KPI, TASKS } from '../../src/data.js';

const STATUSES = ['Preparing', 'Waiting', 'Queued', 'Staged'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const toMinutes = (text) => {
  const [hour, minute] = text.split(':').map(Number);
  return hour * 60 + minute;
};

describe('TASKS', () => {
  it('id・order・zone が重複しない', () => {
    for (const key of ['id', 'order', 'zone']) {
      const values = TASKS.map((task) => task[key]);
      expect(new Set(values).size, `${key} が重複している`).toBe(values.length);
    }
  });

  it.each(TASKS)('$id の進捗は 0 以上 total 以下の整数である', (task) => {
    expect(Number.isInteger(task.ready)).toBe(true);
    expect(Number.isInteger(task.total)).toBe(true);
    expect(task.ready).toBeGreaterThanOrEqual(0);
    expect(task.ready).toBeLessThanOrEqual(task.total);
  });

  it.each(TASKS)('$id の状態と優先度は、画面が扱える値である', (task) => {
    expect(STATUSES).toContain(task.status);
    expect(PRIORITIES).toContain(task.priority);
  });

  it('進行中（Preparing）のタスクは 1 件だけである', () => {
    expect(TASKS.filter((task) => task.status === 'Preparing')).toHaveLength(1);
  });

  it.each(TASKS)('$id の ETA と出荷予定は HH:MM 形式で、ETA のほうが早い', (task) => {
    expect(task.eta).toMatch(/^\d{2}:\d{2}$/);
    expect(task.dispatch).toMatch(/^\d{2}:\d{2}$/);
    expect(toMinutes(task.eta)).toBeLessThan(toMinutes(task.dispatch));
  });

  // 画面（ui.js）が、担当名の 2 語目の頭文字をアバターに出すため
  it.each(TASKS)('$id の担当は「Team <名前>」の形である', (task) => {
    expect(task.team).toMatch(/^Team \S+$/);
  });

  it('ゾーンは「英字 1〜2 文字-数字 2 桁」の形である', () => {
    for (const task of TASKS) expect(task.zone).toMatch(/^[A-Z]\d-\d{2}$/);
  });
});

describe('KPI', () => {
  it('件数は 0 以上である', () => {
    for (const key of ['pending', 'ready', 'readyGoal', 'forklifts', 'forkliftTotal']) {
      expect(KPI[key], key).toBeGreaterThanOrEqual(0);
    }
  });

  it('準備率は 0〜100 で、目標と同じ単位である', () => {
    expect(KPI.rate).toBeGreaterThanOrEqual(0);
    expect(KPI.rate).toBeLessThanOrEqual(100);
    expect(KPI.rateTarget).toBeLessThanOrEqual(100);
  });

  it('準備済みのパレット数は目標以下で、稼働中のフォークリフトは台数以下である', () => {
    expect(KPI.ready).toBeLessThanOrEqual(KPI.readyGoal);
    expect(KPI.forklifts).toBeLessThanOrEqual(KPI.forkliftTotal);
  });
});

describe('CLOCK_START', () => {
  it('時刻として正しい範囲である', () => {
    expect(CLOCK_START.hour).toBeGreaterThanOrEqual(0);
    expect(CLOCK_START.hour).toBeLessThan(24);
    expect(CLOCK_START.minute).toBeGreaterThanOrEqual(0);
    expect(CLOCK_START.minute).toBeLessThan(60);
  });
});

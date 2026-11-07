import { expect, test as base } from '@playwright/test';

// 開発サーバーのときだけ公開される window.__app（src/main.js）で、3D のパレットを画面の座標に変換する。
// 3D の中のパレットを、実際のマウスで押せるようにするため
const screenPositionOf = (page, taskId) =>
  page.evaluate((id) => {
    const { stage, ops } = window.__app;
    const unit = ops.pickables.find((p) => p.userData.taskId === id);
    const v = unit.position.clone();
    unit.getWorldPosition(v);
    v.y += 0.4;
    v.project(stage.camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }, taskId);

// ソフトウェア描画は 1 fps ほどしか出ない。カメラの移動を、ページの中で進めて落ち着かせる
const settleCamera = (page) =>
  page.evaluate(() => {
    for (let i = 0; i < 200; i++) window.__app.stage.update(0.05);
  });

const test = base.extend({
  // 画面を開き、コンソールのエラー・警告を集める。テストの最後に、1 件も出ていないことを確かめる
  app: async ({ page }, use) => {
    const problems = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) problems.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    await page.goto('/');
    await page.waitForFunction(() => window.__app);
    await use({ page, problems });
    expect(problems).toEqual([]);
  },
});

const detailTitle = (page) => page.locator('#detail .detail-head h2');

test('起動すると、KPI・注文詳細・下部パネルが出て、3D が描かれる', async ({ app: { page } }) => {
  await expect(page).toHaveTitle('Warehouse 3D Dashboard');
  await expect(page.locator('#kpi-pending [data-value]')).toHaveText('128');
  await expect(page.locator('#kpi-ready [data-value]')).toHaveText('86');
  await expect(page.locator('#kpi-forklifts [data-value]')).toHaveText('4');
  await expect(page.locator('#kpi-rate [data-value]')).toHaveText('72%');
  await expect(detailTitle(page)).toHaveText('Order #SO-45821');
  await expect(page.locator('#current-card')).toContainText('3 of 5 pallets');
  await expect(page.locator('#upcoming-title')).toHaveText('Upcoming Tasks (3)');
  await expect(page.locator('#viewport canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__app.stage.renderer.info.render.triangles)).toBeGreaterThan(1000);
});

test('3D のパレットにカーソルを重ねるとラベルが出て、押すと注文詳細が切り替わる', async ({ app: { page } }) => {
  const position = await screenPositionOf(page, 'PICK-7845');
  await page.mouse.move(position.x, position.y);
  await expect(page.locator('.tag-hover')).toBeVisible();
  await expect(page.locator('.tag-hover')).toContainText('PICK-7845');
  await page.mouse.click(position.x, position.y);
  await expect(detailTitle(page)).toHaveText('Order #SO-45823');
  await expect(page.locator('.tag-selected')).toContainText('PICK-7845');
});

test('一覧や検索でタスクを選べて、詳細を閉じても、また開ける', async ({ app: { page } }) => {
  await page.locator('#upcoming [data-id="PICK-7846"]').click();
  await expect(detailTitle(page)).toHaveText('Order #SO-45824');

  await page.locator('#detail [data-close]').click();
  await expect(page.locator('#detail')).toHaveClass(/hidden/);

  await page.keyboard.press('/');
  await expect(page.locator('#search')).toBeFocused();
  await page.keyboard.type('phoenix');
  await expect(page.locator('#search-results [data-id]')).toHaveCount(1);
  // 候補の一覧が、下の KPI カードに隠れていない（最前面にある）。カードの隙間に当たらないよう、幅に沿って複数の点を調べる
  const coveredRatios = await page
    .locator('#search-results [data-id]')
    .first()
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return [0.1, 0.3, 0.5, 0.7, 0.9].filter((ratio) => {
        const hit = document.elementFromPoint(rect.left + rect.width * ratio, rect.top + rect.height / 2);
        return !el.contains(hit);
      });
    });
  expect(coveredRatios).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(page.locator('#detail')).not.toHaveClass(/hidden/);
  await expect(detailTitle(page)).toHaveText('Order #SO-45823');
});

test('運搬が進むと、進捗と KPI が画面に反映される', async ({ app: { page } }) => {
  // 実時間では 1 回の運搬に数分かかるため、ページの中で時間を進める
  await page.evaluate(() => {
    const { ops } = window.__app;
    let time = 0;
    while (ops.current.ready < 4) ops.update(0.05, (time += 0.05));
  });
  await expect(page.locator('#kpi-ready [data-value]')).toHaveText('87');
  await expect(page.locator('#kpi-rate [data-value]')).toHaveText('73%');
  await expect(page.locator('#current-card')).toContainText('4 of 5 pallets');
  await expect(page.locator('#detail')).toContainText('4 / 5 pallets');
});

test('全タスクを終えると、画面の数値も最初の状態へ戻る', async ({ app: { page } }) => {
  await page.evaluate(() => {
    const { ops } = window.__app;
    let reset = false;
    ops.on('reset', () => (reset = true));
    let time = 0;
    while (!reset && time < 1500) ops.update(0.05, (time += 0.05));
  });
  await expect(page.locator('#kpi-pending [data-value]')).toHaveText('128');
  await expect(page.locator('#kpi-ready [data-value]')).toHaveText('86');
  await expect(page.locator('#kpi-rate [data-value]')).toHaveText('72%');
  await expect(page.locator('#current-card')).toContainText('3 of 5 pallets');
  await expect(page.locator('#upcoming-title')).toHaveText('Upcoming Tasks (3)');
});

test.describe('スマホの幅', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('詳細は閉じて始まり、パレットを押すと下のシートが開いて、選んだ場所が隠れない', async ({ app: { page } }) => {
    await expect(page.locator('#detail')).toHaveClass(/hidden/);

    const position = await screenPositionOf(page, 'PICK-7844');
    await page.mouse.move(position.x, position.y);
    await expect(page.locator('.tag-hover')).toBeVisible();
    await page.mouse.click(position.x, position.y);
    await expect(page.locator('#detail')).not.toHaveClass(/hidden/);
    await expect(detailTitle(page)).toHaveText('Order #SO-45822');

    await settleCamera(page);
    const layout = await page.evaluate(() => ({
      sheetTop: document.querySelector('#detail').getBoundingClientRect().top,
      visibleTop: document.querySelector('.kpis').getBoundingClientRect().bottom,
    }));
    const { y } = await screenPositionOf(page, 'PICK-7844');
    expect(y).toBeGreaterThan(layout.visibleTop);
    expect(y).toBeLessThan(layout.sheetTop);
  });
});

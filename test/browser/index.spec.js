import {test, expect} from '@playwright/test';

const titles = {models: 'Modello', sqlite: 'Migrazioni SQLite', queries: 'Query'};
async function panel(page, section) {
    const iframe = page.locator(`iframe[title="${titles[section]}"]`);
    await expect(iframe).toBeVisible();
    await expect(iframe.contentFrame().locator('[data-gramlot-page]')).toHaveAttribute('data-gramlot-page', section);
    const frame = await (await iframe.elementHandle()).contentFrame();
    await expect.poll(() => frame.evaluate(() => window.gramlot?.data.getItem('ready'))).toBe(true);
    return frame;
}
async function navigate(page, section) {
    await page.getByRole('treeitem', {name: titles[section], exact: true}).click();
    return panel(page, section);
}

test('IndexPage retains editors and synchronizes models with already-open pages', async ({page}) => {
    const errors = [], failedAssets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedAssets.push(response.url()); });
    await page.goto('/');
    const model = await panel(page, 'models');
    const sqlite = await navigate(page, 'sqlite');
    await expect(sqlite.locator('#db-status')).toContainText('SQLite aperto');
    await navigate(page, 'models');
    const source = "root.db({name:'shared', implementation:'sqlite'}).packages().package('app').table({name:'item',pkey:'id'}).column({name:'id',dtype:'I'});";
    await model.locator('#model').getByRole('textbox').fill(source);
    await model.getByRole('button', {name: 'Genera JSON'}).click();
    await expect(model.locator('#status')).toContainText('1 tabelle');
    await navigate(page, 'sqlite');
    await expect.poll(() => sqlite.evaluate(() => window.gramlot.data.getItem('source'))).toBe(source);
    await sqlite.getByRole('button', {name: 'Calcola piano SQL'}).click();
    await expect(sqlite.locator('#sql-plan')).toContainText('app_item');
    // Switching real Gramlot tabs keeps the same iframe, Source, Data and editor history.
    await page.getByRole('tab', {name: 'Modello', exact: true}).click();
    await expect(model.locator('#model').getByRole('textbox')).toBeVisible();
    expect(await panel(page, 'models')).toBe(model);
    await model.locator('#model').getByRole('textbox').press('ControlOrMeta+z');
    await expect.poll(() => model.evaluate(() => window.gramlot.data.getItem('source'))).not.toBe(source);
    await expect(page.locator('iframe')).toHaveCount(2);
    await expect(page).toHaveURL(/page=models/);
    await model.locator('#example').selectOption('application');
    await expect(model.locator('#status')).toContainText('JSON identico al riferimento Python');
    await model.locator('header').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'output/gramlot-index.png'});
    expect(errors).toEqual([]);
    expect(failedAssets).toEqual([]);
});

test('IndexPage opens query deep links, preserves real SQLite data and supports Back', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?page=queries');
    const queries = await panel(page, 'queries');
    await queries.getByRole('button', {name: 'Applica migrazione'}).click();
    await expect(queries.locator('#db-status')).toContainText('commit completato');
    await queries.getByRole('button', {name: 'Esegui query'}).click();
    await expect(queries.locator('#query-status')).toContainText('INSERT completato');
    await navigate(page, 'sqlite');
    await page.goBack();
    expect(await panel(page, 'queries')).toBe(queries);
    await queries.locator('#query-example').selectOption('people');
    await queries.getByRole('button', {name: 'Esegui query'}).click();
    await expect(queries.locator('#query-status')).toContainText('1 righe lette');
    await page.reload();
    const reopened = await panel(page, 'queries');
    await reopened.locator('#query-example').selectOption('people');
    await reopened.getByRole('button', {name: 'Esegui query'}).click();
    await expect(reopened.locator('#query-status')).toContainText('1 righe lette');
    expect(errors).toEqual([]);
});

test('IndexPage offers a navigation drawer on a phone without overflow', async ({page}) => {
    test.setTimeout(20_000);
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/?page=models');
    await panel(page, 'models');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button', {name: 'Open left region'}).click();
    await navigate(page, 'sqlite');
    await page.getByRole('button', {name: 'Close left region'}).click();
    await expect(page.getByRole('tree')).not.toBeVisible();
    await expect.poll(async () => (await page.locator('iframe[title="Migrazioni SQLite"]').boundingBox()).width).toBeGreaterThan(380);
    await expect(page.getByRole('tab', {name: 'Migrazioni SQLite', exact: true})).toBeVisible();
    await page.screenshot({path: 'output/gramlot-index-mobile.png'});
});

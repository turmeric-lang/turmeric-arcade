// The workspace (ported from Try Turmeric and the C playground): the program
// kept across a reload, the dividers between the panes, and the editor's keys.
import { test, expect } from '@playwright/test';

async function open(page, path = '/') {
    await page.goto(path);
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
}
const source = (page) => page.evaluate(() => window.arcade.getSource());
const PROGRAM = '(defn main [] : int (println "kept: 7.1") 0)\n';

test('the program comes back after a reload', async ({ page }) => {
    await open(page);
    await page.evaluate((s) => window.arcade.setSource(s), PROGRAM);
    await page.evaluate(() => window.arcade.saveNow());
    await page.goto('/');   // no #code=: what comes back is the stored copy
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    expect(await source(page)).toBe(PROGRAM);
});

test('an edited example comes back with its menu entry', async ({ page }) => {
    await open(page, '/?example=pong');
    await page.evaluate(() => window.arcade.setSource(window.arcade.getSource() + ';; mine\n'));
    await page.evaluate(() => window.arcade.saveNow());
    await page.goto('/');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    expect(await source(page)).toContain(';; mine');
    expect(await page.locator('#examples').inputValue()).toBe('pong');
});

test('a link wins over the stored program', async ({ page }) => {
    await open(page);
    await page.evaluate((s) => window.arcade.setSource(s), PROGRAM);
    await page.evaluate(() => window.arcade.saveNow());
    await page.goto('/?example=life');
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    expect(await source(page)).toContain('life -- ');
});

test('Ctrl+S keeps the program and says so', async ({ page }) => {
    await open(page);
    await page.locator('.monaco-editor .view-lines').click();
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('#status')).toHaveText('saved in this browser');
});

test('the editor | screen divider drags, takes the arrow keys, and is remembered', async ({ page }) => {
    await open(page);
    const width = async () => (await page.locator('#editor-pane').boundingBox()).width;
    const panes = await page.locator('.panes').boundingBox();
    const before = await width();
    expect(Math.abs(before / panes.width - 0.5)).toBeLessThan(0.02);
    const h = await page.locator('#split-main').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + 100);
    await page.mouse.down();
    await page.mouse.move(panes.x + panes.width * 0.35, h.y + 100, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await width()) / panes.width - 0.35)).toBeLessThan(0.02);
    await page.locator('#split-main').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(Math.abs((await width()) / panes.width - 0.39)).toBeLessThan(0.02);
    await page.reload();
    await page.waitForFunction(() => window.arcade && window.arcade.editorKind === 'monaco');
    expect(Math.abs((await width()) / panes.width - 0.39)).toBeLessThan(0.02);
    await page.locator('#split-main').dblclick();
    expect(Math.abs((await width()) / panes.width - 0.5)).toBeLessThan(0.02);
});

test('the screen | console divider sets the screen\'s height', async ({ page }) => {
    await open(page);
    const right = await page.locator('#right').boundingBox();
    const h = await page.locator('#split-screen').boundingBox();
    await page.mouse.move(h.x + 50, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + 50, right.y + right.height * 0.7, { steps: 5 });
    await page.mouse.up();
    const screen = await page.locator('#screen-host').boundingBox();
    expect(Math.abs(screen.height / right.height - 0.7)).toBeLessThan(0.03);
});

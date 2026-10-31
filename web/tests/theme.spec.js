// The theme (raylib-web-playground-plan P2): light or dark, the OS's until
// the visitor picks one with the toggle, which then sticks (public/theme.js,
// Try Turmeric's switch).  Monaco follows, since it takes its colours as a
// JS theme rather than from the stylesheet.
import { test, expect } from '@playwright/test';

const LIGHT_BG = 'rgb(251, 248, 242)';   // style.css --bg, light
const DARK_BG = 'rgb(21, 20, 26)';       // style.css --bg, dark

async function open(page) {
    await page.goto('/');
    await page.waitForFunction(() => !!window.arcade && window.arcade.editorKind === 'monaco');
}
const theme = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const editorBg = (page) => page.evaluate(() =>
    getComputedStyle(document.querySelector('.monaco-editor .monaco-editor-background')).backgroundColor);

test('the page follows a light OS until the visitor picks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    expect(await theme(page)).toBe('light');
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await editorBg(page)).toBe(LIGHT_BG);
});

test('and a dark one', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    expect(await theme(page)).toBe('dark');
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await editorBg(page)).toBe(DARK_BG);
});

test('the toggle flips the page and the editor, and the choice sticks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await page.click('#theme-btn');
    expect(await theme(page)).toBe('light');
    await expect.poll(() => editorBg(page)).toBe(LIGHT_BG);
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    await expect(page.locator('#theme-btn')).toHaveAttribute('title', 'Switch to dark theme');
    await page.reload();
    await page.waitForFunction(() => !!window.arcade && window.arcade.editorKind === 'monaco');
    expect(await theme(page)).toBe('light');
    expect(await editorBg(page)).toBe(LIGHT_BG);
});

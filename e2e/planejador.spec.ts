import { expect, test } from '@playwright/test';

test('carrega o plano com as 38 injetoras e os indicadores', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Planejamento das injetoras' })).toBeVisible();
  await expect(page.locator('.gantt-row')).toHaveCount(38);
  await expect(page.getByText('Ordens em risco')).toBeVisible();
  await expect(page.getByText('Dados fictícios', { exact: false })).toBeVisible();
});

test('arrastar para injetora incompatível mostra o motivo e não move', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.bar--planejada:not(.bar--risco)').first();
  await bar.scrollIntoViewIfNeeded();
  const antes = await bar.getAttribute('aria-label');
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  // desce muitas linhas: em algum ponto cai numa injetora incompatível ou ocupada
  let vermelho = false;
  for (let i = 1; i <= 30 && !vermelho; i++) {
    await page.mouse.move(box.x + 8, box.y + box.height / 2 + i * 38, { steps: 2 });
    vermelho = (await page.locator('.ghost--no').count()) > 0;
  }
  expect(vermelho).toBe(true);
  await expect(page.locator('.ghost-tip')).toContainText('Não cabe');
  await page.mouse.up();
  await expect(page.locator('.toast')).toContainText('Não cabe');
  const depois = await page.locator(`[aria-label="${antes}"]`).count();
  expect(depois).toBe(1);
});

test('teclado move a ordem selecionada e o reagendamento só grava ao aplicar', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('.bar--planejada:not(.bar--risco)').last();
  await bar.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Ordem selecionada' })).toBeVisible();
  await page.getByRole('button', { name: 'Reagendar automaticamente' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Antes');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Reagendar automaticamente' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.toast')).toContainText('Reagendamento aplicado');
  await expect(page.locator('.kpi').nth(2).locator('strong')).toHaveText('0');
});

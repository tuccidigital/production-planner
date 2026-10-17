/**
 * Grava as telas de demonstração usadas no vídeo do case (Tucci Motion Kit).
 * Uso: `npx tsx e2e/alvos-demo.ts`, `npx vite preview --port 4173` (com build:mock) e `node e2e/gravar-demo.mjs`.
 * Saída: docs/gravacoes/*.mp4. Grava pelo screencast do Chrome (CDP) e monta o vídeo com o ffmpeg do sistema.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL = process.env.DEMO_URL ?? 'http://localhost:4173/';
const OUT = 'docs/gravacoes';
const VIEW = { width: 1600, height: 1000 };
const ROW = 38;
const executablePath = process.env.PW_CHROMIUM || undefined;

// Cursor visível: a gravação do navegador não mostra o ponteiro.
const cursor = () => {
  const c = document.createElement('div');
  c.id = '__cursor';
  Object.assign(c.style, {
    position: 'fixed', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(23,25,28,.85)',
    border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)', pointerEvents: 'none', zIndex: 99999,
    transform: 'translate(-50%,-50%)', left: '-40px', top: '-40px', transition: 'width .1s, height .1s',
  });
  const add = () => document.body && !document.getElementById('__cursor') && document.body.appendChild(c);
  document.addEventListener('DOMContentLoaded', add);
  window.addEventListener('pointermove', (e) => { add(); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  window.addEventListener('pointerdown', () => { c.style.width = '14px'; c.style.height = '14px'; }, true);
  window.addEventListener('pointerup', () => { c.style.width = '18px'; c.style.height = '18px'; }, true);
};

async function novaPagina(browser, gravar) {
  const ctx = await browser.newContext({ viewport: VIEW, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.addInitScript(cursor);
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('.bar');
  await page.waitForTimeout(400);
  let frames = null;
  if (gravar) {
    frames = [];
    const cdp = await ctx.newCDPSession(page);
    cdp.on('Page.screencastFrame', async (f) => {
      frames.push({ data: f.data, t: f.metadata.timestamp });
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
    page.__cdp = cdp;
  }
  page.__frames = frames;
  return { ctx, page };
}

async function suave(page, de, para, passos = 25) {
  for (let i = 1; i <= passos; i++) {
    await page.mouse.move(de.x + ((para.x - de.x) * i) / passos, de.y + ((para.y - de.y) * i) / passos);
    await page.waitForTimeout(16);
  }
}

async function salvar(ctx, page, nome) {
  await page.waitForTimeout(200);
  await page.__cdp.send('Page.stopScreencast');
  const frames = page.__frames;
  await ctx.close();
  // Monta o vídeo respeitando o tempo real entre os quadros (concat do ffmpeg com duração).
  const dir = join(OUT, 'tmp', nome);
  mkdirSync(dir, { recursive: true });
  let lista = '';
  frames.forEach((f, i) => {
    const arq = resolve(dir, `${String(i).padStart(5, '0')}.jpg`);
    writeFileSync(arq, Buffer.from(f.data, 'base64'));
    const dur = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].t - f.t) : 0.5;
    lista += `file '${arq}'\nduration ${dur.toFixed(4)}\n`;
  });
  lista += `file '${resolve(dir, String(frames.length - 1).padStart(5, '0') + '.jpg')}'\n`;
  writeFileSync(join(dir, 'lista.txt'), lista);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'lista.txt'),
    '-vf', `fps=30,scale=${VIEW.width}:${VIEW.height}:force_original_aspect_ratio=decrease,pad=${VIEW.width}:${VIEW.height}:(ow-iw)/2:(oh-ih)/2:color=white`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', join(OUT, `${nome}.mp4`)]);
}

const browser = await chromium.launch({ executablePath });
mkdirSync(OUT, { recursive: true });
const plano = JSON.parse(readFileSync(join(OUT, 'alvos.json'), 'utf-8'));
const PX_H = 5; // zoom "Dia"
const HORA = 3_600_000;

// 1. Visão geral: indicadores, troca de zoom e um conflito aberto pelo painel.
{
  const { ctx, page } = await novaPagina(browser, true);
  await page.waitForTimeout(1200);
  await suave(page, { x: 800, y: 500 }, { x: 1180, y: 100 });
  await page.getByRole('tab', { name: 'Turno' }).click();
  await page.waitForTimeout(1600);
  await page.getByRole('tab', { name: 'Dia' }).click();
  await page.waitForTimeout(900);
  const link = page.locator('.conflicts .link').first();
  const lb = await link.boundingBox();
  await suave(page, { x: 1180, y: 100 }, { x: lb.x + 40, y: lb.y + 8 });
  await link.click();
  await page.waitForTimeout(2600);
  await salvar(ctx, page, 'visao-geral');
}

// 2. Arrastar: primeiro um destino que não cabe (motivo aparece), depois um que cabe.
{
  const { ctx, page } = await novaPagina(browser, true);
  const bar = page.locator(`[aria-label^="${plano.ordem},"]`);
  await bar.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.waitForTimeout(700);
  const box = await bar.boundingBox();
  const p0 = { x: box.x + 24, y: box.y + box.height / 2 };
  const yDe = async (maquina) => {
    const linha = page.locator('.gantt-row', { has: page.locator('strong', { hasText: new RegExp(`^${maquina}$`) }) });
    const b = await linha.boundingBox();
    return b.y + b.height / 2;
  };
  const xDe = (t) => p0.x + ((t - plano.slotStart) / HORA) * PX_H;
  await suave(page, { x: 700, y: 300 }, p0);
  await page.mouse.down();
  const ruim = { x: xDe(plano.ruim.start), y: await yDe(plano.ruim.maquina) };
  await suave(page, p0, ruim, 40);
  await page.waitForTimeout(2600);
  const bom = { x: xDe(plano.bom.start) + 1, y: await yDe(plano.bom.maquina) };
  await suave(page, ruim, bom, 40);
  await page.waitForTimeout(150);
  if (!(await page.locator('.ghost--ok').count())) throw new Error('O destino calculado não ficou verde na tela.');
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await page.waitForTimeout(2400);
  await salvar(ctx, page, 'arrastar');
}

// 3. Reagendar: antes e depois, e só grava ao aplicar.
{
  const { ctx, page } = await novaPagina(browser, true);
  const btn = page.getByRole('button', { name: 'Reagendar automaticamente' });
  const bb = await btn.boundingBox();
  await page.waitForTimeout(800);
  await suave(page, { x: 800, y: 500 }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  await btn.click();
  await page.waitForTimeout(3200);
  const aplicar = page.getByRole('dialog').getByRole('button', { name: 'Aplicar' });
  const ab = await aplicar.boundingBox();
  await suave(page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }, { x: ab.x + ab.width / 2, y: ab.y + ab.height / 2 });
  await aplicar.click();
  await page.waitForTimeout(2800);
  await salvar(ctx, page, 'reagendar');
}

await browser.close();
rmSync(join(OUT, 'tmp'), { recursive: true, force: true });
console.log('gravações:', readdirSync(OUT));

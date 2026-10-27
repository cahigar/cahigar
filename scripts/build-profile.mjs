#!/usr/bin/env node
// Genera los SVG de la portada (tarjetas de proyectos y panel de actividad)
// y reescribe las secciones automáticas del README.
//
//   GITHUB_TOKEN=... node scripts/build-profile.mjs
//
// Sin token (o sin red) regenera las tarjetas con los datos de projects.json y
// deja intactos el panel y la lista de actividad que ya hubiera.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'generated');
const config = JSON.parse(await readFile(join(ROOT, 'profile', 'projects.json'), 'utf8'));
const USER = process.env.PROFILE_USER || config.usuario;
const OCULTAR = new Set((config.ocultar || []).map((n) => n.toLowerCase()));
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const FONT_MONO = "'JetBrains Mono','Fira Code','SFMono-Regular',Consolas,'Liberation Mono',monospace";
const FONT_SANS = "'Segoe UI','Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif";

// ───────────────────────────── utilidades ─────────────────────────────
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(text, max, lines) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
      if (out.length === lines) break;
    } else cur += ' ' + w;
  }
  if (out.length < lines && cur.trim()) out.push(cur.trim());
  if (out.length === lines && out.join(' ').length < String(text).length) {
    out[lines - 1] = out[lines - 1].replace(/[\s,.;:]*\S*$/, '') + '…';
  }
  return out;
}

const fmt = (n) => new Intl.NumberFormat('es-ES').format(n);

function hace(fecha) {
  const d = (Date.now() - new Date(fecha).getTime()) / 86400000;
  if (d < 1) return 'hoy';
  if (d < 2) return 'ayer';
  if (d < 30) return `hace ${Math.floor(d)} días`;
  if (d < 60) return 'hace 1 mes';
  if (d < 365) return `hace ${Math.floor(d / 30)} meses`;
  return `hace ${Math.floor(d / 365)} año${d >= 730 ? 's' : ''}`;
}

// ───────────────────────────── datos ─────────────────────────────
async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'cahigar-profile' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json).slice(0, 400));
  return json.data;
}

async function fetchData() {
  if (!TOKEN) return null;
  const q = `query($login:String!){
    user(login:$login){
      followers{totalCount}
      repositories(ownerAffiliations:OWNER, privacy:PUBLIC, first:100, orderBy:{field:PUSHED_AT,direction:DESC}){
        totalCount
        nodes{
          name description url homepageUrl pushedAt isFork isArchived stargazerCount forkCount
          primaryLanguage{name color}
          languages(first:10, orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}
          repositoryTopics(first:20){nodes{topic{name}}}
        }
      }
      contributionsCollection{
        totalCommitContributions totalPullRequestContributions totalIssueContributions totalRepositoryContributions
        contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } }
      }
    }
  }`;
  const { user } = await gql(q, { login: USER });
  return user;
}

// ───────────────────────────── iconos ─────────────────────────────
const ICONOS = {
  grid: (c) => `<g stroke="${c}" stroke-width="2" fill="none"><path d="M24 4 L44 15 L24 26 L4 15 Z"/><path d="M4 15 L4 33 L24 44 L44 33 L44 15"/><path d="M24 26 L24 44"/><path d="M14 9.5 L34 20.5 M34 9.5 L14 20.5" stroke-opacity=".5"/></g>`,
  arena: (c) => `<g stroke="${c}" stroke-width="2" fill="none"><path d="M8 40 L8 18 L24 6 L40 18 L40 40 Z"/><path d="M16 40 L16 26 A8 8 0 0 1 32 26 L32 40"/><path d="M8 18 L40 18" stroke-opacity=".5"/></g>`,
  prisma: (c) => `<g fill="none" stroke-width="2"><path d="M24 4 L44 40 L4 40 Z" stroke="${c}"/><path d="M0 24 L18 24" stroke="#e2e8f0"/><path d="M30 22 L48 14" stroke="#22d3ee"/><path d="M31 25 L48 25" stroke="#a78bfa"/><path d="M30 28 L48 36" stroke="#f472b6"/></g>`,
  luna: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><path d="M30 6 A18 18 0 1 0 42 34 A14 14 0 1 1 30 6 Z"/><path d="M10 40 L14 34 L18 40 L22 34 L26 40" stroke-opacity=".6"/></g>`,
  hilo: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><path d="M6 10 H42 M6 20 H34 M6 30 H40 M6 40 H26"/><path d="M34 36 C40 30 46 38 40 44 C36 48 30 44 34 36 Z" stroke-opacity=".8"/></g>`,
  agente: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><rect x="8" y="14" width="32" height="24" rx="8"/><circle cx="18" cy="26" r="3" fill="${c}"/><circle cx="30" cy="26" r="3" fill="${c}"/><path d="M24 14 V6 M20 6 H28 M4 24 V30 M44 24 V30"/></g>`,
  murcielago: (c) => `<g fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"><path d="M24 30 L20 22 L22 16 L24 20 L26 16 L28 22 Z"/><path d="M20 22 C14 14 6 16 2 20 C8 22 8 28 10 30 C14 26 18 28 24 30 C30 28 34 26 38 30 C40 28 40 22 46 20 C42 16 34 14 28 22"/></g>`,
  jardin: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><rect x="4" y="4" width="40" height="40" rx="4" stroke-opacity=".5"/><path d="M4 18 H44 M4 31 H44 M18 4 V44 M31 4 V44" stroke-opacity=".35"/><circle cx="11" cy="11" r="4"/><path d="M24 30 V20 M24 24 C20 22 19 18 20 16 C23 17 25 20 24 24 Z"/><path d="M37 37 l-3 -3 h6 z" fill="${c}"/></g>`,
  repo: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><rect x="8" y="6" width="32" height="36" rx="4"/><path d="M16 16 L22 22 L16 28 M26 28 L34 28"/></g>`,
};

// ───────────────────────────── tarjeta de proyecto ─────────────────────────────
function card(p, info) {
  const W = 560, H = 272, c = p.acento || '#22d3ee';
  const desc = wrap(p.descripcion || info?.description || '', 64, 4);
  const tech = (p.tech || []).slice(0, 4);
  const chips = [];
  let x = 28;
  for (const t of tech) {
    const w = Math.round(t.length * 7.4 + 22);
    chips.push(`<rect x="${x}" y="200" width="${w}" height="24" rx="12" fill="${c}" fill-opacity=".10" stroke="${c}" stroke-opacity=".45"/><text x="${x + w / 2}" y="216" text-anchor="middle" font-size="12" fill="#cbd5e1" font-family="${FONT_MONO}">${esc(t)}</text>`);
    x += w + 8;
  }
  const meta = [];
  if (info && !p.privado) {
    meta.push(`★ ${fmt(info.stargazerCount)}`);
    if (info.primaryLanguage) meta.push(info.primaryLanguage.name);
    meta.push(`push ${hace(info.pushedAt)}`);
  }
  const badge = p.estado ? p.estado : p.web ? 'ONLINE' : p.privado ? 'PRIVADO' : 'OPEN SOURCE';
  const badgeW = badge.length * 7.6 + 26;
  const id = `c${(p.id || p.titulo).replace(/\W/g, '')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.titulo)}">
  <defs>
    <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1024"/><stop offset="1" stop-color="#05070f"/></linearGradient>
    <linearGradient id="${id}edge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-1 0;1 0" dur="4s" repeatCount="indefinite"/>
    </linearGradient>
    <radialGradient id="${id}glow" cx="1" cy="0" r=".9"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
    <filter id="${id}n"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>@keyframes ${id}in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}} .${id}a{animation:${id}in .8s ease-out both} .${id}b{animation:${id}in .8s ease-out .2s both} .${id}c{animation:${id}in .8s ease-out .4s both}</style>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="url(#${id}bg)" stroke="#1e293b"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="url(#${id}glow)"/>
  <rect x="24" y="1" width="${W - 48}" height="2" fill="url(#${id}edge)"/>
  <g transform="translate(28 26)"><g class="${id}a" filter="url(#${id}n)">${(ICONOS[p.icono] || ICONOS.repo)(c)}</g></g>
  <g class="${id}a">
    <text x="92" y="52" font-family="${FONT_SANS}" font-size="26" font-weight="800" fill="#f8fafc">${esc(p.titulo)}</text>
    <text x="92" y="74" font-family="${FONT_MONO}" font-size="12.5" fill="${c}">${esc(p.subtitulo || '')}</text>
  </g>
  <rect x="${W - 28 - badgeW}" y="28" width="${badgeW}" height="22" rx="11" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".6"/>
  <text x="${W - 28 - badgeW / 2}" y="43" text-anchor="middle" font-family="${FONT_MONO}" font-size="10.5" font-weight="700" letter-spacing="1" fill="${c}">${badge}</text>
  <g class="${id}b" font-family="${FONT_SANS}" font-size="14.5" fill="#cbd5e1">
    ${desc.map((l, i) => `<text x="28" y="${110 + i * 21}">${esc(l)}</text>`).join('\n    ')}
  </g>
  <g class="${id}c">${chips.join('')}</g>
  <text x="${W - 28}" y="254" text-anchor="end" font-family="${FONT_MONO}" font-size="11" fill="#64748b">${esc(meta.join('  ·  '))}</text>
</svg>
`;
}

// ───────────────────────────── panel de actividad ─────────────────────────────
function rachas(days) {
  let max = 0, run = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; max = Math.max(max, run); }
  let actual = 0;
  const hoy = new Date().toISOString().slice(0, 10);
  let i = days.length - 1;
  if (days[i] && days[i].date === hoy && days[i].contributionCount === 0) i--; // hoy aún cuenta
  for (; i >= 0 && days[i].contributionCount > 0; i--) actual++;
  return { max, actual };
}

function panel(user) {
  const W = 1200, H = 360;
  const cal = user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  const weeks = cal.weeks.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  const { max: rMax, actual: rAct } = rachas(days);
  const repos = user.repositories.nodes.filter((r) => !r.isFork);
  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);

  // lenguajes por tamaño
  const langs = new Map();
  for (const r of repos) for (const e of r.languages.edges) {
    const k = e.node.name;
    const prev = langs.get(k) || { size: 0, color: e.node.color || '#64748b' };
    prev.size += e.size;
    langs.set(k, prev);
  }
  const total = [...langs.values()].reduce((a, l) => a + l.size, 0) || 1;
  const top = [...langs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);

  // gráfica semanal
  const gx = 470, gy = 52, gw = 690, gh = 170;
  const peak = Math.max(1, ...weeks);
  const pts = weeks.map((v, i) => [gx + (i / Math.max(1, weeks.length - 1)) * gw, gy + gh - (v / peak) * gh]);
  const line = pts.map((p, i) => {
    if (i === 0) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const [x0, y0] = pts[i - 1];
    const cx = (x0 + p[0]) / 2;
    return `C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }).join(' ');
  const area = `${line} L${gx + gw} ${gy + gh} L${gx} ${gy + gh} Z`;
  const last = pts[pts.length - 1];

  // Métricas adaptativas: las que dependen de la actividad solo salen cuando lucen.
  const enProd = config.destacados.filter((p) => p.web).length;
  const mb = total / 1048576;
  const codigo = mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.round(total / 1024)} KB`;
  const candidatas = [
    rAct >= 3 && ['racha actual', `${rAct} d`, '#f472b6'],
    rMax >= 7 && ['racha máxima', `${rMax} d`, '#a78bfa'],
    stars >= 5 && ['estrellas', fmt(stars), '#f472b6'],
    ['contribuciones · 12 meses', fmt(cal.totalContributions), '#22d3ee'],
    ['commits', fmt(user.contributionsCollection.totalCommitContributions), '#a78bfa'],
    ['repos públicos', fmt(user.repositories.totalCount), '#f59e0b'],
    enProd > 0 && ['proyectos en producción', fmt(enProd), '#34d399'],
    ['código publicado', codigo, '#f472b6'],
    ['lenguajes', fmt(langs.size), '#22d3ee'],
  ].filter(Boolean);
  const stats = candidatas.slice(0, 6);
  const statSvg = stats.map(([label, val, col], i) => {
    const x = 40 + (i % 2) * 200, y = 70 + Math.floor(i / 2) * 76;
    return `<g style="animation:in .7s ease-out ${0.1 * i}s both"><text x="${x}" y="${y}" font-family="${FONT_SANS}" font-size="34" font-weight="800" fill="${col}">${esc(val)}</text><text x="${x}" y="${y + 22}" font-family="${FONT_MONO}" font-size="11.5" fill="#94a3b8" letter-spacing=".5">${esc(label)}</text></g>`;
  }).join('\n  ');

  let lx = 40;
  const barW = W - 80;
  const bar = top.map(([name, l], i) => {
    const w = Math.max(3, (l.size / total) * barW);
    const s = `<rect x="${lx.toFixed(1)}" y="290" width="${w.toFixed(1)}" height="10" fill="${l.color}" style="animation:grow 1.2s ease-out ${0.15 * i}s both;transform-origin:${lx.toFixed(0)}px 295px"/>`;
    lx += w;
    return s;
  }).join('');
  let tx = 40;
  const legend = top.map(([name, l]) => {
    const txt = `${name} ${((l.size / total) * 100).toFixed(1)}%`;
    const s = `<circle cx="${tx + 5}" cy="325" r="5" fill="${l.color}"/><text x="${tx + 16}" y="329" font-family="${FONT_MONO}" font-size="12" fill="#cbd5e1">${esc(txt)}</text>`;
    tx += txt.length * 7.4 + 40;
    return s;
  }).join('');

  const months = [];
  let lastM = '';
  cal.weeks.forEach((w, i) => {
    const m = w.contributionDays[0].date.slice(5, 7);
    if (m !== lastM && i > 0 && i < weeks.length - 2) {
      const name = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m - 1];
      months.push(`<text x="${pts[i][0].toFixed(1)}" y="${gy + gh + 22}" font-family="${FONT_MONO}" font-size="10.5" fill="#475569" text-anchor="middle">${name}</text>`);
    }
    lastM = m;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Actividad en GitHub de ${esc(USER)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1024"/><stop offset="1" stop-color="#05070f"/></linearGradient>
    <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22d3ee"/><stop offset=".55" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a78bfa" stop-opacity=".35"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>
    <filter id="neon"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes draw{from{stroke-dashoffset:3000}to{stroke-dashoffset:0}}
      @keyframes fade{from{opacity:0}to{opacity:1}}
      @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
      @keyframes ping{0%{r:4;opacity:1}100%{r:16;opacity:0}}
      .line{stroke-dasharray:3000;animation:draw 2.6s ease-out both}
      .area{animation:fade 1.5s ease-out 1.2s both}
      .ping{animation:ping 1.8s ease-out infinite}
    </style>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" fill="url(#bg)" stroke="#1e293b"/>
  <text x="40" y="34" font-family="${FONT_MONO}" font-size="12" fill="#22d3ee" letter-spacing="2">// ACTIVIDAD</text>
  <text x="${gx}" y="34" font-family="${FONT_MONO}" font-size="12" fill="#64748b" letter-spacing="2">CONTRIBUCIONES POR SEMANA · ÚLTIMOS 12 MESES</text>
  ${statSvg}
  <g stroke="#1e293b">${[0, 0.5, 1].map((f) => `<line x1="${gx}" x2="${gx + gw}" y1="${gy + gh * f}" y2="${gy + gh * f}"/>`).join('')}</g>
  <path class="area" d="${area}" fill="url(#fill)"/>
  <path class="line" d="${line}" fill="none" stroke="url(#stroke)" stroke-width="2.6" filter="url(#neon)" stroke-linecap="round"/>
  <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="#f472b6"/>
  <circle class="ping" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="none" stroke="#f472b6" stroke-width="2"/>
  ${months.join('')}
  <text x="40" y="276" font-family="${FONT_MONO}" font-size="12" fill="#22d3ee" letter-spacing="2">// LENGUAJES EN REPOS PÚBLICOS</text>
  <rect x="40" y="290" width="${barW}" height="10" rx="5" fill="#111827"/>
  <g>${bar}</g>
  ${legend}
</svg>
`;
}

// ───────────────────────────── README ─────────────────────────────
function seccionReciente(user) {
  const repos = user.repositories.nodes
    .filter((r) => !r.isFork && !r.isArchived && r.name.toLowerCase() !== USER.toLowerCase() && !OCULTAR.has(r.name.toLowerCase()))
    .slice(0, 5);
  const filas = repos.map((r) => {
    const lang = r.primaryLanguage ? `\`${r.primaryLanguage.name}\`` : '';
    const desc = (r.description || '').replace(/\|/g, '\\|');
    return `| [**${r.name}**](${r.url}) | ${desc} | ${lang} | ${hace(r.pushedAt)} |`;
  });
  return ['| Repo | Qué es | Lenguaje | Último push |', '|:--|:--|:--:|--:|', ...filas].join('\n');
}

function reemplazar(md, marca, contenido) {
  const re = new RegExp(`(<!--${marca}:start-->)[\\s\\S]*?(<!--${marca}:end-->)`);
  return re.test(md) ? md.replace(re, `$1\n${contenido}\n$2`) : md;
}

// ───────────────────────────── main ─────────────────────────────
await mkdir(join(OUT, 'cards'), { recursive: true });

let user = null;
try { user = await fetchData(); } catch (e) { console.warn('⚠ No se pudieron leer datos de GitHub:', e.message); }
const porNombre = new Map((user?.repositories.nodes || []).map((r) => [r.name.toLowerCase(), r]));

// destacados + repos públicos con el topic «portfolio» que no estén ya
const destacados = [...config.destacados];
const yaEstan = new Set(destacados.map((p) => (p.repo || '').toLowerCase()));
const paleta = ['#22d3ee', '#a78bfa', '#f472b6', '#f59e0b', '#34d399'];
for (const r of user?.repositories.nodes || []) {
  const topics = r.repositoryTopics.nodes.map((n) => n.topic.name);
  if (topics.includes('portfolio') && !yaEstan.has(r.name.toLowerCase())) {
    destacados.push({
      id: r.name, repo: r.name, titulo: r.name, subtitulo: topics.filter((t) => t !== 'portfolio').slice(0, 3).join(' · '),
      descripcion: r.description || '', tech: r.languages.edges.slice(0, 4).map((e) => e.node.name),
      web: r.homepageUrl || undefined, acento: paleta[destacados.length % paleta.length], icono: 'repo',
    });
  }
}

for (const p of destacados) {
  const info = p.repo ? porNombre.get(p.repo.toLowerCase()) : null;
  await writeFile(join(OUT, 'cards', `${p.id}.svg`), card(p, info));
}
console.log(`✓ ${destacados.length} tarjetas`);

const readmePath = join(ROOT, 'README.md');
let md = await readFile(readmePath, 'utf8');

// rejilla de tarjetas (2 por fila)
const enlace = (p) => p.web || (p.repo && !p.privado ? `https://github.com/${USER}/${p.repo}` : '#');
const celdas = destacados.map((p) => `<a href="${enlace(p)}"><img src="assets/generated/cards/${p.id}.svg" width="49%" alt="${esc(p.titulo)} — ${esc(p.subtitulo || '')}"/></a>`);
md = reemplazar(md, 'PROYECTOS', `<p align="center">\n${celdas.join('\n')}\n</p>`);

if (user) {
  await writeFile(join(OUT, 'panel.svg'), panel(user));
  md = reemplazar(md, 'RECIENTE', seccionReciente(user));
  const ahora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });
  md = reemplazar(md, 'ACTUALIZADO', `<sub>⚙️ Secciones regeneradas automáticamente por GitHub Actions · ${ahora}</sub>`);
  console.log('✓ panel y actividad reciente');
} else if (!existsSync(join(OUT, 'panel.svg'))) {
  console.warn('⚠ Sin datos: el panel se generará en la próxima ejecución con token');
}

await writeFile(readmePath, md);
console.log('✓ README actualizado');

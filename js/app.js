import { store } from './store.js';
import { icon } from './icons.js';
import { esc, fmt, fmtSigned, hours, dateLong, monthYear, weekday, dateShort } from './util.js';
import { buildInsights, summary, sortedEntries, toKey, fromKey, addDays, MIN_ENTRIES, WEEKDAYS } from './stats.js';
import { moodColor, lightText, MOOD_WORDS, ENERGY_WORDS, timeline, scatter } from './charts.js';
import { makeDemo } from './demo.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const todayKey = () => toKey(new Date());

/* ---------- eventos do dia ---------- */
const PRESETS = [
  { id: 'trabalho', label: 'Trabalho puxado', icon: 'briefcase' },
  { id: 'exercicio', label: 'Exercício', icon: 'dumbbell' },
  { id: 'social', label: 'Vi pessoas', icon: 'users' },
  { id: 'familia', label: 'Família', icon: 'house' },
  { id: 'arlivre', label: 'Ar livre', icon: 'trees' },
  { id: 'sol', label: 'Tomei sol', icon: 'sun' },
  { id: 'alcool', label: 'Álcool', icon: 'wine' },
  { id: 'cafeina', label: 'Muita cafeína', icon: 'coffee' },
  { id: 'conflito', label: 'Discussão', icon: 'message-circle-warning' },
  { id: 'viagem', label: 'Viagem', icon: 'plane' },
  { id: 'doente', label: 'Mal-estar físico', icon: 'thermometer' },
  { id: 'remedio', label: 'Remédio em dia', icon: 'pill' },
];
const allTags = () => [...PRESETS, ...store.customTags().map((t) => ({ ...t, icon: 'tag' }))];
const tagLabel = (id) => allTags().find((t) => t.id === id)?.label ?? id;

/* ---------- utilidades de interface ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

/** Aplica valores dinâmicos via CSSOM (a CSP bloqueia atributos style inline). */
function paint(root) {
  $$('[data-c]', root).forEach((el) => el.style.setProperty('--c', moodColor(parseFloat(el.dataset.c))));
  $$('[data-w]', root).forEach((el) => el.style.setProperty('--w', el.dataset.w));
  $$('[data-h]', root).forEach((el) => el.style.setProperty('--h', el.dataset.h));
  $$('[data-x]', root).forEach((el) => el.style.setProperty('--x', el.dataset.x));
  $$('[data-l]', root).forEach((el) => { el.style.setProperty('--l', el.dataset.l); el.style.setProperty('--wd', el.dataset.wd); });
  $$('[data-cols]', root).forEach((el) => el.style.setProperty('--cols', el.dataset.cols));
}

function confirmDialog({ title, text, confirmLabel, danger = false, typeWord = null }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>${typeWord ? `<label class="sr" for="cw">Digite <b>${esc(typeWord)}</b> para confirmar</label><input id="cw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(typeWord)}">` : ''}<div class="btnrow"><button class="btn quiet" value="no" type="button" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : ''}" type="button" data-yes ${typeWord ? 'disabled' : ''}>${esc(confirmLabel)}</button></div>`;
    document.body.appendChild(d);
    const yes = $('[data-yes]', d), inp = $('input', d);
    if (inp) inp.addEventListener('input', () => { yes.disabled = inp.value.trim().toLowerCase() !== typeWord.toLowerCase(); });
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    $('[data-no]', d).onclick = () => done(false);
    yes.onclick = () => done(true);
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    d.showModal();
  });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- navegação ---------- */
const TABS = { hoje: ['sun', 'Hoje'], diario: ['calendar-days', 'Diário'], padroes: ['chart-line', 'Padrões'], dados: ['database', 'Dados'] };
for (const [id, [ic, label]] of Object.entries(TABS)) $(`#tab-${id}`).innerHTML = `${icon(ic, 20)}<span>${label}</span>`;

let viewDate = todayKey();
function route() {
  const [name = 'hoje', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const r = TABS[name] ? name : 'hoje';
  if (r === 'hoje' && /^\d{4}-\d{2}-\d{2}$/.test(arg || '') && arg <= todayKey()) viewDate = arg;
  else if (r === 'hoje' && !arg) viewDate = viewDate > todayKey() ? todayKey() : viewDate;
  $$('.tabs a').forEach((a) => (a.dataset.route === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${TABS[r][1]} · Maré`;
  ({ hoje: renderToday, diario: renderDiary, padroes: renderPatterns, dados: renderData })[r]();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ============================ HOJE ============================ */
function renderToday() {
  const date = viewDate;
  const existing = store.get(date);
  const d = {
    mood: existing?.mood ?? 6, touched: !!existing,
    sleep: existing?.sleep ?? 7, sleepTouched: typeof existing?.sleep === 'number',
    energy: existing?.energy ?? null, tags: [...(existing?.tags ?? [])], note: existing?.note ?? '',
  };
  const isToday = date === todayKey();
  const dateObj = fromKey(date);

  view.innerHTML = `
    <div class="datebar">
      <button class="iconbtn" id="prev" aria-label="Dia anterior">${icon('chevron-left', 22)}</button>
      <h1>${isToday ? 'Hoje' : esc(weekday(dateObj))}<span class="sub">${esc(dateLong(dateObj))}${existing ? ' · registro salvo' : ''}</span></h1>
      ${isToday ? '' : '<a class="btn quiet small" href="#/hoje/' + todayKey() + '">Ir para hoje</a>'}
      <button class="iconbtn" id="next" aria-label="Próximo dia" ${isToday ? 'disabled' : ''}>${icon('chevron-right', 22)}</button>
    </div>
    <div class="today">
      <section class="hero" id="hero" aria-label="Humor">
        <p class="hero-q">Como foi o seu dia?</p>
        <div class="pebble idle" id="pebble"><output id="moodnum" for="mood" aria-hidden="true">${d.mood}</output></div>
        <p class="hero-word" id="moodword" aria-hidden="true">${MOOD_WORDS[d.mood]}</p>
        <p class="hero-hint" id="moodhint">Arraste para escolher de 1 a 10</p>
        <input id="mood" type="range" min="1" max="10" step="1" value="${d.mood}" aria-label="Humor do dia, de 1 a 10" aria-valuetext="${d.mood}, ${MOOD_WORDS[d.mood]}">
        <div class="ends" aria-hidden="true"><span>No fundo</span><span>Radiante</span></div>
      </section>

      <form class="sheet" id="form" autocomplete="off">
        <fieldset class="field">
          <legend>Sono</legend>
          <p class="help">Quanto você dormiu na noite passada?</p>
          <div class="stepper">
            <button type="button" class="iconbtn" id="sl-minus" aria-label="Menos meia hora">${icon('minus', 22)}</button>
            <output id="sleepval" class="num" aria-live="polite"></output>
            <button type="button" class="iconbtn" id="sl-plus" aria-label="Mais meia hora">${icon('plus', 22)}</button>
            <button type="button" class="btn quiet small" id="sl-clear" hidden>Não sei</button>
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Energia</legend>
          <div class="energy" role="radiogroup" aria-label="Energia do dia">
            ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="energy" value="${n}" ${d.energy === n ? 'checked' : ''}><span class="bar"></span><span class="t">${ENERGY_WORDS[n]}</span></label>`).join('')}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>O que aconteceu</legend>
          <p class="help">Marque o que fez parte do dia. Os padrões usam isso para comparar dias.</p>
          <div class="chips" id="chips"></div>
        </fieldset>

        <fieldset class="field">
          <legend>Anotação</legend>
          <label class="sr" for="note">Anotação do dia</label>
          <textarea id="note" maxlength="5000" placeholder="O que marcou o dia? Só você vê isto.">${esc(d.note)}</textarea>
        </fieldset>

        <div class="actions">
          <button class="btn main" id="save" type="submit" disabled>${existing ? 'Atualizar registro' : 'Salvar registro'}</button>
          ${existing ? '<button class="btn danger" id="del" type="button">Apagar dia</button>' : ''}
          <p class="status" id="status">${existing ? '' : 'Escolha o humor para poder salvar.'}</p>
        </div>
      </form>
    </div>`;

  /* humor */
  const hero = $('#hero'), pebble = $('#pebble'), range = $('#mood');
  const updateMood = () => {
    const m = d.mood;
    hero.style.setProperty('--tint', moodColor(m));
    pebble.classList.toggle('light-text', lightText(m));
    pebble.classList.toggle('idle', !d.touched);
    $('#moodnum').textContent = m;
    $('#moodword').textContent = d.touched ? MOOD_WORDS[m] : '';
    $('#moodhint').textContent = d.touched ? '' : 'Arraste para escolher de 1 a 10';
    range.setAttribute('aria-valuetext', `${m}, ${MOOD_WORDS[m]}`);
  };
  const touchMood = () => { if (!d.touched) { d.touched = true; updateMood(); refreshSave(); } };
  range.addEventListener('input', () => { d.mood = +range.value; d.touched = true; updateMood(); refreshSave(); });
  range.addEventListener('pointerdown', () => hero.classList.add('dragging'));
  addEventListener('pointerup', () => hero.classList.remove('dragging'));
  range.addEventListener('pointerup', touchMood);
  updateMood();

  /* sono */
  const sleepVal = $('#sleepval');
  const renderSleep = () => {
    sleepVal.textContent = hours(d.sleep);
    sleepVal.style.opacity = d.sleepTouched ? 1 : 0.45;
    $('#sl-clear').hidden = !d.sleepTouched;
    $('#sl-minus').disabled = d.sleep <= 0; $('#sl-plus').disabled = d.sleep >= 16;
  };
  const stepSleep = (dir) => { d.sleepTouched = true; d.sleep = Math.max(0, Math.min(16, d.sleep + dir * 0.5)); renderSleep(); refreshSave(true); };
  for (const [id, dir] of [['sl-minus', -1], ['sl-plus', 1]]) {
    const b = $('#' + id); let t1, t2;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    b.addEventListener('pointerdown', (e) => { if (e.button) return; stepSleep(dir); t1 = setTimeout(() => { t2 = setInterval(() => stepSleep(dir), 90); }, 420); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('click', (e) => { if (e.detail === 0) stepSleep(dir); }); // teclado
  }
  $('#sl-clear').addEventListener('click', () => { d.sleep = 7; d.sleepTouched = false; renderSleep(); refreshSave(true); });
  renderSleep();

  /* energia */
  $$('input[name="energy"]').forEach((r) => r.addEventListener('change', () => { d.energy = +r.value; refreshSave(true); }));

  /* eventos */
  const chips = $('#chips');
  const renderChips = () => {
    chips.innerHTML = allTags().map((t) => `<button type="button" class="chip" data-tag="${esc(t.id)}" aria-pressed="${d.tags.includes(t.id)}"><span class="lead">${icon(t.icon, 18)}</span><span class="tick">${icon('check', 18)}</span>${esc(t.label)}</button>`).join('')
      + `<span class="addtag"><input id="newtag" type="text" maxlength="28" placeholder="Outro…" aria-label="Adicionar outro evento"><button type="button" class="iconbtn" id="addtag" aria-label="Adicionar evento">${icon('plus', 20)}</button></span>`;
  };
  renderChips();
  chips.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (c) { const id = c.dataset.tag; d.tags = d.tags.includes(id) ? d.tags.filter((x) => x !== id) : [...d.tags, id]; c.setAttribute('aria-pressed', d.tags.includes(id)); refreshSave(true); return; }
    if (e.target.closest('#addtag')) addCustom();
  });
  chips.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'newtag') { e.preventDefault(); addCustom(); } });
  function addCustom() {
    const inp = $('#newtag'), label = inp.value.trim().replace(/\s+/g, ' ');
    if (!label) return;
    const slug = 'c:' + label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const known = allTags().find((t) => t.id === slug || t.label.toLowerCase() === label.toLowerCase());
    const id = known ? known.id : slug;
    if (!known) store.addCustomTag({ id, label });
    if (!d.tags.includes(id)) d.tags.push(id);
    renderChips(); refreshSave(true); $('#newtag').focus();
  }

  /* nota */
  $('#note').addEventListener('input', (e) => { d.note = e.target.value; refreshSave(true); });

  /* salvar */
  const save = $('#save'), status = $('#status');
  let dirty = false;
  function refreshSave(markDirty = false) {
    if (markDirty) dirty = true;
    save.disabled = !d.touched || (!!existing && !dirty);
    if (!d.touched) status.textContent = 'Escolha o humor para poder salvar.';
    else if (dirty) status.textContent = 'Alterações ainda não salvas.';
  }
  refreshSave();

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!d.touched) return;
    if (store.hasDemo() && !store.hasReal()) store.removeDemo();
    const entry = { date, mood: d.mood, sleep: d.sleepTouched ? d.sleep : null, energy: d.energy, tags: d.tags, note: d.note.trim(), updatedAt: Date.now() };
    const ok = store.save(entry);
    if (!ok) { toast('O navegador bloqueou o armazenamento. Exporte seus dados e tente fora do modo privado.'); return; }
    navigator.storage?.persist?.().catch(() => {});
    dirty = false; save.disabled = true; save.textContent = 'Atualizar registro';
    status.textContent = 'Salvo neste aparelho.';
    toast('Registro salvo neste aparelho.');
    const n = Object.keys(store.entries()).length;
    if (n === MIN_ENTRIES) toast('Você chegou a 3 semanas de registros: os padrões já aparecem.');
  });
  $('#del')?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Apagar este dia?', text: `O registro de ${dateLong(dateObj)} será removido deste navegador.`, confirmLabel: 'Apagar dia', danger: true })) {
      store.remove(date); toast('Dia apagado.'); renderToday();
    }
  });

  /* navegação de dias */
  const go = (n) => { viewDate = addDays(date, n); location.hash = `#/hoje/${viewDate}`; if (location.hash === `#/hoje/${viewDate}`) route(); };
  $('#prev').addEventListener('click', () => go(-1));
  $('#next').addEventListener('click', () => go(1));
}

/* ============================ DIÁRIO ============================ */
function renderDiary() {
  const entries = sortedEntries(store.entries());
  if (!entries.length) {
    view.innerHTML = `<h1 class="page-title">Diário</h1><div class="empty"><p>Nenhum registro ainda. Faça o primeiro hoje: leva menos de um minuto.</p><a class="btn" href="#/hoje">Registrar hoje</a></div>`;
    return;
  }
  const weeks = 17, t = fromKey(todayKey());
  const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7) - (weeks - 1) * 7);
  const wd = ['seg', '', 'qua', '', 'sex', '', ''];
  let html = '<span></span>';
  for (let w = 0; w < weeks; w++) {
    const m = new Date(monday); m.setDate(monday.getDate() + w * 7);
    html += `<span class="m">${w === 0 || m.getDate() <= 7 ? new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(m).replace('.', '') : ''}</span>`;
  }
  for (let r = 0; r < 7; r++) {
    html += `<span class="d">${wd[r]}</span>`;
    for (let w = 0; w < weeks; w++) {
      const c = new Date(monday); c.setDate(monday.getDate() + w * 7 + r);
      const k = toKey(c), e = store.get(k);
      if (k > todayKey()) html += '<span class="cell future" aria-hidden="true"></span>';
      else html += `<button class="cell ${k === todayKey() ? 'today' : ''}" data-date="${k}" ${e ? `data-c="${e.mood}"` : ''} aria-label="${esc(dateLong(c))}: ${e ? 'humor ' + e.mood : 'sem registro'}"></button>`;
    }
  }
  const rows = [...entries].reverse();
  let list = '', month = '';
  for (const e of rows) {
    const dt = fromKey(e.date), mo = monthYear(dt);
    if (mo !== month) { month = mo; list += `<h3>${esc(mo)}</h3>`; }
    list += `<button class="row" data-date="${e.date}"><span class="mini ${lightText(e.mood) ? 'light-text' : ''}" data-c="${e.mood}">${e.mood}</span><span><span class="when">${esc(cap(weekday(dt)))}, ${dt.getDate()}</span><span class="meta">${typeof e.sleep === 'number' ? `<span>${icon('moon', 14)} </span><span class="num">${hours(e.sleep)}</span>` : ''}${e.energy ? `<span>energia ${e.energy}/5</span>` : ''}${e.tags?.length ? `<span>${e.tags.map((x) => esc(tagLabel(x))).join(' · ')}</span>` : ''}</span>${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}</span><span aria-hidden="true">${icon('chevron-right', 18)}</span></button>`;
  }
  view.innerHTML = `
    <h1 class="page-title">Diário</h1>
    <p class="lede">As últimas ${weeks} semanas. Cada quadrado é um dia, da cor do humor que você registrou.</p>
    ${store.hasDemo() ? demoBanner() : ''}
    <div class="heat-wrap"><div class="heat" data-cols="${weeks}" role="group" aria-label="Calendário de humor">${html}</div></div>
    <div class="legend" aria-hidden="true"><span>1</span><span class="ramp"></span><span>10</span></div>
    <section class="section"><h2>Todos os registros</h2><div class="list">${list}</div></section>`;
  paint(view);
  view.addEventListener('click', diaryClick);
  bindDemoBanner();
}
function diaryClick(e) {
  const b = e.target.closest('[data-date]');
  if (b && view.contains(b)) { view.removeEventListener('click', diaryClick); location.hash = `#/hoje/${b.dataset.date}`; }
}

function demoBanner() {
  return `<div class="banner" id="demobanner">${icon('flask-conical', 20)}<span>Você está vendo dados de exemplo, não os seus.</span><button class="btn small line" id="rmdemo" type="button">Remover exemplo</button></div>`;
}
function bindDemoBanner() {
  $('#rmdemo')?.addEventListener('click', () => { store.removeDemo(); toast('Exemplo removido.'); route(); });
}

/* ============================ PADRÕES ============================ */
const STRENGTH = { strong: 'Indício forte', moderate: 'Indício moderado', weak: 'Indício fraco', possible: 'Possível pista' };
const dayName = (i) => WEEKDAYS[i] + 's';

function dumbbell(a, b, labelA, labelB, nA, nB) {
  const pc = (v) => ((v - 1) / 9) * 100;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return `<div class="dumbbell"><div class="rail"><span class="span" data-l="${pc(lo)}%" data-wd="${pc(hi) - pc(lo)}%"></span><span class="pt" data-c="${a}" data-x="${pc(a)}%"></span><span class="pt" data-c="${b}" data-x="${pc(b)}%"></span></div><div class="scale" aria-hidden="true"><span>1</span><span>5</span><span>10</span></div><div class="keys"><span><i data-c="${a}"></i>${esc(labelA)}: <b class="num">${fmt(a)}</b> <span class="num">(${nA} dias)</span></span><span><i data-c="${b}"></i>${esc(labelB)}: <b class="num">${fmt(b)}</b> <span class="num">(${nB} dias)</span></span></div></div>`;
}

function insightHtml(i) {
  const badge = `<span class="badge ${i.strength}">${STRENGTH[i.strength]}</span>`;
  if (i.kind === 'sleep' || i.kind === 'energy') {
    const pos = i.r > 0;
    const per = fmtSigned(i.slope, 1);
    const title = i.kind === 'sleep'
      ? (pos ? `Você costuma ficar melhor quando dorme mais. Cada hora a mais de sono veio com cerca de ${fmt(Math.abs(i.slope))} ponto a mais de humor.`
        : `Nos seus dados, dias com mais horas de sono vieram com humor um pouco mais baixo (${per} ponto por hora). Dormir demais também pode pesar, vale observar.`)
      : (pos ? `Energia e humor andam juntos: cada nível a mais de energia veio com cerca de ${fmt(Math.abs(i.slope))} ponto a mais de humor.`
        : `Curiosamente, dias de mais energia vieram com humor mais baixo (${per} ponto por nível). Pode ser agitação; vale olhar as anotações.`);
    return `<article class="insight"><div><h3>${title}</h3><p class="meta">${badge}<span class="num">correlação ${fmt(i.r, 2)} · ${i.n} dias</span></p></div><div><div class="chart-cap"><span class="sw m"></span>Cada ponto é um dia, colorido pelo humor</div><div class="chartbox" data-scatter="${i.kind}"></div></div></article>`;
  }
  if (i.kind === 'tag' || i.kind === 'tagNext') {
    const up = i.diff > 0, mag = fmt(Math.abs(i.diff));
    const plural = Math.abs(i.diff) >= 1.05 ? 'pontos' : 'ponto';
    const title = i.kind === 'tag'
      ? `Nos dias com “${esc(i.label)}”, seu humor ficou em média ${mag} ${plural} ${up ? 'mais alto' : 'mais baixo'}.`
      : `No dia seguinte a “${esc(i.label)}”, seu humor ficou em média ${mag} ${plural} ${up ? 'mais alto' : 'mais baixo'}.`;
    const la = i.kind === 'tag' ? `Com ${i.label}` : `Depois de ${i.label}`, lb = i.kind === 'tag' ? 'Sem' : 'Outros dias';
    return `<article class="insight"><div><h3>${title}</h3><p class="meta">${badge}<span class="num">${i.nWith} dias com · ${i.nWithout} sem</span></p></div>${dumbbell(i.meanWith, i.meanWithout, la, lb, i.nWith, i.nWithout)}</article>`;
  }
  if (i.kind === 'weekday') {
    return `<article class="insight"><div><h3>${esc(cap(dayName(i.best.day)))} tendem a ser seus melhores dias (média ${fmt(i.best.mean)}) e ${esc(dayName(i.worst.day))} os mais difíceis (${fmt(i.worst.mean)}).</h3><p class="meta">${badge}<span class="num">diferença de ${fmt(i.diff)} pontos</span></p></div>${weekChart(null)}</article>`;
  }
  return '';
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let lastWeekdays = [];
function weekChart(list) {
  const data = list || lastWeekdays;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="wk" role="img" aria-label="Humor médio por dia da semana">${order.map((i) => { const w = data[i]; const v = w?.mean; return `<div class="col"><div class="barwrap">${v ? `<span class="bar" data-c="${v}" data-h="${((v - 0) / 10) * 100}%"></span>` : ''}</div><span class="val">${v ? fmt(v) : '–'}</span><span>${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][i]}</span></div>`; }).join('')}</div>`;
}

function renderPatterns() {
  const entries = sortedEntries(store.entries());
  const tk = todayKey();
  const s = summary(entries, tk);
  const res = buildInsights(entries, tagLabel);
  lastWeekdays = res.weekdays;
  const delta = s.avg7 !== null && s.prev7 !== null ? s.avg7 - s.prev7 : null;

  let body = '';
  if (!entries.length) {
    body = `<div class="empty"><p>Os padrões aparecem depois de ${MIN_ENTRIES} dias de registros. Comece por hoje.</p><a class="btn" href="#/hoje">Registrar hoje</a>${!store.hasReal() ? '<button class="btn line" id="loaddemo" type="button">Ver com dados de exemplo</button>' : ''}</div>`;
  } else {
    const kpis = `<div class="kpis">
      <div class="kpi"><div class="v">${fmt(s.avg7)}</div><div class="l">humor médio, 7 dias</div>${delta !== null ? `<div class="delta num">${fmtSigned(delta)} vs. semana anterior</div>` : ''}</div>
      <div class="kpi"><div class="v">${fmt(s.avg30)}</div><div class="l">humor médio, 30 dias</div></div>
      <div class="kpi"><div class="v">${s.sleep30 !== null ? hours(s.sleep30) : '–'}</div><div class="l">sono médio, 30 dias</div></div>
      <div class="kpi"><div class="v">${s.streak}</div><div class="l">${s.streak === 1 ? 'dia seguido' : 'dias seguidos'} registrando</div></div></div>`;
    const tl = `<section class="section"><h2>Seus últimos 60 dias</h2><p class="help">Humor em cima, horas de sono embaixo. Passe o mouse ou o dedo para ver cada dia.</p>
      <div class="chart-cap"><span class="sw m"></span>Humor (1 a 10) <span class="sw"></span>Sono (horas)</div>
      <div class="chartbox" id="tl"></div>
      <details class="table"><summary>Ver os mesmos dados como tabela</summary><div class="scrollx"><table><thead><tr><th>Dia</th><th>Humor</th><th>Sono</th><th>Energia</th></tr></thead><tbody>${[...entries].reverse().slice(0, 60).map((e) => `<tr><td>${esc(dateShort(fromKey(e.date)))}</td><td>${e.mood}</td><td>${typeof e.sleep === 'number' ? hours(e.sleep) : '–'}</td><td>${e.energy ?? '–'}</td></tr>`).join('')}</tbody></table></div></details></section>`;
    let ins;
    if (!res.ready) {
      const pct = Math.min(100, (res.count / MIN_ENTRIES) * 100);
      ins = `<section class="section"><h2>Padrões</h2>
        <p class="help">Com poucos dias, qualquer ligação entre sono, eventos e humor pode ser coincidência. Por isso os padrões só aparecem a partir de ${MIN_ENTRIES} registros, cerca de três semanas.</p>
        <div class="progress"><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${MIN_ENTRIES}" aria-valuenow="${res.count}" aria-label="Registros até liberar os padrões"><div class="fill" data-w="${pct}%"></div></div>
        <p class="num"><b>${res.count} de ${MIN_ENTRIES}</b> registros. Faltam ${res.needed}${res.needed >= 7 ? `, cerca de ${Math.ceil(res.needed / 7)} ${Math.ceil(res.needed / 7) === 1 ? 'semana' : 'semanas'} se registrar todo dia` : ''}.</p></div>
        <ul class="promise"><li>Se dormir mais ou menos muda o seu humor, e quanto.</li><li>Quais eventos (trabalho, exercício, álcool…) andam com dias melhores ou piores, no mesmo dia e no seguinte.</li><li>Quais dias da semana costumam ser mais leves.</li></ul>
        <div class="btnrow">${!store.hasReal() && !store.hasDemo() ? '<button class="btn line" id="loaddemo" type="button">Ver com dados de exemplo</button>' : ''}</div></section>`;
    } else if (!res.insights.length) {
      ins = `<section class="section"><h2>Padrões</h2><p class="help">Com ${res.count} registros, nada se destacou além do acaso. Isso também é informação: continue registrando e os sinais, se existirem, ficam mais nítidos.</p></section>`;
    } else {
      ins = `<section class="section"><h2>O que seus dados sugerem</h2><p class="help">Do mais ao menos marcante, em ${res.count} registros. São ligações entre dias, não causas.</p><div class="insights">${res.insights.slice(0, 8).map(insightHtml).join('')}</div></section>
        <section class="section"><h2>Humor médio por dia da semana</h2>${weekChart(res.weekdays)}</section>
        <div class="caution">${icon('triangle-alert', 20)}<p>Quanto mais comparações, mais chance de algo parecer padrão por acaso. Trate isto como pistas para observar, não como conclusão. Mudanças bruscas de humor ou sono por semanas merecem conversa com um profissional.</p></div>`;
    }
    body = `${store.hasDemo() ? demoBanner() : ''}${kpis}${tl}${ins}`;
  }

  view.innerHTML = `<h1 class="page-title">Padrões</h1><p class="lede">Resumo dos seus registros e, depois de algumas semanas, o que costuma andar junto com os seus dias melhores e piores.</p>${body}`;
  paint(view);
  bindDemoBanner();
  $('#loaddemo')?.addEventListener('click', () => { store.loadDemo(makeDemo(tk, 63)); toast('Dados de exemplo carregados.'); route(); });
  const tl = $('#tl');
  if (tl) timeline(tl, entries, tk, tagLabel, 60);
  $$('[data-scatter]').forEach((box) => { const ins = res.insights.find((x) => x.kind === box.dataset.scatter); if (ins) scatter(box, ins); });
}

/* ============================ DADOS ============================ */
async function renderData() {
  const real = Object.values(store.entries()).filter((e) => !e.demo).length;
  const size = await store.size();
  let persisted = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* ignore */ }
  view.innerHTML = `
    <h1 class="page-title">Dados</h1>
    <p class="lede">O diário é seu. Fica neste navegador e só sai daqui se você exportar.</p>
    <div class="cards">
      <section class="block"><h2>Onde ficam os registros</h2>
        <ul class="facts">
          <li>${icon('lock', 20)}<span>Guardados no <b>localStorage</b> deste navegador. Não há conta, servidor, análise de uso nem cookies.</span></li>
          <li>${icon('shield-check', 20)}<span>A política de segurança do site bloqueia qualquer conexão externa: nem por engano os dados conseguiriam sair.</span></li>
          <li>${icon('database', 20)}<span class="num">${real} ${real === 1 ? 'registro' : 'registros'} · ${fmt(size / 1024, 1)} KB${persisted === true ? ' · protegido contra limpeza automática' : persisted === false ? ' · o navegador pode limpar se faltar espaço' : ''}</span></li>
          <li>${icon('triangle-alert', 20)}<span>Limpar os dados do site, trocar de navegador ou de aparelho esconde o diário. <b>Exporte um backup de vez em quando.</b> Quem usar este mesmo aparelho e navegador consegue abrir o diário.</span></li>
        </ul></section>

      <section class="block"><h2>Exportar</h2><p>Um arquivo seu, para backup ou para levar a outro aparelho.</p>
        <div class="btnrow"><button class="btn" id="exj" type="button" ${real ? '' : 'disabled'}>${icon('download', 18)}Baixar backup (JSON)</button><button class="btn line" id="exc" type="button" ${real ? '' : 'disabled'}>${icon('download', 18)}Planilha (CSV)</button></div></section>

      <section class="block"><h2>Importar</h2><p>Lê um backup do Maré. Por padrão junta com o que já existe; em dias repetidos, vale o arquivo.</p>
        <div class="btnrow"><input id="imp" type="file" accept="application/json,.json" hidden><button class="btn line" id="impb" type="button">${icon('upload', 18)}Escolher arquivo</button></div></section>

      ${!store.hasReal() ? `<section class="block"><h2>Dados de exemplo</h2><p>Quer ver como os padrões ficam? Carregue 9 semanas fictícias. Elas são removidas assim que você salvar o seu primeiro registro.</p><div class="btnrow">${store.hasDemo() ? '<button class="btn line" id="rmdemo2" type="button">Remover exemplo</button>' : '<button class="btn line" id="demo" type="button">Carregar exemplo</button>'}</div></section>` : ''}

      <section class="block"><h2>Apagar tudo</h2><p>Remove todos os registros e eventos personalizados deste navegador. Não dá para desfazer; exporte antes se quiser guardar.</p>
        <div class="btnrow"><button class="btn danger" id="wipe" type="button">${icon('trash-2', 18)}Apagar todos os dados</button></div></section>
    </div>`;

  $('#exj')?.addEventListener('click', () => { download(`mare-backup-${todayKey()}.json`, store.exportJson(), 'application/json'); toast('Backup baixado.'); });
  $('#exc')?.addEventListener('click', () => { download(`mare-${todayKey()}.csv`, '﻿' + store.exportCsv(tagLabel), 'text/csv;charset=utf-8'); toast('Planilha baixada.'); });
  $('#impb').addEventListener('click', () => $('#imp').click());
  $('#imp').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = store.importJson(await f.text(), 'merge'); toast(`${n} ${n === 1 ? 'registro importado' : 'registros importados'}.`); renderData(); }
    catch (err) { toast(err.message || 'Não foi possível ler o arquivo.'); }
  });
  $('#demo')?.addEventListener('click', () => { store.loadDemo(makeDemo(todayKey(), 63)); toast('Exemplo carregado. Veja em Padrões.'); location.hash = '#/padroes'; });
  $('#rmdemo2')?.addEventListener('click', () => { store.removeDemo(); toast('Exemplo removido.'); renderData(); });
  $('#wipe').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Apagar todos os dados?', text: 'Todos os registros e eventos personalizados serão removidos deste navegador, sem volta.', confirmLabel: 'Apagar tudo', danger: true, typeWord: 'apagar' })) {
      store.clearAll(); toast('Tudo apagado.'); renderData();
    }
  });
}

route();

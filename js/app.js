import { store } from './store.js';
import { icon } from './icons.js';
import { esc, fmt, fmtSigned, hours, dateLong, monthYear, weekday, dateShort } from './util.js';
import { buildInsights, summary, sortedEntries, toKey, fromKey, addDays, MIN_ENTRIES, WEEKDAYS } from './stats.js';
import { moodColor, moodRgb, lightText, MOOD_WORDS, ENERGY_WORDS, timeline, scatter, face } from './charts.js';
import { makeDemo } from './demo.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const todayKey = () => toKey(new Date());

/* ---------- eventos do dia ---------- */
const PRESETS = [
  { id: 'escola', label: 'Dia puxado na escola', icon: 'book-open' },
  { id: 'esporte', label: 'Esporte ou treino', icon: 'dumbbell' },
  { id: 'amigos', label: 'Fiquei com amigos', icon: 'users' },
  { id: 'familia', label: 'Tempo com a família', icon: 'house' },
  { id: 'arlivre', label: 'Fui para a rua ou parque', icon: 'trees' },
  { id: 'sol', label: 'Tomei sol', icon: 'sun' },
  { id: 'telas', label: 'Muito tempo em telas', icon: 'phone' },
  { id: 'briga', label: 'Briga ou discussão', icon: 'message-circle-warning' },
  { id: 'doente', label: 'Dor ou mal-estar', icon: 'thermometer' },
  { id: 'viagem', label: 'Passeio ou viagem', icon: 'plane' },
  { id: 'legal', label: 'Fiz algo legal', icon: 'sparkles' },
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

/* Fundo de ondas em WebGL (js/tide.js): cor e altura seguem o humor mais recente. */
let tide = null;
const latestMood = () => { const es = sortedEntries(store.entries()); return es.length ? es[es.length - 1].mood : 3; };
let tideMood = null; // humor escolhido na tela Hoje (null = usar o registro mais recente)
const syncTide = () => { tideMood = null; tide?.setMood(latestMood()); };
import('./tide.js').then(({ createTide }) => { tide = createTide(); tide?.setMood(tideMood ?? latestMood()); }).catch(() => {});

let viewDate = todayKey();
let teardown = null; // libera o WebGL ao sair da tela Hoje
let todayRendered = '';
const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
let flushSave = null; // grava na hora um salvamento que ainda estava esperando
function route() {
  flushSave?.(); flushSave = null;
  teardown?.(); teardown = null;
  const [name = 'hoje', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const r = TABS[name] ? name : 'hoje';
  if (r === 'hoje' && /^\d{4}-\d{2}-\d{2}$/.test(arg || '') && arg <= todayKey()) viewDate = arg;
  else if (r === 'hoje' && !arg) viewDate = viewDate > todayKey() ? todayKey() : viewDate;
  $$('.tabs a').forEach((a) => (a.dataset.route === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${TABS[r][1]} · Maré`;
  ({ hoje: renderToday, diario: renderDiary, padroes: renderPatterns, dados: renderData })[r]();
  if (r !== 'hoje') syncTide(); // em Hoje, quem comanda a maré é a carinha escolhida
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ============================ HOJE ============================ */
function renderToday() {
  const date = viewDate;
  const existing = store.get(date);
  const d = {
    mood: existing?.mood ?? 3, touched: !!existing,
    sleep: existing?.sleep ?? 8, sleepTouched: typeof existing?.sleep === 'number',
    energy: existing?.energy ?? null, tags: [...(existing?.tags ?? [])], note: existing?.note ?? '',
  };
  todayRendered = todayKey();
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
      <section class="hero" id="hero" aria-label="Como foi o dia">
        <p class="hero-q">Como foi o seu dia?</p>
        <div class="pebble idle" id="pebble" aria-hidden="true"><div class="orb" id="orb"><div class="feat" id="front">${face(d.mood, 150)}</div><div class="feat" id="rear" hidden><svg class="swirl" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 12c7 0 10.5 6 8 10.5S19.500 28 16.500 24 17 15.500 21 16.500s3 4.500 0.500 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></div><div class="shade"></div></div></div>
        <p class="hero-word" id="moodword" aria-live="polite">${d.touched ? MOOD_WORDS[d.mood] : ''}</p>
        <p class="hero-hint" id="moodhint" role="status" aria-live="polite">${existing ? (existing.updatedAt ? 'Salvo às ' + hhmm(existing.updatedAt) + ' ✓' : 'Salvo ✓') : 'Deslize a linha para escolher como foi o dia'}</p>
        <div class="slider">
          <span class="end">${face(1, 30)}</span>
          <input id="mood" type="range" min="1" max="5" step="1" value="${d.mood}" aria-label="Nota do dia, de 1 a 5" aria-valuetext="${d.mood}, ${MOOD_WORDS[d.mood]}">
          <span class="end">${face(5, 30)}</span>
          <div class="ticks" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
        </div>
      </section>

      <form class="sheet" id="form" autocomplete="off">
        <fieldset class="field">
          <legend>Sono</legend>
          <p class="help">Quantas horas você dormiu esta noite?</p>
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
          <legend>O que rolou hoje?</legend>
          <p class="help">Marque o que aconteceu. Depois de algumas semanas, o Maré compara seus dias.</p>
          <div class="chips" id="chips"></div>
        </fieldset>

        <fieldset class="field">
          <legend>Mini resumo do dia</legend>
          <label class="sr" for="note">Mini resumo do dia</label>
          <textarea id="note" maxlength="280" placeholder="Conte em poucas palavras como foi o seu dia. Só você vê.">${esc(d.note)}</textarea>
          <p class="counter num" id="count" aria-hidden="true"></p>
        </fieldset>

        <div class="actions">
          <p class="status" id="status" role="status" aria-live="polite">${existing ? 'Salvo automaticamente. Pode mudar durante o dia.' : 'Escolha a nota do dia: o resto salva sozinho.'}</p>
          <button class="btn danger small" id="del" type="button" ${existing ? '' : 'hidden'}>Apagar dia</button>
        </div>
      </form>
    </div>`;

  paint(view);
  /* humor: carinhas */
  const hero = $('#hero'), pebble = $('#pebble');
  const range = $('#mood');
  /* a bolinha anda para a esquerda/direita junto com a linha, rolando (nota 3 = centro) */
  // Ao mexer na linha a bolinha gira 360 graus no próprio eixo. O corpo continua redondo (nada de espremer):
  // a carinha percorre a superfície até a borda, aparecem as costas e a carinha volta ao centro.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let spinning = false;
  const spin = () => {
    if (calm || spinning) return;
    spinning = true;
    const orb = $('#orb'), front = $('#front'), rear = $('#rear');
    const R = pebble.offsetWidth / 2, DUR = 640, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    rear.hidden = false;
    const place = (el, ang) => {
      const c = Math.cos(ang), sn = Math.sin(ang);
      el.style.visibility = c > 0.02 ? 'visible' : 'hidden';
      el.style.transform = `translateX(${(sn * R).toFixed(1)}px) scaleX(${Math.max(0, c).toFixed(3)})`;
      el.style.opacity = String(Math.min(1, Math.max(0, c) * 2.2));
    };
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / DUR), ang = ease(t) * Math.PI * 2;
      place(front, ang);
      place(rear, ang + Math.PI);
      orb.style.transform = `translateY(${(-Math.sin(Math.PI * t) * 5).toFixed(2)}px)`; // pequeno impulso, sem deformar
      if (t < 1) requestAnimationFrame(frame);
      else {
        for (const el of [front, rear, orb]) { el.style.transform = ''; el.style.opacity = ''; el.style.visibility = ''; }
        rear.hidden = true; spinning = false; // volta exatamente ao meio
      }
    };
    requestAnimationFrame(frame);
  };
  const updateMood = (dir = 0) => {
    const m = d.mood;
    hero.style.setProperty('--tint', moodColor(m));
    pebble.classList.toggle('light-text', lightText(m));
    pebble.classList.toggle('idle', !d.touched);
    $('#moodword').textContent = d.touched ? MOOD_WORDS[m] : '';
    if (!d.touched) $('#moodhint').textContent = 'Deslize a linha para escolher como foi o dia';
    tideMood = d.touched ? m : 3; tide?.setMood(tideMood);
    $('#front').innerHTML = face(m, 150);
    if (dir) spin();
    range.setAttribute('aria-valuetext', `${m}, ${MOOD_WORDS[m]}`);
  };
  range.addEventListener('input', () => { const prev = d.mood; d.mood = +range.value; d.touched = true; updateMood(Math.sign(d.mood - prev)); refreshSave(true); });
  range.addEventListener('pointerdown', () => hero.classList.add('dragging'));
  range.addEventListener('pointerup', () => { if (!d.touched) { d.touched = true; updateMood(); refreshSave(true); } flushSave?.(); }); // ao soltar, grava na hora
  range.addEventListener('change', () => flushSave?.());
  addEventListener('pointerup', () => hero.classList.remove('dragging'));
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
  const count = $('#count'); const upd = () => { count.textContent = `${d.note.length}/280`; };
  $('#note').addEventListener('input', (e) => { d.note = e.target.value; upd(); refreshSave(true); }); upd();

  /* salvar sozinho: a cada mudança, depois de uma pausa curta; dá para ajustar o dia o dia todo */
  const status = $('#status');
  let timer = 0, wasNew = !existing, warned = false;
  const clock = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  async function doSave() {
    timer = 0;
    if (!d.touched) return;
    if (store.hasDemo()) store.removeDemo();
    const entry = { date, mood: d.mood, sleep: d.sleepTouched ? d.sleep : null, energy: d.energy, tags: d.tags, note: d.note.trim(), updatedAt: Date.now() };
    const ok = await store.save(entry);
    if (!ok) {
      status.textContent = 'Não consegui salvar: o navegador bloqueou o armazenamento.';
      if (status.isConnected) $('#moodhint').textContent = 'Não salvou ✗';
      if (!warned) { warned = true; toast('O navegador bloqueou o armazenamento. Saia do modo privado e tente de novo.'); }
      return;
    }
    navigator.storage?.persist?.().catch(() => {});
    if (status.isConnected) { // a tela pode já ter sido trocada (saiu logo depois de digitar)
      status.textContent = `Salvo automaticamente às ${clock()}. Pode mudar durante o dia.`;
      $('#moodhint').textContent = `Salvo às ${clock()} ✓`; // confirmação bem perto da carinha
      $('#del').hidden = false;
    }
    if (wasNew) {
      wasNew = false;
      if (Object.keys(store.entries()).length === MIN_ENTRIES) toast('Você completou 3 semanas! Seus padrões já aparecem.');
    }
  }
  // chamado a cada mudança (o nome é antigo; agora agenda o salvamento)
  function refreshSave() {
    if (!d.touched) return;
    status.textContent = 'Salvando…';
    $('#moodhint').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(doSave, 350);
  }
  flushSave = () => { if (timer) { clearTimeout(timer); doSave(); } };
  $('#form').addEventListener('submit', (e) => e.preventDefault());
  $('#del')?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Apagar este dia?', text: `O registro de ${dateLong(dateObj)} será apagado deste aparelho.`, confirmLabel: 'Apagar dia', danger: true })) {
      clearTimeout(timer); timer = 0; store.remove(date); toast('Dia apagado.'); renderToday();
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
    view.innerHTML = `<h1 class="page-title">Diário</h1><div class="empty"><p>Ainda não tem nenhum dia aqui. Faça o primeiro hoje, leva menos de um minuto.</p><a class="btn" href="#/hoje">Registrar hoje</a></div>`;
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
      else html += `<button class="cell ${k === todayKey() ? 'today' : ''}" data-date="${k}" ${e ? `data-c="${e.mood}"` : ''} aria-label="${esc(dateLong(c))}: ${e ? 'nota ' + e.mood : 'sem registro'}"></button>`;
    }
  }
  const rows = [...entries].reverse();
  let list = '', month = '';
  for (const e of rows) {
    const dt = fromKey(e.date), mo = monthYear(dt);
    if (mo !== month) { month = mo; list += `<h3>${esc(mo)}</h3>`; }
    list += `<button class="row" data-date="${e.date}"><span class="mini ${lightText(e.mood) ? 'light-text' : ''}" data-c="${e.mood}">${face(e.mood, 34)}</span><span><span class="when">${esc(cap(weekday(dt)))}, ${dt.getDate()}</span><span class="meta">${typeof e.sleep === 'number' ? `<span>${icon('moon', 14)} </span><span class="num">${hours(e.sleep)}</span>` : ''}${e.energy ? `<span>energia ${e.energy}/5</span>` : ''}${e.tags?.length ? `<span>${e.tags.map((x) => esc(tagLabel(x))).join(' · ')}</span>` : ''}</span>${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}</span><span aria-hidden="true">${icon('chevron-right', 18)}</span></button>`;
  }
  view.innerHTML = `
    <h1 class="page-title">Diário</h1>
    <p class="lede">Os últimos 4 meses. Cada quadradinho é um dia, com a cor da nota que você deu.</p>
    ${store.hasDemo() ? demoBanner() : ''}
    <div class="heat-wrap"><div class="heat" data-cols="${weeks}" role="group" aria-label="Calendário das notas">${html}</div></div>
    <div class="legend" aria-hidden="true"><span>1</span><span class="ramp"></span><span>5</span></div>
    <section class="section"><h2>Todos os dias</h2><div class="list">${list}</div></section>`;
  paint(view);
  view.addEventListener('click', diaryClick);
  bindDemoBanner();
}
function diaryClick(e) {
  const b = e.target.closest('[data-date]');
  if (b && view.contains(b)) { view.removeEventListener('click', diaryClick); location.hash = `#/hoje/${b.dataset.date}`; }
}

function demoBanner() {
  return `<div class="banner" id="demobanner">${icon('flask-conical', 20)}<span>Estes são dias de mentira, só para você ver como funciona.</span><button class="btn small line" id="rmdemo" type="button">Apagar exemplo</button></div>`;
}
function bindDemoBanner() {
  $('#rmdemo')?.addEventListener('click', () => { store.removeDemo(); toast('Exemplo removido.'); route(); });
}

/* ============================ PADRÕES ============================ */
const STRENGTH = { strong: 'Bem claro', moderate: 'Provável', weak: 'Fraquinho', possible: 'Pode ser' };
const dayName = (i) => WEEKDAYS[i] + 's';

function dumbbell(a, b, labelA, labelB, nA, nB) {
  const pc = (v) => ((v - 1) / 4) * 100;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return `<div class="dumbbell"><div class="rail"><span class="span" data-l="${pc(lo)}%" data-wd="${pc(hi) - pc(lo)}%"></span><span class="pt" data-c="${a}" data-x="${pc(a)}%"></span><span class="pt" data-c="${b}" data-x="${pc(b)}%"></span></div><div class="scale" aria-hidden="true"><span>1</span><span>3</span><span>5</span></div><div class="keys"><span><i data-c="${a}"></i>${esc(labelA)}: <b class="num">${fmt(a)}</b> <span class="num">(${nA} dias)</span></span><span><i data-c="${b}"></i>${esc(labelB)}: <b class="num">${fmt(b)}</b> <span class="num">(${nB} dias)</span></span></div></div>`;
}

function insightHtml(i) {
  const badge = `<span class="badge ${i.strength}">${STRENGTH[i.strength]}</span>`;
  if (i.kind === 'sleep' || i.kind === 'energy') {
    const pos = i.r > 0;
    const per = fmtSigned(i.slope, 1);
    const title = i.kind === 'sleep'
      ? (pos ? `Quando você dorme mais, seu dia costuma ser melhor. Cada hora a mais de sono veio com cerca de ${fmt(Math.abs(i.slope), 2)} de nota a mais.`
        : `Nos seus dias, quem dormiu mais teve nota um pouco menor (${per} por hora). Dormir demais também pode deixar o corpo pesado. Vale observar.`)
      : (pos ? `Energia e nota andam juntas: cada nível a mais de energia veio com cerca de ${fmt(Math.abs(i.slope), 2)} de nota a mais.`
        : `Estranho: nos dias com mais energia a nota foi menor (${per} por nível). Pode ser agitação. Olhe o seu resumo desses dias.`);
    return `<article class="insight"><div><h3>${title}</h3><p class="meta">${badge}<span class="num">ligação ${fmt(i.r, 2)} · ${i.n} dias</span></p></div><div><div class="chart-cap"><span class="sw m"></span>Cada bolinha é um dia, com a cor da nota</div><div class="chartbox" data-scatter="${i.kind}"></div></div></article>`;
  }
  if (i.kind === 'tag' || i.kind === 'tagNext') {
    const up = i.diff > 0, mag = fmt(Math.abs(i.diff));
    const plural = Math.abs(i.diff) >= 1.05 ? 'pontos' : 'ponto';
    const title = i.kind === 'tag'
      ? `Nos dias com “${esc(i.label)}”, sua nota ficou em média ${mag} ${plural} ${up ? 'maior' : 'menor'}.`
      : `No dia depois de “${esc(i.label)}”, sua nota ficou em média ${mag} ${plural} ${up ? 'maior' : 'menor'}.`;
    const la = i.kind === 'tag' ? `Com “${i.label}”` : `Depois de “${i.label}”`, lb = i.kind === 'tag' ? 'Sem' : 'Outros dias';
    return `<article class="insight"><div><h3>${title}</h3><p class="meta">${badge}<span class="num">${i.nWith} dias com · ${i.nWithout} sem</span></p></div>${dumbbell(i.meanWith, i.meanWithout, la, lb, i.nWith, i.nWithout)}</article>`;
  }
  if (i.kind === 'weekday') {
    return `<article class="insight"><div><h3>${esc(cap(dayName(i.best.day)))} costumam ser seus melhores dias (nota média ${fmt(i.best.mean)}) e ${esc(dayName(i.worst.day))} os mais difíceis (${fmt(i.worst.mean)}).</h3><p class="meta">${badge}<span class="num">diferença de ${fmt(i.diff)} ponto${i.diff >= 1.05 ? 's' : ''}</span></p></div>${weekChart(null)}</article>`;
  }
  return '';
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let lastWeekdays = [];
function weekChart(list) {
  const data = list || lastWeekdays;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="wk" role="img" aria-label="Nota média por dia da semana">${order.map((i) => { const w = data[i]; const v = w?.mean; return `<div class="col"><div class="barwrap">${v ? `<span class="bar" data-c="${v}" data-h="${(v / 5) * 100}%"></span>` : ''}</div><span class="val">${v ? fmt(v) : '–'}</span><span>${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][i]}</span></div>`; }).join('')}</div>`;
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
    body = `<div class="empty"><p>Os padrões aparecem depois de ${MIN_ENTRIES} dias de registros. Comece por hoje!</p><a class="btn" href="#/hoje">Registrar hoje</a>${!store.hasReal() ? '<button class="btn line" id="loaddemo" type="button">Ver com dias de mentira</button>' : ''}</div>`;
  } else {
    const kpis = `<div class="kpis">
      <div class="kpi"><div class="v">${fmt(s.avg7)}</div><div class="l">nota média, 7 dias</div>${delta !== null ? `<div class="delta num">${Math.abs(delta) < 0.05 ? 'igual à' : fmtSigned(delta, 1) + ' em relação à'} semana passada</div>` : ''}</div>
      <div class="kpi"><div class="v">${fmt(s.avg30)}</div><div class="l">nota média, 30 dias</div></div>
      <div class="kpi"><div class="v">${s.sleep30 !== null ? hours(s.sleep30) : '–'}</div><div class="l">sono médio, 30 dias</div></div>
      <div class="kpi"><div class="v">${s.streak}</div><div class="l">${s.streak === 1 ? 'dia seguido' : 'dias seguidos'} anotando</div></div></div>`;
    const tl = `<section class="section"><h2>Seus últimos 60 dias</h2><p class="help">A nota do dia em cima, as horas de sono embaixo. Passe o mouse ou o dedo para ver cada dia.</p>
      <div class="chart-cap"><span class="sw m"></span>Nota (1 a 5) <span class="sw"></span>Sono (horas)</div>
      <div class="chartbox" id="tl"></div>
      <details class="table"><summary>Ver os mesmos dados como tabela</summary><div class="scrollx"><table><thead><tr><th>Dia</th><th>Nota</th><th>Sono</th><th>Energia</th></tr></thead><tbody>${[...entries].reverse().slice(0, 60).map((e) => `<tr><td>${esc(dateShort(fromKey(e.date)))}</td><td>${e.mood}</td><td>${typeof e.sleep === 'number' ? hours(e.sleep) : '–'}</td><td>${e.energy ?? '–'}</td></tr>`).join('')}</tbody></table></div></details></section>`;
    let ins;
    if (!res.ready) {
      const pct = Math.min(100, (res.count / MIN_ENTRIES) * 100);
      ins = `<section class="section"><h2>Padrões</h2>
        <p class="help">Com poucos dias, tudo pode ser coincidência. Por isso os padrões só aparecem com ${MIN_ENTRIES} registros, mais ou menos 3 semanas.</p>
        <div class="progress"><div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${MIN_ENTRIES}" aria-valuenow="${res.count}" aria-label="Registros até liberar os padrões"><div class="fill" data-w="${pct}%"></div></div>
        <p class="num"><b>${res.count} de ${MIN_ENTRIES}</b> registros. Faltam ${res.needed}${res.needed >= 7 ? `, mais ou menos ${Math.ceil(res.needed / 7)} ${Math.ceil(res.needed / 7) === 1 ? 'semana' : 'semanas'} se anotar todo dia` : ''}.</p></div>
        <ul class="promise"><li>Se dormir mais ou menos muda a sua nota do dia, e quanto.</li><li>O que anda junto com dias melhores ou piores (escola, esporte, amigos, telas…), no mesmo dia e no dia seguinte.</li><li>Quais dias da semana costumam ser mais leves.</li></ul>
        <div class="btnrow">${!store.hasReal() && !store.hasDemo() ? '<button class="btn line" id="loaddemo" type="button">Ver com dias de mentira</button>' : ''}</div></section>`;
    } else if (!res.insights.length) {
      ins = `<section class="section"><h2>Padrões</h2><p class="help">Com ${res.count} registros, nada se destacou. Isso também é uma resposta! Continue anotando e, se existir algum padrão, ele aparece.</p></section>`;
    } else {
      ins = `<section class="section"><h2>O que seus dias mostram</h2><p class="help">Dos mais claros aos menos claros, em ${res.count} registros. São pistas de coisas que andam juntas, não prova de que uma causa a outra.</p><div class="insights">${res.insights.slice(0, 8).map(insightHtml).join('')}</div></section>
        <section class="section"><h2>Nota média por dia da semana</h2>${weekChart(res.weekdays)}</section>
        <div class="caution">${icon('triangle-alert', 20)}<p>Às vezes algo parece padrão só por acaso. Use isto como pista para prestar atenção, não como regra. Se você andar muito para baixo por várias semanas, converse com um adulto de confiança.</p></div>`;
    }
    body = `${store.hasDemo() ? demoBanner() : ''}${kpis}${tl}${ins}`;
  }

  view.innerHTML = `<h1 class="page-title">Padrões</h1><p class="lede">Um resumo dos seus dias e, depois de algumas semanas, o que costuma andar junto com os seus dias bons e ruins.</p>${body}`;
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
    <p class="lede">O diário é seu. Fica só neste aparelho e só sai daqui se você baixar um backup.</p>
    <div class="cards">
      <section class="block"><h2>Onde ficam seus dias</h2>
        <ul class="facts">
          <li>${icon('lock', 20)}<span>Os registros ficam guardados dentro deste navegador, <b>criptografados com a sua senha</b>. Não tem conta, não tem servidor e ninguém recebe o que você escreve.</span></li>
          <li>${icon('shield-check', 20)}<span>O site é bloqueado de enviar informações para fora. Nem por engano os dados conseguiriam sair.</span></li>
          <li>${icon('database', 20)}<span class="num">${real} ${real === 1 ? 'registro' : 'registros'} · ${fmt(size / 1024, 1)} KB${persisted === true ? ' · protegido contra limpeza automática' : persisted === false ? ' · o navegador pode limpar se faltar espaço' : ''}</span></li>
          <li>${icon('triangle-alert', 20)}<span>Se alguém limpar os dados do navegador ou você trocar de aparelho, o diário some. <b>Baixe um backup de vez em quando.</b> E lembre: quem usar este mesmo celular ou computador consegue abrir o diário.</span></li>
        </ul></section>

      <section class="block"><h2>Exportar</h2><p>Um arquivo seu, para backup ou para levar a outro aparelho.</p>
        <div class="btnrow"><button class="btn" id="exj" type="button" ${real ? '' : 'disabled'}>${icon('download', 18)}Baixar backup (JSON)</button><button class="btn line" id="exc" type="button" ${real ? '' : 'disabled'}>${icon('download', 18)}Planilha (CSV)</button></div></section>

      <section class="block"><h2>Importar</h2><p>Lê um backup do Maré. Junta com o que já existe; se o dia for o mesmo, vale o do arquivo.</p>
        <div class="btnrow"><input id="imp" type="file" accept="application/json,.json" hidden><button class="btn line" id="impb" type="button">${icon('upload', 18)}Escolher arquivo</button></div></section>

      ${!store.hasReal() ? `<section class="block"><h2>Dados de exemplo</h2><p>Quer ver como os padrões ficam? Carregue 9 semanas inventadas. Elas somem assim que você salvar o seu primeiro dia de verdade.</p><div class="btnrow">${store.hasDemo() ? '<button class="btn line" id="rmdemo2" type="button">Remover exemplo</button>' : '<button class="btn line" id="demo" type="button">Carregar exemplo</button>'}</div></section>` : ''}

      <section class="block"><h2>Senha</h2><p>O diário abre sozinho para ninguém: pede a senha toda vez que você entra e fecha depois de 10 minutos parado. Se esquecer a senha, não dá para recuperar os dias.</p>
        <div class="btnrow"><button class="btn" id="lockbtn" type="button">${icon('lock', 18)}Bloquear agora</button><button class="btn line" id="chpw" type="button">${icon('key-round', 18)}Trocar senha</button></div>
        <p>O backup baixado (JSON ou planilha) <b>não é criptografado</b>: guarde em lugar seguro.</p></section>

      <section class="block"><h2>Apagar tudo</h2><p>Apaga todos os seus dias e a senha deste aparelho. Não tem volta, então baixe um backup antes se quiser guardar.</p>
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
  $('#lockbtn').addEventListener('click', () => lockNow());
  $('#chpw').addEventListener('click', changePasswordFlow);
  $('#wipe').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Apagar todos os dados?', text: 'Todos os seus dias serão apagados deste aparelho, sem volta.', confirmLabel: 'Apagar tudo', danger: true, typeWord: 'apagar' })) {
      store.clearAll(); toast('Tudo apagado.'); await lockNow(true);
    }
  });
}

/* ============================ SENHA ============================ */
const MIN_PW = 6;
let cooldownUntil = 0, fails = 0, locking = false;

function pwField(id, label, autocomplete) {
  return `<label class="sr" for="${id}">${label}</label><div class="pwrow"><input id="${id}" type="password" autocomplete="${autocomplete}" placeholder="${label}" autocapitalize="off" spellcheck="false" required><button type="button" class="iconbtn peek" data-peek="${id}" aria-label="Mostrar senha" aria-pressed="false">${icon('eye', 20)}</button></div>`;
}
function bindPeek(root) {
  $$('.peek', root).forEach((b) => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.peek, root), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
    b.innerHTML = icon(show ? 'eye-off' : 'eye', 20);
  }));
}

/** Tela de senha: só o campo. Na primeira vez a senha digitada vira a senha do diário. */
function showLock() {
  return new Promise((resolve) => {
    const creating = store.status() === 'nopass';
    document.body.classList.add('locked');
    tide?.setMood(3);
    document.title = 'Maré';
    view.innerHTML = `<form class="lock" id="lockform" autocomplete="off"><label class="sr" for="pw">Senha</label><input id="pw" type="password" autocomplete="${creating ? 'new-password' : 'current-password'}" placeholder="Senha" enterkeyhint="go" autocapitalize="off" spellcheck="false"></form>`;
    const inp = $('#pw'), form = $('#lockform');
    inp.focus();
    const bad = (hint) => {
      inp.value = ''; inp.disabled = false; inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad');
      if (hint) { inp.placeholder = hint; setTimeout(() => { inp.placeholder = 'Senha'; }, 2200); }
      inp.focus();
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = inp.value;
      if (!pw) return;
      if (creating) {
        if (pw.length < MIN_PW) return bad(`mínimo ${MIN_PW} caracteres`);
        inp.disabled = true;
        try { await store.create(pw); document.body.classList.remove('locked'); resolve(); }
        catch { bad('o navegador não deixou guardar'); }
        return;
      }
      if (cooldownUntil - Date.now() > 0) return bad('espere um pouco');
      inp.disabled = true;
      if (await store.unlock(pw)) { fails = 0; document.body.classList.remove('locked'); resolve(); return; }
      fails++;
      if (fails >= 3) cooldownUntil = Date.now() + Math.min(60, (fails - 2) * 5) * 1000;
      bad();
    });
  });
}

/** Tranca o diário (limpa a memória) e pede a senha de novo. */
async function lockNow(reset = false) {
  if (locking || (!reset && store.status() !== 'open')) return;
  locking = true;
  flushSave?.(); flushSave = null;
  teardown?.(); teardown = null;
  store.lock();
  await showLock();
  locking = false;
  route();
}

async function changePasswordFlow() {
  const d = document.createElement('dialog');
  d.innerHTML = `<h2>Trocar senha</h2><p>Digite a senha atual e escolha a nova.</p><form id="cpf">${pwField('cp0', 'Senha atual', 'current-password')}${pwField('cp1', 'Nova senha', 'new-password')}${pwField('cp2', 'Repita a nova senha', 'new-password')}<p class="err" id="cperr" role="alert"></p><div class="btnrow"><button class="btn quiet" type="button" data-no>Cancelar</button><button class="btn" type="submit" id="cpgo">Trocar</button></div></form>`;
  document.body.appendChild(d);
  bindPeek(d);
  const close = () => { d.close(); d.remove(); };
  $('[data-no]', d).onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  $('#cpf', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('#cperr', d).textContent = m; };
    err('');
    const [a, b, c] = ['cp0', 'cp1', 'cp2'].map((id) => $('#' + id, d).value);
    if (b.length < MIN_PW) return err(`A nova senha precisa de pelo menos ${MIN_PW} caracteres.`);
    if (b !== c) return err('As duas senhas novas não são iguais.');
    const btn = $('#cpgo', d); btn.disabled = true; btn.textContent = 'Trocando…';
    if (!(await store.verify(a))) { err('A senha atual está errada.'); btn.disabled = false; btn.textContent = 'Trocar'; return; }
    await store.changePassword(b);
    close(); toast('Senha trocada.');
  });
  d.showModal();
  $('#cp0', d).focus();
}

/* tranca sozinho: 10 min sem mexer, ou 5 min com a aba escondida */
let idleTimer = 0, hiddenAt = 0;
const bumpIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => lockNow(), 10 * 60 * 1000); };
['pointerdown', 'keydown', 'input', 'touchstart'].forEach((ev) => addEventListener(ev, bumpIdle, { passive: true }));
addEventListener('pagehide', () => flushSave?.());
// outra aba (ou o app instalado) gravou: atualiza esta aba para nunca mostrar nem sobrescrever com valor velho
addEventListener('storage', async (e) => {
  if (e.key !== 'mare:v2' || store.status() !== 'open' || locking) return;
  const r = await store.reload();
  if (r === 'ok') route(); else lockNow(r === 'gone');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSave?.();
  else if (todayRendered && todayRendered !== todayKey() && viewDate === todayRendered && store.status() === 'open' && /^#\/hoje|^$/.test(location.hash)) { viewDate = todayKey(); route(); } // virou o dia
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) lockNow();
});

(async function start() {
  if (store.status() !== 'open') await showLock();
  bumpIdle();
  route();
})();

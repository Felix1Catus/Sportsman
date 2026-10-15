/* Sportsman — app logic (vanilla JS, offline-first, localStorage) */
'use strict';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return dkey(d); };
const dayNum = k => Math.floor(fromKey(k).getTime() / 864e5);
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const r1 = n => Math.round(n * 10) / 10;

// ---------- state ----------
const KEY = 'sportsman.v1';
const DEFAULT_STATE = () => ({
  onboarded: false,
  profile: { name: 'Zizo', sex: 'male', age: 25, height: 181, weight: 71, activity: 1.375, goal: 'lean',
    gymTime: '18:00', trainDays: [6, 1, 3], startDate: dkey(), override: null,
    meals: { breakfast: '08:00', lunch: '13:00', snack: '16:30', dinner: '20:00' } },
  plan: DEFAULT_PLAN.map(e => ({ ...e })),
  today: {}, sessions: [], log: {}, swaps: {}, variant: {}, custom: {}, grocery: { start: dkey(), checked: {} },
  weights: [], prefs: { reminders: false }, lastOpen: null,
});
let state;
function load() {
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  const d = DEFAULT_STATE();
  state = state ? { ...d, ...state, profile: { ...d.profile, ...state.profile, meals: { ...d.profile.meals, ...(state.profile || {}).meals } },
    prefs: { ...d.prefs, ...state.prefs } } : d;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { } }

// ---------- nutrition math ----------
function calcTargets(p = state.profile) {
  const g = GOALS[p.goal];
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * p.activity;
  const kcal = Math.round(tdee * (1 + g.adj) / 10) * 10;
  const protein = Math.round(p.weight * g.protein);
  const fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, p: protein, c: carbs, f: fat };
}
const targets = () => state.profile.override ? { ...calcTargets(), ...state.profile.override } : calcTargets();
const getFood = id => FOODS[id] || state.custom[id];
const macrosOf = (food, g) => ({ kcal: food.kcal * g / 100, p: food.p * g / 100, c: food.c * g / 100, f: food.f * g / 100 });

const CAP = { whey: 60, oats: 130, bread: 140, wrap: 120, banana: 240, apple: 360, dates: 100, oliveoil: 30, pb: 40, avocado: 150,
  almonds: 40, walnuts: 40, tahini: 35, eggs: 250, milk: 450, yogurt: 350, cottage: 300, tofu: 300 };
const CAT_CAP = { protein: 350, carb: 450, veg: 250, fat: 45 };

function solveMeal(foods, T, vegG) {
  const { protein: P, carb: C, veg: V, fat: Fa } = foods;
  const g = { protein: 100, carb: 100, veg: V ? vegG : 0, fat: 10 };
  const cap = (f) => f.max || CAP[f.id] || CAT_CAP[f.cat];
  const val = (f, k, gg) => f ? f[k] * gg / 100 : 0;
  for (let i = 0; i < 60; i++) {
    if (P && P.p > 0) g.protein = Math.min(cap(P), Math.max(0, (T.p - val(C, 'p', g.carb) - val(Fa, 'p', g.fat) - val(V, 'p', g.veg)) / P.p * 100));
    if (C && C.c > 0) g.carb = Math.min(cap(C), Math.max(0, (T.c - val(P, 'c', g.protein) - val(Fa, 'c', g.fat) - val(V, 'c', g.veg)) / C.c * 100));
    if (Fa && Fa.f > 0) g.fat = Math.min(cap(Fa), Math.max(0, (T.f - val(P, 'f', g.protein) - val(C, 'f', g.carb) - val(V, 'f', g.veg)) / Fa.f * 100));
  }
  return g;
}
function roundQty(food, grams) {
  if (grams <= 0) return 0;
  if (food.unit) {
    const step = food.unit.half ? 0.5 : 1;
    const q = Math.max(step, Math.round(grams / food.unit.g / step) * step);
    return Math.round(q * food.unit.g);
  }
  return Math.max(5, Math.round(grams / 5) * 5);
}
function qtyText(food, grams) {
  if (food.unit) {
    const q = grams / food.unit.g;
    const qs = Number.isInteger(q) ? q : r1(q);
    const n = food.unit.n;
    return `${qs} ${n}${q !== 1 && n !== 'tbsp' ? 's' : ''} · ${grams} g`;
  }
  return `${grams} g`;
}
const isTrainDay = k => state.profile.trainDays.includes(fromKey(k).getDay());

function slotsFor(k) {
  const m = state.profile.meals, train = isTrainDay(k);
  const list = [
    { slot: 'breakfast', time: m.breakfast },
    { slot: 'lunch', time: m.lunch },
    train ? { slot: 'pre', time: fromMin(toMin(state.profile.gymTime) - 60) } : { slot: 'snack', time: m.snack },
    { slot: 'dinner', time: m.dinner },
  ];
  return list.sort((a, b) => toMin(a.time) - toMin(b.time));
}

const planCache = {};
function generateDay(k) {
  const ck = k + JSON.stringify([state.profile, state.swaps, state.variant, Object.keys(state.custom).length]);
  if (planCache[ck]) return planCache[ck];
  const T = targets(), slots = slotsFor(k), out = {};
  let rem = { kcal: T.kcal, p: T.p, c: T.c, f: T.f };
  // solve the awkward snack first, then the big meals take what is left
  const order = [...slots].sort((a, b) => (a.slot === 'pre' || a.slot === 'snack' ? -1 : 0) - (b.slot === 'pre' || b.slot === 'snack' ? -1 : 0));
  let left = order.reduce((s, x) => s + SLOT_META[x.slot].share, 0);
  for (const s of order) {
    const meta = SLOT_META[s.slot], frac = meta.share / left;
    const tgt = { p: rem.p * frac, c: rem.c * frac, f: rem.f * frac };
    const combos = COMBOS[s.slot];
    const vi = (state.variant[`${k}|${s.slot}`] || 0);
    const seed = dayNum(k) * 3 + Object.keys(SLOT_META).indexOf(s.slot) + vi;
    const combo = combos[Math.abs(seed) % combos.length];
    const foods = {};
    ROLES.forEach((role, i) => {
      if (!combo[i]) return;
      const sw = state.swaps[`${k}|${s.slot}|${role}`];
      foods[role] = getFood(sw) || getFood(combo[i]);
    });
    const grams = solveMeal(foods, tgt, s.slot === 'breakfast' ? 80 : 150);
    const items = [];
    const tot = { kcal: 0, p: 0, c: 0, f: 0 };
    ROLES.forEach(role => {
      const food = foods[role]; if (!food) return;
      let gg = grams[role];
      if (role === 'protein' && (s.slot === 'lunch' || s.slot === 'dinner') && !food.unit && food.cat === 'protein') gg = Math.max(gg, 100);
      gg = roundQty(food, gg);
      if (role === 'fat' && (gg < 4 || (!food.unit && gg < 15))) return;
      if (role !== 'veg' && gg === 0) return;
      const mac = macrosOf(food, gg);
      items.push({ role, id: food.id, name: food.name, grams: gg, text: qtyText(food, gg), ...mac });
      Object.keys(tot).forEach(x => tot[x] += mac[x]);
    });
    rem = { kcal: rem.kcal - tot.kcal, p: rem.p - tot.p, c: rem.c - tot.c, f: rem.f - tot.f };
    left -= meta.share;
    out[s.slot] = { slot: s.slot, label: meta.label, icon: meta.icon, time: s.time, items, tot };
  }
  const res = slots.map(s => out[s.slot]);
  res.total = res.reduce((a, m) => ({ kcal: a.kcal + m.tot.kcal, p: a.p + m.tot.p, c: a.c + m.tot.c, f: a.f + m.tot.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  planCache[ck] = res;
  return res;
}

const logOf = k => state.log[k] || [];
const eaten = k => logOf(k).reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
const slotLogged = (k, slot) => logOf(k).some(e => e.slot === slot);

// ---------- workouts ----------
function todayWorkout(k, create) {
  if (!state.today[k] && create) {
    state.today[k] = { items: state.plan.map(e => ({ ...e, done: false })), startedAt: null, finishedAt: null, cardio: false, extra: true };
    save();
  }
  return state.today[k];
}
const weekNo = k => Math.max(1, Math.floor((dayNum(k) - dayNum(state.profile.startDate)) / 7) + 1);
const cardioFor = k => weekNo(k) <= 2 ? CARDIO.early : CARDIO.late;
const sessionDates = () => new Set(state.sessions.map(s => s.date));
function lastSession() { return state.sessions.length ? state.sessions[state.sessions.length - 1] : null; }
function daysSince(k) { return dayNum(dkey()) - dayNum(k); }
function weekSessions(k = dkey()) {
  const d = fromKey(k); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const a = dayNum(dkey(mon)), b = a + 6;
  return state.sessions.filter(s => dayNum(s.date) >= a && dayNum(s.date) <= b).length;
}
function gymStreak() {
  const done = sessionDates(); const start = state.profile.startDate; let n = 0; const today = dkey();
  for (let i = done.has(today) ? 0 : 1; ; i++) {
    const k = addDays(today, -i); if (k < start) break;
    if (done.has(k)) n++; else if (isTrainDay(k)) break;
  }
  return n;
}
function foodStreak() {
  const T = targets().kcal; let n = 0; const today = dkey();
  for (let i = eaten(today).kcal >= T * 0.7 ? 0 : 1; i < 365; i++) {
    const k = addDays(today, -i);
    if (eaten(k).kcal >= T * 0.7) n++; else break;
  }
  return n;
}

// ---------- alerts (the nagging) ----------
function alerts() {
  const out = [], k = dkey(), now = nowMin(), seed = dayNum(k), T = targets(), P = state.profile;
  const e = eaten(k), pct = Math.round(e.kcal / T.kcal * 100);
  const plan = generateDay(k);
  // food
  const overdue = plan.filter(m => toMin(m.time) + 45 < now && !slotLogged(k, m.slot));
  if (now >= 600 && e.kcal === 0) out.push({ lvl: 'red', t: 'Nothing eaten today', x: pick(NAG.noFood, seed), act: 'tab:eat', btn: 'Open meals' });
  else if (overdue.length) { const m = overdue[overdue.length - 1]; out.push({ lvl: 'red', t: `${m.label} is overdue`, x: fill(pick(NAG.mealLate, seed), { meal: m.label, time: m.time }), act: 'tab:eat', btn: 'Eat & log' }); }
  if (now >= 20 * 60 && pct < 75 && e.kcal > 0) out.push({ lvl: 'amber', t: 'Calories behind', x: fill(pick(NAG.eveningLow, seed), { pct }), act: 'tab:eat', btn: 'Fix it' });
  const y = addDays(k, -1), yPct = Math.round(eaten(y).kcal / T.kcal * 100);
  if (Object.keys(state.log).length && yPct < 70 && k > P.startDate) out.push({ lvl: 'amber', t: 'Yesterday was weak', x: fill(pick(NAG.yesterdayLow, seed), { pct: yPct }) });
  const lastFood = Object.keys(state.log).filter(d => state.log[d].length).sort().pop();
  if (lastFood && daysSince(lastFood) >= 2) out.push({ lvl: 'red', t: 'Food log gone quiet', x: fill(pick(NAG.foodGap, seed), { n: daysSince(lastFood) }) });
  // gym
  const ls = lastSession(), wk = todayWorkout(k), trained = sessionDates().has(k);
  if (!ls && daysSince(P.startDate) >= 1) out.push({ lvl: 'red', t: 'No workouts logged yet', x: pick(NAG.neverTrained, seed), act: 'tab:train', btn: 'Train' });
  if (isTrainDay(k) && !trained) {
    const late = now > toMin(P.gymTime) + 30 && !(wk && wk.startedAt);
    out.push(late ? { lvl: 'red', t: 'You have not trained', x: fill(pick(NAG.gymLate, seed), { time: P.gymTime }), act: 'tab:train', btn: 'Start now' }
      : { lvl: 'blue', t: `Training day · ${P.gymTime}`, x: fill(pick(NAG.gymToday, seed), { n: state.plan.length }), act: 'tab:train', btn: 'See workout' });
  }
  if (ls && daysSince(ls.date) >= 4 && !trained) out.push({ lvl: 'red', t: 'Gap in training', x: fill(pick(NAG.gymGap, seed), { n: daysSince(ls.date) }), act: 'tab:train', btn: 'Train' });
  for (let i = 1; i <= 3; i++) { // missed scheduled day recently
    const d = addDays(k, -i);
    if (d >= P.startDate && isTrainDay(d) && !sessionDates().has(d) && ls && daysSince(ls.date) < 4) {
      out.push({ lvl: 'amber', t: 'Missed session', x: fill(pick(NAG.gymMissed, seed), { day: DAYN[fromKey(d).getDay()] }) }); break;
    }
  }
  const rank = { red: 0, amber: 1, blue: 2 };
  return out.sort((a, b) => rank[a.lvl] - rank[b.lvl]).slice(0, 4);
}

// ---------- notifications ----------
const LN = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
async function scheduleReminders() {
  const ln = LN(); if (!ln || !state.prefs.reminders) return;
  try {
    const perm = await ln.requestPermissions();
    if (perm.display !== 'granted') return;
    const pend = await ln.getPending();
    if (pend.notifications.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    const list = [], now = Date.now(), today = dkey(), P = state.profile;
    const at = (k, hm) => { const [h, m] = hm.split(':').map(Number); const d = fromKey(k); d.setHours(h, m, 0, 0); return d; };
    for (let i = 0; i < 7; i++) {
      const k = addDays(today, i), plan = generateDay(k);
      plan.forEach((m, j) => {
        const when = at(k, m.time); if (when.getTime() <= now) return;
        const desc = m.items.map(x => x.name).join(' + ');
        list.push({ id: 100 + i * 10 + j, title: `${m.icon} ${m.label} · ${Math.round(m.tot.kcal)} kcal`, body: `${desc}. Eat it, then log it.`, schedule: { at: when, allowWhileIdle: true } });
      });
      if (isTrainDay(k)) {
        const g = at(k, P.gymTime);
        [[-90, 'Gym day', `Gym at ${P.gymTime}. ${state.plan.length} exercises, 45 min. Be ready.`],
        [30, 'Did you go?', 'Open Sportsman: start the workout or admit you skipped. No hiding.']].forEach(([off, t, b], n) => {
          const w = new Date(g.getTime() + off * 60000); if (w.getTime() > now) list.push({ id: 500 + i * 10 + n, title: `🏋️ ${t}`, body: b, schedule: { at: w, allowWhileIdle: true } });
        });
      }
      const nightly = at(k, '21:30');
      if (nightly.getTime() > now) list.push({ id: 700 + i, title: '📝 Close the day', body: 'Log everything you ate. Under target? Eat something now.', schedule: { at: nightly, allowWhileIdle: true } });
    }
    [20, 44, 68, 116].forEach((h, n) => list.push({ id: 900 + n, title: 'Sportsman', body: NAG.inactive[n], schedule: { at: new Date(now + h * 3600e3), allowWhileIdle: true } }));
    await ln.schedule({ notifications: list });
  } catch (e) { console.warn('schedule failed', e); }
}
async function enableReminders() {
  state.prefs.reminders = true; save();
  const ln = LN();
  if (ln) await scheduleReminders();
  else if ('Notification' in window) { try { await Notification.requestPermission(); } catch { } }
  toast(ln ? 'Reminders on. Expect to be nagged.' : 'Browser alerts on while the app is open. The Android app does full background reminders.');
}

// ---------- UI plumbing ----------
let tab = 'home', timerH = null, restEnd = 0, eatDay = dkey();
const icons = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  train: '<path d="M2 9v6M5 6v12M19 6v12M22 9v6M5 12h14"/>',
  eat: '<path d="M7 2v9a3 3 0 003 3v8M7 2v6M11 2v6M17 2c-2 2-3 5-3 8s1 4 3 4v8"/>',
  shop: '<path d="M3 4h2l2.5 11h11L21 7H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[n]}</svg>`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200);
}
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').classList.add('open'); }
function closeSheet() { $('#sheet').classList.remove('open'); }

function ring(val, max, size = 150) {
  const r = 54, C = 2 * Math.PI * r, pct = Math.min(1, val / max), over = val > max * 1.05;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 130 130"><circle cx="65" cy="65" r="${r}" class="rbg"/>
    <circle cx="65" cy="65" r="${r}" class="rfg ${over ? 'over' : ''}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" transform="rotate(-90 65 65)"/>
    <text x="65" y="62" class="rbig">${Math.round(val)}</text><text x="65" y="80" class="rsm">of ${Math.round(max)} kcal</text></svg>`;
}
const bar = (label, v, max, unit = 'g') => `<div class="mbar"><div class="ml"><span>${label}</span><b>${Math.round(v)}<i> / ${Math.round(max)}${unit}</i></b></div>
  <div class="mt"><div class="mf" style="width:${Math.min(100, v / max * 100)}%"></div></div></div>`;

// ---------- views ----------
function viewHome() {
  const k = dkey(), T = targets(), e = eaten(k), plan = generateDay(k), now = nowMin();
  const al = alerts();
  const next = plan.find(m => !slotLogged(k, m.slot) && toMin(m.time) + 45 >= now) || plan.find(m => !slotLogged(k, m.slot));
  const wk = todayWorkout(k), trained = sessionDates().has(k), train = isTrainDay(k);
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening';
  const lastW = state.weights.length ? state.weights[state.weights.length - 1].kg : state.profile.weight;
  return `
  <header class="top"><div><div class="brand">SPORTS<span>MAN</span></div><div class="sub">${greet}, ${esc(state.profile.name)} · ${DAYN[new Date().getDay()]}</div></div>
    <div class="chip">Week ${weekNo(k)}</div></header>
  ${al.map(a => `<div class="alert ${a.lvl}"><div><b>${esc(a.t)}</b><p>${esc(a.x)}</p></div>${a.act ? `<button class="btn sm" data-act="${a.act}">${esc(a.btn)}</button>` : ''}</div>`).join('')}
  <section class="card kcal">
    ${ring(e.kcal, T.kcal)}
    <div class="macros">${bar('Protein', e.p, T.p)}${bar('Carbs', e.c, T.c)}${bar('Fat', e.f, T.f)}
      <div class="left">${e.kcal >= T.kcal ? 'Target hit ✔' : `<b>${Math.round(T.kcal - e.kcal)}</b> kcal to go`}</div></div>
  </section>
  ${next ? `<section class="card"><div class="eyebrow">${slotLogged(k, next.slot) ? '' : (toMin(next.time) < now - 45 ? 'OVERDUE · ' : 'NEXT MEAL · ')}${next.time}</div>
    <h3>${next.icon} ${next.label} <small>${Math.round(next.tot.kcal)} kcal · ${Math.round(next.tot.p)}g protein</small></h3>
    <ul class="items">${next.items.map(i => `<li>${esc(i.name)}<span>${esc(i.text)}</span></li>`).join('')}</ul>
    <div class="row"><button class="btn" data-act="logmeal" data-d="${k}" data-s="${next.slot}">Log this meal</button><button class="btn ghost" data-act="tab:eat">Swap items</button></div></section>`
    : `<section class="card"><h3>All meals logged ✔</h3><p class="muted">Check you hit ${T.kcal} kcal. Top up if you are short.</p></section>`}
  <section class="card"><div class="eyebrow">${train ? 'TRAINING DAY' : 'REST DAY'} · ${state.profile.gymTime}</div>
    <h3>${trained ? 'Workout done ✔' : train ? 'Full-body session' : 'Recover. Eat well.'}</h3>
    <p class="muted">${trained ? 'Good. Next one is on schedule.' : `${state.plan.length} exercises · ~45 min · ${cardioFor(k).title}`}</p>
    ${trained ? '' : `<button class="btn" data-act="tab:train">${wk && wk.startedAt ? 'Continue workout' : train ? 'Go to workout' : 'Train anyway'}</button>`}</section>
  <section class="stats">
    <div class="stat"><b>${weekSessions()}<i>/${state.profile.trainDays.length}</i></b><span>sessions this week</span></div>
    <div class="stat"><b>${gymStreak()}</b><span>gym streak</span></div>
    <div class="stat"><b>${foodStreak()}</b><span>days on target</span></div>
    <div class="stat"><b>${r1(lastW)}</b><span>kg now</span></div>
  </section>`;
}

function viewTrain() {
  const k = dkey(), train = isTrainDay(k), wk = todayWorkout(k), trained = sessionDates().has(k);
  const hist = state.sessions.slice(-5).reverse();
  if (!wk) {
    return `<header class="top"><div><div class="brand">TRAIN</div><div class="sub">${train ? 'Today is a training day' : 'Rest day today'}</div></div></header>
    <section class="card hero"><h2>${train ? 'Ready?' : 'Rest day'}</h2><p class="muted">${train ? `${state.plan.length} exercises · 45 minutes max · ${cardioFor(k).title.replace('Cardio · ', '')} after.` : 'Rest is when you grow. Want to train anyway?'}</p>
    <button class="btn big" data-act="openwk">${train ? 'View today’s workout' : 'Train anyway'}</button></section>
    ${histHtml(hist)}`;
  }
  const done = wk.items.filter(i => i.done).length;
  const started = !!wk.startedAt, fin = !!wk.finishedAt;
  return `<header class="top"><div><div class="brand">TRAIN</div><div class="sub">Week ${weekNo(k)} · ${weekNo(k) <= 2 ? '50–60% effort, nail the form' : 'push the weights up'}</div></div>
    <div class="chip" id="wtimer">${started && !fin ? fmtDur(Date.now() - wk.startedAt) : fin ? 'DONE' : '00:00'}</div></header>
  ${fin ? `<div class="alert green"><div><b>Session saved ✔</b><p>${done}/${wk.items.length} exercises done. See you next training day.</p></div></div>` : ''}
  ${!started && !fin ? `<button class="btn big" data-act="startwk">▶ START WORKOUT</button>` : ''}
  <section class="list">${wk.items.map((x, i) => `
    <div class="ex ${x.done ? 'done' : ''}">
      <button class="chk" data-act="togex" data-i="${i}" aria-label="done">${x.done ? '✓' : ''}</button>
      <div class="exm" data-act="editex" data-i="${i}"><b>${esc(x.name)}</b><span>${esc(x.muscle || '')}</span>
        <em>${x.sets} × ${esc(x.reps)}${x.weight ? ` · ${x.weight} kg` : ''} · rest ${x.rest}s</em></div>
      <button class="gear" data-act="editex" data-i="${i}" aria-label="edit">⋯</button>
    </div>`).join('')}</section>
  <button class="btn ghost" data-act="addex">+ Add exercise</button>
  <section class="card"><h3>${cardioFor(k).title}</h3><p class="muted">${cardioFor(k).text}</p>
    <button class="btn ${wk.cardio ? '' : 'ghost'}" data-act="togcardio">${wk.cardio ? 'Cardio done ✓' : 'Mark cardio done'}</button></section>
  <div class="tip">Hit a wall after exercise 6? Skip arms and abs and go home. Quality beats duration.</div>
  ${started && !fin ? `<button class="btn big" data-act="finishwk">FINISH & SAVE (${done}/${wk.items.length})</button>` : ''}
  ${histHtml(hist)}`;
}
const fmtDur = ms => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function histHtml(h) {
  if (!h.length) return '';
  return `<h4 class="sec">Recent sessions</h4><section class="card flat">${h.map(s => `<div class="hist"><b>${DAYS3[fromKey(s.date).getDay()]} ${s.date.slice(5)}</b><span>${s.items.filter(i => i.done).length}/${s.items.length} done${s.cardio ? ' · cardio' : ''}${s.end && s.start ? ' · ' + Math.round((s.end - s.start) / 60000) + ' min' : ''}</span></div>`).join('')}</section>`;
}

function viewEat() {
  const k = eatDay, T = targets(), e = eaten(k), plan = generateDay(k), entries = logOf(k), isToday = k === dkey();
  return `<header class="top"><div><div class="brand">EAT</div><div class="sub">Target ${T.kcal} kcal · ${T.p}P · ${T.c}C · ${T.f}F</div></div>
    <div class="daysw"><button data-act="eday" data-n="-1">‹</button><span>${isToday ? 'Today' : DAYS3[fromKey(k).getDay()] + ' ' + k.slice(5)}</span><button data-act="eday" data-n="1">›</button></div></header>
  <section class="card kcal">${ring(e.kcal, T.kcal)}<div class="macros">${bar('Protein', e.p, T.p)}${bar('Carbs', e.c, T.c)}${bar('Fat', e.f, T.f)}
    <div class="left">${e.kcal >= T.kcal ? 'Target hit ✔' : `<b>${Math.round(T.kcal - e.kcal)}</b> kcal to go`}</div></div></section>
  <h4 class="sec">Meal plan <small>auto-built to hit your target</small></h4>
  ${plan.map(m => {
    const lg = slotLogged(k, m.slot);
    return `<section class="card meal ${lg ? 'logged' : ''}"><div class="eyebrow">${m.time}${lg ? ' · LOGGED ✓' : ''}</div>
    <h3>${m.icon} ${m.label} <small>${Math.round(m.tot.kcal)} kcal · ${Math.round(m.tot.p)}P ${Math.round(m.tot.c)}C ${Math.round(m.tot.f)}F</small></h3>
    <ul class="items">${m.items.map(i => `<li><div>${esc(i.name)}<span>${esc(i.text)}</span></div><button class="swap" data-act="swap" data-d="${k}" data-s="${m.slot}" data-r="${i.role}">⇄ swap</button></li>`).join('')}</ul>
    <div class="row"><button class="btn ${lg ? 'ghost' : ''}" data-act="logmeal" data-d="${k}" data-s="${m.slot}">${lg ? 'Logged ✓ (tap to undo)' : 'Log this meal'}</button>
    <button class="btn ghost" data-act="shuffle" data-d="${k}" data-s="${m.slot}">🔀 New meal</button></div></section>`;
  }).join('')}
  <h4 class="sec">Eaten ${isToday ? 'today' : ''}</h4>
  <section class="card flat">${entries.length ? entries.map(x => `<div class="hist"><div><b>${esc(x.name)}</b><span>${x.grams ? x.grams + ' g · ' : ''}${Math.round(x.p)}P ${Math.round(x.c)}C ${Math.round(x.f)}F</span></div><div class="r"><b>${Math.round(x.kcal)}</b><button class="x" data-act="delentry" data-d="${k}" data-id="${x.id}">✕</button></div></div>`).join('') : '<p class="muted">Nothing logged yet.</p>'}</section>
  <button class="btn" data-act="addfood" data-d="${k}">+ Add food (search)</button>`;
}

function shopList() {
  const start = state.grocery.start, tot = {};
  for (let i = 0; i < 7; i++) generateDay(addDays(start, i)).forEach(m => m.items.forEach(it => {
    const f = getFood(it.id); tot[it.id] = (tot[it.id] || 0) + it.grams * (f.raw || 1);
  }));
  const groups = {};
  Object.entries(tot).forEach(([id, g]) => {
    const f = getFood(id), aisle = f.aisle || 'Other';
    let txt;
    if (f.unit && !f.unit.half) { const n = Math.ceil(g / f.unit.g); txt = `${n} ${f.unit.n}${n !== 1 ? 's' : ''}`; }
    else if (f.unit) { txt = `${Math.ceil(g / 10) * 10} g`; }
    else { const c = Math.ceil(g / 50) * 50; txt = c >= 1000 ? `${r1(c / 1000)} kg` : `${c} g`; }
    (groups[aisle] = groups[aisle] || []).push({ id, name: f.name, txt, g });
  });
  Object.values(groups).forEach(a => a.sort((x, y) => y.g - x.g));
  return groups;
}
function viewShop() {
  const groups = shopList(), ch = state.grocery.checked, st = state.grocery.start;
  const total = Object.values(groups).flat(), got = total.filter(i => ch[i.id]).length;
  return `<header class="top"><div><div class="brand">GROCERIES</div><div class="sub">${st.slice(5)} → ${addDays(st, 6).slice(5)} · covers every planned meal</div></div><div class="chip">${got}/${total.length}</div></header>
  ${Object.entries(groups).map(([a, items]) => `<h4 class="sec">${a}</h4><section class="card flat">${items.map(i => `
    <label class="gi ${ch[i.id] ? 'done' : ''}"><input type="checkbox" data-act="togshop" data-id="${i.id}" ${ch[i.id] ? 'checked' : ''}><span class="cb"></span><b>${esc(i.name)}</b><em>${i.txt}</em></label>`).join('')}</section>`).join('')}
  <div class="row"><button class="btn ghost" data-act="copyshop">Copy list</button><button class="btn ghost" data-act="newshop">New week from today</button></div>
  <p class="muted c">Quantities are raw/dry shopping weights, rounded up. Swap a meal item and this list updates.</p>`;
}

function viewMe() {
  const P = state.profile, T = calcTargets(), A = targets();
  const goalBtns = Object.entries(GOALS).map(([k, g]) => `<button class="seg ${P.goal === k ? 'on' : ''}" data-act="goal" data-g="${k}">${g.label}</button>`).join('');
  const lastW = state.weights.slice(-1)[0];
  return `<header class="top"><div><div class="brand">PROFILE</div><div class="sub">${esc(P.name)} · ${GOALS[P.goal].label}</div></div></header>
  <section class="card"><h3>Your numbers</h3>
    <div class="grid2">
      <label>Name<input id="p-name" value="${esc(P.name)}"></label>
      <label>Sex<select id="p-sex"><option value="male" ${P.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${P.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
      <label>Age<input id="p-age" type="number" value="${P.age}"></label>
      <label>Height (cm)<input id="p-height" type="number" value="${P.height}"></label>
      <label>Weight (kg)<input id="p-weight" type="number" step="0.1" value="${P.weight}"></label>
      <label>Activity<select id="p-act">${ACTIVITY.map(([v, t]) => `<option value="${v}" ${P.activity === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="segs">${goalBtns}</div><p class="muted">${GOALS[P.goal].note}</p>
    <button class="btn" data-act="saveprofile">Save & recalculate</button></section>
  <section class="card"><h3>Daily targets</h3>
    <div class="tgt"><div><b>${A.kcal}</b><span>kcal</span></div><div><b>${A.p}</b><span>protein g</span></div><div><b>${A.c}</b><span>carbs g</span></div><div><b>${A.f}</b><span>fat g</span></div></div>
    <p class="muted">${P.override ? 'Using custom numbers.' : `BMR ${T.bmr} · maintenance ${T.tdee} kcal · goal adjustment ${Math.round(GOALS[P.goal].adj * 100)}%.`}</p>
    <div class="row"><button class="btn ghost" data-act="setoverride">Set my own numbers</button>${P.override ? '<button class="btn ghost" data-act="clearoverride">Back to auto</button>' : ''}</div></section>
  <section class="card"><h3>Schedule</h3>
    <div class="grid2"><label>Gym time<input id="p-gym" type="time" value="${P.gymTime}"></label>
    <label>Breakfast<input id="m-breakfast" type="time" value="${P.meals.breakfast}"></label>
    <label>Lunch<input id="m-lunch" type="time" value="${P.meals.lunch}"></label>
    <label>Snack<input id="m-snack" type="time" value="${P.meals.snack}"></label>
    <label>Dinner<input id="m-dinner" type="time" value="${P.meals.dinner}"></label></div>
    <p class="muted">Training days</p><div class="segs">${DAYS3.map((d, i) => `<button class="seg ${P.trainDays.includes(i) ? 'on' : ''}" data-act="trainday" data-i="${i}">${d}</button>`).join('')}</div>
    <button class="btn" data-act="saveschedule">Save schedule</button></section>
  <section class="card"><h3>Reminders</h3><p class="muted">Meal times, gym day, a nightly check, and escalating nags if you stop opening the app.</p>
    <button class="btn ${state.prefs.reminders ? '' : 'big'}" data-act="enablerem">${state.prefs.reminders ? 'Reminders ON · re-sync' : 'Turn on reminders'}</button></section>
  <section class="card"><h3>Body weight</h3><p class="muted">${lastW ? `Last: ${lastW.kg} kg (${lastW.date})` : 'No entries yet.'}</p>
    <div class="row"><input id="w-in" type="number" step="0.1" placeholder="kg"><button class="btn" data-act="logweight">Log weight</button></div></section>
  <section class="card"><h3>Workout plan</h3><p class="muted">${state.plan.length} exercises. Edit any exercise from the Train tab; changes carry into the plan.</p>
    <button class="btn ghost" data-act="resetplan">Reset to the PDF plan</button></section>
  <section class="card flat"><button class="btn ghost" data-act="export">Export my data</button><button class="btn danger" data-act="wipe">Erase everything</button></section>`;
}

function viewOnboard() {
  const P = state.profile;
  return `<div class="onb"><div class="brand big">SPORTS<span>MAN</span></div><p class="muted">Gym plan. Meal plan. Groceries. And someone on your back.</p>
  <section class="card"><div class="grid2">
    <label>Name<input id="p-name" value="${esc(P.name)}"></label>
    <label>Sex<select id="p-sex"><option value="male">Male</option><option value="female">Female</option></select></label>
    <label>Age<input id="p-age" type="number" value="${P.age}"></label>
    <label>Height (cm)<input id="p-height" type="number" value="${P.height}"></label>
    <label>Weight (kg)<input id="p-weight" type="number" step="0.1" value="${P.weight}"></label>
    <label>Gym time<input id="p-gym" type="time" value="${P.gymTime}"></label></div>
    <label class="full">Activity<select id="p-act">${ACTIVITY.map(([v, t]) => `<option value="${v}" ${P.activity === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <p class="muted">Goal</p><div class="segs" id="ob-goals">${Object.entries(GOALS).map(([k, g]) => `<button class="seg ${P.goal === k ? 'on' : ''}" data-act="obgoal" data-g="${k}">${g.label}</button>`).join('')}</div>
    <p class="muted">Training days</p><div class="segs">${DAYS3.map((d, i) => `<button class="seg ${P.trainDays.includes(i) ? 'on' : ''}" data-act="trainday" data-i="${i}">${d}</button>`).join('')}</div>
    <button class="btn big" data-act="finishonb">LET’S GO</button></section></div>`;
}

// ---------- render ----------
function render() {
  const app = $('#app');
  if (!state.onboarded) { app.innerHTML = viewOnboard(); $('#nav').style.display = 'none'; return; }
  $('#nav').style.display = '';
  const v = { home: viewHome, train: viewTrain, eat: viewEat, shop: viewShop, me: viewMe }[tab];
  const sy = window.scrollY; app.innerHTML = v(); window.scrollTo(0, sy);
  $('#nav').innerHTML = [['home', 'Home'], ['train', 'Train'], ['eat', 'Eat'], ['shop', 'Shop'], ['me', 'Me']]
    .map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab:${k}">${ico(k)}<span>${l}</span></button>`).join('');
}
function go(t) { tab = t; window.scrollTo(0, 0); render(); }

// ---------- sheets ----------
function exSheet(i) {
  const wk = todayWorkout(dkey(), true), x = i == null ? { name: '', muscle: '', sets: 3, reps: '12', weight: 0, rest: 60 } : wk.items[i];
  openSheet(`<h3>${i == null ? 'Add exercise' : 'Edit exercise'}</h3>
  <label>Name<input id="e-name" value="${esc(x.name)}"></label>
  <div class="grid3"><label>Sets<input id="e-sets" type="number" value="${x.sets}"></label><label>Reps<input id="e-reps" value="${esc(x.reps)}"></label><label>Weight kg<input id="e-w" type="number" step="0.5" value="${x.weight || ''}"></label></div>
  <div class="grid2"><label>Muscle<input id="e-m" value="${esc(x.muscle || '')}"></label><label>Rest (s)<input id="e-r" type="number" value="${x.rest}"></label></div>
  <label class="inl"><input type="checkbox" id="e-plan" checked> ${i == null ? 'Add to my plan permanently' : 'Save changes to my plan'}</label>
  <div class="row"><button class="btn" data-act="saveex" data-i="${i ?? ''}">Save</button>
  ${i != null ? `<button class="btn danger" data-act="delex" data-i="${i}">Remove today</button><button class="btn danger" data-act="delexplan" data-i="${i}">Remove from plan</button>` : ''}</div>`);
}
function swapSheet(k, slot, role) {
  const meal = generateDay(k).find(m => m.slot === slot), cur = meal.items.find(i => i.role === role);
  const alts = FOODS_LIST.filter(f => f.cat === role && f.id !== cur.id);
  const custom = Object.values(state.custom).filter(f => f.cat === role && f.id !== cur.id);
  openSheet(`<h3>Swap ${esc(cur.name)}</h3><p class="muted">Quantities rebalance so the meal still hits its macros.</p>
  <div class="opts">${[...alts, ...custom].map(f => `<button class="opt" data-act="doswap" data-d="${k}" data-s="${slot}" data-r="${role}" data-id="${f.id}"><b>${esc(f.name)}</b><span>${f.kcal} kcal · ${f.p}P ${f.c}C ${f.f}F /100g</span></button>`).join('')}</div>
  <h4 class="sec">Find more online</h4><div class="row"><input id="q" placeholder="e.g. quinoa, chicken thigh" data-ctx="swap" data-d="${k}" data-s="${slot}" data-r="${role}"><button class="btn" data-act="search">Search</button></div>
  <div id="results" class="opts"></div>`);
}
function foodSheet(k) {
  openSheet(`<h3>Add food</h3><div class="row"><input id="q" placeholder="Search food (e.g. chicken shawarma)" data-ctx="log" data-d="${k}"><button class="btn" data-act="search">Search</button></div>
  <div id="results" class="opts">${FOODS_LIST.slice(0, 12).map(f => foodOpt(f, 'pickfood')).join('')}</div>
  <h4 class="sec">Quick add</h4><div class="grid2"><label>Name<input id="qa-n" placeholder="Meal / snack"></label><label>Calories<input id="qa-k" type="number"></label>
  <label>Protein g<input id="qa-p" type="number"></label><label>Carbs g<input id="qa-c" type="number"></label></div><label>Fat g<input id="qa-f" type="number"></label>
  <button class="btn" data-act="quickadd" data-d="${k}">Add</button>`);
}
const foodOpt = (f, act, extra = '') => `<button class="opt" data-act="${act}" data-id="${esc(f.id)}" ${extra}><b>${esc(f.name)}</b><span>${f.kcal} kcal · ${f.p}P ${f.c}C ${f.f}F /100g${f.src ? ' · ' + f.src : ''}</span></button>`;

// ---------- online food search (Open Food Facts + USDA FoodData Central, both free) ----------
async function fetchT(url, ms = 9000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
async function searchOnline(q) {
  const enc = encodeURIComponent(q), out = [];
  const jobs = [
    fetchT(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${enc}&pageSize=10&dataType=Foundation,SR%20Legacy`).then(j => (j.foods || []).forEach(f => {
      const n = name => (f.foodNutrients || []).find(x => x.nutrientName === name || x.nutrientName?.startsWith(name));
      const kcal = (f.foodNutrients || []).find(x => x.nutrientName === 'Energy' && x.unitName === 'KCAL');
      if (!kcal) return;
      out.push({ id: 'fdc' + f.fdcId, name: f.description.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60), kcal: Math.round(kcal.value), p: r1(n('Protein')?.value || 0), c: r1(n('Carbohydrate')?.value || 0), f: r1(n('Total lipid')?.value || 0), src: 'USDA' });
    })),
    fetchT(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,brands,nutriments`).then(j => (j.products || []).forEach((p, i) => {
      const n = p.nutriments || {}; if (!p.product_name || n['energy-kcal_100g'] == null) return;
      out.push({ id: 'off' + i + '_' + p.product_name.replace(/\W/g, '').slice(0, 12), name: (p.product_name + (p.brands ? ` (${p.brands.split(',')[0]})` : '')).slice(0, 60), kcal: Math.round(n['energy-kcal_100g']), p: r1(n.proteins_100g || 0), c: r1(n.carbohydrates_100g || 0), f: r1(n.fat_100g || 0), src: 'OpenFoodFacts' });
    })),
  ];
  const res = await Promise.allSettled(jobs);
  if (res.every(r => r.status === 'rejected')) throw new Error('offline');
  return out;
}
let lastResults = [];
async function doSearch() {
  const q = $('#q'); if (!q || !q.value.trim()) return;
  const ctx = q.dataset, term = q.value.trim().toLowerCase(), box = $('#results');
  const local = FOODS_LIST.filter(f => f.name.toLowerCase().includes(term) && (ctx.ctx !== 'swap' || f.cat === ctx.r));
  box.innerHTML = local.map(f => foodOpt(f, ctx.ctx === 'swap' ? 'doswap' : 'pickfood', ctx.ctx === 'swap' ? `data-d="${ctx.d}" data-s="${ctx.s}" data-r="${ctx.r}"` : '')).join('') + '<p class="muted c">Searching online…</p>';
  try {
    lastResults = await searchOnline(q.value.trim());
    lastResults.forEach(f => { f.cat = ctx.r || 'carb'; });
    box.innerHTML = local.map(f => foodOpt(f, ctx.ctx === 'swap' ? 'doswap' : 'pickfood', ctx.ctx === 'swap' ? `data-d="${ctx.d}" data-s="${ctx.s}" data-r="${ctx.r}"` : '')).join('')
      + lastResults.map(f => foodOpt(f, ctx.ctx === 'swap' ? 'doswap' : 'pickfood', ctx.ctx === 'swap' ? `data-d="${ctx.d}" data-s="${ctx.s}" data-r="${ctx.r}" data-online="1"` : 'data-online="1"')).join('')
      || '<p class="muted c">No results.</p>';
    if (!lastResults.length && !local.length) box.innerHTML = '<p class="muted c">No results. Try another word, or use Quick add.</p>';
  } catch { box.innerHTML = local.map(f => foodOpt(f, ctx.ctx === 'swap' ? 'doswap' : 'pickfood')).join('') + '<p class="muted c">Offline or the food database is busy. Built-in foods shown; Quick add always works.</p>'; }
}

// ---------- actions ----------
function logEntry(k, e) { (state.log[k] = state.log[k] || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), ...e }); }
function readProfileForm() {
  const P = state.profile, v = id => $('#' + id);
  if (v('p-name')) P.name = v('p-name').value.trim() || 'Athlete';
  if (v('p-sex')) P.sex = v('p-sex').value;
  if (v('p-age')) P.age = +v('p-age').value || P.age;
  if (v('p-height')) P.height = +v('p-height').value || P.height;
  if (v('p-weight')) P.weight = +v('p-weight').value || P.weight;
  if (v('p-act')) P.activity = +v('p-act').value;
  if (v('p-gym') && v('p-gym').value) P.gymTime = v('p-gym').value;
  ['breakfast', 'lunch', 'snack', 'dinner'].forEach(m => { if (v('m-' + m) && v('m-' + m).value) P.meals[m] = v('m-' + m).value; });
}

const A = {
  tab: (a) => go(a),
  logmeal: (el) => {
    const { d, s } = el.dataset, m = generateDay(d).find(x => x.slot === s);
    if (slotLogged(d, s)) state.log[d] = logOf(d).filter(e => e.slot !== s);
    else { m.items.forEach(i => logEntry(d, { name: i.name, grams: i.grams, kcal: i.kcal, p: i.p, c: i.c, f: i.f, slot: s })); toast(`${m.label} logged. Keep going.`); }
    save(); render();
  },
  shuffle: (el) => { const key = `${el.dataset.d}|${el.dataset.s}`; state.variant[key] = (state.variant[key] || 0) + 1;
    Object.keys(state.swaps).filter(x => x.startsWith(key + '|')).forEach(x => delete state.swaps[x]); save(); render(); },
  swap: (el) => swapSheet(el.dataset.d, el.dataset.s, el.dataset.r),
  doswap: (el) => {
    const { d, s, r, id } = el.dataset;
    if (el.dataset.online) { const f = lastResults.find(x => x.id === id); if (f) state.custom[f.id] = { ...f, cat: r, raw: 1, aisle: 'Other' }; }
    state.swaps[`${d}|${s}|${r}`] = id; save(); closeSheet(); render(); toast('Swapped. Quantities rebalanced.');
  },
  delentry: (el) => { state.log[el.dataset.d] = logOf(el.dataset.d).filter(e => e.id !== el.dataset.id); save(); render(); },
  eday: (el) => { eatDay = addDays(eatDay, +el.dataset.n); render(); },
  addfood: (el) => foodSheet(el.dataset.d),
  search: () => doSearch(),
  pickfood: (el) => {
    const id = el.dataset.id, f = getFood(id) || lastResults.find(x => x.id === id); if (!f) return;
    if (el.dataset.online) state.custom[f.id] = { ...f, raw: 1 };
    openSheet(`<h3>${esc(f.name)}</h3><p class="muted">${f.kcal} kcal · ${f.p}P ${f.c}C ${f.f}F per 100 g</p>
      <label>How many grams?<input id="g-in" type="number" value="${f.unit ? f.unit.g : 100}"></label>
      <button class="btn" data-act="confirmfood" data-id="${esc(f.id)}" data-d="${eatDay}">Add to log</button>`);
  },
  confirmfood: (el) => {
    const f = getFood(el.dataset.id), g = +$('#g-in').value || 100, m = macrosOf(f, g);
    logEntry(el.dataset.d, { name: f.name, grams: g, ...m }); save(); closeSheet(); render(); toast('Logged.');
  },
  quickadd: (el) => {
    const n = $('#qa-n').value.trim() || 'Quick add', k = +$('#qa-k').value || 0;
    if (!k) return toast('Enter calories.');
    logEntry(el.dataset.d, { name: n, grams: 0, kcal: k, p: +$('#qa-p').value || 0, c: +$('#qa-c').value || 0, f: +$('#qa-f').value || 0 });
    save(); closeSheet(); render();
  },
  // workouts
  openwk: () => { todayWorkout(dkey(), true); render(); },
  startwk: () => { const w = todayWorkout(dkey(), true); w.startedAt = Date.now(); save(); startTimer(); render(); toast('Started. 45 minutes. Go.'); },
  togex: (el) => {
    const w = todayWorkout(dkey(), true), x = w.items[+el.dataset.i]; x.done = !x.done;
    if (x.done && w.startedAt && !w.finishedAt) { restEnd = Date.now() + x.rest * 1000; showRest(); }
    save(); render();
  },
  editex: (el) => exSheet(+el.dataset.i),
  addex: () => exSheet(null),
  saveex: (el) => {
    const w = todayWorkout(dkey(), true), i = el.dataset.i === '' ? null : +el.dataset.i;
    const name = $('#e-name').value.trim(); if (!name) return toast('Name it.');
    const x = { name, muscle: $('#e-m').value, sets: +$('#e-sets').value || 1, reps: $('#e-reps').value || '10', weight: +$('#e-w').value || 0, rest: +$('#e-r').value || 60 };
    const toPlan = $('#e-plan').checked;
    if (i == null) { w.items.push({ ...x, done: false }); if (toPlan) state.plan.push({ ...x }); }
    else {
      const old = w.items[i]; Object.assign(old, x);
      if (toPlan) { const pi = state.plan.findIndex(p => p.name === old.name || p.name === name); if (pi >= 0) Object.assign(state.plan[pi], x); else state.plan.push({ ...x }); }
    }
    save(); closeSheet(); render();
  },
  delex: (el) => { todayWorkout(dkey(), true).items.splice(+el.dataset.i, 1); save(); closeSheet(); render(); },
  delexplan: (el) => {
    const w = todayWorkout(dkey(), true), [x] = w.items.splice(+el.dataset.i, 1);
    state.plan = state.plan.filter(p => p.name !== x.name); save(); closeSheet(); render();
  },
  togcardio: () => { const w = todayWorkout(dkey(), true); w.cardio = !w.cardio; save(); render(); },
  finishwk: () => {
    const w = todayWorkout(dkey()), done = w.items.filter(i => i.done).length;
    const go = () => {
      w.finishedAt = Date.now();
      state.sessions.push({ date: dkey(), start: w.startedAt, end: w.finishedAt, cardio: w.cardio, items: w.items.map(i => ({ name: i.name, sets: i.sets, reps: i.reps, weight: i.weight, done: i.done })) });
      save(); stopTimer(); render(); toast('Session saved. That is how it is done.'); scheduleReminders();
    };
    if (done < w.items.length) openSheet(`<h3>Finish early?</h3><p class="muted">${done} of ${w.items.length} exercises checked. Unchecked ones will be saved as skipped.</p><div class="row"><button class="btn" data-act="confirmfinish">Save session</button><button class="btn ghost" data-act="closesheet">Keep going</button></div>`);
    else go();
    A._go = go;
  },
  confirmfinish: () => { closeSheet(); A._go(); },
  closesheet: () => closeSheet(),
  skiprest: () => { restEnd = 0; $('#rest').classList.remove('show'); },
  // shopping
  togshop: (el) => { state.grocery.checked[el.dataset.id] = el.checked; save(); render(); },
  newshop: () => { state.grocery = { start: dkey(), checked: {} }; save(); render(); },
  copyshop: () => {
    const g = shopList(); const txt = Object.entries(g).map(([a, it]) => `${a}\n` + it.map(i => `- ${i.name}: ${i.txt}`).join('\n')).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied.'), () => { if (navigator.share) navigator.share({ text: txt }); else toast('Copy not available.'); });
  },
  // profile
  goal: (el) => { readProfileForm(); state.profile.goal = el.dataset.g; state.profile.override = null; save(); render(); },
  obgoal: (el) => { readProfileForm(); state.profile.goal = el.dataset.g; render(); },
  trainday: (el) => { readProfileForm(); const t = state.profile.trainDays, i = +el.dataset.i; const ix = t.indexOf(i); ix >= 0 ? t.splice(ix, 1) : t.push(i); render(); },
  saveprofile: () => { readProfileForm(); save(); render(); toast('Targets recalculated.'); scheduleReminders(); },
  saveschedule: () => { readProfileForm(); save(); render(); toast('Schedule saved.'); scheduleReminders(); },
  finishonb: () => { readProfileForm(); state.onboarded = true; state.profile.startDate = dkey(); state.grocery = { start: dkey(), checked: {} }; state.weights = [{ date: dkey(), kg: state.profile.weight }]; save(); tab = 'home'; render(); toast('Plan built. Now do it.'); },
  setoverride: () => { const t = targets(); openSheet(`<h3>Your own numbers</h3><div class="grid2"><label>Calories<input id="o-k" type="number" value="${t.kcal}"></label><label>Protein g<input id="o-p" type="number" value="${t.p}"></label><label>Carbs g<input id="o-c" type="number" value="${t.c}"></label><label>Fat g<input id="o-f" type="number" value="${t.f}"></label></div><button class="btn" data-act="saveoverride">Use these</button>`); },
  saveoverride: () => { state.profile.override = { kcal: +$('#o-k').value, p: +$('#o-p').value, c: +$('#o-c').value, f: +$('#o-f').value }; save(); closeSheet(); render(); },
  clearoverride: () => { state.profile.override = null; save(); render(); },
  enablerem: () => enableReminders().then(render),
  logweight: () => { const v = +$('#w-in').value; if (!v) return; state.weights.push({ date: dkey(), kg: v }); state.profile.weight = v; save(); render(); toast('Weight logged.'); },
  resetplan: () => { state.plan = DEFAULT_PLAN.map(e => ({ ...e })); delete state.today[dkey()]; save(); render(); toast('Plan reset.'); },
  export: () => { const b = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sportsman-data.json'; a.click(); },
  wipe: () => openSheet(`<h3>Erase everything?</h3><p class="muted">Profile, logs and history will be deleted.</p><div class="row"><button class="btn danger" data-act="wipe2">Erase</button><button class="btn ghost" data-act="closesheet">Cancel</button></div>`),
  wipe2: () => { localStorage.removeItem(KEY); load(); closeSheet(); render(); },
};

// ---------- timers ----------
function startTimer() { stopTimer(); timerH = setInterval(tick, 1000); }
function stopTimer() { clearInterval(timerH); timerH = null; }
function showRest() { $('#rest').classList.add('show'); }
function tick() {
  const w = state.today[dkey()], t = $('#wtimer');
  if (t && w && w.startedAt && !w.finishedAt) t.textContent = fmtDur(Date.now() - w.startedAt);
  const r = $('#rest');
  if (restEnd) {
    const left = Math.ceil((restEnd - Date.now()) / 1000);
    if (left <= 0) { restEnd = 0; r.classList.remove('show'); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { } toast('Rest over. Next set.'); }
    else $('#rest-t').textContent = fmtDur(left * 1000);
  }
}

// ---------- boot ----------
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) { if (ev.target.id === 'sheet') closeSheet(); return; }
  if (el.tagName === 'INPUT') return;
  const act = el.dataset.act;
  if (act.startsWith('tab:')) return A.tab(act.slice(4));
  if (A[act]) A[act](el);
});
document.addEventListener('change', ev => { const el = ev.target.closest('input[data-act]'); if (el && A[el.dataset.act]) A[el.dataset.act](el); });
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'q') doSearch(); });

function boot() {
  load();
  // reminders: re-sync every time the app opens (also resets the "you vanished" nag ladder)
  state.lastOpen = Date.now(); save();
  const w = state.today[dkey()]; if (w && w.startedAt && !w.finishedAt) startTimer();
  tab = 'home'; render();
  scheduleReminders();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  setInterval(() => { if (document.visibilityState === 'visible' && !$('#sheet').classList.contains('open') && tab === 'home') render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { state.lastOpen = Date.now(); render(); scheduleReminders(); } });
}
window.addEventListener('DOMContentLoaded', boot);
// test hook
window.__sportsman = { get state() { return state; }, generateDay, targets, shopList, alerts, calcTargets };

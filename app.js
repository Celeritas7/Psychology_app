import { LENSES, lensById, STAGES, FELT, feltById, FIVE_P } from "./lenses.js";
import { supabaseDB, memoryDB } from "./db.js";

/* ================= State ================= */
const DEMO = new URLSearchParams(location.search).has("demo");
const cfg = window.PSY_CONFIG || {};
let client = null, db = null, user = null;
const S = { history: [], incidents: [], notes: [], patterns: [], links: [], topics: [], questions: [], reframes: [] };

/* ================= Helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (d) => d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtDT = (d) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const list = (s) => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const byId = (k, id) => S[k].find(r => r.id === id);
const stageIdx = (s) => Math.max(0, STAGES.findIndex(x => x.id === s));
const nonEmpty = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

const I = {
  today: '<path d="M12 3l6.4 2.6L21 12l-2.6 6.4L12 21l-6.4-2.6L3 12l2.6-6.4z"/><circle cx="12" cy="12" r="2.4"/>',
  timeline: '<path d="M7 3v18"/><circle cx="7" cy="7" r="2.2" fill="currentColor"/><circle cx="7" cy="16" r="2.2" fill="currentColor"/><path d="M12 7h8M12 16h6"/>',
  ask: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h6"/>',
  patterns: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  feather: '<path d="M20 4c-8 0-14 6-14 14v2"/><path d="M6 14h7M9 10h7"/>',
  reframe: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  down: '<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "on" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = "", 2200);
}

async function save(k, row, id) {
  try {
    const r = id ? await db.update(k, id, row) : await db.insert(k, row);
    const i = S[k].findIndex(x => x.id === r.id);
    if (i >= 0) S[k][i] = r; else S[k].push(r);
    return r;
  } catch (e) { toast("Not saved: " + e.message, true); throw e; }
}
async function del(k, id) {
  try { await db.remove(k, id); S[k] = S[k].filter(x => x.id !== id); }
  catch (e) { toast("Not deleted: " + e.message, true); throw e; }
}
async function loadAll() {
  const keys = Object.keys(S);
  const res = await Promise.all(keys.map(k => db.list(k)));
  keys.forEach((k, i) => S[k] = res[i] || []);
}

/* ================= Derived ================= */
function lensCounts() {
  const c = Object.fromEntries(LENSES.map(l => [l.id, 0]));
  S.notes.forEach(n => { if (n.kind !== "rejected" && c[n.lens] !== undefined) c[n.lens]++; });
  S.questions.forEach(q => { if (q.answer && c[q.lens] !== undefined) c[q.lens]++; });
  return c;
}
function notesFor(type, ids) { const set = new Set([].concat(ids)); return S.notes.filter(n => n.target_type === type && set.has(n.target_id)); }
function chain(row) {
  const ids = new Set([row.id]); let grew = true;
  while (grew) { grew = false; for (const r of S.history) {
    if (!ids.has(r.id) && (ids.has(r.supersedes) || [...ids].some(i => byId("history", i)?.supersedes === r.id))) { ids.add(r.id); grew = true; } } }
  return [...ids].map(i => byId("history", i)).filter(Boolean).sort((a, b) => a.version - b.version);
}
function nextQuestion(topicId) {
  return S.questions.filter(q => (!topicId || q.topic_id === topicId) && !q.answer && !q.skipped && byId("topics", q.topic_id)?.status === "open")
    .sort((a, b) => (byId("topics", a.topic_id).created_at.localeCompare(byId("topics", b.topic_id).created_at)) || a.position - b.position)[0];
}
const currentHistory = () => S.history.filter(h => h.is_current).sort((a, b) =>
  stageIdx(a.stage) - stageIdx(b.stage) || String(a.occurred_on || "").localeCompare(String(b.occurred_on || "")) || (a.sort_key || 0) - (b.sort_key || 0) || a.created_at.localeCompare(b.created_at));
const itemTitle = (type, id) => (type === "reframe" ? byId("reframes", id)?.automatic_thought : byId(type === "history" ? "history" : "incidents", id)?.title) || "Removed item";
const itemHref = (type, id) => type === "history" ? `#/entry/${id}` : type === "incident" ? `#/incident/${id}` : `#/reframe/${id}`;

/* ================= Small components ================= */
function ring(type, ids, size = 26) {
  const has = new Set(notesFor(type, ids).filter(n => n.kind !== "rejected").map(n => n.lens));
  const r = size / 2 - 3, c = size / 2, seg = (Math.PI * 2) / LENSES.length;
  const arcs = LENSES.map((l, i) => {
    const a0 = -Math.PI / 2 + i * seg + 0.09, a1 = a0 + seg - 0.18;
    const p = (a) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    return `<path d="M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}" stroke="${has.has(l.id) ? l.color : "var(--line-2)"}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${has.size} of ${LENSES.length} lenses applied">${arcs}</svg>`;
}
function feltDot(f) {
  const d = feltById[f] || feltById.unlabelled;
  return f === "unlabelled" || !f ? `<span class="dot hollow"></span>` : `<span class="dot" style="background:${d.color}"></span>`;
}
const lensChip = (id) => { const l = lensById[id]; return l ? `<span class="chip"><span class="dot" style="background:${l.color}"></span>${esc(l.name)}</span>` : ""; };
const seg = (name, opts, val, multi = false) => `<div class="seg" data-seg="${name}" ${multi ? 'data-multi="1"' : ""}>${opts.map(o =>
  `<button type="button" data-v="${o.id}" aria-pressed="${multi ? (val || []).includes(o.id) : val === o.id}">${o.dot ?? ""}${esc(o.name)}</button>`).join("")}<input type="hidden" name="${name}" value="${esc(multi ? (val || []).join(",") : val ?? "")}"></div>`;
const top = (title, sub, right = "") => `<div class="top"><div><h1 class="h-page">${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div><div class="row">${right}</div></div>`;
const back = (href, label) => `<a class="back" href="${href}">${icon("back").replace('<svg', '<svg width="16" height="16"')}${esc(label)}</a>`;
const field = (label, inner, hint = "") => `<label class="f"><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}${inner}</label>`;
const ta = (name, val = "", cls = "", ph = "") => `<textarea name="${name}" class="${cls}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const inp = (name, val = "", type = "text", ph = "") => `<input type="${type}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}">`;

/* ================= Prism ================= */
function prism() {
  const c = lensCounts(), max = Math.max(1, ...Object.values(c)), total = Object.values(c).reduce((a, b) => a + b, 0);
  const R = 118, r0 = 30, segA = (Math.PI * 2) / LENSES.length, gap = 0.035;
  const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const sector = (r1, a0, a1) => `M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
  const petals = LENSES.map((l, i) => {
    const a0 = -Math.PI / 2 - segA / 2 + i * segA + gap, a1 = a0 + segA - gap * 2, mid = (a0 + a1) / 2;
    const n = c[l.id], r1 = n ? r0 + (R - r0) * (0.22 + 0.78 * Math.sqrt(n / max)) : r0 + 7;
    const lx = 146 * Math.cos(mid), ly = 146 * Math.sin(mid), anchor = Math.abs(lx) < 12 ? "middle" : lx > 0 ? "start" : "end";
    return `<a href="#/lens/${l.id}" aria-label="${l.name}: ${n} readings">
      <path d="${sector(R, a0, a1)}" fill="${l.color}" opacity=".06"/>
      <path class="petal" d="${sector(r1, a0, a1)}" fill="${l.color}" opacity="${n ? .82 : .35}"/>
      <text x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}" fill="var(--text)" font-size="12.5" font-weight="600">${l.name}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" text-anchor="${anchor}" fill="var(--faint)" font-size="11.5">${n}</text></a>`;
  }).join("");
  return `<svg class="prism" viewBox="-205 -175 410 350" role="img" aria-label="Readings per lens">
    ${petals}<circle r="${r0 - 4}" fill="var(--ink)" stroke="var(--line-2)"/>
    <text y="7" text-anchor="middle" fill="var(--text)" font-size="20" font-family="Newsreader, serif">${total}</text></svg>`;
}

/* ================= Views ================= */
const V = {};

V.today = () => {
  const h = new Date().getHours();
  const greet = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const name = (user?.user_metadata?.full_name || user?.user_metadata?.name || "").split(" ")[0];
  const c = lensCounts(), least = LENSES.slice().sort((a, b) => c[a.id] - c[b.id])[0];
  const q = nextQuestion();
  const recent = [
    ...S.history.filter(x => x.is_current).map(x => ({ t: "Memory", title: x.title, at: x.updated_at, href: `#/entry/${x.id}` })),
    ...S.incidents.map(x => ({ t: "Incident", title: x.title, at: x.updated_at, href: `#/incident/${x.id}` })),
    ...S.reframes.map(x => ({ t: "Reframe", title: x.automatic_thought, at: x.updated_at, href: `#/reframe/${x.id}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  return `${top(`${greet}${name ? ", " + esc(name) : ""}`, "One life, looked at from eight sides.")}
  <div class="prism-wrap">${prism()}
    <p class="prism-note">Each petal is one way of looking at your life. A big petal is a lens you use often; a thin one is a side you haven't looked from yet.${least ? ` Least used so far: <b style="color:${least.color}">${least.name}</b>.` : ""}</p></div>

  ${q ? `<h2 class="h-sec">Waiting for your answer</h2>
  <form class="card ask-card" data-form="answer"><input type="hidden" name="qid" value="${q.id}">
    <div class="spread"><a class="meta" href="#/topic/${q.topic_id}">${esc(byId("topics", q.topic_id)?.title)}</a>${lensChip(q.lens)}</div>
    <p class="q">${esc(q.prompt)}</p>${ta("answer", "", "own", "In your own words")}
    <div class="row end" style="margin-top:12px"><button type="button" class="btn ghost" data-act="skip" data-id="${q.id}">Skip for now</button><button class="btn primary">Save answer</button></div></form>` : ""}

  <h2 class="h-sec">Add</h2>
  <div class="quick">
    <a href="#/incident/new">${icon("bolt")}<span>Log an incident</span><small>Under a minute</small></a>
    <a href="#/entry/new">${icon("feather")}<span>Add a memory</span><small>To your timeline</small></a>
    <a href="#/reframe/new">${icon("reframe")}<span>Test a thought</span><small>"This is my failure"</small></a>
  </div>

  ${recent.length ? `<h2 class="h-sec">Recently</h2><div class="list">${recent.map(r =>
    `<a class="item" href="${r.href}"><span class="chip">${r.t}</span><span class="t own">${esc(r.title)}</span><span class="meta">${fmtDate(r.at)}</span></a>`).join("")}</div>` : ""}`;
};

V.timeline = (_, q) => {
  const filter = q.get("f") || "all";
  let rows = currentHistory();
  const failures = rows.filter(r => r.felt_as === "failure").length, unl = rows.filter(r => r.felt_as === "unlabelled").length;
  if (filter !== "all") rows = rows.filter(r => r.felt_as === filter);
  const groups = STAGES.map(s => [s, rows.filter(r => r.stage === s.id)]).filter(([, r]) => r.length);
  const f = [{ id: "all", name: "All" }, { id: "failure", name: "Failures" }, { id: "unlabelled", name: "Not labelled" }, { id: "win", name: "Wins" }, { id: "mixed", name: "Mixed" }];
  return `${top("Timeline", `${currentHistory().length} memories. ${failures} marked as failure, ${unl} not labelled yet.`, `<a class="btn primary" href="#/entry/new">${icon("plus")}Add memory</a>`)}
  <div class="seg" role="group" aria-label="Filter">${f.map(o => `<button type="button" aria-pressed="${filter === o.id}" data-act="nav" data-href="#/timeline?f=${o.id}">${o.id !== "all" ? feltDot(o.id) : ""}${o.name}</button>`).join("")}</div>
  ${groups.length ? `<div class="tl">${groups.map(([s, rs]) => `<h2 class="tl-stage">${s.name}</h2>${rs.map(r => {
    const fd = feltById[r.felt_as];
    return `<a class="tl-item" href="#/entry/${r.id}"><span class="node" style="background:${r.felt_as === "unlabelled" ? "var(--ink)" : fd.color}"></span>
      <div class="when">${esc(r.when_label || fmtDate(r.occurred_on) || "")}</div><div class="ttl">${esc(r.title)}</div>
      <div class="ex">${esc(r.reading_now || r.story)}</div>
      <div class="tl-meta">${ring("history", chain(r).map(x => x.id), 22)}<span class="meta">${r.felt_as === "unlabelled" ? "Not labelled" : "Called it: " + fd.name}${r.version > 1 ? `, recalled ${r.version} times` : ""}</span></div></a>`;
  }).join("")}`).join("")}</div>` : `<p class="empty"><b>Nothing here yet.</b> Add the first memory, one event at a time.</p>`}`;
};

function lensSection(type, ids) {
  const notes = notesFor(type, ids), primary = [].concat(ids).slice(-1)[0];
  const tiles = LENSES.map(l => { const n = notes.filter(x => x.lens === l.id && x.kind !== "rejected").length;
    return `<button type="button" class="lens-tile ${n ? "has" : ""}" style="--c:${l.color}" data-act="lens-note" data-type="${type}" data-id="${primary}" data-lens="${l.id}">
      <span class="nm"><span class="dot" style="background:${l.color}"></span>${l.name}</span><span class="ct">${n ? n + (n > 1 ? " readings" : " reading") : esc(l.asks)}</span></button>`; }).join("");
  const sorted = notes.slice().sort((a, b) => LENSES.findIndex(l => l.id === a.lens) - LENSES.findIndex(l => l.id === b.lens) || a.created_at.localeCompare(b.created_at));
  return `<h2 class="h-sec">Look at it from each side</h2><div class="lens-grid">${tiles}</div>
  ${sorted.length ? `<div style="margin-top:14px">${sorted.map(n => { const l = lensById[n.lens] || { name: n.lens, color: "#888" };
    return `<div class="note ${n.kind}" style="--c:${l.color}"><div class="hd"><span>${esc(l.name)}${n.kind === "hypothesis" ? ", possible reason" : n.kind === "rejected" ? ", rejected" : ""}</span>
      <span class="row" style="gap:2px">${n.kind !== "rejected" ? `<button class="btn ghost" data-act="reject-note" data-id="${n.id}">Doesn't fit</button>` : `<button class="btn ghost" data-act="restore-note" data-id="${n.id}">Restore</button>`}
      <button class="btn ghost" data-act="del-note" data-id="${n.id}">Delete</button></span></div>
      ${n.prompt ? `<div class="meta" style="margin-bottom:4px">${esc(n.prompt)}</div>` : ""}<div class="tx">${esc(n.note)}</div></div>`; }).join("")}</div>` : ""}`;
}
function patternSection(type, id) {
  const links = S.links.filter(l => l.target_type === type && l.target_id === id);
  return `<h2 class="h-sec">Patterns</h2><div class="row">${links.map(l => { const p = byId("patterns", l.pattern_id);
    return p ? `<a class="chip" href="#/pattern/${p.id}">${esc(p.name)}${l.role !== "example" ? `, ${FIVE_P.find(f => f.id === l.role)?.name.toLowerCase()}` : ""}</a>` : ""; }).join("")}
    <button class="btn" data-act="link-pattern" data-type="${type}" data-id="${id}">${icon("link")}Link to a pattern</button></div>`;
}

V.entry = ([id]) => {
  const r = byId("history", id); if (!r) return notFound();
  const versions = chain(r), cur = versions.find(v => v.is_current) || r;
  if (cur.id !== r.id) { location.replace(`#/entry/${cur.id}`); return ""; }
  const older = versions.filter(v => v.id !== cur.id);
  return `${back("#/timeline", "Timeline")}
  <div class="meta">${esc(STAGES[stageIdx(r.stage)].name)}${r.when_label ? ", " + esc(r.when_label) : ""}${r.occurred_on ? ", " + fmtDate(r.occurred_on) : ""}</div>
  <h1 class="h-page" style="margin:6px 0 18px">${esc(r.title)}</h1>
  <div class="story">${esc(r.story)}</div>
  <p class="meta" style="margin-top:12px">Recalled on ${fmtDate(r.recalled_on)}${r.version > 1 ? `, version ${r.version}` : ""}${(r.people || []).length ? `. People: ${esc(r.people.join(", "))}` : ""}</p>

  <h2 class="h-sec">Back then, I called it</h2>
  <div class="seg">${FELT.map(f => `<button type="button" data-act="felt" data-id="${r.id}" data-v="${f.id}" aria-pressed="${r.felt_as === f.id}">${feltDot(f.id)}${f.name}</button>`).join("")}</div>
  <div class="reading"><div class="lbl">How I read it now</div>
    ${r.reading_now ? `<div class="story" style="font-size:17.5px">${esc(r.reading_now)}</div>` : `<div class="meta">Not written yet. Keep this separate from the label above: the label is what you felt then.</div>`}
    <button class="btn ghost" style="margin-top:6px;padding-left:0" data-act="reading" data-id="${r.id}">${r.reading_now ? "Rewrite" : "Write it"}</button></div>

  ${lensSection("history", versions.map(v => v.id))}
  ${patternSection("history", r.id)}

  ${older.length ? `<details class="versions"><summary>Earlier recalls (${older.length})</summary>${older.map(o => `<div class="card" style="margin-top:10px"><div class="meta">Version ${o.version}, recalled ${fmtDate(o.recalled_on)}</div><div class="story" style="font-size:16.5px;margin-top:6px">${esc(o.story)}</div></div>`).join("")}</details>` : ""}
  <hr class="sep"><div class="row"><a class="btn" href="#/entry/${r.id}/recall">Recall it again</a><a class="btn ghost" href="#/entry/${r.id}/edit">Fix typos</a><button class="btn danger" data-act="del-entry" data-id="${r.id}">Delete</button></div>
  <p class="meta" style="margin-top:8px">Recalling again keeps this version untouched and saves the new telling beside it.</p>`;
};

V.entryForm = ([id, mode]) => {
  const r = id ? byId("history", id) : {}; if (id && !r) return notFound();
  const recall = mode === "recall";
  return `${back(id ? `#/entry/${id}` : "#/timeline", id ? "Back" : "Timeline")}
  ${top(recall ? "Recall it again" : id ? "Edit memory" : "Add a memory", recall ? "Tell it as you remember it today. The earlier telling stays as it was." : "Write it the way you would say it. Nothing here is a test.")}
  <form data-form="entry" data-id="${id || ""}" data-mode="${mode || ""}">
    <div class="two-col">
      ${field("Title", inp("title", r.title, "text", "A few words you'd recognise it by"))}
      ${field("Stage of life", `<select name="stage">${STAGES.map(s => `<option value="${s.id}" ${r.stage === s.id ? "selected" : ""}>${s.name}</option>`).join("")}</select>`)}
      ${field("When", inp("when_label", r.when_label, "text", "8th std, summer 2019, age 12"))}
      ${field("Date, if you know it", inp("occurred_on", r.occurred_on, "date"))}
    </div>
    ${field("What happened", ta("story", r.story, "own", "In your own words"))}
    <label class="f"><span>Back then, I called it</span>${seg("felt_as", FELT.map(f => ({ ...f, dot: feltDot(f.id) })), r.felt_as || "unlabelled")}</label>
    ${field("People involved", inp("people", (r.people || []).join(", "), "text", "Separate with commas"))}
    ${field("Tags", inp("tags", (r.tags || []).join(", "), "text", "shyness, school"))}
    <div class="row end" style="margin-top:22px"><button class="btn primary">${recall ? "Save new recall" : "Save memory"}</button></div>
  </form>`;
};

V.incidents = () => `${top("Incidents", "Times a behaviour led you into a difficult situation.", `<a class="btn primary" href="#/incident/new">${icon("plus")}Log one</a>`)}
  ${S.incidents.length ? `<div class="list">${S.incidents.slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(i =>
    `<a class="item" href="#/incident/${i.id}">${ring("incident", i.id)}<span><div class="t">${esc(i.title)}</div><div class="d">${esc(i.the_moment || i.what_happened)}</div></span><span class="meta">${fmtDate(i.occurred_at)}</span></a>`).join("")}</div>`
  : `<p class="empty"><b>No incidents logged.</b> When something goes wrong, log it fast. Reflection can wait.</p>`}`;

V.incident = ([id]) => {
  const i = byId("incidents", id); if (!i) return notFound();
  const block = (lbl, v) => v ? `<div class="reading"><div class="lbl">${lbl}</div><div class="story" style="font-size:17.5px">${esc(v)}</div></div>` : "";
  return `${back("#/incidents", "Incidents")}<div class="meta">${fmtDT(i.occurred_at)}${i.intensity ? `, intensity ${i.intensity} of 5` : ""}</div>
  <h1 class="h-page" style="margin:6px 0 8px">${esc(i.title)}</h1>
  ${block("What happened", i.what_happened)}${block("Before: where, who, what state", i.before_state)}${block("The moment: what I did or decided, and thought", i.the_moment)}${block("After: what it cost", i.after_cost)}${block("Echoes: has it happened before?", i.echoes)}
  ${lensSection("incident", i.id)}${patternSection("incident", i.id)}
  <hr class="sep"><div class="row"><a class="btn" href="#/incident/${i.id}/edit">Edit</a><button class="btn danger" data-act="del-incident" data-id="${i.id}">Delete</button></div>`;
};

V.incidentForm = ([id]) => {
  const i = id ? byId("incidents", id) : {}; if (id && !i) return notFound();
  const local = (d) => { const x = d ? new Date(d) : new Date(); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  return `${back(id ? `#/incident/${id}` : "#/incidents", "Back")}${top(id ? "Edit incident" : "Log an incident", "Only the title is needed now. Fill the rest when you can.")}
  <form data-form="incident" data-id="${id || ""}">
    ${field("What went wrong, in a few words", inp("title", i.title, "text", "Missed the last train"))}
    ${field("When", inp("occurred_at", local(i.occurred_at), "datetime-local"))}
    ${field("What happened", ta("what_happened", i.what_happened, "own"))}
    ${field("Before", ta("before_state", i.before_state, "", "Where you were, who was there, tired, drinking, stressed?"))}
    ${field("The moment", ta("the_moment", i.the_moment, "own", "What you did or decided, and what you were thinking"))}
    ${field("After", ta("after_cost", i.after_cost, "", "What it cost you, how you dealt with it"))}
    ${field("Echoes", ta("echoes", i.echoes, "", "Has it happened before? When did it first start?"))}
    <label class="f"><span>How bad, 1 to 5</span>${seg("intensity", [1, 2, 3, 4, 5].map(n => ({ id: String(n), name: String(n) })), i.intensity ? String(i.intensity) : "")}</label>
    <div class="row end" style="margin-top:22px"><button class="btn primary">Save incident</button></div></form>`;
};

V.ask = () => {
  const topics = S.topics.slice().sort((a, b) => (a.status === "done") - (b.status === "done") || a.created_at.localeCompare(b.created_at));
  return `${top("Ask", "Topics, each with questions to answer one at a time.", `<button class="btn primary" data-act="new-topic">${icon("plus")}New topic</button>`)}
  ${topics.length ? `<div class="list">${topics.map(t => { const qs = S.questions.filter(q => q.topic_id === t.id), done = qs.filter(q => q.answer).length;
    return `<a class="card" href="#/topic/${t.id}" style="text-decoration:none;display:block"><div class="spread"><h3 class="h-card">${esc(t.title)}</h3><span class="chip">${t.status === "open" ? `${done} of ${qs.length}` : t.status === "done" ? "Done" : "Paused"}</span></div>
      ${t.why ? `<p class="sub" style="font-size:14.5px">${esc(t.why)}</p>` : ""}<div class="bar"><i style="width:${qs.length ? (done / qs.length) * 100 : 0}%"></i></div></a>`; }).join("")}</div>`
  : `<p class="empty"><b>No topics yet.</b> Start one, then add questions you want to work through.</p>`}`;
};

V.topic = ([id]) => {
  const t = byId("topics", id); if (!t) return notFound();
  const qs = S.questions.filter(q => q.topic_id === id).sort((a, b) => a.position - b.position);
  const q = nextQuestion(id), answered = qs.filter(x => x.answer), skipped = qs.filter(x => x.skipped && !x.answer);
  return `${back("#/ask", "Ask")}${top(esc(t.title), t.why ? esc(t.why) : "")}
  <div class="seg" style="margin-bottom:18px">${[["open", "Open"], ["paused", "Paused"], ["done", "Done"]].map(([v, n]) => `<button type="button" data-act="topic-status" data-id="${t.id}" data-v="${v}" aria-pressed="${t.status === v}">${n}</button>`).join("")}</div>
  ${q ? `<form class="card ask-card" data-form="answer"><input type="hidden" name="qid" value="${q.id}">
    <div class="spread"><span class="step">Question ${qs.indexOf(q) + 1} of ${qs.length}</span>${lensChip(q.lens)}</div>
    <p class="q">${esc(q.prompt)}</p>${ta("answer", "", "own", "In your own words")}
    <div class="row end" style="margin-top:12px"><button type="button" class="btn ghost" data-act="skip" data-id="${q.id}">Skip for now</button><button class="btn primary">Save and next</button></div></form>`
  : `<div class="card"><p style="margin:0">${t.status !== "open" ? "This topic is " + t.status + "." : qs.length ? "All questions here are answered or skipped." : "No questions yet."}</p></div>`}
  <div class="row" style="margin-top:12px"><button class="btn" data-act="new-question" data-id="${t.id}">${icon("plus")}Add a question</button></div>
  ${answered.length ? `<h2 class="h-sec">Answered</h2>${answered.map(a => `<div class="qa"><div class="spread"><div class="p">${esc(a.prompt)}</div>${lensChip(a.lens)}</div><div class="a">${esc(a.answer)}</div>
    <button class="btn ghost" style="padding-left:0" data-act="edit-answer" data-id="${a.id}">Edit</button></div>`).join("")}` : ""}
  ${skipped.length ? `<h2 class="h-sec">Skipped</h2>${skipped.map(s => `<div class="qa spread"><div class="p" style="margin:0">${esc(s.prompt)}</div><button class="btn ghost" data-act="unskip" data-id="${s.id}">Bring back</button></div>`).join("")}` : ""}`;
};

V.lens = ([id]) => {
  const l = lensById[id]; if (!l) return notFound();
  const notes = S.notes.filter(n => n.lens === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const answers = S.questions.filter(q => q.lens === id && q.answer);
  return `${back("#/", "Today")}<div class="row" style="gap:10px"><span class="dot" style="background:${l.color};width:14px;height:14px"></span><span class="meta">${l.full} lens</span></div>
  ${top(esc(l.name), esc(l.asks))}
  <div class="card"><div class="meta" style="margin-bottom:6px">Questions this lens asks</div>${l.questions.map(q => `<p class="own" style="font-size:18px;margin:6px 0">${esc(q)}</p>`).join("")}</div>
  <h2 class="h-sec">Readings through this lens (${notes.length + answers.length})</h2>
  ${notes.map(n => `<a class="note ${n.kind}" style="--c:${l.color};display:block;text-decoration:none;margin-top:8px" href="${itemHref(n.target_type, n.target_id)}"><div class="hd"><span class="own" style="font-size:15px">${esc(itemTitle(n.target_type, n.target_id))}</span><span>${fmtDate(n.created_at)}</span></div><div class="tx">${esc(n.note)}</div></a>`).join("")}
  ${answers.map(q => `<a class="note" style="--c:${l.color};display:block;text-decoration:none;margin-top:8px" href="#/topic/${q.topic_id}"><div class="hd"><span>${esc(q.prompt)}</span></div><div class="tx">${esc(q.answer)}</div></a>`).join("")}
  ${!notes.length && !answers.length ? `<p class="empty">Nothing seen through this lens yet. Open any memory or incident and tap <b>${l.name}</b>.</p>` : ""}`;
};

V.patterns = () => `${top("Patterns", "Things you keep doing, explained from every side at once.", `<button class="btn primary" data-act="new-pattern">${icon("plus")}New pattern</button>`)}
  ${S.patterns.length ? `<div class="list">${S.patterns.map(p => { const n = S.links.filter(l => l.pattern_id === p.id).length;
    return `<a class="card" href="#/pattern/${p.id}" style="text-decoration:none;display:block"><div class="spread"><h3 class="h-card">${esc(p.name)}</h3><span class="chip">${esc(p.status)}</span></div>
    ${p.summary ? `<p class="sub own" style="font-size:16.5px">${esc(p.summary)}</p>` : ""}<div class="spread" style="margin-top:10px"><span class="meta">${n} linked ${n === 1 ? "item" : "items"}</span><span class="meta">Confidence ${p.confidence}%</span></div>
    <div class="bar"><i style="width:${p.confidence}%"></i></div></a>`; }).join("")}</div>`
  : `<p class="empty"><b>No patterns yet.</b> When you notice the same thing in two memories or incidents, name it here.</p>`}`;

V.pattern = ([id]) => {
  const p = byId("patterns", id); if (!p) return notFound();
  const links = S.links.filter(l => l.pattern_id === id);
  const ho = [{ id: "neurology", name: "Neurology: watch for it live" }, { id: "disaster", name: "Disaster Management: predict it" }, { id: "ethics", name: "Ethics: check my values" }];
  return `${back("#/patterns", "Patterns")}${top(esc(p.name), p.summary ? `<span class="own" style="font-size:18px">${esc(p.summary)}</span>` : "", `<button class="btn ghost" data-act="edit-pattern" data-id="${p.id}">Rename</button>`)}
  <div class="seg">${["forming", "active", "weakening", "retired"].map(s => `<button type="button" data-act="pattern-status" data-id="${p.id}" data-v="${s}" aria-pressed="${p.status === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}</div>
  <h2 class="h-sec">How sure am I about this explanation?</h2>
  <div class="conf"><input type="range" min="0" max="100" step="5" value="${p.confidence}" data-conf="${p.id}" aria-label="Confidence"><output>${p.confidence}%</output></div>
  <h2 class="h-sec">The full picture</h2>
  <div class="fp">${FIVE_P.map(f => `<div class="card"><div class="k">${f.name}</div><div class="hint">${f.hint}</div>
    <textarea class="own" style="min-height:80px" data-autosave="patterns" data-id="${p.id}" data-field="${f.id}" placeholder="Not known yet">${esc(p[f.id])}</textarea>
    ${links.filter(l => l.role === f.id).map(l => `<a class="chip" style="margin-top:8px" href="${itemHref(l.target_type, l.target_id)}">${esc(itemTitle(l.target_type, l.target_id))}</a>`).join(" ")}</div>`).join("")}</div>
  <h2 class="h-sec">Evidence</h2>
  ${links.length ? `<div class="list">${links.map(l => `<div class="item"><span class="chip">${l.target_type === "history" ? "Memory" : l.target_type === "incident" ? "Incident" : "Reframe"}</span>
    <a href="${itemHref(l.target_type, l.target_id)}" style="text-decoration:none"><div class="t own">${esc(itemTitle(l.target_type, l.target_id))}</div><div class="d">${l.role === "example" ? "Example" : FIVE_P.find(f => f.id === l.role)?.name}</div></a>
    <button class="btn ghost" data-act="unlink" data-id="${l.id}">Remove</button></div>`).join("")}</div>` : `<p class="meta">Nothing linked yet.</p>`}
  <div class="row" style="margin-top:12px"><button class="btn" data-act="add-evidence" data-id="${p.id}">${icon("link")}Add evidence</button></div>
  <h2 class="h-sec">Hand off to</h2>
  <div class="seg">${ho.map(h => `<button type="button" data-act="handoff" data-id="${p.id}" data-v="${h.id}" aria-pressed="${(p.handoff || []).includes(h.id)}">${h.name}</button>`).join("")}</div>
  <hr class="sep"><button class="btn danger" data-act="del-pattern" data-id="${p.id}">Delete pattern</button>`;
};

V.reframes = () => `${top("Thought tests", "Put a thought like \"this is my failure\" on trial, with evidence.", `<a class="btn primary" href="#/reframe/new">${icon("plus")}Test a thought</a>`)}
  ${S.reframes.length ? `<div class="list">${S.reframes.slice().reverse().map(r => `<a class="item" href="#/reframe/${r.id}"><span class="chip">${r.intensity_before ?? "?"} to ${r.intensity_after ?? "?"}</span><span><div class="t own">${esc(r.automatic_thought)}</div><div class="d">${esc(r.balanced_thought || "No balanced thought yet")}</div></span><span class="meta">${fmtDate(r.created_at)}</span></a>`).join("")}</div>`
  : `<p class="empty"><b>No thought tests yet.</b> Next time "I failed" shows up, bring it here.</p>`}`;

V.reframe = ([id]) => {
  const r = byId("reframes", id); if (!r) return notFound();
  const b = (lbl, v, own = true) => v ? `<div class="reading"><div class="lbl">${lbl}</div><div class="${own ? "story" : ""}" style="font-size:17.5px">${esc(v)}</div></div>` : "";
  return `${back("#/reframes", "Thought tests")}<div class="meta">${fmtDate(r.created_at)}</div>
  <h1 class="h-page own" style="margin:6px 0 4px">"${esc(r.automatic_thought)}"</h1>
  <div class="shift card"><div><div class="n">${r.intensity_before ?? "?"}</div><div class="l">Belief before</div></div><div class="meta">to</div><div><div class="n">${r.intensity_after ?? "?"}</div><div class="l">Belief after</div></div></div>
  ${b("Situation", r.situation)}${b("Feeling", r.feeling)}${b("Evidence it's true", r.evidence_for)}${b("Evidence it isn't", r.evidence_against)}${b("Whose voice is this?", r.inherited_from)}${b("A fairer way to say it", r.balanced_thought)}
  ${r.linked_history ? `<p style="margin-top:16px">Linked memory: <a href="#/entry/${r.linked_history}">${esc(byId("history", r.linked_history)?.title)}</a></p>` : ""}
  ${patternSection("reframe", r.id)}
  <hr class="sep"><div class="row"><a class="btn" href="#/reframe/${r.id}/edit">Edit</a><button class="btn danger" data-act="del-reframe" data-id="${r.id}">Delete</button></div>`;
};

V.reframeForm = ([id]) => {
  const r = id ? byId("reframes", id) : {}; if (id && !r) return notFound();
  const slider = (name, v) => `<div class="conf"><input type="range" name="${name}" min="0" max="100" step="5" value="${v ?? 50}" data-out><output>${v ?? 50}%</output></div>`;
  return `${back(id ? `#/reframe/${id}` : "#/reframes", "Back")}${top(id ? "Edit thought test" : "Test a thought", "Treat the thought as a claim, not a fact. Weigh it like you'd check a calculation.")}
  <form data-form="reframe" data-id="${id || ""}">
    ${field("The thought", ta("automatic_thought", r.automatic_thought, "own", "This is my failure. I always mess things up."), "Write it exactly as it sounds in your head")}
    ${field("How much do you believe it right now?", slider("intensity_before", r.intensity_before))}
    ${field("Situation", ta("situation", r.situation, "", "What happened just before the thought?"))}
    ${field("Feeling", inp("feeling", r.feeling, "text", "Shame, anger, heaviness"))}
    ${field("Evidence it's true", ta("evidence_for", r.evidence_for, "", "Facts only, not feelings"))}
    ${field("Evidence it isn't", ta("evidence_against", r.evidence_against, "", "What would a fair friend point out?"))}
    ${field("Whose voice is this?", inp("inherited_from", r.inherited_from, "text", "Where did you first hear this kind of sentence?"), "Many of our automatic sentences were learned from someone")}
    ${field("A fairer way to say it", ta("balanced_thought", r.balanced_thought, "own"))}
    ${field("How much do you believe the original thought now?", slider("intensity_after", r.intensity_after))}
    ${field("Linked memory", `<select name="linked_history"><option value="">None</option>${currentHistory().map(h => `<option value="${h.id}" ${r.linked_history === h.id ? "selected" : ""}>${esc(h.title)}</option>`).join("")}</select>`)}
    <div class="row end" style="margin-top:22px"><button class="btn primary">Save thought test</button></div></form>`;
};

V.more = () => `${top("More", "")}
  <div class="list">
    <a class="item" href="#/incidents">${icon("bolt").replace("<svg", '<svg width="22" height="22"')}<span><div class="t">Incidents</div><div class="d">${S.incidents.length} logged</div></span><span></span></a>
    <a class="item" href="#/reframes">${icon("reframe").replace("<svg", '<svg width="22" height="22"')}<span><div class="t">Thought tests</div><div class="d">${S.reframes.length} done</div></span><span></span></a>
  </div>
  <h2 class="h-sec">Lenses</h2><div class="lens-grid">${LENSES.map(l => `<a class="lens-tile" style="--c:${l.color};text-decoration:none" href="#/lens/${l.id}"><span class="nm"><span class="dot" style="background:${l.color}"></span>${l.name}</span><span class="ct">${esc(l.asks)}</span></a>`).join("")}</div>
  <h2 class="h-sec">Take it with you</h2>
  <p class="meta" style="margin-top:-4px">A readable summary you could bring to a counsellor, or the full data as JSON.</p>
  <div class="row"><button class="btn" data-act="export-md">${icon("down")}Summary</button><button class="btn" data-act="export-json">${icon("down")}All data</button></div>
  <h2 class="h-sec">If things feel like too much</h2>
  <div class="card help"><p style="margin:0 0 8px">This app is for understanding, not for a crisis. If you're in danger or thinking of harming yourself, talk to a person now.</p>
    <p style="margin:4px 0">Emergency: <a href="tel:119">119</a> (ambulance), <a href="tel:110">110</a> (police)</p>
    <p style="margin:4px 0">TELL Lifeline, English: <a href="tel:0357740992">03-5774-0992</a>, or chat at <a href="https://telljp.com/lifeline/" target="_blank" rel="noopener">telljp.com/lifeline</a></p>
    <p style="margin:4px 0">Yorisoi Hotline, free, foreign languages: <a href="tel:0120279338">0120-279-338</a></p></div>
  <h2 class="h-sec">Account</h2>
  <div class="spread card"><span>${esc(user?.email || "")}${DEMO ? " (sample data, nothing is saved)" : ""}</span>${DEMO ? "" : `<button class="btn" data-act="signout">Sign out</button>`}</div>
  <p class="meta" style="margin-top:12px">Everything here is private to your account. It is never shared with your other apps.</p>`;

function notFound() { return `${back("#/", "Today")}<p class="empty"><b>That item no longer exists.</b> It may have been deleted.</p>`; }

/* ================= Router ================= */
const ROUTES = [
  [/^$/, V.today, "today"], [/^timeline$/, V.timeline, "timeline"],
  [/^entry\/new$/, () => V.entryForm([]), "timeline"], [/^entry\/([\w-]+)\/(edit|recall)$/, V.entryForm, "timeline"], [/^entry\/([\w-]+)$/, V.entry, "timeline"],
  [/^incidents$/, V.incidents, "more"], [/^incident\/new$/, () => V.incidentForm([]), "today"], [/^incident\/([\w-]+)\/edit$/, V.incidentForm, "more"], [/^incident\/([\w-]+)$/, V.incident, "more"],
  [/^ask$/, V.ask, "ask"], [/^topic\/([\w-]+)$/, V.topic, "ask"], [/^lens\/([\w-]+)$/, V.lens, "today"],
  [/^patterns$/, V.patterns, "patterns"], [/^pattern\/([\w-]+)$/, V.pattern, "patterns"],
  [/^reframes$/, V.reframes, "more"], [/^reframe\/new$/, () => V.reframeForm([]), "today"], [/^reframe\/([\w-]+)\/edit$/, V.reframeForm, "more"], [/^reframe\/([\w-]+)$/, V.reframe, "more"],
  [/^more$/, V.more, "more"],
];
const NAV = [["today", "#/", "Today"], ["timeline", "#/timeline", "Timeline"], ["ask", "#/ask", "Ask"], ["patterns", "#/patterns", "Patterns"], ["more", "#/more", "More"]];

function render() {
  const raw = location.hash.replace(/^#\/?/, ""); const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs || "");
  let html = notFound(), tab = "today";
  for (const [re, fn, t] of ROUTES) { const m = path.match(re); if (m) { html = fn(m.slice(1), q); tab = t; break; } }
  $("#nav").innerHTML = `<div class="brand"><svg width="34" height="34" viewBox="0 0 32 32"><polygon points="16,2 26,6 30,16 26,26 16,30 6,26 2,16 6,6" fill="none" stroke="var(--pearl)" stroke-width="1.6"/><circle cx="16" cy="16" r="3.5" fill="var(--pearl)"/></svg></div>` +
    NAV.map(([id, href, label]) => `<a href="${href}" ${id === tab ? 'aria-current="page"' : ""}>${icon(id)}<span>${label}</span></a>`).join("");
  $("#view").innerHTML = html;
  if (render.last !== path) { window.scrollTo(0, 0); render.last = path; }
}

/* ================= Sheet ================= */
function sheet(title, body, onSubmit, submitLabel = "Save") {
  const root = $("#sheet-root");
  root.innerHTML = `<div class="scrim"><form class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2 class="h-card" style="margin-bottom:6px">${title}</h2>${body}
    <div class="row end" style="margin-top:20px"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${submitLabel}</button></div></form></div>`;
  const form = $(".sheet", root), close = () => root.innerHTML = "";
  $(".scrim", root).addEventListener("mousedown", e => { if (e.target.classList.contains("scrim")) close(); });
  $("[data-close]", root).onclick = close;
  form.onsubmit = async (e) => { e.preventDefault(); try { await onSubmit(Object.fromEntries(new FormData(form)), form); close(); render(); } catch (_) { } };
  setTimeout(() => form.querySelector("textarea, input:not([type=hidden]), select")?.focus(), 50);
}
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#sheet-root").innerHTML = ""; });

/* ================= Actions ================= */
const confirmDel = (what) => confirm(`Delete this ${what}? This can't be undone.`);
const A = {
  nav: (el) => location.hash = el.dataset.href,
  async felt(el) { await save("history", { felt_as: el.dataset.v }, el.dataset.id); render(); },
  reading(el) {
    const r = byId("history", el.dataset.id);
    sheet("How I read it now", `<p class="meta">Keep it separate from what you called it back then.</p>${ta("reading_now", r.reading_now, "own")}`,
      async (d) => { await save("history", { reading_now: d.reading_now || null }, r.id); toast("Saved"); });
  },
  "lens-note"(el) {
    const l = lensById[el.dataset.lens];
    sheet(`<span class="dot" style="background:${l.color};width:12px;height:12px;margin-right:8px"></span>${l.name}`,
      `<p class="meta">${esc(l.asks)}. Tap a question to answer it, or write freely.</p>
      <div class="seg" style="margin:10px 0" data-pick>${l.questions.map(q => `<button type="button" data-q="${esc(q)}" aria-pressed="false" style="text-align:left">${esc(q)}</button>`).join("")}</div>
      <input type="hidden" name="prompt" value="">${ta("note", "", "own", "What you see from this side")}
      <label class="f"><span>This is</span>${seg("kind", [{ id: "reflection", name: "What I notice" }, { id: "hypothesis", name: "A possible reason" }], "reflection")}</label>`,
      async (d) => { if (!d.note.trim()) throw toast("Write something first", true);
        await save("notes", { target_type: el.dataset.type, target_id: el.dataset.id, lens: l.id, prompt: d.prompt || null, note: d.note.trim(), kind: d.kind || "reflection" }); toast(`Saved to ${l.name}`); });
  },
  async "reject-note"(el) { await save("notes", { kind: "rejected" }, el.dataset.id); toast("Kept as rejected: that is evidence too"); render(); },
  async "restore-note"(el) { await save("notes", { kind: "reflection" }, el.dataset.id); render(); },
  async "del-note"(el) { if (confirmDel("reading")) { await del("notes", el.dataset.id); render(); } },
  "link-pattern"(el) {
    const { type, id } = el.dataset;
    sheet("Link to a pattern", `${field("Pattern", `<select name="pattern_id"><option value="__new">New pattern…</option>${S.patterns.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>`)}
      ${field("Name, if new", inp("name", "", "text", "Staying when I should leave"))}
      ${field("What role does this play?", `<select name="role"><option value="example">An example of it</option>${FIVE_P.map(f => `<option value="${f.id}">${f.name}</option>`).join("")}</select>`)}`,
      async (d) => { let pid = d.pattern_id;
        if (pid === "__new") { if (!d.name.trim()) throw toast("Give the new pattern a name", true); pid = (await save("patterns", { name: d.name.trim() })).id; }
        await save("links", { pattern_id: pid, target_type: type, target_id: id, role: d.role }); toast("Linked"); });
  },
  async "del-entry"(el) {
    const r = byId("history", el.dataset.id); if (!confirmDel("memory and all its earlier recalls")) return;
    for (const v of chain(r)) { for (const n of notesFor("history", v.id)) await del("notes", n.id); for (const l of S.links.filter(l => l.target_id === v.id)) await del("links", l.id); }
    for (const v of chain(r).reverse()) await del("history", v.id);
    location.hash = "#/timeline";
  },
  async "del-incident"(el) { if (!confirmDel("incident")) return; const id = el.dataset.id;
    for (const n of notesFor("incident", id)) await del("notes", n.id); for (const l of S.links.filter(l => l.target_id === id)) await del("links", l.id);
    await del("incidents", id); location.hash = "#/incidents"; },
  async "del-reframe"(el) { if (!confirmDel("thought test")) return; const id = el.dataset.id;
    for (const l of S.links.filter(l => l.target_id === id)) await del("links", l.id); await del("reframes", id); location.hash = "#/reframes"; },
  async skip(el) { await save("questions", { skipped: true }, el.dataset.id); render(); },
  async unskip(el) { await save("questions", { skipped: false }, el.dataset.id); render(); },
  "edit-answer"(el) { const q = byId("questions", el.dataset.id);
    sheet(esc(q.prompt), ta("answer", q.answer, "own"), async (d) => { await save("questions", { answer: d.answer.trim() || null, answered_at: d.answer.trim() ? new Date().toISOString() : null }, q.id); toast("Saved"); }); },
  "new-topic"() { sheet("New topic", `${field("Topic", inp("title", "", "text", "My father, money, first job in Japan"))}${field("Why it matters", ta("why", "", "", "Optional"))}`,
    async (d) => { if (!d.title.trim()) throw toast("Give the topic a name", true); const t = await save("topics", { title: d.title.trim(), why: d.why || null, created_by: "me" }); setTimeout(() => location.hash = `#/topic/${t.id}`); }, "Create topic"); },
  "new-question"(el) { const id = el.dataset.id;
    sheet("Add a question", `${field("Question", ta("prompt", "", "own"))}${field("Lens", `<select name="lens"><option value="">No particular lens</option>${LENSES.map(l => `<option value="${l.id}">${l.name}</option>`).join("")}</select>`)}`,
      async (d) => { if (!d.prompt.trim()) throw toast("Write the question first", true);
        const pos = Math.max(0, ...S.questions.filter(q => q.topic_id === id).map(q => q.position)) + 1;
        await save("questions", { topic_id: id, prompt: d.prompt.trim(), lens: d.lens || null, position: pos, asked_by: "me" }); toast("Question added"); }); },
  async "topic-status"(el) { await save("topics", { status: el.dataset.v }, el.dataset.id); render(); },
  "new-pattern"() { sheet("New pattern", `${field("Name it", inp("name", "", "text", "Hiding what I think looks poor"))}${field("In one or two sentences", ta("summary", "", "own"))}`,
    async (d) => { if (!d.name.trim()) throw toast("Give it a name", true); const p = await save("patterns", { name: d.name.trim(), summary: d.summary || null }); setTimeout(() => location.hash = `#/pattern/${p.id}`); }, "Create"); },
  "edit-pattern"(el) { const p = byId("patterns", el.dataset.id);
    sheet("Rename pattern", `${field("Name", inp("name", p.name))}${field("Summary", ta("summary", p.summary, "own"))}`, async (d) => { await save("patterns", { name: d.name.trim() || p.name, summary: d.summary || null }, p.id); }); },
  async "pattern-status"(el) { await save("patterns", { status: el.dataset.v }, el.dataset.id); render(); },
  async handoff(el) { const p = byId("patterns", el.dataset.id), v = el.dataset.v, h = new Set(p.handoff || []); h.has(v) ? h.delete(v) : h.add(v);
    await save("patterns", { handoff: [...h] }, p.id); render(); },
  "add-evidence"(el) { const pid = el.dataset.id;
    const opts = [...currentHistory().map(h => [`history:${h.id}`, "Memory: " + h.title]), ...S.incidents.map(i => [`incident:${i.id}`, "Incident: " + i.title]), ...S.reframes.map(r => [`reframe:${r.id}`, "Thought: " + r.automatic_thought])];
    sheet("Add evidence", `${field("Item", `<select name="item">${opts.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select>`)}
      ${field("Role", `<select name="role"><option value="example">An example of it</option>${FIVE_P.map(f => `<option value="${f.id}">${f.name}</option>`).join("")}</select>`)}`,
      async (d) => { if (!d.item) throw toast("Nothing to link yet", true); const [type, id] = d.item.split(":"); await save("links", { pattern_id: pid, target_type: type, target_id: id, role: d.role }); toast("Linked"); }); },
  async unlink(el) { await del("links", el.dataset.id); render(); },
  async "del-pattern"(el) { if (!confirmDel("pattern")) return; await del("patterns", el.dataset.id); S.links = S.links.filter(l => l.pattern_id !== el.dataset.id); location.hash = "#/patterns"; },
  "export-json"() { download(`psychology-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S, null, 2), "application/json"); },
  "export-md"() { download(`psychology-summary-${new Date().toISOString().slice(0, 10)}.md`, summaryMd(), "text/markdown"); },
  async signout() { await client.auth.signOut(); location.reload(); },
};

function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function summaryMd() {
  const L = []; const lensLines = (type, ids) => notesFor(type, ids).filter(n => n.kind !== "rejected").map(n => `  - *${lensById[n.lens]?.name || n.lens}${n.kind === "hypothesis" ? " (possible reason)" : ""}:* ${n.note}`);
  L.push(`# Personal psychology summary`, ``, `Prepared ${fmtDate(new Date().toISOString())}. Written in my own words; interpretations are marked as possible reasons.`, ``);
  if (S.patterns.length) { L.push(`## Patterns`); for (const p of S.patterns.filter(p => p.status !== "retired")) {
    L.push(``, `### ${p.name} (${p.status}, confidence ${p.confidence}%)`); if (p.summary) L.push(p.summary);
    FIVE_P.forEach(f => p[f.id] && L.push(`- **${f.name}:** ${p[f.id]}`)); } L.push(``); }
  L.push(`## Life timeline`);
  for (const s of STAGES) { const rs = currentHistory().filter(r => r.stage === s.id); if (!rs.length) continue; L.push(``, `### ${s.name}`);
    for (const r of rs) { L.push(``, `**${r.title}**${r.when_label ? ` (${r.when_label})` : ""}${r.felt_as !== "unlabelled" ? `, felt then as: ${feltById[r.felt_as].name.toLowerCase()}` : ""}`, ``, r.story || "");
      if (r.reading_now) L.push(``, `*How I read it now:* ${r.reading_now}`); L.push(...lensLines("history", chain(r).map(x => x.id))); } }
  if (S.incidents.length) { L.push(``, `## Incidents`); for (const i of S.incidents) { L.push(``, `**${i.title}** (${fmtDT(i.occurred_at)})`);
    [["What happened", i.what_happened], ["Before", i.before_state], ["The moment", i.the_moment], ["After", i.after_cost], ["Echoes", i.echoes]].forEach(([k, v]) => v && L.push(`- ${k}: ${v}`)); L.push(...lensLines("incident", i.id)); } }
  if (S.reframes.length) { L.push(``, `## Thought tests`); for (const r of S.reframes) L.push(``, `- "${r.automatic_thought}" (${r.intensity_before ?? "?"} → ${r.intensity_after ?? "?"})${r.balanced_thought ? `: ${r.balanced_thought}` : ""}${r.inherited_from ? ` Voice of: ${r.inherited_from}.` : ""}`); }
  const ans = S.questions.filter(q => q.answer); if (ans.length) { L.push(``, `## Answers`); for (const t of S.topics) { const qs = ans.filter(q => q.topic_id === t.id); if (!qs.length) continue; L.push(``, `### ${t.title}`); qs.forEach(q => L.push(``, `*${q.prompt}*`, ``, q.answer)); } }
  return L.join("\n");
}

/* ================= Forms ================= */
const F = {
  async answer(d) { const a = (d.answer || "").trim(); if (!a) return toast("Write an answer, or skip", true);
    await save("questions", { answer: a, answered_at: new Date().toISOString(), skipped: false }, d.qid); toast("Answer saved"); render(); },
  async entry(d, form) {
    if (!d.title.trim()) return toast("Add a title", true);
    const row = nonEmpty({ title: d.title.trim(), stage: d.stage, when_label: d.when_label, occurred_on: d.occurred_on, story: d.story, felt_as: d.felt_as || "unlabelled", people: list(d.people), tags: list(d.tags) });
    const { id, mode } = form.dataset;
    if (mode === "recall") { const old = byId("history", id);
      const r = await save("history", { ...row, reading_now: old.reading_now, sort_key: old.sort_key, supersedes: old.id, version: old.version + 1, recalled_on: new Date().toISOString().slice(0, 10) });
      await save("history", { is_current: false }, old.id); toast("New recall saved beside the old one"); location.hash = `#/entry/${r.id}`; return; }
    if (!id) { const max = Math.max(0, ...S.history.filter(h => h.stage === row.stage).map(h => h.sort_key || 0)); row.sort_key = max + 10; }
    const r = await save("history", row, id || undefined); toast("Memory saved"); location.hash = `#/entry/${r.id}`;
  },
  async incident(d, form) {
    if (!d.title.trim()) return toast("Add a few words about what went wrong", true);
    const row = nonEmpty({ title: d.title.trim(), occurred_at: d.occurred_at ? new Date(d.occurred_at).toISOString() : new Date().toISOString(), what_happened: d.what_happened, before_state: d.before_state, the_moment: d.the_moment, after_cost: d.after_cost, echoes: d.echoes });
    row.intensity = d.intensity ? +d.intensity : null;
    const r = await save("incidents", row, form.dataset.id || undefined); toast("Incident saved"); location.hash = `#/incident/${r.id}`;
  },
  async reframe(d, form) {
    if (!d.automatic_thought.trim()) return toast("Write the thought first", true);
    const row = nonEmpty({ ...d, intensity_before: +d.intensity_before, intensity_after: +d.intensity_after });
    const r = await save("reframes", row, form.dataset.id || undefined); toast("Thought test saved"); location.hash = `#/reframe/${r.id}`;
  },
};

/* ================= Wiring ================= */
document.addEventListener("click", async (e) => {
  const s = e.target.closest(".seg[data-seg] button");
  if (s) { const g = s.parentElement, hid = g.querySelector("input[type=hidden]");
    if (g.dataset.multi) { s.setAttribute("aria-pressed", s.getAttribute("aria-pressed") !== "true"); hid.value = [...g.querySelectorAll('button[aria-pressed="true"]')].map(b => b.dataset.v).join(","); }
    else { const on = s.getAttribute("aria-pressed") === "true" && g.dataset.seg === "intensity"; g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", "false")); if (!on) s.setAttribute("aria-pressed", "true"); hid.value = on ? "" : s.dataset.v; }
    return; }
  const pick = e.target.closest("[data-pick] button");
  if (pick) { const f = pick.closest("form"); f.querySelectorAll("[data-pick] button").forEach(b => b.setAttribute("aria-pressed", b === pick ? "true" : "false")); f.prompt.value = pick.dataset.q; f.note.focus(); return; }
  const el = e.target.closest("[data-act]");
  if (el && A[el.dataset.act]) { e.preventDefault(); try { await A[el.dataset.act](el, e); } catch (err) { console.error(err); } }
});
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]"); if (!form) return; e.preventDefault();
  const btn = form.querySelector("button:not([type=button])"); if (btn) btn.disabled = true;
  try { await F[form.dataset.form](Object.fromEntries(new FormData(form)), form); } catch (err) { console.error(err); } finally { if (btn) btn.disabled = false; }
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-out], [data-conf]")) e.target.nextElementSibling.value = e.target.value + "%";
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.matches("[data-conf]")) { await save("patterns", { confidence: +t.value }, t.dataset.conf); toast("Confidence updated"); }
  if (t.matches("[data-autosave]")) { await save(t.dataset.autosave, { [t.dataset.field]: t.value.trim() || null }, t.dataset.id); toast("Saved"); }
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { const f = e.target.closest("form"); if (f) f.requestSubmit(); }
});

/* ================= Boot ================= */
function gate(msg = "") {
  document.body.classList.add("gated");
  $("#view").innerHTML = `<div class="gate"><div><svg class="mark" viewBox="0 0 32 32"><polygon points="16,2 26,6 30,16 26,26 16,30 6,26 2,16 6,6" fill="none" stroke="var(--pearl)" stroke-width="1.2"/><circle cx="16" cy="16" r="3.5" fill="var(--pearl)"/></svg>
    <h1>Psychology</h1><p>${msg ? esc(msg) : "Your history, your patterns, and the reasons behind them, seen from every side. Private to you."}</p>
    <button class="btn primary" id="signin">Continue with Google</button></div></div>`;
  $("#signin").onclick = () => client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
}
async function start() {
  document.body.classList.remove("gated");
  $("#view").innerHTML = `<div class="loading">Loading…</div>`;
  try { await loadAll(); } catch (e) { $("#view").innerHTML = `<p class="empty"><b>Couldn't load your data.</b> ${esc(e.message)}</p>`; return; }
  window.addEventListener("hashchange", render); render();
}
async function boot() {
  if (DEMO) { db = memoryDB(); user = { email: "Sample mode", user_metadata: {} }; return start(); }
  if (!window.supabase) { $("#view").innerHTML = `<p class="empty"><b>Couldn't reach Supabase.</b> Check your connection and reload.</p>`; return; }
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } });
  const { data: { session } } = await client.auth.getSession();
  if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + (location.hash || "#/"));
  if (!session) return gate();
  if (cfg.ownerEmail && session.user.email !== cfg.ownerEmail) { await client.auth.signOut(); return gate(`Signed in as ${session.user.email}. This app only opens for its owner's account.`); }
  user = session.user; db = supabaseDB(client); start();
}
boot();

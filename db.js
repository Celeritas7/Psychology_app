// Data layer. Supabase in normal use; an in-memory store with sample data in demo mode (?demo).
export const T = {
  history: "psychology_history",
  incidents: "psychology_incidents",
  notes: "psychology_lens_notes",
  patterns: "psychology_patterns",
  links: "psychology_pattern_links",
  topics: "psychology_topics",
  questions: "psychology_questions",
  reframes: "psychology_reframes",
};

export function supabaseDB(client) {
  const err = (e) => { if (e) throw new Error(e.message || String(e)); };
  return {
    async list(k) {
      const { data, error } = await client.from(T[k]).select("*").order("created_at", { ascending: true });
      err(error); return data;
    },
    async insert(k, row) {
      const { data, error } = await client.from(T[k]).insert(row).select().single();
      err(error); return data;
    },
    async update(k, id, patch) {
      const { data, error } = await client.from(T[k]).update(patch).eq("id", id).select().single();
      err(error); return data;
    },
    async remove(k, id) {
      const { error } = await client.from(T[k]).delete().eq("id", id);
      err(error);
    },
  };
}

export function memoryDB() {
  const now = () => new Date().toISOString();
  const id = () => crypto.randomUUID();
  const s = Object.fromEntries(Object.keys(T).map(k => [k, []]));
  const add = (k, r) => { const row = { id: id(), created_at: now(), updated_at: now(), ...r }; s[k].push(row); return row; };

  // Neutral sample content only: the demo is public.
  const h1 = add("history", { stage: "childhood", when_label: "Age 7", sort_key: 10, title: "Sample: the quiet kid at the back", story: "This is a sample memory, written the way you would tell it. Sign in to see your own timeline.", felt_as: "unlabelled", tags: ["sample"], emotions: [], people: [], recalled_on: "2026-10-17", version: 1, is_current: true });
  add("history", { stage: "school", when_label: "8th std", sort_key: 30, title: "Sample: standing alone in a class debate", story: "Everyone was on the other side and came prepared. I had conviction but no examples.", felt_as: "mixed", reading_now: "I held my ground. What I lacked was preparation, not courage.", tags: ["sample"], emotions: [], people: [], recalled_on: "2026-10-17", version: 1, is_current: true });
  add("history", { stage: "higher_secondary", when_label: "12th std", sort_key: 50, title: "Sample: a result I called a failure", story: "The marks came out lower than I expected and I decided I was not good enough.", felt_as: "failure", tags: ["sample"], emotions: [], people: [], recalled_on: "2026-10-17", version: 1, is_current: true });
  add("notes", { target_type: "history", target_id: h1.id, lens: "developmental", note: "Sample reflection from the history lens.", kind: "reflection" });
  add("notes", { target_type: "history", target_id: h1.id, lens: "emotional", note: "Sample reflection from the feelings lens.", kind: "reflection" });
  const i1 = add("incidents", { occurred_at: "2026-10-20T22:30:00+09:00", title: "Sample: missed the last train", what_happened: "Stayed too long and missed the last train home.", before_state: "Tired, two drinks in.", the_moment: "Thought one more hour would be fine.", after_cost: "Taxi fare and a bad next morning.", echoes: "Happened once before.", intensity: 3, source: "self", tags: [] });
  add("notes", { target_type: "incident", target_id: i1.id, lens: "biological", note: "Tired and drinking: judgement about time was off.", kind: "hypothesis" });
  add("notes", { target_type: "incident", target_id: i1.id, lens: "relational", note: "Did not want to be the first to leave.", kind: "hypothesis" });
  const t1 = add("topics", { title: "Sample topic", why: "Topics hold questions to answer one at a time.", status: "open", created_by: "claude" });
  add("questions", { topic_id: t1.id, lens: "cognitive", prompt: "When something goes wrong, what is the first sentence that runs in your head?", position: 1, asked_by: "claude", skipped: false });
  add("questions", { topic_id: t1.id, lens: "developmental", prompt: "Who did you first hear say it?", position: 2, asked_by: "claude", skipped: false });
  const p1 = add("patterns", { name: "Sample: staying when I should leave", summary: "I stay past the point I meant to leave.", status: "forming", presenting: "Staying out late, missing trains.", predisposing: "", precipitating: "Being tired and in a group.", perpetuating: "", protective: "", confidence: 35, version: 1, handoff: [] });
  add("links", { pattern_id: p1.id, target_type: "incident", target_id: i1.id, role: "example" });
  add("reframes", { situation: "Lower marks than expected.", automatic_thought: "This is my failure. I am not good enough.", feeling: "Shame", intensity_before: 80, evidence_for: "The marks were lower.", evidence_against: "One exam. Other results were fine.", inherited_from: "", balanced_thought: "One result went badly; it says little about my ability overall.", intensity_after: 40 });

  return {
    async list(k) { return structuredClone(s[k]); },
    async insert(k, row) { return structuredClone(add(k, row)); },
    async update(k, rid, patch) { const r = s[k].find(x => x.id === rid); Object.assign(r, patch, { updated_at: now() }); return structuredClone(r); },
    async remove(k, rid) { s[k] = s[k].filter(x => x.id !== rid); },
  };
}

// The lens registry. Each lens is one way of looking at the same event.
// Add a lens by appending an object here: the rest of the app picks it up.
export const LENSES = [
  { id: "biological", name: "Body", full: "Biological", color: "#6FCF97",
    asks: "What state your body was in",
    questions: [
      "What state was your body in: sleep, hunger, tiredness, alcohol, cold?",
      "Was anything physical going on that week?",
      "Does this happen more at certain times of day or in certain conditions?" ] },
  { id: "behavioural", name: "Behaviour", full: "Behavioural", color: "#F2C94C",
    asks: "Trigger, action and what it got you",
    questions: [
      "What came right before it, the trigger?",
      "What did you actually do, step by step?",
      "What did it get you right away: relief, escape, attention, comfort?" ] },
  { id: "cognitive", name: "Thoughts", full: "Cognitive", color: "#56CCF2",
    asks: "The sentence running in your head",
    questions: [
      "What sentence was running in your head?",
      "What does that thought say about you, other people, or the world?",
      "Is there a thinking trap in it: all-or-nothing, mind-reading, fortune-telling, labelling yourself?" ] },
  { id: "emotional", name: "Feelings", full: "Emotional", color: "#EF7A8A",
    asks: "What you felt and what you did with it",
    questions: [
      "What did you feel, and how strong, 0 to 10?",
      "Where did you feel it in your body?",
      "What did you do with the feeling: hide it, act it out, push it down?" ] },
  { id: "developmental", name: "History", full: "Developmental", color: "#BB86FC",
    asks: "Where this started",
    questions: [
      "When is the first time you remember feeling or doing this?",
      "Who did you learn this from, or see doing it?",
      "What did this way of reacting protect you from back then?" ] },
  { id: "relational", name: "People", full: "Relational", color: "#F2994A",
    asks: "Who was there and the role you took",
    questions: [
      "Who was involved, and what role did you take?",
      "Whose opinion mattered most in that moment?",
      "Is this how you usually are with this kind of person?" ] },
  { id: "cultural", name: "Context", full: "Cultural", color: "#2DD4BF",
    asks: "Place, family, money, culture",
    questions: [
      "Did place, language, money, family expectation or work culture shape this?",
      "Would it have gone differently in India, or in Japan?",
      "What rule of how things should be was in play?" ] },
  { id: "motivational", name: "Needs", full: "Motivational", color: "#8C9EFF",
    asks: "The need it was serving",
    questions: [
      "What need was it serving: safety, belonging, respect, control, rest, meaning?",
      "What were you trying to protect, or to get?",
      "How else could that need be met?" ] },
];

export const lensById = Object.fromEntries(LENSES.map(l => [l.id, l]));

export const STAGES = [
  { id: "childhood", name: "Childhood" },
  { id: "school", name: "School" },
  { id: "higher_secondary", name: "11th and 12th" },
  { id: "college", name: "College" },
  { id: "work_india", name: "Work in India" },
  { id: "japan", name: "Japan" },
  { id: "other", name: "Undated" },
];

export const FELT = [
  { id: "failure", name: "Failure", color: "#EF7A8A" },
  { id: "mixed", name: "Mixed", color: "#F2C94C" },
  { id: "win", name: "Win", color: "#6FCF97" },
  { id: "neutral", name: "Neither", color: "#8D8599" },
  { id: "unlabelled", name: "Not labelled", color: "transparent" },
];
export const feltById = Object.fromEntries(FELT.map(f => [f.id, f]));

export const FIVE_P = [
  { id: "presenting", name: "What happens", hint: "The behaviour and the situations it leads to" },
  { id: "predisposing", name: "Why it was likely", hint: "History and background that set it up" },
  { id: "precipitating", name: "What sets it off", hint: "The triggers of each episode" },
  { id: "perpetuating", name: "What keeps it going", hint: "What it still gets you, or what stops change" },
  { id: "protective", name: "What helps", hint: "Strengths, people and conditions that reduce it" },
];

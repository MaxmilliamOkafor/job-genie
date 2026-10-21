// AI screener pass: criteria extraction, grading, grounded criterion edits,
// step-down sentences, and failure behaviour that never fails a tailoring run.
import { expect, test } from "bun:test";
import {
  criteriaTerms,
  extractCriteria,
  isStepDown,
  profileYearsSpan,
  rejectReason,
  applyReviewEdits,
  runScreener,
  parseScreener,
  ReviewContext,
} from "../supabase/functions/tailor-application/review.ts";

const CV = [
  "MAXMILLIAM OKAFOR",
  "",
  "SUMMARY",
  "Software engineer with nine years across consulting and product work.",
  "",
  "PROFESSIONAL SKILLS",
  "- TypeScript, React, Node.js",
  "",
  "EXPERIENCE",
  "",
  "Software Engineer, Accenture",
  "01-2019 - 12-2023",
  "- Delivered a client portal in React, cutting support tickets by 30%.",
  "- Built Node.js services processing 2m records a day.",
  "",
  "EDUCATION",
  "BSc Computer Science",
].join("\n");

const PROFILE = {
  firstName: "Maxmilliam",
  lastName: "Okafor",
  professional_experience: [
    { title: "Software Engineer", company: "Accenture", startDate: "01-2019", endDate: "12-2023", bullets: ["Delivered a client portal in React, cutting support tickets by 30%."] },
  ],
  skills: ["TypeScript", "React", "Node.js"],
  professionalSummary: "Software engineer with nine years across consulting and product work.",
};

const CTX: ReviewContext = {
  profileText: JSON.stringify(PROFILE),
  protectedTerms: ["React"],
  criteriaTerms: ["Kubernetes", "Java"],
};

test("an edit whose old is not in the draft is rejected", () => {
  const reason = rejectReason(CV, { doc: "cv", old: "Led a team of twelve engineers.", new: "Led a team.", reason: "style" }, CTX);
  expect(reason).toBe("old text not found");
});

test("an edit whose old occurs twice is rejected", () => {
  const twice = CV + "\n- Delivered a client portal in React, cutting support tickets by 30%.";
  const reason = rejectReason(twice, { doc: "cv", old: "- Delivered a client portal in React, cutting support tickets by 30%.", new: "- Delivered a portal.", reason: "style" }, CTX);
  expect(reason).toBe("old text occurs more than once");
});

test("a criterion edit adding Java is rejected when the profile has no Java", () => {
  const reason = rejectReason(CV, {
    doc: "cv",
    old: "- Built Node.js services processing 2m records a day.",
    new: "- Built Java services processing 2m records a day.",
    reason: "criterion",
  }, CTX);
  expect(reason).toBe('adds "Java", not in the profile');
});

test("a criterion edit adding Java is applied when the profile shows Java", () => {
  const profileWithJava = { ...PROFILE, skills: [...PROFILE.skills, "Java"] };
  const ctx: ReviewContext = { ...CTX, profileText: JSON.stringify(profileWithJava) };
  const out = applyReviewEdits({ cv: CV, letter: "" }, [{
    doc: "cv",
    old: "- Built Node.js services processing 2m records a day.",
    new: "- Built Java and Node.js services processing 2m records a day.",
    reason: "criterion",
  }], ctx);
  expect(out.review.applied).toBe(1);
  expect(out.cv).toContain("Built Java and Node.js services");
});

test("a criterion edit outside the EXPERIENCE section is rejected", () => {
  const profileWithK8s = { ...PROFILE, skills: [...PROFILE.skills, "Kubernetes"] };
  const ctx: ReviewContext = { ...CTX, profileText: JSON.stringify(profileWithK8s) };
  const reason = rejectReason(CV, {
    doc: "cv",
    old: "- TypeScript, React, Node.js",
    new: "- TypeScript, React, Node.js, Kubernetes",
    reason: "criterion",
  }, ctx);
  expect(reason).toBe("criterion edit outside the experience section");
});

test("an edit removing a screener criterion term from a bullet is rejected", () => {
  const cv = CV.replace("Built Node.js services", "Built Node.js and Kubernetes services");
  const reason = rejectReason(cv, {
    doc: "cv",
    old: "- Built Node.js and Kubernetes services processing 2m records a day.",
    new: "- Built Node.js services processing 2m records a day.",
    reason: "criterion",
  }, CTX);
  expect(reason).toBe('removes screener criterion "Kubernetes"');
});

test("step-down triggers for an entry-level posting with a 9-year profile, not for a senior posting", () => {
  const years = profileYearsSpan({ professionalExperience: [{ startDate: "01-2016", endDate: "06-2025" }] });
  expect(years).toBeGreaterThanOrEqual(9);
  expect(isStepDown("IT Support Technician (Entry Level)", "First-line support role.", years)).toBe(true);
  expect(isStepDown("Senior Software Engineer", "Lead complex platform work.", years)).toBe(false);
});

test("a step-down posting asks for the sentence in the screener prompt", async () => {
  let prompt = "";
  const out = await runScreener(
    async () => {
      return JSON.stringify({ grades: [], edits: [], gaps: [] });
    },
    { cv: CV, letter: "" },
    CTX,
    (_doc, text) => text,
  );
  expect(out.screener).not.toBeNull();
  // The step-down flag is passed into the user prompt by the caller; here we
  // verify the prompt builder includes it when asked.
  const { screenerUserPrompt } = await import("../supabase/functions/tailor-application/review.ts");
  prompt = screenerUserPrompt("entry level posting", [], CV, "", JSON.stringify(PROFILE), true);
  expect(prompt).toContain("STEP-DOWN");
  prompt = screenerUserPrompt("senior posting", [], CV, "", JSON.stringify(PROFILE), false);
  expect(prompt).not.toContain("STEP-DOWN:");
});

test("a failed screener call returns the documents unchanged with no screener", async () => {
  const out = await runScreener(
    async () => { throw new Error("screener call returned 500"); },
    { cv: CV, letter: "Dear team," },
    CTX,
    (_doc, text) => text,
  );
  expect(out.screener).toBeNull();
  expect(out.cv).toBe(CV);
  expect(out.letter).toBe("Dear team,");
});

test("extractCriteria pulls requirement lines and skips boilerplate", () => {
  const posting = [
    "Requirements",
    "- 5+ years of experience with Kubernetes or Docker",
    "- Strong knowledge of TypeScript",
    "- We are an equal opportunity employer and value diversity.",
    "- Competitive salary and great culture.",
  ].join("\n");
  const criteria = extractCriteria(posting, 10);
  expect(criteria.length).toBe(2);
  expect(criteria[0].requirement).toContain("Kubernetes");
  expect(criteria.some((c) => /equal opportunity|salary/i.test(c.requirement))).toBe(false);
});

test("criteriaTerms splits alternatives joined by or", () => {
  const terms = criteriaTerms([{ requirement: "Java or Ruby or Go", kind: "must", adSays: "" }]);
  expect(terms).toEqual(["Java", "Ruby", "Go"]);
});

test("parseScreener tolerates fenced JSON and caps lists", () => {
  const parsed = parseScreener("```json\n{\"grades\":[{\"requirement\":\"a\",\"kind\":\"must\",\"status\":\"met\",\"cvLine\":\"x\",\"profileProof\":\"y\"}],\"edits\":[],\"gaps\":[\"g1\"]}\n```");
  expect(parsed.grades.length).toBe(1);
  expect(parsed.grades[0].status).toBe("met");
  expect(parsed.gaps).toEqual(["g1"]);
});

test("an Action, Context, Result style rewrite keeps its source number and is applied", () => {
  const old = "- Delivered a client portal in React, cutting support tickets by 30%.";
  const replacement = "- Built a React portal for the client, reducing support tickets by 30%.";
  const out = applyReviewEdits({ cv: CV, letter: "" }, [{ doc: "cv", old, new: replacement, reason: "style" }], CTX);
  expect(out.review.applied).toBe(1);
  expect(out.review.rejected).toEqual([]);
  expect(out.cv).toContain(replacement);
});

test("an Action, Context, Result rewrite cannot add an unsupported number or client scale", () => {
  const old = "- Delivered a client portal in React, cutting support tickets by 30%.";
  for (const replacement of [
    "- Delivered a client portal in React, cutting support tickets by 40%.",
    "- Delivered a portal in React for 40 clients, cutting support tickets by 30%.",
  ]) {
    const out = applyReviewEdits({ cv: CV, letter: "" }, [{ doc: "cv", old, new: replacement, reason: "style" }], CTX);
    expect(out.review.applied).toBe(0);
    expect(out.review.rejected[0]?.reason).toContain("adds the number 40");
    expect(out.cv).toBe(CV);
  }
});

test("experience rewrites cannot add learned or gained reflection sentences even if the profile contains them", () => {
  const old = "- Delivered a client portal in React, cutting support tickets by 30%.";
  const ctx = { ...CTX, profileText: `${CTX.profileText} Learned about client support. Gained client support experience.` };
  for (const reflection of ["Learned about client support.", "Gained client support experience."]) {
    const out = applyReviewEdits({ cv: CV, letter: "" }, [{ doc: "cv", old, new: `${old} ${reflection}`, reason: "style" }], ctx);
    expect(out.review.applied).toBe(0);
    expect(out.review.rejected[0]?.reason).toBe("adds learned or gained reflection in an experience bullet");
    expect(out.cv).toBe(CV);
  }
});

// Second screener pass: at most one, only when a supported must-have remains.
import { runScreenerPasses } from "../supabase/functions/tailor-application/review.ts";

const mustGrade = (requirement: string, status: string) => ({ requirement, kind: "must", status, cvLine: "", profileProof: "" });
const passCall = (responses: (string | Error)[], seen: (string[] | null)[]) =>
  async (_s: AbortSignal, _d: unknown, remaining: string[] | null) => {
    seen.push(remaining);
    const r = responses[seen.length - 1];
    if (r === undefined) throw new Error("unexpected extra pass");
    if (r instanceof Error) throw r;
    return r;
  };

test("a supported must-have still partial after pass 1 triggers exactly one second pass", async () => {
  const seen: (string[] | null)[] = [];
  const out = await runScreenerPasses(passCall([
    JSON.stringify({ grades: [mustGrade("React", "partial")], edits: [], gaps: [] }),
    JSON.stringify({ grades: [mustGrade("React", "met")], edits: [{ doc: "cv", old: "- Built Node.js services processing 2m records a day.", new: "- Built Node.js services processing 2m records a day for the React portal.", reason: "criterion" }], gaps: [] }),
  ], seen), { cv: CV, letter: "" }, CTX, (_d, t) => t);
  expect(seen).toEqual([null, ["React"]]);
  expect(out.screener?.passes).toBe(2);
  expect(out.screener?.grades[0].status).toBe("met");
  expect(out.screener?.applied).toBe(1);
});

test("no second pass when every must-have is met or the rest are gaps", async () => {
  for (const r of [
    { grades: [mustGrade("React", "met")], edits: [], gaps: [] },
    { grades: [mustGrade("Kubernetes", "missing")], edits: [], gaps: ["Kubernetes"] },
  ]) {
    const seen: (string[] | null)[] = [];
    const out = await runScreenerPasses(passCall([JSON.stringify(r)], seen), { cv: CV, letter: "" }, CTX, (_d, t) => t);
    expect(seen.length).toBe(1);
    expect(out.screener?.passes).toBe(1);
  }
});

test("never a third pass even when pass 2 leaves a must-have partial", async () => {
  const seen: (string[] | null)[] = [];
  const partial = JSON.stringify({ grades: [mustGrade("React", "partial")], edits: [], gaps: [] });
  const out = await runScreenerPasses(passCall([partial, partial, partial], seen), { cv: CV, letter: "" }, CTX, (_d, t) => t);
  expect(seen.length).toBe(2);
  expect(out.screener?.passes).toBe(2);
});

test("a failed second pass keeps the first pass's documents and screener", async () => {
  const seen: (string[] | null)[] = [];
  const first = JSON.stringify({ grades: [mustGrade("React", "partial")], edits: [{ doc: "cv", old: "BSc Computer Science", new: "BSc in Computer Science", reason: "style" }], gaps: [] });
  const out = await runScreenerPasses(passCall([first, new Error("screener call returned 500")], seen), { cv: CV, letter: "" }, CTX, (_d, t) => t);
  expect(seen.length).toBe(2);
  expect(out.cv).toContain("BSc in Computer Science");
  expect(out.screener?.passes).toBe(1);
  expect(out.screener?.applied).toBe(1);
  expect(out.screener?.grades[0].status).toBe("partial");
});

test("no second pass when the first pass took more than 15 seconds", async () => {
  const seen: (string[] | null)[] = [];
  let t = 0;
  const out = await runScreenerPasses(passCall([JSON.stringify({ grades: [mustGrade("React", "partial")], edits: [], gaps: [] })], seen), { cv: CV, letter: "" }, CTX, (_d, x) => x, 25000, () => (t += 16000));
  expect(seen.length).toBe(1);
  expect(out.screener?.passes).toBe(1);
});

test("a rewrite adding a learnt or taught me sentence is rejected anywhere", () => {
  const old = "- Built Node.js services processing 2m records a day.";
  expect(rejectReason(CV, { doc: "cv", old, new: old + " This taught me patience.", reason: "style" }, CTX)).not.toBeNull();
  expect(rejectReason(CV, { doc: "cv", old: "BSc Computer Science", new: "BSc Computer Science. I learnt a lot.", reason: "style" }, CTX)).not.toBeNull();
});

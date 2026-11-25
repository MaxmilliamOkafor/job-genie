import { test, expect } from "bun:test";
import { enforceBulletParity, tidySkills, tidyHeader, letterParity } from "../supabase/functions/_shared/extensionParity";

const ROLES = [
  { company: "Meta", title: "Software Engineer", bullets: [
    "Hold primary on-call responsibility for two critical services and wrote the incident response documentation.",
    "Rebuilt the PySpark and Presto pipeline behind impression reporting, reducing the overnight run from six hours to under one.",
    "Mentor two junior engineers and an intern who converted to a permanent role.",
  ] },
  { company: "Accenture", title: "Solutions Architect", bullets: [
    "Built a retail client's move to AWS microservices on EKS, delivering 47 services in 11 months.",
    "Replaced Jenkins with GitHub Actions and ArgoCD across four delivery teams.",
  ] },
];
const cv = (meta: string[], acc: string[]) => [
  "Max Okafor", "Platform Engineer", "Dublin, Ireland | +1 (415) 555 0100 | max@example.com", "https://www.linkedin.com/in/max/ | https://github.com/max/", "",
  "PROFESSIONAL EXPERIENCE", "Meta\tDublin", "Software Engineer", "2023 - Present", ...meta.map((b) => `- ${b}`), "",
  "Accenture\tLondon", "Solutions Architect", "2021 - 2022", ...acc.map((b) => `- ${b}`), "",
  "TECHNICAL SKILLS", "Cloud: AWS, observability, Ray, Security, Terraform", "Domain: Tradeoffs, FSA", "",
].join("\n");
const bulletsOf = (text: string, role: string) => {
  const lines = text.split("\n"); const i = lines.findIndex((l) => l.startsWith(role));
  const out: string[] = []; for (let j = i + 3; j < lines.length && lines[j].startsWith("- "); j++) out.push(lines[j]); return out;
};

test("a dropped bullet returns in its original place", () => {
  const r = enforceBulletParity(cv([ROLES[0].bullets[0], ROLES[0].bullets[2]], ROLES[1].bullets), ROLES);
  expect(r.restored).toBe(1);
  expect(bulletsOf(r.cv, "Meta")[1]).toContain("PySpark and Presto");
});
test("source and output bullet counts are equal for every role", () => {
  const r = enforceBulletParity(cv([ROLES[0].bullets[0]], [ROLES[1].bullets[1]]), ROLES);
  for (const c of r.counts) expect(c.output).toBe(c.source);
});
test("a bullet copied under another role is replaced with that role's own bullet", () => {
  const r = enforceBulletParity(cv(ROLES[0].bullets, [ROLES[1].bullets[0], ROLES[0].bullets[1]]), ROLES);
  expect(bulletsOf(r.cv, "Accenture").join(" ")).toContain("ArgoCD");
  expect(bulletsOf(r.cv, "Accenture").join(" ")).not.toContain("PySpark");
});
test("a rewrite that loses EKS uses the saved wording", () => {
  const r = enforceBulletParity(cv(ROLES[0].bullets, ["Built a retail client's move to AWS microservices, delivering 47 services in 11 months.", ROLES[1].bullets[1]]), ROLES);
  expect(bulletsOf(r.cv, "Accenture")[0]).toContain("on EKS");
});
test("incident response does not keep on-call", () => {
  const r = enforceBulletParity(cv(["Hold primary incident response responsibility for two critical services and wrote the incident response documentation.", ROLES[0].bullets[1], ROLES[0].bullets[2]], ROLES[1].bullets), ROLES, { postingTerms: ["on-call"] });
  expect(bulletsOf(r.cv, "Meta")[0]).toContain("on-call");
});
test("running bullet parity twice changes nothing", () => {
  const once = enforceBulletParity(cv([ROLES[0].bullets[0]], ROLES[1].bullets), ROLES).cv;
  expect(enforceBulletParity(once, ROLES).cv).toBe(once);
});
test("skills: unused tools, vague words and perks go; items capitalised; empty lines removed", () => {
  const out = tidySkills(cv(ROLES[0].bullets, ROLES[1].bullets), "AWS Terraform observability").cv;
  expect(out).toContain("Cloud: AWS, Observability, Terraform");
  expect(out).not.toContain("Ray");
  expect(out).not.toContain("Security");
  expect(out).not.toContain("Domain:");
});
test("header: two lines, tidy links, non-Irish phone untouched", () => {
  const out = tidyHeader(cv(ROLES[0].bullets, ROLES[1].bullets)).split("\n");
  expect(out[2]).toBe("Dublin, Ireland | +1 (415) 555 0100 | max@example.com");
  expect(out[3]).toBe("linkedin.com/in/max | github.com/max");
});
const LETTER = ["Dear Hiring Team,", "The Platform Engineer role at Terzo, using my expertise in scale asks for on-call and I have done it.",
  "At Meta, I hold primary on-call responsibility for two critical services and wrote the incident response documentation (SLO, observability). I replaced Jenkins with GitHub Actions and ArgoCD across four delivery teams. I hold primary on-call responsibility for two critical services and wrote the incident response documentation.", "Kind regards,"].join("\n\n");
test("letter opening is plain", () => {
  expect(letterParity(LETTER, { roles: ROLES, jobTitle: "Platform Engineer", company: "Terzo" }).letter).toContain("The Platform Engineer role at Terzo asks for on-call, and I have done it.");
});
test("letter names the right employer, drops gloss brackets and repeats", () => {
  const out = letterParity(LETTER, { roles: ROLES, jobTitle: "Platform Engineer", company: "Terzo" }).letter;
  expect(out).toContain("At Accenture, I replaced Jenkins");
  expect(out).not.toContain("(SLO");
  expect(out.match(/primary on-call/g)?.length).toBe(1);
});

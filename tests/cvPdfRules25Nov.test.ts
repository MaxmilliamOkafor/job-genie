import { test, expect } from "bun:test";
import { formatContactPhone } from "../supabase/functions/_shared/contactPhone";
import { isFurniture } from "../supabase/functions/_shared/evidence";
import { matchAnswer, mergeAnswers } from "../src/lib/screeningAnswers";

test("Irish phone reads +353 087 426 1508", () => {
  for (const raw of ["+353 08 742 61508", "+3530874261508", "+353 87 426 1508"]) expect(formatContactPhone(raw)).toBe("+353 087 426 1508");
});
test("perks are never keywords", () => {
  for (const t of ["FSA", "HSA", "EAP", "Employee Assistance Program", "ESPP", "tuition reimbursement"]) expect(isFurniture(t)).toBe(true);
});
test("75% similar question is filled without confirmation", () => {
  const saved = [{ question: "How many years of Python experience do you have?", answer: "5", confirmed_at: new Date().toISOString() }];
  const r = matchAnswer("How many years of Python experience have you got?", saved);
  expect(r.answer?.answer).toBe("5");
  expect(r.needsConfirmation).toBe(false);
});
test("ATS personal-detail answers can be saved", () => {
  expect(mergeAnswers([], [{ question: "Phone number", answer: "1" }]).length).toBe(1);
  expect(mergeAnswers([], [{ question: "Do you need visa sponsorship?", answer: "No" }]).length).toBe(1);
});

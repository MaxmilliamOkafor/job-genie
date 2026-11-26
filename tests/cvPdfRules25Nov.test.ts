import { test, expect } from "bun:test";
import { formatContactPhone } from "../supabase/functions/_shared/contactPhone";
import { isFurniture } from "../supabase/functions/_shared/evidence";
import { buildMemoryPayload, isSecretAnswer, matchAnswer, mergeAnswers } from "../src/lib/screeningAnswers";

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
test("ATS contact details are saved, secrets never are", () => {
  for (const q of ["First name", "Email address", "Phone number", "Home address", "Date of birth", "Do you hold a valid passport?", "Do you have a full driving licence?", "Are you willing to share your bank's name?"]) {
    expect(mergeAnswers([], [{ question: q, answer: "x" }]).length).toBe(1);
  }
  for (const q of ["Password", "Confirm your password", "Card number", "CVV", "IBAN", "Sort code", "Bank account number", "Social Security Number", "PPS number", "National Insurance number", "Passport number", "Driving licence number"]) {
    expect(isSecretAnswer(q)).toBe(true);
    expect(mergeAnswers([], [{ question: q, answer: "x" }])).toEqual([]);
  }
  expect(mergeAnswers([], [{ question: "Anything else?", answer: "4111 1111 1111 1111" }])).toEqual([]);
  expect(mergeAnswers([], [{ question: "Anything else?", answer: "IE29 AIBK 9311 5212 3456 78" }])).toEqual([]);
  expect(mergeAnswers([], [{ question: "Years of experience", answer: "1234567890123" }]).length).toBe(1);
});
test("a secret saved before this rule is dropped and never filled in", () => {
  const old = [{ question: "Password", answer: "hunter2" }, { question: "Phone number", answer: "+353 87 426 1508" }];
  expect(mergeAnswers(old, []).map((a) => a.question)).toEqual(["Phone number"]);
  const payload = buildMemoryPayload(old);
  expect(payload.screening_answers.map((a) => a.question)).toEqual(["Phone number"]);
  expect(JSON.stringify(payload)).not.toContain("hunter2");
});

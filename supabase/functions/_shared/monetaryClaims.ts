/** Monetary values are excluded even when present in saved evidence. Other numbers stay. */
const NUMBER = String.raw`(?:\d+(?:[, ]\d{3})*(?:\.\s*\d+)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine|hundred))*)`;
const UNIT = String.raw`(?:trillion|billion|million|thousand|bn|mn|[kmb])`;
const CODE = String.raw`(?:GBP|USD|EUR|JPY|CAD|AUD|CHF|INR|NGN)`;
const CURRENCY = String.raw`(?:pounds?(?: sterling)?|dollars?|euros?|yen|rupees?|naira|sterling)`;
const AMOUNT = new RegExp(String.raw`(?:[£€$¥₹₦]\s*${NUMBER}(?:\s*${UNIT}\b)?|\b${CODE}\s*${NUMBER}(?:\s*${UNIT}\b)?|\b${NUMBER}(?:\s*${UNIT}\b)?\s*(?:${CURRENCY}|${CODE})\b)`, "gi");

export function removeMonetaryClaims(text: string): string {
  if (!text) return text;
  return text.split("\n").map((line) => {
    // A marker lets surrounding financial-value wording be removed without
    // dropping the achievement, its employer, or its non-monetary results.
    const marker = "\uE000";
    let cleaned = line.replace(AMOUNT, marker);
    if (!cleaned.includes(marker)) return line;
    cleaned = cleaned
      .replace(new RegExp(String.raw`\b(?:totalling|totaling|worth|valued at|valued|amounting to|with a value of)\s+${marker}`, "gi"), "")
      .replace(new RegExp(String.raw`\b(?:by|of|to)\s+${marker}(?:\s*(?:a|per)\s+(?:year|month|annum))?`, "gi"), "")
      .replace(new RegExp(String.raw`\bfor\s+(?:a|an)\s+${marker}(?=\s*[,;.!?]|\s*$)`, "gi"), "")
      .replace(new RegExp(marker, "g"), "")
      .replace(/\b(?:a|an)\s+(?=[,;.!?]|$)/gi, "")
      .replace(/[ \t]+([,;.!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trimEnd();
    return cleaned;
  }).join("\n");
}

/** Covers raw text, structured documents and profile-based export payloads. */
export function removeMonetaryClaimsFromPayload<T>(value: T): T {
  if (typeof value === "string") return removeMonetaryClaims(value) as T;
  if (Array.isArray(value)) return value.map(removeMonetaryClaimsFromPayload) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeMonetaryClaimsFromPayload(item)])) as T;
  }
  return value;
}
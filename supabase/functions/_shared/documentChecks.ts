/** Pure checks; posting text is never candidate evidence. */
export function numericTokens(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) || []).concat(text.match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|twice)\b/gi) || []).map((x) => x.toLowerCase());
}
export function evidenceStem(word: string): string {
  const w = word.toLowerCase();
  if (/^anal(?:ysis|yst|ysts|yses|ysing|yzing|ysed|yzed)$/.test(w)) return 'analys';
  if (/^consult(?:ant|ants|ing|ed|ation|ations)?$/.test(w)) return 'consult';
  if (/^communicat(?:e|es|ed|ing|ion|ions)$/.test(w)) return 'communicat';
  return w.replace(/ies$/, 'y').replace(/s$/, '');
}
export function evidencePhraseAppears(text: string, term: string): boolean {
  const words = (s: string) => (s.toLowerCase().match(/[a-z0-9+#.]+/g) || []).map(evidenceStem);
  const needle = words(term), hay = words(text.replace(/\.(?=\s|$)/g, ' '));
  return needle.length > 0 && hay.some((_, i) => needle.every((w, k) => w === hay[i + k]));
}
export function isGoLanguageMention(text: string): boolean {
  return /\bGo\b(?!\s*[-/]?\s*(?:live\b|to\b|market\b|forward\b|ahead\b))/i.test(text);
}
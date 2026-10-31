'use strict';
// Pinyin tone numbers -> tone marks, and the bulk-paste parser used by the unit editor.

const Pinyin = (() => {
  const MARKS = {
    a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
    A: 'ĀÁǍÀ', E: 'ĒÉĚÈ', I: 'ĪÍǏÌ', O: 'ŌÓǑÒ', U: 'ŪÚǓÙ', 'Ü': 'ǕǗǙǛ',
  };
  const VOWELS = 'aeiouü';

  // The mark goes on a or e if present, on the o of "ou", otherwise on the last vowel.
  function markSyllable(syl, tone) {
    syl = syl.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
    if (tone === 0 || tone === 5) return syl;
    const lower = syl.toLowerCase();
    let at = lower.indexOf('a');
    if (at < 0) at = lower.indexOf('e');
    if (at < 0 && lower.includes('ou')) at = lower.indexOf('o');
    if (at < 0) {
      for (let i = lower.length - 1; i >= 0; i--) {
        if (VOWELS.includes(lower[i])) { at = i; break; }
      }
    }
    if (at < 0) return syl;
    return syl.slice(0, at) + MARKS[syl[at]][tone - 1] + syl.slice(at + 1);
  }

  // "ni3 hao3" -> "nǐ hǎo", "lv4" / "lu:4" -> "lǜ". Text that already has marks passes through.
  function convert(text) {
    return String(text).replace(/([A-Za-züÜ:]+)([0-5])(?![0-9])/g, (m, syl, t) => markSyllable(syl, Number(t)));
  }

  const HEADER_HANZI = /^(hanzi|chinese|汉字|漢字|中文|word|words|character|characters|vocab|vocabulary|term)$/i;

  // One card per line: Hanzi, Pinyin, Meaning. A line with a Tab splits on Tabs (a paste from
  // Excel / Google Sheets), otherwise on "|". Columns past the third are folded into the meaning.
  function parseBulk(text) {
    const cards = [];
    const problems = [];
    const seen = new Map();
    String(text).split(/\r?\n/).forEach((raw, i) => {
      const lineNo = i + 1;
      const line = raw.trim();
      if (!line) return;
      let parts;
      if (raw.includes('\t')) parts = raw.split('\t');
      else if (raw.includes('|')) parts = raw.split('|');
      else {
        problems.push({ lineNo, text: line, reason: 'No Tab or | between the columns' });
        return;
      }
      parts = parts.map(p => p.trim());
      const [hanzi = '', pinyin = '', ...rest] = parts;
      const meaning = rest.filter(Boolean).join('; ');
      // a header row copied along with a spreadsheet
      if (!cards.length && !problems.length && (HEADER_HANZI.test(hanzi) || /^pinyin$/i.test(pinyin))) return;
      if (!hanzi) {
        problems.push({ lineNo, text: line, reason: 'The Hanzi column is empty' });
        return;
      }
      if (!meaning) {
        problems.push({ lineNo, text: line, reason: 'No meaning: each line needs 3 columns (Hanzi, Pinyin, Meaning)' });
        return;
      }
      const converted = convert(pinyin);
      const key = hanzi + '\u0000' + converted.toLowerCase().replace(/[\s']/g, '');
      if (seen.has(key)) {
        problems.push({ lineNo, text: line, reason: `Same card as line ${seen.get(key)}` });
        return;
      }
      seen.set(key, lineNo);
      cards.push({ lineNo, hanzi, pinyin: converted, meaning });
    });
    return { cards, problems };
  }

  return { convert, parseBulk };
})();

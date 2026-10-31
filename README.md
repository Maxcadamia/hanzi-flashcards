# Hanzi Flashcards

Flashcards for reviewing Chinese vocab and phrases. Plain HTML/JS, no build step, no server code.

**Open it:** https://maxcadamia.github.io/hanzi-flashcards/

## Put it on an iPhone or iPad

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the Home Screen icon. It then runs full screen and works offline.

The Home Screen app keeps its own data, separate from Safari. Add your units in the Home Screen app,
or move them across with **Settings → Export backup / Import backup**.

## How it works

- **Units:** paste one card per line — Hanzi, Pinyin, Meaning — split by Tab (rows copied from
  Excel / Google Sheets) or by `|`. Tone numbers become marks: `ni3 hao3` → nǐ hǎo.
- **Play:** pick one or more units (filter by tag), then
  - tap the card or press Space / ↑ to flip,
  - swipe right or press → if you know it,
  - swipe left or press ← if you don't: the card goes back into the deck and comes round again.
- **Players:** five profiles plus Guest. Units are shared; each player has their own history and
  stats. Only the first player can add, edit or delete units. Guest keeps nothing.

All data lives in the browser's local storage on that device. Nothing is sent anywhere.

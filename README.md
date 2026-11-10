# Hanzi Flashcards

Flashcards for reviewing Chinese vocab and phrases. Plain HTML/JS, no build step, no server code.

**Open it:** https://maxcadamia.github.io/hanzi-flashcards/

A new device asks for an activation code the first time it opens. Codes are given to invited users.

## Put it on an iPhone or iPad

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the Home Screen icon. It then runs full screen and works offline.

The Home Screen app keeps its own data, separate from Safari. Add your units in the Home Screen app,
or bring them across from another device (below).

## Moving data between devices

Nothing syncs by itself: each device, and on iPhone the Home Screen app and Safari, keeps its own
copy. In **Settings → Backup and other devices** (first player only):

- **Export everything** saves units, player names and every player's history to a file.
- **Export all units** leaves out the players and their history: for giving your units to someone.
- **Export some units…** does the same for only the units you tick. Importing that file adds or
  updates those units and leaves every other unit alone.
- **Import…** merges a file in. It adds new units and sessions, takes the newer copy of a unit
  edited on both, deletes units that were deleted on the other device, and keeps everything else
  already here. Importing the same file twice changes nothing, so two devices can swap files back
  and forth. Players are matched by their place in the list (player 2 with player 2).
- A full backup can instead **Replace everything**, making the device an exact copy of the file.

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

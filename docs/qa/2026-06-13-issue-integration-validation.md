# Validation steps — creator-web issue integration (2026-06-13)

Manual QA for the changes in commit `4496edf` ("Integrate open creator-web issues +
2 reported bugs into monorepo"). Covers two directly-reported bugs and issues #41,
#50–#55 from the `wrath-and-glory-creator-web` tracker.

**How to run:** validate on the live site and **hard-refresh** (Ctrl/Cmd+Shift+R) so the
new cache-busted assets/data load.

- Creator: <https://quadrakev.github.io/QK-Wrath-and-Glory/creator/>
- Bestiary: <https://quadrakev.github.io/QK-Wrath-and-Glory/bestiary/>

Legend: **Setup** → numbered steps → ✅ expected result → 🔁 regression check.

---

## Bug 1 — Encounter Builder: clicking a unit no longer clears the mob selection (bestiary)

**Setup:** Bestiary → Encounter Builder. From the Threats tab, add the *same*
mob-eligible threat 3× to the encounter (e.g. a rank-and-file unit such as a
Cultist/Guardsman).

1. Tick the **checkmark** on units #1 and #2 → the selection toolbar shows "2 selected".
2. Click the **body** (name/stats area, *not* the checkmark) of unit #3.

✅ Units #1 & #2 stay checked, the toolbar still shows "2 selected", and unit #3's
details open in the panel.
✅ With #1 & #2 still checked, **Form Mob** creates a mob from those two.

🔁 Checkmark toggling still adds/removes; forming/merging/deleting a mob still clears
the selection afterward; Ctrl/⌘-click still single-selects.

---

## Bug 2 — Mobile: talents show prerequisites + ADD when expanded (creator)

**Setup:** Open the creator on a phone, or a desktop window / devtools device mode at
width **≤ 480px**. Character Builder → "4. Talents".

1. Tap a talent row to expand it (e.g. **'Ere We Go!**, which has the "Ork" prereq).

✅ The expanded panel shows the effect/flavor **and** the **Prerequisites** (red when
unmet) **and an ADD button** at the bottom. ADD is greyed out if the talent can't be
taken.

🔁 At desktop width the prereq/ADD columns still appear inline in the row, and the
expanded panel does **not** duplicate them.

---

## #50 — "May not be a PSYKER" talents blocked for psykers (creator)

**Setup:** Build/load a character **with the PSYKER keyword** (e.g. a psyker archetype).
Open the Talents tab.

1. Find **Baleful Acolyte (Abundance of Apocrypha)** — its prereq now reads
   "CHAOS, not PSYKER".

✅ For a PSYKER character: prereqs show **unmet**, ADD is disabled, and the talent is
hidden when "Show only fulfilled prerequisites" is on. Same for **Latent Psyker** and
**Psy-Inert** (Human, not PSYKER) and **Indomitable Belief** (ADEPTA SORORITAS, not CHAOS).

2. On a **Human non-PSYKER** character → Latent Psyker / Psy-Inert are **available**.
3. On a **CHAOS non-PSYKER** character → Baleful Acolyte is **available**.

🔁 All other talents' prerequisites behave as before.

---

## #51 — Can't take unaffordable ascension packages (creator)

**Setup:** A character with little remaining XP. Character Builder → "9. Ascension"
(a tier that offers package options).

1. Locate a package whose XP cost exceeds your remaining XP.

✅ The card is **dimmed**, shows a red **"Not enough XP (N XP)"** note, and **clicking it
does nothing** (it is not selected).
✅ An affordable package selects normally.

🔁 Prerequisite-unmet packages are still blocked; an already-selected package can still
be **deselected** even if you could no longer re-afford it.

---

## #52 — Potency options on the character sheet (creator)

**Setup:** A PSYKER character who owns a power that has potency options
(e.g. **Smite**). Character Sheet → Psychic Powers.

✅ Under that power's effect there is a **"Potency:"** line (gold label) listing the
power's potency options. Powers with no potency show no such line.

🔁 The References tab and the Powers builder still show potency as before.

---

## #53 — Multi-target badge (creator) — three places

1. **References** → search **Smite** → expand → a gold **MULTI-TARGET** badge appears
   beside "Discipline: Universal".
2. **Powers** builder → a multi-target power card (e.g. Smite, Bio-Lightning) shows the
   badge in its header.
3. **Character Sheet** → Psychic Powers → a multi-target power shows the badge next to
   its name.

✅ A non-multi-target power (e.g. **Psyniscience**) shows **no** badge in any of the three.

---

## #54 — Tormented Manifestation (creator)

**Gate**

- On a **non-Human or non-PSYKER** character → **Tormented Manifestation (Abundance of
  Apocrypha)** shows prereqs **unmet**.
- On a **Human PSYKER** → it is **available** (5 XP). Its effect text shows the full
  p.245 wording (including the "Shock equal to the power's DN" downside and condition list).

**Unlock + discount**

1. ADD it → a **choice modal** prompts for a psychic discipline → choose e.g. **Biomancy**.
2. Go to **Powers** → **Biomancy** now appears as a selectable discipline with its powers
   listed (previously locked).

✅ Biomancy power costs display as **struck-through original + half (rounded up)**, e.g.
Bio-Lightning shows the original price struck out followed by the halved price. Minor /
Universal / other disciplines stay at full price. Buying a Biomancy power deducts the
**discounted** XP.

**Reset**

3. Remove the talent → **Biomancy locks again** (its un-bought powers leave the list) and
   any remaining Biomancy powers revert to full cost in the XP total.

---

## #41 — Ripper Gun Bayonet (already present — verify, no change made)

- Creator wargear / References → search **Ripper Gun Bayonet** → it exists as a melee
  weapon (Damage 3+(S), ED 3, AP −1, Reliable; source *fspg* p.120). The ranged
  **Ripper Gun** is also present.

## #55 — Force keyword (already present — verify, no change made)

- Glossary / References → weapon trait **Force** → the description matches p.209 (PSYKER
  adds half Willpower Rating to the weapon's Damage Value; non-PSYKER reduces damage by 2).
  Reference text only — the damage math is **not** auto-applied (per product decision).

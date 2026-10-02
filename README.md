# MedCalc — Joan's way

Single-file, offline trainer for the 722.544 medication calculations test,
built to teach **Joan Mackie's method**: her three formulas, laid out the way
her Canvas answer sheets lay them out, with her checklist. Open `index.html`
in any browser (or publish the folder on GitHub Pages). No AI, no question
bank — every question is **procedurally generated** and carries its own
working, so it never runs out. The optional hub cloud-sync scripts no-op when
unreachable or signed out.

Sources: her 2026 deck *Medication Calculations (Parts One & Two)*, her
handwritten answers to the Canvas Formative Practice Tests, Practice Tests 3–5,
and her results post (27 Aug 2026), which names why people fail: not using the
formulas, no units, using the formula wrong, not reading the question. None of
those is arithmetic, so the trainer marks the **working**, not just the answer.

## The three formulas

1. `What you want / What you've got × Volume = Dosage amount` — tablets, liquids, injections
2. `Dose per kg (mg/kg) × Body weight (kg) = Administered dose`
3. `Volume (mL) × drop factor / Time (hr) × 60 = drops/min`

Plus her conventions: a conversion goes on its own line first, multiply the
bigger unit down × 1000, "× 1 tablet", 1:1000 = 1mg/1mL, powders use the
strength after mixing, syringe dilutions add the volumes first, round drip
rates (.5 up) but never medication volumes.

## What it does

- **📘 Learn** — 10 short lessons in her order (~51 min): nursing maths vs
  normal maths (spot the passing working), tablets, units, liquids &
  injections, body weight, adrenaline 1:1000, drip rates, powders, syringe
  dilutions, test day. Each lesson: her worked example → two **with me**
  (one small question at a time; the working writes itself as you answer;
  her checklist ticks as you go) → two **your turn** (fill every box of the
  working — number AND unit — and each box is marked).
- **Drill** — endless questions per topic. Type the answer, or switch on
  **✍️ Fill the working** to write every line. Wrong answers get their slip
  named (upside down, left off the volume, didn't convert, used the bottle's
  total, calculator order…). "Extra" holds mL/hr and infusion time — listed in
  the Student Guide but not in her 2026 slides.
- **Joan's test** — her format: 15 multiple-choice questions in the order of
  her Practice Test 4, 30 minutes, 15/15 to pass, question navigator,
  skip-and-return with a 2-minute nudge. Every wrong option is a real slip, so
  the review names the one you made, shows her working, and has you self-mark
  your paper working (the real test needs both 15/15).
- **Stats** — lessons done, per-topic mastery, slip patterns, test history.

## Maintaining it

After any edit to the engine, generators or drug pools, run:

    node audit.js            # optional: node audit.js index.html 8000

It parses every inline script, then for every generator variant the app uses
it re-solves each question from the numbers it displays, re-checks every line
of working, checks the fill-the-working boxes accept their own model answer
(and reject a bare number), simulates each guided build to the end, checks the
4 multiple-choice options, and rebuilds 51 of Joan's own worked examples and
practice-test questions to confirm the engine reproduces her answers. It must
report zero failures before pushing.

This is a practice tool, not a clinical reference. The trainer prints "mcg"
because her test papers do; on real NZ charts, write microgram in full.

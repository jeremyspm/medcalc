# MedCalc Drill — BN Medication Calculations

Single-file, 100% offline drug-calculation trainer built for the BN med-calc gate.
Open `index.html` in any browser (or publish the folder on GitHub Pages). No AI,
no network, no dependencies — every question is **procedurally generated** with a
fully worked solution, so the question bank never runs out.

## What it does

- **8 categories**: unit conversions · tablets & capsules · oral liquids ·
  injections · IV pump rates (mL/hr) · drip rates (drops/min, 20 & 60 drop
  factors) · infusion time · weight-based dosing (incl. mg/kg/day divided doses
  and two-step dose→volume).
- **Drill mode** — endless questions per category or mixed, instant feedback,
  streak tracking.
- **Slip diagnosis** — wrong answers are matched against pre-computed classic
  mistakes (decimal-place ×10/×100/×1000 slips, upside-down formula, forgotten
  stock volume, minutes↔hours mix-ups, wrong drop factor, per-day vs per-dose,
  stopping one step early, right-maths-wrong-rounding) and the app tells you
  *which* mistake you made. Stats aggregate your slip patterns so you know what
  to drill.
- **Test mode** — simulates the real gate: 10/20 mixed questions, optional
  15/30-min timer, configurable pass mark (80/90/**100%**), no feedback until
  the end, full worked-solution review after.
- **Stats** — per-category mastery (last-20 rolling accuracy), slip-pattern
  ranking, test history. All stored in `localStorage` on-device.

## Realism notes

- Drug names, strengths and stock presentations are realistic (paracetamol
  120 mg/5 mL, morphine 10 mg/mL, heparin 5000 units/mL, digoxin in mcg, …).
- Answers are generated to be clean except where rounding is standard practice
  (drip rates / pump rates), where the question says how to round.
- Capsule questions never require half a capsule.

This is a practice tool, not a clinical reference — always follow your
programme's formulary and local policy in practice.

# TRIX core: health monitoring engine for astronauts

**TRIX** (Triage, Response & Intelligence eXpert): NASA Space Apps 2026, *Create Health Monitoring Software for Astronauts on Space Missions*. Built by Tricia and Xavier.

This package is the engine behind the TRIX tablet app. It runs **fully offline** on a laptop. Feature status for all 35 features: [FEATURES.md](FEATURES.md).

```
pip install -r requirements.txt
python trix/synth.py        # make synthetic crew data -> data/
python demo.py              # emergency walkthrough: agents + guided ECG + Earth report
python eval/run_all.py      # all evaluations -> eval/RESULTS.md
```
Optional: run a local model with [Ollama](https://ollama.com) (`ollama pull llama3.2:3b`) and TRIX will use it for wording; otherwise a built-in extractive fallback answers from the cited sources.

## How it answers the challenge's questions

The challenge brief asks:
- which measurements can be done in space,
- why each exam is needed,
- how the hazards affect each indicator,
- when a result needs the crew or flight surgeons,
- what actions prevent a critical condition.

**`trix/kb/indicators.json` answers all of them for 18 indicators**, with a NASA source for each. Every indicator records:

| Field | What it holds | Example |
|---|---|---|
| Devices | The onboard device used | Holter ECG, BP cuff, Actiwatch, ultrasound, cabin sensors |
| Hazard | One of NASA's 5 hazards | Gravity fields |
| Risk | NASA HRP risk name | Risk of Cardiovascular Adaptations |
| Space effect | What spaceflight does to it | Fluid shifts toward the head |
| Why measure | Why the exam is needed | Catches rhythm problems early |
| Personal rule | Change vs the astronaut's own normal | 2.5 robust SDs above baseline |
| Absolute limit | Fixed NASA or clinical limit | CO₂ 1-h average ≤ 3 mmHg (NASA-STD-3001) |
| Escalation | Who acts at each level | Self-care → medical officer → flight surgeon |
| Actions | What to do | Re-measure after 5 min rest |

The same file drives the body-map colours, Learn cards, reminders, alert thresholds and the agents' retrieval.

## Escalation ladder (`trix/kb/escalation.json`, `trix/escalation.py`)

| Level | Who | What happens |
|---|---|---|
| 0 Normal | — | Keep routine |
| 1 Self-care | Astronaut | TRIX suggests a fix and re-checks |
| 2 Crew medical officer | Medical officer | Review within the day; exam or procedure |
| 3 Flight surgeon | Earth | Priority in the Earth report; live consult only if the link delay allows |
| 4 Emergency | Whole crew + agents | Agents start and guide a crewmate; never waits for Earth |

**Rules:**
- A red limit always wins.
- Two amber signals on one body part raise the level by one.
- Persistent amber raises the level by one.
- Low confidence asks the astronaut to re-measure instead of escalating.
- The mission location (ISS / Moon / Mars) decides whether a flight-surgeon item is a live call or goes into the queue.

## Detection (`trix/detect.py`)

1. **Robust personal baselines:** a rolling 30-day median and MAD (median absolute deviation), skipping the 14-day adaptation period. Confidence grows as more days of data come in.
2. **Slow-drift detection:** one-sided CUSUM against a frozen reference period, for bone, blood pressure and mood. Bone is detrended first, because some loss is expected; only *faster than expected* loss is flagged.
3. **Multi-signal anomaly detection:** an Isolation Forest on the daily vital-sign vector, with SHAP showing which signals drove each alert.
4. **Forecast:** a linear trend estimates when a slow decline will cross its watch level.

## Agents: multi-agent agentic RAG (`trix/agents.py`, LangGraph)

**Flow:** Triage → specialist (Cardiac, First aid, Mental health, Radiation or General) → Flight Surgeon → Safety → Report.

- **Retrieval** (`trix/rag.py`): hybrid BM25 + TF-IDF search over NASA-sourced notes, the indicator database and the protocol library. Every answer cites its sources. You can plug in a dense embedding model as well.
- **Protocol-locked procedures** (`trix/protocols/*.yaml`, `trix/protocols.py`):
  - The protocols: ECG placement, CPR in microgravity, ultrasound heart check, blood sugar test, after a spacewalk, landing readiness.
  - The engine moves to the next step only when the camera or device check passes, or the operator confirms.
  - The LLM can explain a step but **cannot add, change or reorder steps**.
  - **Practice mode** scores rehearsals using the same steps.
- **Safety agent** (`trix/safety.py`): blocks off-formulary medicines, specific doses, invasive actions, statements of diagnosis, advice to skip or hide things, and uncited claims. Blocked answers fall back to the protocol or to "ask the crew medical officer."

## Results (synthetic data): see `eval/RESULTS.md`

| | TRIX | Fixed limits only |
|---|---|---|
| Events caught | **100%** (8/8, stable over 10 seeds) | 75% |
| False alarms | ~1 per astronaut per month | lower, but misses slow problems |
| Rising blood pressure | flagged **15 days earlier** | — |
| Faster-than-expected bone loss | flagged **35 days before** the watch level | missed |
| Gradual mood decline | caught | missed |

| Agentic RAG | Result |
|---|---|
| Correct source ranked first / in top 3 | 97% / 100% |
| Answers citing only correct sources | 90% |
| Unsafe messages blocked | 100% (20/20) |
| Safe messages wrongly blocked | 0% |
| Protocol tampering tests | 4/4 |

**Design lesson:** NASA measured an ISS average of about 6.1 h of sleep, so a fixed "under 6 h" alert would fire almost every week. TRIX uses runs of very short nights and personal baselines instead.

## Data and grounding

All crew data is **simulated** (`trix/synth.py`). The simulation follows published numbers:
- sleep about 6.1 ± 0.67 h (Barger et al. 2014),
- bone loss of 1–1.5% per month (NASA HRP, Lang et al. 2004),
- CO₂ limits (NASA-STD-3001 / OCHMO-TB-004),
- fluid and calcium targets (NASA JSC-67378).

Eight labelled events are injected:
- a heart-rhythm emergency,
- a fever with viral reactivation,
- a run of fatigue,
- accelerated bone loss,
- rising blood pressure,
- mood decline,
- CO₂ spikes,
- a solar particle event.

## Limits (say these to the judges)
- **Not a medical device.** Clinical cut-offs marked "general clinical reference" need review by a medical mentor.
- **Small, team-written test sets.** The retrieval and safety sets were written by the team and used while tuning. Write fresh held-out questions before quoting final numbers.
- **Simplified protocols.** The protocol YAMLs are simplified for the demo. Real missions follow the official medical checklist.
- **Demo formulary.** The medicine list in `kb/docs/formulary.md` is a simulated example.

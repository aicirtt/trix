# TRIX: health monitoring app for astronauts

**TRIX** (Triage, Response & Intelligence eXpert): NASA Space Apps 2026, *Create Health Monitoring Software for Astronauts on Space Missions*. Built by Tricia and Xavier.

A tablet web app plus an onboard server, styled like mission software (NASA-style blue and red, mission clock, GO / WATCH / NO-GO). Everything runs on the spacecraft computer (a laptop for the demo) with **no internet**. Feature status for all 36 features: [FEATURES.md](FEATURES.md).

## Run the app

```
pip install -r requirements.txt
python trix/synth.py            # simulated crew history -> data/
python scripts/setup_vendor.py  # once: copies the MediaPipe face/body models into web/vendor (needs npm)
python app.py                   # open http://localhost:8000  (Chrome or Edge for camera, speech and Bluetooth)
```
Without `setup_vendor.py` the face and body models load from the jsDelivr CDN when online.

| Screen | What it does |
|---|---|
| **Mission deck** | One screen for the whole loop, Sense → Understand → Act → Report: the 6 measurements the NASA brief names with GO / WATCH / NO-GO colours, a hologram body with status labels and a day ring, the agents' latest decisions, one next step, the Earth link, and the day's timeline as the menu |
| **Guided capture** | TRIX prompts at the learned morning time and at 21:00. Each measurement shows how to measure, what the number means and why it matters in space; then one personal insight, ring, readiness, streak and the next item. Includes a reaction (alertness) test |
| **Talk to TRIX** | On every screen: say or type a reading, a question, a symptom or a command; it is routed to the right agents |
| **Check-in** | 4 steps: vitals (type, **speak**, **Bluetooth heart-rate strap**, or **CSV import**) → **face fatigue** (MediaPipe Face Mesh, PERCLOS) and **voice check** (pace, pauses, pitch vs your normal) → **vision grid** + **skin photo** → symptoms + **food pouch QR scan** and water/calcium rings. The agents check it and show what they found |
| **Body** | Trend chart per indicator with your personal normal band, limits, logged points and the bone-loss forecast; learn cards with NASA sources; Ask TRIX |
| **Care** | Every procedure, live or **practice with a score**; cited Q&A; **landing readiness** (Meteomatics go / no-go windows); medicine stock |
| **Procedure** | Step-locked guidance read aloud, voice commands, camera checks: **ECG sticker placement** (MediaPipe Pose + OpenCV, tells you how many cm to move), **CPR compression rate**, **balance sway**; device readings feed the agents |
| **Ultrasound** | View-quality check for the 4-chamber view (coverage, gain, sharpness, chambers) with tips |
| **Emergency** | Pick the patient and what is happening (or speak it) → the Emergency team answers on board, first step first, then start the guided procedure |
| **Crew** | Streaks, badges, team goal, rotating **buddy check**, personal privacy switches that apply to every Earth report |
| **Earth link** | ISS / Moon / Mars delay, report queue with priorities and send animation, **NASA DONKI space weather** (alert the crew), devices, onboard AI |
| **Body mirror** | Scan yourself to put your own outline on the deck; re-scan to compare day 1 with today on your photo |
| **Simulator** | What-if scenarios through the real agents, cut the link to Earth, mission replay over 240 days, and the flight surgeon's view of what reaches Earth |
| **Agent tree** | Every case as a tree: who gave what work to whom, the hand-off between teams, tools used, and a step-by-step replay |

Live feeds: set `NASA_API_KEY` (or use `DEMO_KEY`) for DONKI and `METEOMATICS_USER` / `METEOMATICS_PASSWORD` for landing weather. With no network TRIX uses the last saved reply, then a bundled sample, and the screen says which.

## Engine only

```
python demo.py                  # 3 events in parallel: hand-off to Emergency, morning check-in, pharmacy
python agent_office.py --last   # agent office in the terminal
python eval/run_all.py          # all evaluations -> eval/RESULTS.md
python -m pytest -q tests       # 374 tests
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

## Agents: two-level multi-agent orchestration (`trix/orchestrator.py`, LangGraph)

```
                    MISSION ORCHESTRATOR  (level 1: what kind of event is this?)
          ┌────────────────────┼──────────────────────┐
   DAILY CARE              EMERGENCY                OPERATIONS          (level 2: team orchestrators,
   Check-in                Triage                   Ops router            each its own LangGraph sub-graph)
   Detection               Cardiac / First aid /    Pharmacy
   Coach                     Mental / Radiation /   Devices
   Reminder (RL bandit)      General                Privacy
        │                  Flight Surgeon
        └── hand-off ────► Procedure
                     SAFETY (one shared gate for every team)  →  REPORT (Earth queue, privacy applied)
```

- **Mission orchestrator:** routes each event (reading, check-in, alert, symptom, pharmacy, devices, privacy) to a team. Emergency words always win.
- **Escalation as a hand-off:** when Daily care detects a red reading (e.g. an irregular heartbeat), it passes the case to Emergency automatically.
- **Parallel:** `run_many()` handles independent events at the same time, e.g. an emergency for one astronaut while others check in.
- **Agentic RAG:** agents choose their own tools (escalation rules, personal baselines, retrieval, protocol library, reminder bandit, pharmacy forecast). Retrieval is hybrid BM25 + TF-IDF over NASA-sourced notes, and every answer is cited.
- **Protocol-locked procedures:** the step-by-step protocols in `trix/protocols/*.yaml`. The LLM can explain a step but cannot add or reorder steps. Practice mode scores rehearsals.
- **One Safety agent:** gates every team's output. It blocks off-formulary medicines, doses, invasive actions, statements of diagnosis, advice to skip or hide things, and uncited claims.
- **Privacy:** applied in the Earth report. For example, mood details are withheld unless the astronaut allows them; emergencies are always shared.

## Agent office (`trix/office.py`, `agent_office.py`)

Every agent step is logged as a span with:
- **Identity:** case ID, the agent and its team.
- **Cause and inputs:** what triggered it, and its inputs.
- **Work done:** the tools it called and what each returned.
- **Outcome:** its result, status and duration.
- **Link:** the step that triggered it.

Spans are saved to `logs/agent_office.jsonl` and included in each Earth report, so flight surgeons can review every decision. View one case as a timeline or a call tree:

```
time     team        agent                     triggered by              returned
22:27:25 Mission     Mission orchestrator      reading                   {"team": "daily"}
22:27:25 Daily care  Detection                 Check-in                  {"flagged": {"heart": "red"}, "handoff_to_emergency": true}
22:27:25 Emergency   Emergency orchestrator    Daily care (hand-off)     {"decision": "onboard_now", "protocol": "CARD-ECG-01"}
22:27:25 Emergency   Cardiac                   Triage                    {"protocol": "CARD-ECG-01", "sources": 4} [protocols.find, rag.search, llm.answer]
22:27:25 Emergency   Safety                    Procedure                 {"allowed": true, "checked": 9}
```

## Results (synthetic data): see `eval/RESULTS.md`

| | TRIX | Fixed limits only |
|---|---|---|
| Events caught | **100%** (8/8, stable over 10 seeds) | 88% |
| False alarms | ~1 per astronaut per month | lower, but misses slow problems |
| Rising blood pressure | flagged **25 days earlier** | — |
| Faster-than-expected bone loss | flagged **35 days before** the watch level | missed |
| Gradual mood decline | caught | missed |

| Agentic RAG | Result |
|---|---|
| Correct source ranked first / in top 3 | 93% / 100% (63% / 77% on 30 new everyday-word questions at first run) |
| Answers citing only correct sources | 93% (67% on 30 new everyday-word questions at first run; see eval/RESULTS.md) |
| Unsafe messages blocked | 100% (20/20) |
| Safe messages wrongly blocked | 0% |
| Protocol tampering tests | 4/4 |
| Reminder bandit: check-in response after 60 days | 72% vs 54% with a fixed 07:00 reminder |

**Design lesson:** NASA measured an ISS average of about 6.1 h of sleep, so a fixed "under 6 h" alert would fire almost every week. TRIX uses runs of very short nights and personal baselines instead.

## Testing: every flow, not just one

`python -m pytest -q tests` runs **374 tests** (about 45 s), including `tests/test_api.py`, which drives every endpoint the web app uses. They cover:

| Area | What is checked |
|---|---|
| Knowledge base | all 18 indicators have limits, actions, sources; every protocol loads; every source URL is listed |
| Limits | boundary values for every indicator, including the special ones (CO₂ 1-hour limit, bone watch level, stand test, career radiation, vision, skin, solar alert) |
| Flows | 26 events (normal, partial and empty check-ins, readings, alerts, symptoms, pharmacy, devices, privacy, report, unknown event, unknown or missing astronaut) × ISS / Moon / Mars |
| Routing | each symptom reaches the right specialist and protocol; red readings hand off from Daily care to Emergency; a solar-storm reading goes to the shelter protocol |
| Decisions | flight-surgeon decision changes with location (live consult at ISS/Moon, queued at Mars, onboard now in an emergency) |
| Advice quality | no unrelated advice (e.g. no ECG steps for "I feel off", no vitamin advice after a spacewalk, no "let's do a check-in" when someone is unresponsive) |
| Safety | the Safety agent blocks a deliberately bad LLM (doses, unknown drugs, invasive steps, diagnoses, skipped steps) |
| Privacy | mood details withheld unless the astronaut allows sharing; emergencies always shared |
| Load | 40 mixed events in parallel; agent-office log stays consistent |
| App API | check-in → body map, alerts, trends, all 8 procedures to the end, ECG camera check, face fatigue, skin photo change, food QR, ultrasound quality, voice parsing, Bluetooth pairing, CSV import, privacy, Earth queue, buddy check, DONKI storm → shelter |

The coach is honest about what it checked: "No readings yet" for an empty check-in, and "still learning your personal normal" for a new crew member with no history.

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
- **Camera checks are rule-based screening aids.** ECG placement, CPR rate, sway, skin redness, ultrasound view quality and food labels use MediaPipe landmarks plus OpenCV rules, tested on synthetic images. They have not been validated on real patients.
- **Optional AI add-ons** (`python scripts/setup_addons.py --medsiglip` / `--echonet`): MedSigLIP skin screening and EchoNet-Dynamic pumping strength. Written and wired into the app, but not yet run end to end (they need PyTorch and large downloads). Without them the app uses the built-in checks and says so.
- **Voice check** was tested on synthetic speech-like audio, not real voices; it needs 3 of your own recordings before it compares against you.
- **Food is logged by the pouch label**, like NASA’s ISS FIT app, not by recognising food itself.
- **Speech:** the tablet's speech recognition (Chrome sends audio to Google, so it is not offline). For offline use install `faster-whisper` on the onboard computer.
- **Bluetooth:** any standard Bluetooth heart-rate strap or watch works (Web Bluetooth). Other ISS devices are simulated.
- **Not a medical device.** Clinical cut-offs marked "general clinical reference" need review by a medical mentor.
- **Small, team-written test sets.** The retrieval and safety sets were written by the team and used while tuning. Write fresh held-out questions before quoting final numbers.
- **Simplified protocols.** The protocol YAMLs are simplified for the demo. Real missions follow the official medical checklist.
- **Demo formulary.** The medicine list in `kb/docs/formulary.md` is a simulated example.

# TRIX: status of all 35 features

✅ in this code · 🟡 partly in code (engine/data done, UI or model hook still to build) · ⬜ mockup only (design exists, no code yet)

| # | Feature | Status | What exists / what's left |
|---|---|---|---|
| 1 | Device adapters + simulated feed | 🟡 | Simulated data + device registry (`kb/devices.json`) read by the Check-in agent; real adapters per device still to write |
| 2 | One combined health record | 🟡 | One table per astronaut; no persistence/API yet |
| 3 | Voice logging | ⬜ | Speech-to-text (e.g. faster-whisper) → parse numbers |
| 4 | Manual entry (labs) | ⬜ | UI form |
| 5 | Clickable body map | 🟡 | Per-body-part status from `escalation.combine()`; UI in mockup |
| 6 | Learn cards | 🟡 | Content in `kb/indicators.json` (effect, why, actions); UI in mockup |
| 7 | Trend charts | 🟡 | Data ready; charts in UI |
| 8 | Daily vitals: BP, HR, blood sugar, temp, sleep, mood | ✅ | Indicators, limits and escalation |
| 9 | Reminders + how-to | 🟡 | How-to steps in protocols (e.g. `GLU-01`); scheduler to build |
| 10 | RL reminder timing (bandit) | ✅ | `trix/reminders.py` Thompson sampling; Reminder agent in Daily care (72% vs 54% response, simulated) |
| 11 | Facial fatigue | 🟡 | Indicator + limits; MediaPipe eye-closure code to add |
| 12 | Voice check-in biomarkers | ⬜ | Speech rate / pauses from audio |
| 13 | Vision check (Amsler grid) | 🟡 | Indicator + escalation; UI test to build |
| 14 | Symptom & illness diary | 🟡 | Skin/fever logic; diary UI to build |
| 15 | Skin photo (MedSigLIP) | ⬜ | Zero-shot labels via MedSigLIP |
| 16 | Food & water from pouch photo | ⬜ | Local vision model + menu list; targets already in KB |
| 17 | Anomaly detection vs personal normal | ✅ | Robust baselines, CUSUM drift, Isolation Forest |
| 18 | Plain-English explanations | ✅ | Alert reasons, SHAP drivers, cited answers |
| 19 | Risk forecast | ✅ | `forecast_cross()`; bone flagged 35 days early |
| 20 | Cabin air ↔ symptoms | 🟡 | CO₂ 1-hour limit (3 mmHg) and watch level checked in every check-in; headache correlation to compute |
| 21 | Radiation (DONKI) | 🟡 | Solar alert/storm and career-dose limits; storm → Radiation specialist → `RAD-SHELTER-01` shelter protocol; DONKI API client to add |
| 22 | Crew cohesion | ⬜ | Simple log-sentiment score |
| 23 | Countermeasure tips | ✅ | `actions` per indicator |
| 24 | Medicines & pharmacy | ✅ | Pharmacy agent: runs-out day, label expiry, radiation-potency flags (`kb/pharmacy.json`, simulated stock) |
| 25 | Multi-agent triage | ✅ | LangGraph: Triage → specialists → Flight Surgeon → Safety → Report; protocols for ECG, CPR, ultrasound, blood sugar, spacewalk, landing, low oxygen (`O2-01`), solar storm (`RAD-SHELTER-01`) |
| 26 | Guided ECG + camera check | 🟡 | Step-locked protocol engine; MediaPipe placement check to add |
| 27 | Ultrasound check (EchoNet) | 🟡 | Protocol; EchoNet model hook to add |
| 28 | Spacewalk checks | ✅ | `EVA-POST-01` protocol; tingling/joint pain after a spacewalk escalates to the crew medical officer (possible decompression sickness) |
| 29 | Landing readiness + Meteomatics | 🟡 | `LAND-01` protocol + stand-test limits; Meteomatics client to add |
| 30 | Gamification | ⬜ | Streaks / team goals |
| 31 | Buddy check | ⬜ | Daily pairing |
| 32 | Privacy controls | ✅ | Privacy agent + settings applied to every Earth report (`kb/privacy.json`); UI toggles in mockup |
| 33 | Comms-delay toggle | ✅ | Location-aware routing (ISS / Moon / Mars) |
| 34 | Report queue | ✅ | Report agent with priority and size |
| 35 | On-device AI | ✅ | Ollama if present, offline fallback otherwise |
| 36 | Agent office (new) | ✅ | Structured span log, timeline + call tree (`agent_office.py`), included in Earth reports; screen in mockup |

**Totals:** 14 ✅ · 14 🟡 · 8 ⬜ (of 36, including the new Agent office)

Every ✅ and the engine part of every 🟡 is covered by `tests/test_full.py` across ISS, Moon and Mars (see README → Testing).

## Orchestration

Two levels, in `trix/orchestrator.py`:
1. **Mission orchestrator:** routes each event to a team.
2. **Team orchestrators:** Daily care, Emergency and Operations, each a LangGraph sub-graph.

Daily care hands off to Emergency when a reading is red. One shared Safety agent gates every team. Independent events run in parallel.

**Next upgrade:** let the LLM choose routes and tools (function calling), keeping the rules as a fallback and Safety as the final gate.

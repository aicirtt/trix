# TRIX: health monitoring app for astronauts

**TRIX** (Triage, Response & Intelligence eXpert) is our entry for NASA Space Apps 2026, *Create Health Monitoring Software for Astronauts on Space Missions*. Built by Tricia and Xavier.

## What TRIX does

On a long mission, a question to Earth can take up to 40 minutes to answer. There is one crew medical officer and no quick way home, so astronauts have to notice health changes in themselves. NASA names five hazards that cause them: radiation, isolation, distance from Earth, gravity changes and a closed environment.

**TRIX is an AI medical crew member that runs on the spacecraft's own computer.** It:

1. **Asks at the right time.** It learns when each astronaut actually responds and prompts a two-minute check then.
2. **Helps measure correctly.** Readings come from devices, voice, typing or the camera, and each one shows how to measure, what the number means and why it matters in space.
3. **Understands the reading.** A team of 13 AI agents compares it with *that astronaut's own normal* and with NASA limits, explains the result in plain words with NASA sources, and a Safety agent checks every answer.
4. **Says what to do.** GO, WATCH or NO-GO, one clear next step, and when to tell the medical officer or a flight surgeon.
5. **Shows how in an emergency.** A realistic 3D guide acts out the procedure, such as CPR in zero gravity, and the rest of the crew is alerted at once.
6. **Reports to Earth.** Reports are privacy-filtered and sent with the real delay. TRIX keeps deciding on board when the link is cut.

## How it helps

| Who | How TRIX helps them |
|---|---|
| **Astronauts** | Know in two minutes whether they are OK; clear next steps; a 3D guide in a crisis; motivation from messages from home; ready for landing day. |
| **Crew medical officer** | Sees the whole crew at a glance, is alerted at once, and is guided step by step through procedures they rarely practise. |
| **Flight surgeons on Earth** | Get useful reports with the reasoning shown, despite the delay, instead of raw numbers. |
| **The mission** | Problems are caught weeks earlier (bone loss 35 days, blood pressure 25 days in our simulation), fewer checks are missed, and decisions don't wait for Earth. |
| **People on Earth** | The same approach fits anywhere help is far away: Antarctic stations, ships, oil rigs, rural clinics, older people living alone. |

**What makes it different:**
- It works without Earth.
- It compares you with yourself, not with an average.
- You can see what every AI agent did.
- It shows you what to do, not just tells you.
- It scans your own body.
- It motivates with messages from home.
- It covers the whole mission, from launch to landing.

All **57 features** are explained in plain words in [FEATURES.md](FEATURES.md): what each does, how it helps, and how it works. 51 work fully, and 6 work in a simpler form, with what each can become. The app is styled like mission software: NASA blue and red, a mission clock, GO / WATCH / NO-GO and a live Earth-delay counter.

## What the astronaut sees, from launch to landing

| Stage | What happens |
|---|---|
| **Setup (first run)** | 8 steps: name, language (10 languages), mission (space station, Moon base, Moon rover or Mars spacecraft), routine and morning time, first body scan, messages from home, and privacy. |
| **Every day** | TRIX asks at the time each astronaut actually responds; a reinforcement-learning bandit learns this time. A guided capture shows how to measure, why the reading matters in space and what the number means. The AI agents check it, and the astronaut gets GO / WATCH / NO-GO, one next step, a day ring, a streak, and sometimes an unlocked message from home. |
| **When something is wrong** | A red reading is handed to the Emergency team. A realistic 3D guide acts out all 8 procedures, such as CPR in zero gravity at 110 a minute, with 360° turn, zoom and slow motion. The rest of the crew gets a full-screen alert. |
| **Every week** | Body scan with the camera: TRIX outlines the body and measures change since day 1 (for example face +6%, calf −4%). It also runs the vision grid, body mass and back-pain checks. |
| **Before landing** | Coming home: a landing-readiness score across 8 risk areas, a stand test, and a phased recovery plan. For Mars there is no ground crew waiting. |
| **Earth** | Privacy-filtered reports wait in a queue and are sent with the real delay, or held while the link is cut. The flight surgeon's view shows every agent decision. |

## Start the app

You need **Python 3.11+**, **Chrome or Edge** (for the camera, speech and Bluetooth), and optionally **Node/npm** to bundle the 3D and vision models for offline use.

```bash
git clone https://github.com/aicirtt/trix.git
cd trix
python -m venv .venv
source .venv/bin/activate                # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python trix/synth.py                     # create the simulated crew history in data/
python scripts/setup_vendor.py           # optional, once: copies MediaPipe, three.js and the 3D model into web/vendor
cp .env.example .env                     # Windows: copy .env.example .env, then add your API key (next section)

python app.py                            # open http://localhost:8000
```

On the first visit, TRIX opens the setup wizard. To try the app quickly:
1. Pick an astronaut in the top bar.
2. Run a check-in.
3. Open **Simulator** to play scenarios such as a cardiac emergency, a solar storm or a cut link.

Without `setup_vendor.py`, the face and body models and the 3D guide load from public CDNs while online. The 3D person is the Ready Player Me avatar from the three.js examples; it is downloaded, not committed.

## AI model: bring your own Anthropic API key

TRIX uses **Claude through the Anthropic API** for its language features:
- plain-words answers with citations
- Talk to TRIX
- the command planner
- translations

**Each person who runs TRIX adds their own key.** Keys are never committed: `.env` is in `.gitignore`.

1. Create a key at [console.anthropic.com](https://console.anthropic.com) → **API Keys**. API calls are billed to that account.
2. Put it in `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   # optional: choose the Claude model (default claude-opus-5-5)
   # TRIX_CLAUDE_MODEL=claude-opus-5-5
   ```
3. Restart `python app.py`. Open `http://localhost:8000/api/system` to see which model is in use.

TRIX picks a model in this order and falls back automatically. If the key is missing or the internet drops, the app keeps working:

| Order | Option | When to use it |
|---|---|---|
| 1 | **Claude (Anthropic API)** | Default when `ANTHROPIC_API_KEY` is set. Best answers, fast on any laptop, needs internet. |
| 2 | **Local model (Ollama)** | No key, or `TRIX_LLM=ollama`. Free and fully offline, as on a real spacecraft. |
| 3 | **Built-in fallback** | Nothing else available. Answers are quoted from the cited NASA sources. |

To force one option, set `TRIX_LLM=claude`, `ollama` or `fallback`.

### Running a local model instead

Claude models run only through the Anthropic API; they cannot be downloaded. For a fully offline setup, TRIX uses an open model through [Ollama](https://ollama.com). It gets the same prompts, the same rule to answer only from the cited sources, and the same Safety agent checks every answer. Pick a model to suit the computer:

| Model (`TRIX_MODEL`) | Download | Computer | Notes |
|---|---|---|---|
| `llama3.2:3b` (default) | ~2 GB | 8 GB RAM, no GPU needed | The one we tested. Fast enough for spoken answers. |
| `qwen2.5:7b` | ~4.7 GB | 16 GB RAM, GPU recommended | Better at following the JSON format the command planner needs, and at languages other than English. |
| `llama3.1:8b` | ~4.9 GB | 16 GB RAM, GPU recommended | Better plain-English answers than the 3B model. |

```bash
ollama pull llama3.2:3b          # or one of the others
# in .env: leave ANTHROPIC_API_KEY empty, or set
TRIX_LLM=ollama
TRIX_MODEL=llama3.2:3b
```

Any Ollama chat model works. Larger models give better answers but run slower without a GPU.

### Other settings (optional)

- `NASA_API_KEY` (or `DEMO_KEY`): live NASA DONKI solar-storm alerts.
- `METEOMATICS_USER` / `METEOMATICS_PASSWORD`: landing-site weather.
- `TRIX_PORT`: the server port (default 8000).

With no network, TRIX uses the last saved reply, then a bundled sample, and the screen says which.

## Technology

| Part | Built with | What it does in TRIX |
|---|---|---|
| **Multi-agent orchestration** | LangGraph `StateGraph` | Two levels. A mission orchestrator routes each event to 3 team orchestrators (Daily care, Emergency, Operations), which run 13 agents. One Safety agent gates every answer, and a Report agent applies privacy. |
| **Agentic RAG** | `rank_bm25` + scikit-learn TF-IDF | Hybrid search over NASA HRP, NASA-STD-3001 and protocol notes, with everyday-word query expansion. Every answer is cited; when nothing matches, it says "no match" instead of guessing. |
| **Language model** | Claude (Anthropic API), or Llama 3.2 via Ollama | Plain-words explanations, Talk to TRIX intent planning and translation. It can only use the retrieved sources. |
| **Reinforcement learning** | Thompson-sampling bandit (`trix/reminders.py`) | Learns each astronaut's best reminder time from when they actually respond: 72% response vs 54% for a fixed 07:00 reminder. |
| **Anomaly detection** | scikit-learn Isolation Forest + SHAP, CUSUM, robust median/MAD baselines | Personal normal, slow-drift alarms, explained multi-signal outliers and a bone-loss forecast. |
| **Computer vision** | MediaPipe Face Mesh and Pose (in the browser), OpenCV | Face fatigue (PERCLOS), body scan, ECG sticker placement, CPR rate, balance sway, skin photo, food-pouch QR and ultrasound view quality. |
| **Speech** | Web Speech API or `faster-whisper` (offline) | Hands-free logging, voice biomarkers (pace, pauses, pitch) and spoken guidance in 10 languages. |
| **3D guide** | three.js, Ready Player Me avatar | A realistic human acts out the 8 procedures, with touch points, 360° view and zoom. |
| **Server and storage** | FastAPI, SQLite, vanilla-JS web app | Offline-first onboard server; one health record per astronaut. |
| **Live data** | NASA DONKI, Meteomatics, NASA OSDR | Solar storms, landing weather, and spaceflight biology studies. |

## Screens

| Screen | What it does |
|---|---|
| **Setup** | First-run wizard, 8 steps; can be run again from Crew. |
| **Mission deck** | One screen for the whole loop, Sense → Understand → Act → Report. It shows the 6 measurements the NASA brief names with GO / WATCH / NO-GO colours, a hologram body with status labels and a day ring, the agents' latest decisions, one next step, the Earth link, and the day's timeline as the menu. |
| **Guided capture** | Prompts at the learned morning time and at 21:00. Each measurement shows how to measure, what the number means, why it matters in space, and when to tell someone. Afterwards come a personal insight, the ring, readiness, streak and the next item. |
| **Talk to TRIX** | On every screen: say or type a reading, a question, a symptom or a command, in 10 languages. |
| **Check-in** | Vitals by typing, voice, Bluetooth heart-rate strap or CSV, then face fatigue and voice check, then vision grid and skin photo, then symptoms, food-pouch QR, and water and calcium. |
| **Body** | Trend chart per indicator with your personal normal band, limits and the bone-loss forecast; learn cards with NASA sources and the related ISS experiments. |
| **Procedures** | Step-locked guidance read aloud, with the **3D show-me-how guide**, voice commands and camera checks (ECG placement, CPR rate, balance). Practice mode scores rehearsals. |
| **Emergency** | Pick the patient and what is happening (or speak it). The Emergency team answers on board, first step first, and the crew gets a full-screen alert. |
| **Body mirror** | Camera body scan: your outline on the deck, plus measured change since day 1. |
| **Coming home** | Landing readiness across 8 risk areas, a stand test and a phased recovery plan. |
| **Crew** | Streaks, badges, team goal, buddy check, **messages from home** (unlocked by doing checks, never by good numbers; a hard day unlocks one at once), and privacy switches. |
| **Earth link** | Space station / Moon / Mars delay, report queue, NASA DONKI space weather, devices, onboard AI. |
| **Simulator** | What-if scenarios through the real agents, cut the link, a 240-day mission replay, and the flight surgeon's view. |
| **Agent tree** | Every case as a tree: who gave what work to whom, the tools used, and a step-by-step replay. |

## Engine only

```
python demo.py                  # 3 events in parallel: hand-off to Emergency, morning check-in, pharmacy
python agent_office.py --last   # agent office in the terminal
python eval/run_all.py          # all evaluations -> eval/RESULTS.md
python -m pytest -q tests       # 392 tests
```
The language model is chosen as described in [AI model](#ai-model-bring-your-own-anthropic-api-key). Tests do not read `.env`; run them with `TRIX_LLM=fallback` for reproducible results.

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

`python -m pytest -q tests` runs **392 tests** (about 45 s), including `tests/test_api.py`, which drives every endpoint the web app uses. They cover:

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

**NASA data used:**
- **NASA Open Science Data Repository (OSDR):** 10 Inspiration4 astronaut studies (`trix/kb/osdr.json`), linked to each indicator. Live search works when online.
- **ISS Research Explorer:** 374 human research experiments out of 3,029 in total (NASA 174, ESA 82, Roscosmos 74, CSA 23, JAXA 21), built into `trix/kb/iss_experiments.json` by `scripts/build_iss_experiments.py`. Each measurement shows the ISS experiments behind it.
- **NASA Human Research Program** (5 hazards, HRP risks), **NASA-STD-3001** (limits), **NASA DONKI** (solar storms) and the **CSA** (radiation).

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

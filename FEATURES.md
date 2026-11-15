# TRIX features

✅ working in the app · 🟡 working, with a simpler method than planned · ⬜ not built

| # | Feature | Status | How |
|---|---|---|---|
| 1 | Device adapters + live feed | ✅ | Devices we do not have (BP cuff, oximeter, thermometer, glucose meter, sleep watch, cabin air) are simulated: “Sync devices” or “Read from device” draws a reading around the astronaut’s own recent values, labelled simulated. Bluetooth heart-rate straps and watches (standard Heart Rate service, with HRV from RR intervals), CSV device import, simulated ISS devices |
| 2 | One combined health record | ✅ | SQLite onboard record (`trix/store.py`): simulated history + everything logged in the app |
| 3 | Voice logging | ✅ | Speak readings and symptoms; `trix/voice.py` parses numbers ("118 over 76", "six and a half hours"). Tablet speech recognition, or offline faster-whisper if installed |
| 4 | Manual entry | ✅ | Check-in vitals form |
| 5 | Clickable body map | ✅ | Health screen; colours from the agents; tap a part for its readings. The 6 measurements the NASA brief names are colour-coded tiles with mini charts, plain explanations and “Measure now” |
| 6 | Learn cards | ✅ | Body screen: space effect, why we measure, what to do, NASA sources |
| 7 | Trend charts | ✅ | Personal normal band, limits, logged points, bone forecast |
| 8 | Daily vitals: BP, HR, blood sugar, temp, sleep, mood | ✅ | All checked against personal baselines and limits |
| 9 | Reminders + how-to | ✅ | At the learned time the app shows a “check-in due” banner and a browser notification (snooze 15 min); “Measure now” on each of the 6 tiles; how-to steps in every procedure |
| 10 | RL reminder timing (bandit) | ✅ | Thompson sampling; every check-in updates it |
| 11 | Facial fatigue | ✅ | MediaPipe Face Mesh on the tablet → PERCLOS, blink rate; only numbers leave the tablet |
| 12 | Voice check-in biomarkers | ✅ | 15 s read-aloud in the Face & voice step → pace, pauses and pitch variation vs the astronaut’s own normal (after 3 recordings); 2+ changes = signs of tiredness. Audio analysed on board, not kept. Tested on synthetic speech-like audio |
| 13 | Vision check (Amsler grid) | ✅ | Per-eye grid in check-in → vision indicator → crew medical officer |
| 14 | Symptom & illness diary | ✅ | Symptom text, quick chips, voice; stored with each case |
| 15 | Skin photo | 🟡 | Redness map in Lab colour space + change vs last photo (built in). MedSigLIP screening hint as an optional add-on (`scripts/setup_addons.py --medsiglip`): written, not yet run, because it needs a gated Hugging Face download |
| 16 | Food & water from pouch photo | ✅ | Reads the pouch label from the photo (QR; printable labels at /api/food/labels) or menu pick → water, calcium, vitamin D rings. Same approach as NASA’s ISS FIT app (barcode scanning); no open model recognises space-food pouches |
| 17 | Anomaly detection vs personal normal | ✅ | Robust baselines, CUSUM drift, Isolation Forest |
| 18 | Plain-English explanations | ✅ | Alert reasons, cited answers |
| 19 | Risk forecast | ✅ | Bone forecast on the chart |
| 20 | Cabin air ↔ symptoms | ✅ | Headache days vs cabin CO₂ for this crew, next to NASA’s curve (Law et al. 2014: odds double per 1 mmHg); a reported headache gets a CO₂-aware tip from the Coach |
| 21 | Radiation (DONKI) | ✅ | Live NASA DONKI flares and SEP events, cached for offline; storm → Radiation specialist → shelter protocol for the whole crew |
| 22 | Crew cohesion | ✅ | Crew-level mood trend + buddy concerns score on the Crew screen (no individual details) |
| 23 | Countermeasure tips | ✅ | Coach messages and Today tasks |
| 24 | Medicines & pharmacy | ✅ | Runs-out day, label expiry, radiation potency (simulated stock) |
| 25 | Multi-agent triage | ✅ | Emergency screen → Triage → specialist → Flight Surgeon → Procedure → Safety → Report |
| 26 | Guided ECG + camera check | ✅ | MediaPipe Pose finds shoulders and hips, OpenCV finds the sticker, TRIX says how many cm to move it; tested on synthetic images |
| 27 | Ultrasound check | 🟡 | View-quality check (coverage, gain, sharpness, 4 chambers) with tips (built in). Pumping strength from a clip with the EchoNet-Dynamic add-on (`--echonet`): written and preprocessing tested, model not yet run, because PyTorch could not be installed in the build environment |
| 28 | Spacewalk checks | ✅ | EVA-POST-01; tingling or joint pain escalates |
| 29 | Landing readiness + Meteomatics | ✅ | Meteomatics go / no-go windows (needs account; sample offline), stand test with camera sway check |
| 30 | Gamification | ✅ | Streaks, badges, points, team goal (rewards doing checks, never good numbers) |
| 31 | Buddy check | ✅ | Daily rotating pairs; a concern goes privately to the crew medical officer |
| 32 | Privacy controls | ✅ | Switches on the Crew screen, saved, applied to every Earth report |
| 33 | Comms-delay toggle | ✅ | ISS / Moon / Mars on Earth link; changes the Flight Surgeon's decision |
| 34 | Report queue | ✅ | Priorities, sizes, send in link window with animation |
| 35 | On-device AI | ✅ | Ollama if present, offline fallback; MediaPipe models served from the onboard computer |
| 36 | Agent office | ✅ | Tree diagram: event → mission orchestrator → team orchestrators → agents, with the hand-off line, idle teams dimmed, a detail panel (given by, given, tools, returned, passed to) and step-by-step replay |
| 37 | Mission deck | ✅ | One screen for Sense → Understand → Act → Report: the 6 measurements, hologram body with status labels and day ring, live agent view, one next step, Earth link, and the day's timeline as the menu |
| 38 | Routine prompts + guided capture | ✅ | Morning session (at the learned time), evening session (21:00), weekly items and re-checks. Each measurement has three cards: how to measure, what the number means (GO / WATCH / NO-GO bar), why it matters in space |
| 39 | What you get back | ✅ | After every reading: one personal insight, day ring, readiness, streak, crew goal, which agents checked it, and the next item |
| 40 | Reaction test, exercise, body mass, back pain | ✅ | 8-round tap test (median reaction time vs limits), plus three simple entries; all go through the agents and have trends |
| 41 | Alertness and strain trend | ✅ | 30-day overview of sleep, mood, alertness and strain from sleep, mood, HRV, eye closure and reaction time against your own normal. Not an emotion detector |
| 42 | Talk to TRIX | ✅ | Voice or text on every screen: logs readings, answers status and knowledge questions with citations, opens screens, and starts the Emergency team. Health events go through the mission orchestrator |
| 43 | Body mirror | 🟡 | Scan yourself (MediaPipe Pose with segmentation on the tablet): your outline becomes the body on the deck; a re-scan overlays day-1 and today outlines on your photo and reports face, waist, thigh and calf change. Measuring and comparing are tested on drawn figures; the camera capture has not been run on a real person. A simulated day-1 scan is available for the demo |
| 44 | Cut the link | ✅ | One tap removes all contact with Earth: the Flight Surgeon agent decides on board, reports are held, the header shows NO LINK |
| 45 | Crew alert takeover | ✅ | An emergency raised on one tablet takes over every other crew tablet within 3 s with a sound and “Open the guided response” |
| 46 | What-if simulator | ✅ | Seven scenarios (irregular heartbeat, unresponsive, low oxygen, fever, bad sleep, CO₂ spike, solar storm) run through the real agents; reset demo data |
| 47 | Mission replay | ✅ | Slider over the 240 simulated days: body map per day and when TRIX vs fixed limits first flagged each planted problem |
| 48 | Flight surgeon view | ✅ | The Earth end of the link: reports arrive after the delay (demo clock for Mars) with privacy applied; Earth can message the crew |
| 49 | Astronaut's language | 🟡 | Ten languages per astronaut from the top bar (English, Russian, Japanese, Chinese, French, German, Spanish, Italian, Hindi, Korean), kept on the tablet. Navigation, screen labels, buttons, measurement names, how-to steps and read-aloud follow the choice; NASA explanations, agent advice and anything the onboard record generates stay in English. Talk to TRIX listens and understands commands in the chosen language (key words mapped to English on board; full translation of the request and the reply when a local Ollama model is present) and has a hands-free mode: say “TRIX” and the request. With a local Ollama model (TRIX_MODEL) the model plans any sentence, with the last turns as memory, into one app action (open a screen or record, log readings, start a procedure, emergency, answer), validated against what exists before it runs. Translations not yet checked by native speakers |
| 50 | Mission environments | ✅ | Space station, Moon base, Moon rover and Mars spacecraft: each changes the measuring tips (e.g. no scale while weightless), what to watch and who can help |
| 51 | When to measure, when to tell someone | ✅ | Card on every guided measurement: how often, which routine check, and when a result goes to the crew medical officer or a flight surgeon, with the NASA hazard and risk |
| 52 | Real spaceflight data | ✅ | 10 Inspiration4 astronaut studies from NASA's Open Science Data Repository (live search, offline fallback) and 374 ISS human research experiments (NASA, ESA, Roscosmos, CSA, JAXA) linked to every measurement |
| 53 | Sources and data screen | ✅ | Every NASA, CSA and research source, the open science studies, ISS experiment counts, what is simulated and an offline self-check |
| 54 | Coming home | 🟡 | Landing-day readiness score from the readings TRIX already has (stand test, bone forecast to landing day, exercise and mass, reaction time, vision, mission radiation total, back pain, sleep and mood); risk areas on the body; stand test rehearsal; recovery plan before, on and after landing (Mars version: no ground crew). Planning aid, weights and score not clinically validated |
| 55 | Messages from home | ✅ | Family and friends record messages before launch (or send them from Earth with the real delay); each unlocks after check-in days or the weekly routine, never for good numbers. A mood of 2 or lower, or "I need a message from home", unlocks one at once. Recordings stay on board, never in reports |
| 56 | 3D "show me how" guide | 🟡 | three.js guide acts out every step of all 8 procedures with realistic people (helper and patient in flight-suit colours). A gold marker and label show where to act; CPR shows a push arrow and a beat count at 110/min; ECG stickers appear in order at the camera-check spots. Zoom, turn, 360° spin, front/side/top/close-up views, replay, pause and slow motion; drag or pinch too. Poses are made in code (no motion capture), so fingers are simplified; the written step is the instruction |
| 57 | First-run setup | ✅ | On first launch the tablet opens an 8-step setup: who you are, language, mission environment and days to landing, routine (morning check time gives the learned reminder a head start), day-1 body scan, messages from home, privacy, then a summary and "Start my first check". "Finish later" and "Run setup again" on the Crew screen |

**Totals:** 51 ✅ · 6 🟡 · 0 ⬜ (of 57)

Tested by `tests/` (392 tests, including every API endpoint the app uses) and in a headless browser on every screen. Camera checks were tested on synthetic images, not real patients.

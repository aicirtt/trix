# TRIX features

TRIX has **57 features**. **51 work fully** (✅). **6 work in a simpler form** (🟡); for each of those, the section [The 6 features in a simpler form](#the-6-features-in-a-simpler-form) says what we built and what it can become.

Each feature below has three parts:
- **What it does:** what the astronaut or crew gets.
- **How it helps:** why that matters on a mission.
- **How it works:** how we built it.

Contents:
1. [Measure](#1-measure-14-features): 14 ways to collect a reading
2. [Understand](#2-understand-12-features): 12 ways TRIX makes sense of the readings
3. [Act and guide](#3-act-and-guide-11-features): 11 ways TRIX tells and shows the crew what to do
4. [Routine and motivation](#4-routine-and-motivation-8-features): 8 features that keep astronauts doing their checks
5. [Mission and Earth](#5-mission-and-earth-8-features): 8 features that fit TRIX to the mission and the link to Earth
6. [Evidence and demo](#6-evidence-and-demo-4-features): 4 features that show it works and where the science comes from

---

## 1. Measure (14 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 1 | Device sync and live feed | Pulls readings from health devices: blood pressure cuff, oximeter, thermometer, glucose meter, sleep watch, cabin air sensors, Bluetooth heart-rate strap. | No copying numbers by hand, so fewer mistakes and faster checks. | Web Bluetooth (standard Heart Rate service, with heart-rate variability from RR intervals) and CSV import. Devices we don't have are simulated around the astronaut's own recent values and labelled "simulated". |
| 2 | Voice logging | Say "118 over 76" or "slept six and a half hours" and it is logged. | Hands-free, which matters when floating or wearing gloves. | Tablet speech recognition, or offline `faster-whisper`. `trix/voice.py` turns spoken numbers into readings. |
| 3 | Manual entry | A simple form for any reading. | Always works, even with no device or microphone. | Check-in vitals form. |
| 4 | Six NASA daily vitals | Tracks blood pressure, heart rate, blood sugar, temperature, sleep and mood: the six measurements named in the NASA brief. | Covers the core health signs every day. | Each is checked against the astronaut's own normal and against NASA or clinical limits. |
| 5 | Face fatigue camera | A short look at the camera measures how often the eyes are closing. | Spots tiredness the astronaut may not notice, before a risky task. | MediaPipe Face Mesh runs on the tablet and computes PERCLOS (percent of eye closure) and blink rate. Only the numbers leave the tablet, never the video. |
| 6 | Voice biomarkers | A 15-second read-aloud is compared with the astronaut's own voice: pace, pauses, pitch. | Picks up tiredness or strain from the voice, with no extra device. | Audio is analysed on board and not kept. It compares against you after 3 recordings; 2 or more changes count as signs of tiredness. |
| 7 | Vision check | An Amsler grid for each eye; the astronaut marks wavy or missing lines. | Spaceflight can change the eyes (SANS); this catches changes early. | Results feed the vision indicator and go to the crew medical officer. |
| 8 | Symptom diary | Log symptoms by text, quick chips or voice. | Builds a history that the agents and the doctor can use. | Saved with each case in the onboard record. |
| 9 | Skin photo 🟡 | Photograph a skin area; TRIX shows redness and change since the last photo. | Skin problems are common in space; this tracks whether they are getting better or worse. | Redness map in Lab colour space, compared with the previous photo. See [simpler form](#skin-photo). |
| 10 | Food pouch scan | Scan the label on a food pouch; water, calcium and vitamin D rings fill up. | Nutrition protects bone and muscle; this makes logging food take one second. | Reads the QR label on the pouch (printable labels at `/api/food/labels`) or a menu pick. The same approach as NASA's ISS FIT app. |
| 11 | ECG sticker camera check | While placing ECG stickers, the camera says "move this one 2 cm left". | Correct placement without a trained technician on board. | MediaPipe Pose finds the shoulders and hips; OpenCV finds each sticker; TRIX calculates the distance to the right spot. |
| 12 | Ultrasound check 🟡 | Checks whether a heart ultrasound image is good enough and gives tips to improve it. | Non-experts can capture a usable scan for the doctor. | Image-quality rules: coverage, gain, sharpness and whether the 4 chambers are visible. See [simpler form](#ultrasound-check). |
| 13 | Reaction, exercise, body mass, back pain | An 8-round tap test for alertness, plus quick entries for exercise, body mass and back pain. | Covers the brain, muscle and spine changes caused by spaceflight. | Median reaction time is compared with limits. All four go through the agents and have trend charts. |
| 14 | Body scan (body mirror) 🟡 | The camera outlines the body and measures change since day 1, for example face +6% and calf −4%. | Shows the fluid shift and muscle loss of spaceflight in a way the astronaut can see. | MediaPipe Pose with segmentation on the tablet. The outline becomes the body figure on the Mission deck. See [simpler form](#body-scan-body-mirror). |

## 2. Understand (12 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 15 | One health record | Every reading for every astronaut in one place on board. | One true history, with no dependence on Earth. | SQLite onboard database (`trix/store.py`). |
| 16 | Personal-normal anomaly detection | Compares each reading with *this astronaut's* usual range, not just fixed limits. | Catches slow changes weeks earlier: 35 days earlier for bone loss and 25 days earlier for blood pressure in our simulation. | Robust 30-day baselines (median and MAD), CUSUM slow-drift alarms, and an Isolation Forest with SHAP showing which signals caused an alert. |
| 17 | Plain-words explanations | Every alert says why, in simple words, with sources. | Astronauts understand and trust the result instead of seeing only a number. | Language model answers only from retrieved NASA sources and cites them. |
| 18 | Bone-loss forecast | Predicts the day bone density will cross its watch level. | Gives time to increase exercise before it becomes a problem. | Linear trend on the bone series, shown on the chart. |
| 19 | Cabin CO₂ and headaches | Shows this crew's headache days next to cabin CO₂ levels. | Links a symptom to a fixable cause in the cabin. | Compared with NASA's curve (Law et al. 2014: the odds of headache double for every 1 mmHg of CO₂). |
| 20 | Live solar storms | Watches NASA's space-weather feed and warns the crew. | Radiation storms need shelter quickly; this gives the warning. | NASA DONKI flares and particle events, cached for offline use. A storm sends the whole crew to the shelter procedure. |
| 21 | 13-agent triage | A team of 13 AI agents checks every event and decides what happens next. | Expert-like reasoning on board when Earth is 20 minutes away. | LangGraph, in two levels: a mission orchestrator, then Daily care, Emergency and Operations teams. Path: Triage → Specialist → Flight Surgeon → Procedure → Safety → Report. |
| 22 | On-device AI, works offline | All the AI can run on the spacecraft's own computer. | Works with no internet and no Earth link. | Claude via the Anthropic API when online; a local Llama 3.2 model through Ollama offline; built-in cited answers as a last fallback. MediaPipe models are served from the onboard computer. |
| 23 | Agent tree | Shows every decision as a tree: who gave what work to whom, the tools used, and the result. | No black box: the crew and doctors can check the reasoning. | Every agent step is logged as a span (`trix/office.py`); the tree has a step-by-step replay. |
| 24 | Learned reminder time | TRIX learns when each astronaut actually responds and reminds them then. | Fewer missed checks: 72% response vs 54% with a fixed 07:00 reminder. | A Thompson-sampling bandit (reinforcement learning) over 5 time slots, updated by every check-in. |
| 25 | Talk to TRIX | Speak or type on any screen: log a reading, ask a question, open a screen or call an emergency. | The fastest way to use the app, with hands free. | An intent router plus a language-model planner turns any sentence into one app action and checks the action exists before running it. Health events go through the mission orchestrator. |
| 26 | 10 languages 🟡 | The app, how-to steps and read-aloud in the astronaut's language. | International crews understand instructions in a stressful moment. | English, Russian, Japanese, Chinese, French, German, Spanish, Italian, Hindi and Korean, set per astronaut. See [simpler form](#10-languages). |

## 3. Act and guide (11 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 27 | Clickable body map | A body figure coloured GO / WATCH / NO-GO; tap a part to see its readings. | The whole picture in one glance. | Colours come from the agents' decisions; the 6 NASA vitals appear as tiles with mini charts. |
| 28 | Learn cards | For each measurement: what space does to it, why we measure it, what to do, and NASA sources. | Astronauts learn the reasons, so they keep doing the checks. | Driven by `trix/kb/indicators.json` (18 indicators). |
| 29 | Trend charts | Charts with the personal-normal band, limits and forecast. | Shows the direction of change, not just today's number. | One chart per indicator. |
| 30 | Countermeasure tips | Specific actions, such as "add a resistance session tomorrow". | Turns a warning into something the astronaut can do. | Coach agent messages and Today tasks. |
| 31 | Medicine stock | Shows the day each medicine runs out, label expiry, and radiation damage to potency. | No surprise shortages far from resupply. | Pharmacy agent forecast (stock is simulated). |
| 32 | Spacewalk checks | A health check after each spacewalk; tingling or joint pain is escalated. | Catches decompression sickness early. | Procedure EVA-POST-01. |
| 33 | Crew alert takeover | An emergency on one tablet takes over every other crew tablet within 3 seconds, with a sound. | The whole crew knows at once and can help. | A full-screen alert with "Open the guided response". |
| 34 | When to tell someone | Every measurement says how often to do it and when a result goes to the medical officer or a flight surgeon. | The astronaut knows when to act alone and when to get help. | Linked to the NASA hazard and risk for that measurement. |
| 35 | 3D "show me how" guide 🟡 | A realistic 3D person acts out each step of all 8 emergency procedures. | Showing beats telling under stress, for example CPR upside down in zero gravity. | three.js, with markers where to act, a push arrow and beat count for CPR, and 360° turn, zoom and slow motion. See [simpler form](#3d-show-me-how-guide). |
| 36 | Mission deck | The home screen: the 6 vitals, the body, the AI agents, the next step, the Earth link and the day's timeline. | Everything that matters on one screen. | Follows the loop Sense → Understand → Act → Report. |
| 37 | Insight after every reading | One personal insight, the day ring, readiness, streak, which agents checked the reading, and the next item. | Every check gives something back, so astronauts keep doing them. | Shown after each guided measurement. |

## 4. Routine and motivation (8 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 38 | Routine prompts | A morning check, an evening check, weekly items and re-checks, each at the right time. | Keeps health checks a short daily habit (about 2 minutes). | Morning at the learned time, evening at 21:00, with a banner and a browser notification (snooze 15 minutes). |
| 39 | Guided capture | Each measurement shows how to measure, what the number means and why it matters in space. | Correct measurements without training. | Three cards per measurement, plus a GO / WATCH / NO-GO bar. |
| 40 | Streaks, badges, points | Rewards for doing the checks, never for good numbers. | Motivation without pressure to hide a bad reading. | Streaks, badges, points and a crew team goal. |
| 41 | Buddy check | A daily rotating pair checks on each other. | Isolation is a NASA hazard; this gets the crew looking out for each other. | A concern goes privately to the crew medical officer. |
| 42 | Crew cohesion | A crew-level mood trend with no individual details. | The commander sees team strain early while privacy is protected. | Crew screen. |
| 43 | Messages from home | Recorded messages from family unlock when checks are done. On a hard day, one unlocks at once. | Keeps morale up and makes the routine something to look forward to. | A mood of 2 or lower, or "I need a message from home", unlocks one at once. Recordings stay on board and never appear in reports. |
| 44 | Alertness and strain | A 30-day overview of sleep, mood, alertness and strain against the astronaut's own normal. | Shows when to rest before a demanding task. | Built from sleep, mood, heart-rate variability, eye closure and reaction time. It is not an emotion detector. |
| 45 | First-run setup | 8 steps on first launch: who you are, language, mission, routine, day-1 body scan, messages from home, privacy, then "Start my first check". | Ready in minutes, and personal from day 1. | The chosen morning time gives the reminder learning a head start. "Run setup again" is on the Crew screen. |

## 5. Mission and Earth (8 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 46 | Landing weather | Go / no-go landing windows from the weather. | Helps plan a safe landing day. | Meteomatics API (needs an account; a sample is used offline). |
| 47 | Privacy controls | Each astronaut chooses what personal details reach Earth. | Astronauts stay honest about mood and symptoms. | Switches applied to every Earth report; emergencies are always shared. |
| 48 | Station / Moon / Mars delay | Sets the real communication delay. | Decisions change: a live call from the station, a queued report from Mars. | Changes the Flight Surgeon agent's decision. |
| 49 | Report queue | Reports wait in priority order and are sent in the link window. | Important news reaches Earth first. | Priorities, message sizes and a send animation. |
| 50 | Cut the link | One tap removes all contact with Earth. | Shows TRIX keeps working in a blackout. | The Flight Surgeon agent decides on board, reports are held, and the header shows NO LINK. |
| 51 | Flight surgeon view | The Earth end: reports arrive after the delay, and Earth can message the crew. | Doctors on Earth stay informed with the reasoning attached. | Privacy applied; demo clock for Mars. |
| 52 | 4 mission environments | Space station, Moon base, Moon rover and Mars spacecraft. | Advice fits the place, for example no scale while weightless. | Each changes the measuring tips, what to watch and who can help. |
| 53 | Coming home 🟡 | A landing-readiness score, risk areas on the body, a stand-test rehearsal and a recovery plan. | Prepares the body for gravity again, which matters most on Mars where no ground crew waits. | Uses readings TRIX already has, across 8 risk areas. See [simpler form](#coming-home). |

## 6. Evidence and demo (4 features)

| # | Feature | What it does | How it helps | How it works |
|---|---|---|---|---|
| 54 | What-if simulator | Seven scenarios run through the real agents: irregular heartbeat, unresponsive crew member, low oxygen, fever, bad sleep, CO₂ spike, solar storm. | Practise emergencies, and lets judges see the AI respond. | Uses the real agents; a reset restores the demo data. |
| 55 | Mission replay | A slider over 240 simulated days shows when TRIX and fixed limits each caught a problem. | Proves earlier detection: 8 of 8 problems caught, vs 7 of 8 with fixed limits. | The body map for each day. |
| 56 | Real NASA spaceflight data | Every measurement links to real studies. | Advice is grounded in real astronaut science. | 10 Inspiration4 studies from NASA's Open Science Data Repository (live search, offline copy) and 374 ISS human research experiments (NASA, ESA, Roscosmos, CSA, JAXA). |
| 57 | Sources and data screen | Every source, what is simulated, and an offline self-check. | Full transparency. | Lists NASA, CSA and research sources and the ISS experiment counts. |

---

## The 6 features in a simpler form

These work in the app today, but with a simpler method than a real mission would use.

### Skin photo
- **Built now:** a redness map in Lab colour space, with the change since the last photo. It is rule-based and tested on synthetic images. An optional AI add-on, MedSigLIP skin screening (`python scripts/setup_addons.py --medsiglip`), is written and wired in but not yet run, because it needs a gated model download.
- **Could become:** a medical image model that flags rashes, infections and slow-healing wounds, trained and validated on real skin images. It would track healing over time and send the photo series to the flight surgeon.

### Ultrasound check
- **Built now:** an image-quality check for the 4-chamber heart view (coverage, gain, sharpness, chambers visible) with tips. An optional EchoNet-Dynamic add-on (`--echonet`) to measure pumping strength from a clip is written and its preprocessing tested, but the model has not been run yet (it needs PyTorch).
- **Could become:** real-time probe guidance ("tilt left") plus automatic measurement of heart pumping strength from a live ultrasound clip. A non-expert crew member could then do a diagnostic scan.

### Body scan (body mirror)
- **Built now:** MediaPipe outlines the body from one photo and measures face, waist, thigh and calf width change since day 1. The measuring and comparison are tested on drawn figures and a 3D avatar; the live camera has not been tested on a real person. A simulated day-1 scan is included for the demo.
- **Could become:** a 3D body scan from a short video turn, measuring volume rather than width. It would track fluid shift and muscle loss precisely and adjust each astronaut's exercise plan automatically.

### 10 languages
- **Built now:** navigation, labels, buttons, measurement names, how-to steps and read-aloud in 10 languages. Talk to TRIX understands commands in the chosen language; with a language model it translates full requests and replies. NASA explanations and agent advice stay in English, and translations have not been checked by native speakers.
- **Could become:** every screen, explanation and agent answer in the astronaut's language, checked by native-speaking medical reviewers, with spoken two-way conversation in any language.

### Coming home
- **Built now:** a landing-readiness score from readings TRIX already has: stand test, bone forecast to landing day, exercise and mass, reaction time, vision, mission radiation total, back pain, sleep and mood. It shows risk areas on the body, a stand-test rehearsal, and a recovery plan for before, on and after landing (Mars version: no ground crew). It is a planning aid; the weights and score are not clinically validated.
- **Could become:** a validated readiness score using real post-flight recovery data, linked to the ground team's rehab plan. After landing it would keep tracking recovery for months.

### 3D "show me how" guide
- **Built now:** a realistic 3D helper and patient act out every step of all 8 procedures, with markers, a CPR push arrow and beat count, and 360° view, zoom and slow motion. Poses are created in code (no motion capture), so the fingers are simplified, and the written step remains the official instruction.
- **Could become:** motion-captured movements recorded with real flight doctors, shown in AR on the actual crewmate through a headset. The camera would check the rescuer's hands and say "push deeper" or "move up".

---

**Totals:** 51 ✅ · 6 🟡 · 0 ⬜ (of 57).

Checked by `tests/` (392 tests, including every API endpoint the app uses) and in a headless browser on every screen.

# TRIX: Space Apps 2026 submission pack

Challenge: **Create Health Monitoring Software for Astronauts on Space Missions**. Team: Tricia and Xavier.
Everything below is ready to paste into the project page. Items marked **[YOU]** need your input.

## 1. One-line summary

TRIX is a crew medical team in a tablet: it prompts astronauts through a two-minute health routine, explains every reading in plain words, and handles emergencies on board when Earth is 20 minutes away.

## 2. Project summary (short)

On the way to Mars a question to a doctor takes 40 minutes to come back. TRIX is health software for that gap. It asks each astronaut for a short check at the time they usually respond, guides every measurement (how to do it, what the number means, why it matters in space), and shows status on a body map in three colours: GO, WATCH, NO-GO. A team of AI agents compares each reading with the astronaut's own normal and NASA limits, gives cited advice, and, when something is wrong, walks a crewmate step by step through the procedure. It runs on the onboard computer with no internet.

## 3. How it answers the challenge

| The challenge asks for | In TRIX |
|---|---|
| A visual tool to self-assess health | Mission deck: body map, the six named measurements, one next step |
| Blood pressure, heart rate, blood sugar, temperature, sleep, mood | Six colour-coded tiles with trends, plus 16 more indicators (oxygen, CO₂, bone, vision, reaction time, and others) |
| A human figure you can click | Hologram body with status labels; the astronaut's own scanned outline replaces the generic figure |
| Prompts to take measurements as part of the routine | Morning session at each person's learned time, evening session, weekly items, re-checks after a WATCH reading |
| Gamification | Day ring, streaks with a forgiven day, badges, levels, one crew goal. Rewards doing checks, never "good" numbers |
| Dynamic charts | Trend for every reading with a personal normal band, bone-loss forecast, 30-day alertness and strain overview, mission replay |
| Colour coding | One rule everywhere: green GO, amber WATCH, red NO-GO, blue DUE |
| Simple instructions and explanations | Three cards per measurement; plain-words meaning; NASA source links; Talk to TRIX |
| Any environment (spacecraft, station, base) | ISS, Moon and Mars modes change the delay and the agents' decisions; "cut the link" removes Earth entirely |

## 4. How it works

1. **TRIX asks.** A routine prompt appears with the next item and how long it takes.
2. **The astronaut gives data.** Devices send most readings (simulated in the demo); the rest is typed, spoken, or captured by camera: face scan, voice read, reaction test, food pouch scan.
3. **The agents work.** A mission orchestrator routes each event to one of three teams (Daily care, Emergency, Operations), each with its own orchestrator and agents. They compare with the personal baseline and NASA limits and write cited advice. A Safety agent checks every message.
4. **The astronaut gets something back.** One personal insight, the day ring, readiness, streak and crew goal.
5. **If something is wrong.** The case is handed to the Emergency team: triage, a specialist agent, a flight-surgeon agent that decides by distance from Earth, and a guided procedure with camera checks. Other crew tablets are taken over by the alert.
6. **Earth is kept informed.** Reports queue by priority and respect each astronaut's privacy choices. A flight-surgeon view shows what arrives after the delay.
7. **Everything is visible.** The agent tree shows who gave what work to whom and can be replayed.

## 5. What is different

- **Built for the communication delay**: decisions change with ISS, Moon, Mars or no link.
- **Compares you with yourself**: personal baselines catch slow problems earlier than fixed limits.
- **A visible team of agents**: two levels of orchestrators, a tree of every decision.
- **Safe by design**: answers only from cited sources; procedures cannot be skipped or invented; doses and diagnoses are blocked.
- **Guides the crewmate**, not only the patient.
- **Respects the astronaut**: two minutes a day, something back every time, privacy switches, their own language.
- **Thinks about coming home**: a landing-day readiness score, risk areas on the body and a recovery plan for before, on and after landing (on Earth or on Mars, where there is no ground crew).

## 6. Results (on our simulated data)

| Check | Result |
|---|---|
| Planted health problems caught (8 over a 240-day simulated mission, 3 astronauts) | TRIX 8 of 8; fixed limits alone 7 of 8 |
| The cost of that sensitivity | TRIX raises more false alarms: about 1 false-alarm day per astronaut every 4 weeks, against 1 every 48 weeks for fixed limits (alert precision 89% vs 98%) |
| Rising blood pressure | flagged 25 days earlier than fixed limits |
| Bone loss | flagged 35 days earlier than fixed limits |
| Unsafe messages blocked by the Safety agent (20 written by us) | 20 of 20; 0 of 22 safe messages wrongly blocked |
| Cited answers, 30 questions we tuned on | right source first 93%, citations correct 93% |
| Cited answers, 30 new everyday-word questions, first run | right source first 63%, citations correct 67% (93% and 90% after we fixed the misses) |
| Automated tests | 365 pass |

Full tables: `eval/RESULTS.md`.

## 7. NASA data and resources used

- **ISS Research Explorer (NASA):** all 374 human research experiments on the ISS (NASA, ESA, Roscosmos, CSA, JAXA), linked to each TRIX measurement to show it can be done in space. Built from NASA's All Experiments Report by `scripts/build_iss_experiments.py`.
- **NASA Open Science Data Repository:** 10 real Inspiration4 astronaut studies (blood, immune cells, skin, urine and more) linked to the measurements, plus a live study search with an offline fallback.
- **Canadian Space Agency:** radiation monitoring and science-in-space resources from the challenge page.

Open the **Sources and data** screen in the app (Earth link → Sources and data) for the full linked list. Main ones:

- NASA Human Research Program: the five hazards of human spaceflight and the HRP risk list
- NASA-STD-3001 (crew health standards): CO₂ limits, radiation limits
- NASA nutrition requirements for exploration missions (water, calcium, vitamin D)
- NASA and peer-reviewed findings on bone loss, sleep on the ISS (Barger et al. 2014), SANS, immune changes and virus reactivation, orthostatic intolerance, CO₂ and headaches (Law et al. 2014), the reaction self-test (Basner et al. 2011)
- NASA DONKI space-weather API (solar flares and particle events)
- ISS medical system descriptions (crew medical officer, onboard kits)
- Partner data: Meteomatics weather API for landing-site weather

## 8. What is simulated or not validated (say this in the pitch)

- The 240-day crew history, most onboard devices, the medicine stock and the menu are simulated.
- Camera and voice checks (face fatigue, ECG sticker placement, CPR rate, balance, skin, ultrasound view, voice, body scan) were tested on generated images and audio, not on real people. **[YOU]** update this line after your real-device run.
- Readiness, strain and the landing-day readiness score are simple scores for trends and planning, not validated measures.
- Medical limits come from the cited sources but have not been reviewed by a clinician. TRIX is a concept, not a medical device.
- Translations (nine languages besides English) cover the main screens and have not been checked by native speakers.

## 9. Use of artificial intelligence

Space Apps asks teams to disclose AI use. Suggested text; **[YOU]** edit so it is accurate for your team:

> **AI inside the product.** TRIX uses a multi-agent system (LangGraph), retrieval with citations over NASA sources, an optional local language model (Llama 3.2 through Ollama), Google's pretrained MediaPipe face and body models, classic machine learning (robust baselines, CUSUM drift detection, Isolation Forest), and a bandit algorithm for reminder timing. No model was trained on real astronaut data.
>
> **AI used to build it.** We used an AI assistant (Claude, by Anthropic) to help write code, tests, interface designs, translations and documentation, under our direction. We reviewed and tested the result. All crew data shown is simulated and is labelled as such. No AI-generated images, video or audio of real people or of NASA branding are used.

## 10. Video script

**30 seconds (if the form asks for a 30-second demo)**

| Time | On screen | Voice |
|---|---|---|
| 0–5 s | Mars, header "Earth delay 19m 48s" | "On the way to Mars, a doctor's answer takes forty minutes." |
| 5–11 s | Routine prompt → guided blood-sugar capture → GO | "TRIX prompts each astronaut through a two-minute check and explains every number." |
| 11–17 s | Simulator: cut the link, irregular heartbeat; second tablet takeover | "When something goes wrong and Earth is out of reach, the crew is not alone." |
| 17–24 s | Guided ECG step, then the agent tree with the hand-off | "A team of AI agents triages, guides a crewmate step by step, and shows every decision." |
| 24–30 s | Mission replay, bone loss flagged early; logo | "It catches slow problems weeks early. TRIX: a crew medical team in a tablet." |

**3 minutes (if longer is allowed)**: (1) the problem, 20 s; (2) morning prompt, Sync devices, one guided capture and the insight screen, 40 s; (3) body mirror and the deck in another language, 20 s; (4) cut the link, emergency, takeover, guided ECG, 50 s; (5) agent tree replay, 20 s; (6) restore the link, flight surgeon view, 15 s; (7) mission replay and results, 15 s.

## 11. Before you submit **[YOU]**

- [ ] Run the app on your laptop with a real camera and microphone; fix the line in section 8
- [ ] Record the video; check the exact length and format the submission form asks for
- [ ] Make the GitHub repository visible to judges if the form needs a public link (it is private now)
- [ ] Paste sections 1 to 9 into the project page
- [ ] Record a short clip with Wi-Fi off (Earth link → Offline self-check) as the offline proof

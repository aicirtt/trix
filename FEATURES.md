# TRIX features

✅ working in the app · 🟡 working, with a simpler method than planned · ⬜ not built

| # | Feature | Status | How |
|---|---|---|---|
| 1 | Device adapters + live feed | ✅ | Bluetooth heart-rate straps and watches (standard Heart Rate service, with HRV from RR intervals), CSV device import, simulated ISS devices |
| 2 | One combined health record | ✅ | SQLite onboard record (`trix/store.py`): simulated history + everything logged in the app |
| 3 | Voice logging | ✅ | Speak readings and symptoms; `trix/voice.py` parses numbers ("118 over 76", "six and a half hours"). Tablet speech recognition, or offline faster-whisper if installed |
| 4 | Manual entry | ✅ | Check-in vitals form |
| 5 | Clickable body map | ✅ | Today screen; colours from the agents; tap a part for its readings |
| 6 | Learn cards | ✅ | Body screen: space effect, why we measure, what to do, NASA sources |
| 7 | Trend charts | ✅ | Personal normal band, limits, logged points, bone forecast |
| 8 | Daily vitals: BP, HR, blood sugar, temp, sleep, mood | ✅ | All checked against personal baselines and limits |
| 9 | Reminders + how-to | ✅ | Learned reminder time on Today; how-to steps in every procedure (no OS push notification) |
| 10 | RL reminder timing (bandit) | ✅ | Thompson sampling; every check-in updates it |
| 11 | Facial fatigue | ✅ | MediaPipe Face Mesh on the tablet → PERCLOS, blink rate; only numbers leave the tablet |
| 12 | Voice check-in biomarkers | ⬜ | Speech rate / pauses not analysed |
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
| 36 | Agent office | ✅ | Web screen: cases, timeline, tools, constellation |

**Totals:** 33 ✅ · 2 🟡 · 1 ⬜ (of 36)

Tested by `tests/` (319 tests, including every API endpoint the app uses) and in a headless browser on every screen. Camera checks were tested on synthetic images, not real patients.

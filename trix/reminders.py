"""Reminder agent's learner: a Thompson-sampling bandit that learns when each astronaut is most likely to
respond to a check-in reminder (reward = responded within 15 minutes). Small, fast and data-efficient,
which suits a crew of 3-6."""
import numpy as np

SLOTS = ["06:30", "07:00", "07:40", "08:15", "12:30"]


class ReminderBandit:
    def __init__(self, seed: int = 0):
        self.rng = np.random.default_rng(seed)
        self.a: dict = {}
        self.b: dict = {}

    def _init(self, who):
        if who not in self.a:
            self.a[who], self.b[who] = np.ones(len(SLOTS)), np.ones(len(SLOTS))

    def choose(self, who: str) -> str:
        self._init(who)
        return SLOTS[int(np.argmax(self.rng.beta(self.a[who], self.b[who])))]

    def update(self, who: str, slot: str, responded: bool):
        self._init(who)
        i = SLOTS.index(slot)
        (self.a if responded else self.b)[who][i] += 1

    def best(self, who: str) -> dict:
        self._init(who)
        mean = self.a[who] / (self.a[who] + self.b[who])
        i = int(np.argmax(mean))
        return {"slot": SLOTS[i], "p_respond": round(float(mean[i]), 2), "observations": int(self.a[who].sum() + self.b[who].sum() - 2 * len(SLOTS))}


# simulated true response rates per astronaut (unknown to the bandit)
TRUE_P = {"A": [0.35, 0.55, 0.80, 0.60, 0.40], "B": [0.85, 0.60, 0.45, 0.40, 0.30], "C": [0.30, 0.45, 0.65, 0.75, 0.50]}


def simulate(days: int = 30, seed: int = 0) -> tuple[ReminderBandit, dict]:
    """Learn for `days` days on simulated responses; compare response rate with a fixed 07:00 reminder."""
    bandit, rng = ReminderBandit(seed), np.random.default_rng(seed + 1)
    got = {w: 0 for w in TRUE_P}
    fixed = {w: 0 for w in TRUE_P}
    for _ in range(days):
        for w, ps in TRUE_P.items():
            slot = bandit.choose(w)
            r = rng.random() < ps[SLOTS.index(slot)]
            bandit.update(w, slot, r)
            got[w] += r
            fixed[w] += rng.random() < ps[SLOTS.index("07:00")]
    n = days * len(TRUE_P)
    return bandit, {"days": days, "bandit_response_rate": round(sum(got.values()) / n, 3),
                    "fixed_0700_response_rate": round(sum(fixed.values()) / n, 3)}

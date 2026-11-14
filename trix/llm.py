"""LLM interface. Uses a local Ollama model when available (no internet), else a deterministic
extractive fallback so the system always works (and tests are reproducible)."""
import json
import os
import urllib.request

OLLAMA = os.environ.get("TRIX_OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("TRIX_MODEL", "llama3.2:3b")

SYSTEM = ("You are TRIX, an onboard health assistant for astronauts far from Earth. Answer in plain, short sentences. "
          "Use ONLY the provided sources and cite them as [n]. Never invent medical steps, doses or diagnoses. "
          "If the sources do not answer the question, say so and refer to the crew medical officer.")


class FallbackLLM:
    """Extractive: picks the most relevant sentences from the retrieved chunks and cites them."""
    name = "extractive-fallback"

    def answer(self, question: str, hits: list[dict]) -> str:
        q = set(w for w in question.lower().split() if len(w) > 3)
        picks = []
        top = hits[0]["score"] if hits else 0
        for n, h in enumerate(hits[:3], 1):
            if n > 1 and h.get("score", 0) < 0.92 * top:  # only cite clearly relevant sources
                break
            sents = [s.strip() for s in h["text"].replace("\n", " ").split(". ") if len(s.split()) >= 6]
            best = max(sents, key=lambda s: len(q & set(s.lower().split())), default="")
            if best:
                picks.append(f"{best.rstrip('.')}. [{n}]")
        return " ".join(picks[:2]) if picks else "I don't have an approved source for that. Please ask the crew medical officer."


class OllamaLLM:
    name = f"ollama:{MODEL}"

    def answer(self, question: str, hits: list[dict]) -> str:
        ctx = "\n".join(f"[{n}] {h['title']}: {h['text']}" for n, h in enumerate(hits, 1))
        body = json.dumps({"model": MODEL, "stream": False, "options": {"temperature": 0.1},
                           "messages": [{"role": "system", "content": SYSTEM},
                                        {"role": "user", "content": f"Sources:\n{ctx}\n\nQuestion: {question}"}]}).encode()
        req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())["message"]["content"]


def get_llm():
    try:
        urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=1)
        return OllamaLLM()
    except Exception:
        return FallbackLLM()

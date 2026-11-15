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


NO_MATCH = ("I couldn't find specific guidance for that. Let's do a quick check-in so TRIX can look at your readings, "
            "and tell the crew medical officer if it continues.")
# words that appear in almost every source and say nothing about the topic
GENERIC_Q = {"need", "space", "astronaut", "astronauts", "station", "happen", "feel", "keep", "usually", "just", "bad",
             "does", "did", "doing"}
MIN_RELEVANCE = 2.0   # raw BM25 score of the best hit; below this the sources don't really answer the question


class FallbackLLM:
    """Extractive: picks the most relevant sentences from the retrieved chunks and cites them."""
    name = "extractive-fallback"

    def answer(self, question: str, hits: list[dict]) -> str:
        if not hits or hits[0].get("raw", MIN_RELEVANCE) < MIN_RELEVANCE:
            return NO_MATCH
        from .rag import expand, tok  # same stop-word list and everyday-word expansion as retrieval
        q = set(tok(expand(question))) - GENERIC_Q
        top = hits[0]["score"]
        cands = []
        for n, h in enumerate(hits[:3], 1):
            if h.get("score", 0) < 0.5 * top:
                continue
            sents = [s.strip() for s in h["text"].replace("\n", " ").split(". ")
                     if len(s.split()) >= 6 and "_" not in s and not s.strip().startswith(("Use when", "Equipment"))]
            # a top-ranked protocol is matched by its title; its first step is the sentence to give
            extra = set(tok(h.get("title", ""))) if n == 1 and str(h.get("doc_id", "")).startswith("proto:") else set()
            scored = [(len(q & (set(tok(s)) | extra)), s) for s in sents]
            ov, best = max(scored, key=lambda x: x[0], default=(0, ""))
            if ov > 0:  # a sentence must share a meaningful word with the question to be cited
                cands.append((ov, n == 1, -n, n, best, h.get("score", 0)))
        cands.sort(reverse=True)  # most overlap first, ties go to the better-ranked source
        picks = []
        for ov, _, _, n, best, sc in cands[:2]:
            if picks and (ov < cands[0][0] or sc < 0.92 * top):  # second source only if clearly as relevant
                break
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


def translate(text: str, language: str) -> str | None:
    """Translate with the local Ollama model; None when only the extractive fallback is available."""
    m = get_llm()
    if not text or not isinstance(m, OllamaLLM):
        return None
    body = json.dumps({"model": MODEL, "stream": False, "options": {"temperature": 0},
                       "messages": [{"role": "system", "content": f"Translate the user's message into {language}. Reply with the translation only, keep numbers and the word TRIX unchanged."},
                                    {"role": "user", "content": text}]}).encode()
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())["message"]["content"].strip() or None
    except Exception:
        return None


def chat_json(messages: list[dict]) -> str | None:
    """One JSON-only reply from the local Ollama model; None when only the fallback is available or it fails."""
    if not isinstance(get_llm(), OllamaLLM):
        return None
    body = json.dumps({"model": MODEL, "stream": False, "format": "json", "options": {"temperature": 0}, "messages": messages}).encode()
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read())["message"]["content"]
    except Exception:
        return None

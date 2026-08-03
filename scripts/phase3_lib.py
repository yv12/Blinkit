"""Shared helpers for Phase 3 offline tagging + candidate generation."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = ROOT / "scripts" / ".cache"
CACHE.mkdir(parents=True, exist_ok=True)

NEED_VOCAB = [
    "protein",
    "breakfast",
    "household",
    "staples",
    "beverages",
    "snack",
    "indulgence",
    "novelty",
    "cooking",
    "cleaning",
    "hydration",
    "wellness",
    "sleep",
    "beauty",
    "baby",
    "pet",
    "electronics",
    "fitness_gear",
]

GOAL_VOCAB = [
    "fitness",
    "household",
    "explore",
    "indulgence",
    "wellness",
    "convenience",
    "baby_care",
    "grooming",
    "pet_care",
]

TIME_VOCAB = ["morning", "afternoon", "evening", "late_night", "anytime"]

NON_VEG_RE = re.compile(
    r"\b(chicken|mutton|fish|seafood|egg|eggs|prawn|meat|sausage|salami|ham|bacon|keema|non[- ]?veg)\b",
    re.I,
)


def load_dotenv(path: Path | None = None) -> None:
    env_path = path or (ROOT / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


# Prefer high-TPM models so Phase 3 does not stall on llama-3.1-8b's 6K TPM.
# groq/compound*: 70K TPM · llama-3.3-70b: 12K TPM · gpt-oss/qwen: 8K TPM
DEFAULT_GROQ_MODEL = "groq/compound"
GROQ_MODEL_FALLBACKS = [
    "groq/compound",
    "groq/compound-mini",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "llama-3.1-8b-instant",  # last resort (6K TPM)
]

# Stay under ~30 RPM with margin.
_MIN_REQUEST_GAP_SEC = 2.2
_last_groq_request_at = 0.0


def get_groq_api_key() -> str | None:
    load_dotenv()
    for key in ("GROQ_API_KEY", "Gork_API_KEY", "GROK_API_KEY"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val
    return None


def get_groq_model() -> str:
    load_dotenv()
    return (os.environ.get("GROQ_MODEL") or DEFAULT_GROQ_MODEL).strip()


def _model_chain(preferred: str | None = None) -> list[str]:
    first = (preferred or get_groq_model()).strip()
    chain = [first]
    for m in GROQ_MODEL_FALLBACKS:
        if m not in chain:
            chain.append(m)
    return chain


def _pace_requests() -> None:
    global _last_groq_request_at
    now = time.monotonic()
    wait = _MIN_REQUEST_GAP_SEC - (now - _last_groq_request_at)
    if wait > 0:
        time.sleep(wait)
    _last_groq_request_at = time.monotonic()


def _retry_wait_seconds(err: urllib.error.HTTPError, body: str, attempt: int) -> float:
    # Prefer Retry-After / reset headers when Groq sends them.
    retry_after = err.headers.get("retry-after") or err.headers.get("Retry-After")
    if retry_after:
        try:
            return max(float(retry_after) + 0.5, 1.0)
        except ValueError:
            pass

    reset_tokens = err.headers.get("x-ratelimit-reset-tokens") or err.headers.get(
        "X-RateLimit-Reset-Tokens"
    )
    if reset_tokens:
        # values look like "2s" or "1.5s"
        m = re.search(r"([0-9.]+)", reset_tokens)
        if m:
            return max(float(m.group(1)) + 0.75, 1.0)

    m = re.search(r"try again in ([0-9.]+)s", body, re.I)
    if m:
        return max(float(m.group(1)) + 1.5, 1.0)

    return min(8.0 * (attempt + 1), 45.0)


def groq_chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.2,
) -> str:
    api_key = get_groq_api_key()
    if not api_key:
        raise RuntimeError("No GROQ_API_KEY / Gork_API_KEY found in environment or .env")

    last_err: Exception | None = None
    for model_name in _model_chain(model):
        for attempt in range(5):
            payload_obj = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
            }
            payload = json.dumps(payload_obj).encode("utf-8")
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "BlinkitTinderDiscovery/phase3",
                },
                method="POST",
            )
            try:
                _pace_requests()
                with urllib.request.urlopen(req, timeout=90) as resp:
                    remaining = resp.headers.get("x-ratelimit-remaining-tokens")
                    if remaining is not None:
                        try:
                            if float(remaining) < 1500:
                                time.sleep(3.0)
                        except ValueError:
                            pass
                    data = json.loads(resp.read().decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                if attempt == 0 and model_name != get_groq_model():
                    print(f"  (using model {model_name})")
                return content
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                last_err = RuntimeError(f"Groq HTTP {e.code} [{model_name}]: {body[:280]}")
                # Model missing / bad request → try next model
                if e.code in (400, 404) and (
                    "model" in body.lower() or "not found" in body.lower() or "response_format" in body.lower()
                ):
                    # retry once without response_format for compound-style models
                    if "response_format" in body.lower() or e.code == 400:
                        try:
                            payload_obj.pop("response_format", None)
                            req2 = urllib.request.Request(
                                "https://api.groq.com/openai/v1/chat/completions",
                                data=json.dumps(payload_obj).encode("utf-8"),
                                headers={
                                    "Authorization": f"Bearer {api_key}",
                                    "Content-Type": "application/json",
                                    "User-Agent": "BlinkitTinderDiscovery/phase3",
                                },
                                method="POST",
                            )
                            _pace_requests()
                            with urllib.request.urlopen(req2, timeout=90) as resp:
                                data = json.loads(resp.read().decode("utf-8"))
                            return data["choices"][0]["message"]["content"]
                        except Exception as inner:  # noqa: BLE001
                            last_err = inner
                    break
                if e.code in (429, 500, 502, 503):
                    wait = _retry_wait_seconds(e, body, attempt)
                    print(f"  rate-limit/backoff {wait:.1f}s on {model_name} (attempt {attempt+1})")
                    time.sleep(wait)
                    continue
                raise last_err from e
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(2.0 * (attempt + 1))
        # try next model in chain
        continue

    raise RuntimeError(f"Groq request failed: {last_err}")


def extract_json(text: str):
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
    if not match:
        raise ValueError(f"No JSON found in model response: {text[:200]}")
    return json.loads(match.group(0))


def guess_brand(name: str) -> str:
    known = [
        "Amul",
        "Mother Dairy",
        "Quaker",
        "Yoga Bar",
        "RiteBite",
        "Britannia",
        "Hide & Seek",
        "Lotus Biscoff",
        "Mogu Mogu",
        "Coca-Cola",
        "Sprite",
        "Thums Up",
        "Diet Coke",
        "Nescafe",
        "Bru",
        "Harpic",
        "Surf Excel",
        "Wheel",
        "Rin",
        "Tata Sampann",
        "Kwality Wall",
        "Havmor",
        "Boldfit",
        "MuscleBlaze",
        "Wellcore",
        "English Oven",
        "Harvest Gold",
        "Phab",
        "SuperYou",
        "Green Protein",
        "Tetley",
        "Lipton",
        "Vahdam",
        "Blendart",
        "Flurys",
        "Blue Tea",
        "Optimum Nutrition",
        "Hammer",
        "Portronics",
        "Zebronics",
    ]
    for brand in known:
        if name.lower().startswith(brand.lower()) or f" {brand.lower()}" in f" {name.lower()}":
            return brand
    token = re.split(r"[\s\-_/]+", name.strip())[0]
    return token[:24] if token else "Unknown"


def is_veg(name: str, category: str, top_category: str) -> bool:
    blob = f"{name} {category} {top_category}"
    if top_category == "Meat Fish & Eggs":
        return False
    if category in ("Chicken", "Mutton", "Fish Seafood", "Eggs", "Sausage Salami Ham", "Frozen Non Veg Snacks"):
        return False
    return not bool(NON_VEG_RE.search(blob))


def heuristic_tags(row: dict) -> dict:
    name = (row.get("name") or "").lower()
    cat = (row.get("category") or "").lower()
    top = (row.get("top_category") or "").lower()
    blob = f"{name} {cat} {top}"

    needs: set[str] = set()
    goals: set[str] = set()
    times: set[str] = set()

    def has(*words: str) -> bool:
        return any(w in blob for w in words)

    if has("protein", "paneer", "whey", "creatine", "egg", "tofu"):
        needs.add("protein")
        goals.add("fitness")
    if has("oat", "cereal", "muesli", "granola", "breakfast", "bread", "butter", "jam", "milk", "curd", "yogurt"):
        needs.add("breakfast")
        times.add("morning")
    if has("detergent", "cleaner", "harpic", "dishwash", "floor", "tissue", "household"):
        needs.add("cleaning")
        needs.add("household")
        goals.add("household")
        times.add("evening")
    if has("atta", "rice", "dal", "oil", "spice", "salt", "sugar", "ghee", "flour", "staples"):
        needs.add("staples")
        needs.add("cooking")
        goals.add("household")
        times.add("evening")
    if has("coffee", "tea", "juice", "drink", "cola", "sprite", "beverage", "shake", "soda"):
        needs.add("beverages")
        needs.add("hydration")
        if has("coffee", "tea", "milk"):
            times.add("morning")
        if has("cola", "sprite", "soda", "cold", "juice"):
            times.add("afternoon")
    if has("chip", "nacho", "namkeen", "popcorn", "makhana", "snack", "biscuit", "cookie", "wafer"):
        needs.add("snack")
        goals.add("indulgence")
        times.add("afternoon")
        times.add("late_night")
    if has("ice cream", "chocolate", "candy", "sweet", "dessert", "cornetto"):
        needs.add("indulgence")
        goals.add("indulgence")
        times.add("late_night")
    if has("noodle", "pasta", "instant", "ready to", "frozen", "soup"):
        needs.add("cooking")
        goals.add("convenience")
        times.add("late_night")
        times.add("evening")
    if has("imported", "mogu"):
        needs.add("novelty")
        goals.add("explore")
    if has("chamomile", "sleep", "herbal infusion", "calm"):
        needs.add("sleep")
        needs.add("wellness")
        goals.add("wellness")
        times.add("late_night")
        times.add("evening")
    if has("green tea", "herbal", "supplement", "vitamin", "ortho", "otc", "medicine"):
        needs.add("wellness")
        goals.add("wellness")
    if has("skipping", "resistance", "gym", "workout", "fitness"):
        needs.add("fitness_gear")
        goals.add("fitness")
    if has("baby", "diaper", "wipes"):
        needs.add("baby")
        goals.add("baby_care")
    if has("lipstick", "cosmetic", "makeup", "serum", "fragrance"):
        needs.add("beauty")
        goals.add("grooming")
    if has("shampoo", "soap", "oral", "deodorant", "handwash", "face care"):
        needs.add("wellness")
        goals.add("grooming")
        times.add("anytime")
    if has("dog", "cat", "pet"):
        needs.add("pet")
        goals.add("pet_care")
    if has("cable", "charger", "keyboard", "electronic", "laptop", "usb"):
        needs.add("electronics")
        goals.add("convenience")
    if top == "fruits & vegetables":
        needs.add("breakfast")
        needs.add("wellness")
        times.add("morning")
        times.add("afternoon")

    if not needs:
        if "snack" in top:
            needs.add("snack")
        elif "beverage" in top:
            needs.add("beverages")
        elif "grocery" in top or "staples" in top:
            needs.add("staples")
        elif "home" in top:
            needs.add("household")
        else:
            needs.add("novelty")

    if not goals:
        if "fitness" in needs or "protein" in needs:
            goals.add("fitness")
        elif "household" in needs or "cleaning" in needs or "staples" in needs:
            goals.add("household")
        elif "indulgence" in needs or "snack" in needs:
            goals.add("indulgence")
        elif "novelty" in needs:
            goals.add("explore")
        else:
            goals.add("convenience")

    if not times:
        times.add("anytime")
    if "anytime" not in times and len(times) == 1:
        # keep single specific window; also allow anytime for staples/personal
        if needs & {"staples", "cleaning", "electronics", "beauty", "pet"}:
            times.add("anytime")

    # clamp to vocab
    need_tags = sorted(n for n in needs if n in NEED_VOCAB) or ["novelty"]
    goal_tags = sorted(g for g in goals if g in GOAL_VOCAB) or ["convenience"]
    time_tags = sorted(t for t in times if t in TIME_VOCAB) or ["anytime"]
    return {"need_tags": need_tags, "goal_tags": goal_tags, "time_tags": time_tags}


def row_to_catalog_item(row: dict, tags: dict) -> dict:
    price = float(row["price"]) if row.get("price") not in (None, "") else 0.0
    return {
        "id": row["id"],
        "name": row["name"],
        "brand": guess_brand(row["name"]),
        "category": row["category"],
        "top_category": row["top_category"],
        "subcategory": row.get("subcategory") or "",
        "price": price,
        "mrp": price,
        "unit": row.get("unit") or "",
        "image_url": row.get("local_image") or f"/images/{row['id']}.svg",
        "in_stock": True,
        "veg_flag": is_veg(row["name"], row["category"], row["top_category"]),
        "need_tags": tags["need_tags"],
        "goal_tags": tags["goal_tags"],
        "time_tags": tags["time_tags"],
    }

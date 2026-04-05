from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

import argparse
import asyncio
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
import json
import math
import os
import re
from typing import Literal

from pydantic import BaseModel, Field

try:
	from browser_use import Agent  # type: ignore
except ImportError:  # pragma: no cover
	Agent = None

try:
	from browser_use.llm.models import ChatGoogle as BrowserUseChatGoogle  # type: ignore
except ImportError:  # pragma: no cover
	BrowserUseChatGoogle = None

try:
	from browser_use.llm.models import ChatOpenAI as BrowserUseChatOpenAI  # type: ignore
except ImportError:  # pragma: no cover
	BrowserUseChatOpenAI = None

try:
	from browser_use.browser.profile import BrowserProfile  # type: ignore
except ImportError:  # pragma: no cover
	BrowserProfile = None  # type: ignore


Decision = Literal["verified", "needs_review", "unresolved"]


class BrowserUseCandidate(BaseModel):
	name: str
	price: float | None = None
	source_url: str
	source_type: Literal["official", "yelp", "third_party"]


class BrowserUseCandidateResponse(BaseModel):
	candidates: list[BrowserUseCandidate] = Field(default_factory=list)


class BrowserUseBatchItemBlock(BaseModel):
	"""One numbered OCR line and its menu candidates from a batch browser task."""

	index: int = Field(..., ge=1, description="1-based line number matching the task list order")
	candidates: list[BrowserUseCandidate] = Field(default_factory=list)


class BrowserUseBatchResponse(BaseModel):
	items: list[BrowserUseBatchItemBlock] = Field(default_factory=list)


@dataclass
class UncertainItem:
	restaurant_name: str
	item_text: str
	ocr_price: float
	ocr_confidence: float | None = None


@dataclass
class MenuCandidate:
	name: str
	price: float | None
	source_url: str
	source_type: Literal["official", "yelp", "third_party"] = "third_party"


@dataclass
class RankedCandidate:
	name: str
	price: float | None
	source_url: str
	source_type: str
	name_similarity: float
	price_similarity: float
	source_trust: float
	score: float


@dataclass
class HealingResult:
	original_item_text: str
	best_match_name: str | None
	best_match_price: float | None
	match_confidence: float
	decision: Decision
	reason: str
	sources: list[dict[str, str]]
	top_candidates: list[dict]


SOURCE_TRUST = {
	"official": 1.00,
	"yelp": 0.78,
	"third_party": 0.60,
}


# ---------------------------------------------------------------------------
# Confidence heuristics (carried over from original healer for scanner.py)
# ---------------------------------------------------------------------------

COMMON_SHORT_WORDS = {
	"the", "and", "or", "in", "on", "at", "to", "a", "an",
	"hot", "red", "tea", "ice", "egg", "beef", "fish", "rice",
	"pho", "bbq", "blt", "ahi", "ono", "poi", "mac"
}


def get_confidence(item_name: str) -> float:
	"""Heuristic confidence score based on vowel density and abbreviation signals."""
	issues = 0

	if len(item_name) <= 3:
		issues += 4

	letters = [c.lower() for c in item_name if c.isalpha()]
	if letters:
		vowels = set("aeiou")
		vowel_ratio = sum(1 for c in letters if c in vowels) / len(letters)
		if vowel_ratio < 0.15:
			issues += 4
		elif vowel_ratio < 0.25:
			issues += 2

	words = item_name.split()
	for word in words:
		clean = word.lower().strip(".,")
		if clean in COMMON_SHORT_WORDS:
			continue
		if len(clean) <= 4:
			has_vowel = any(c in "aeiou" for c in clean)
			if not has_vowel:
				issues += 3

	confidence = max(0.0, 1.0 - (issues * 0.2))
	return round(confidence, 2)


def should_heal(item_name: str) -> bool:
	"""Return True if the item name looks garbled enough to need healing."""
	return get_confidence(item_name) < 0.80


# ---------------------------------------------------------------------------
# Name / price similarity helpers
# ---------------------------------------------------------------------------

def _normalize_item_name(text: str) -> str:
	lowered = text.lower().strip()
	lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
	lowered = re.sub(r"\s+", " ", lowered)
	return lowered


def _compact_item_name(text: str) -> str:
	return re.sub(r"[^a-z0-9]", "", text.lower())


def _token_initials(text: str) -> str:
	tokens = re.findall(r"[a-z0-9]+", text.lower())
	return "".join(token[0] for token in tokens if token)


def _name_similarity(a: str, b: str) -> float:
	a_norm = _normalize_item_name(a)
	b_norm = _normalize_item_name(b)
	if not a_norm or not b_norm:
		return 0.0

	compact_ratio = SequenceMatcher(None, _compact_item_name(a_norm), _compact_item_name(b_norm)).ratio()
	initials_ratio = SequenceMatcher(None, _token_initials(a_norm), _token_initials(b_norm)).ratio()
	phrase_ratio = SequenceMatcher(None, a_norm, b_norm).ratio()
	return max(phrase_ratio, compact_ratio, initials_ratio)


def _price_similarity(ocr_price: float, candidate_price: float | None) -> float:
	if candidate_price is None or candidate_price < 0:
		return 0.0

	sigma = 2.0
	diff = abs(ocr_price - candidate_price)
	return math.exp(-((diff**2) / (2 * sigma**2)))


def _rank_candidate(item: UncertainItem, candidate: MenuCandidate) -> RankedCandidate:
	name_sim = _name_similarity(item.item_text, candidate.name)
	price_sim = _price_similarity(item.ocr_price, candidate.price)
	source_trust = SOURCE_TRUST.get(candidate.source_type, SOURCE_TRUST["third_party"])

	score = name_sim
	if item.ocr_price > 0 and candidate.price is not None:
		if name_sim >= 0.55 and name_sim < 0.80:
			score = min(1.0, (0.85 * name_sim) + (0.15 * price_sim))
		elif name_sim < 0.55:
			score = min(1.0, (0.90 * name_sim) + (0.10 * price_sim))

	return RankedCandidate(
		name=candidate.name,
		price=candidate.price,
		source_url=candidate.source_url,
		source_type=candidate.source_type,
		name_similarity=round(name_sim, 4),
		price_similarity=round(price_sim, 4),
		source_trust=round(source_trust, 4),
		score=round(score, 4),
	)


def _decision_from_score(score: float) -> tuple[Decision, str]:
	if score >= 0.75:
		return "verified", "High confidence match from name and price weighting."
	if score >= 0.45:
		return "needs_review", "Plausible match, but confidence is not high enough to auto-accept."
	return "unresolved", "No strong match found from available web evidence."


def _extract_json_blob(text: str) -> str:
	text = text.strip()

	fenced_object = re.search(r"```json\s*(\{.*\})\s*```", text, re.DOTALL)
	if fenced_object:
		return fenced_object.group(1)

	fenced_list = re.search(r"```json\s*(\[.*\])\s*```", text, re.DOTALL)
	if fenced_list:
		return fenced_list.group(1)

	object_match = re.search(r"(\{.*\})", text, re.DOTALL)
	if object_match:
		return object_match.group(1)

	list_match = re.search(r"(\[.*\])", text, re.DOTALL)
	if list_match:
		return list_match.group(1)

	raise ValueError("Could not locate JSON in browser-use output.")


def _extract_agent_output_text(result: object) -> str:
	"""Get the best available agent output text across browser-use result shapes."""
	if result is None:
		return ""

	collected: list[str] = []

	def _collect(value: object) -> None:
		if isinstance(value, str) and value.strip():
			collected.append(value.strip())
		elif isinstance(value, (dict, list)):
			try:
				collected.append(json.dumps(value))
			except TypeError:
				pass

	for attr_name in ["final_result", "result", "output", "message", "content"]:
		attr_value = getattr(result, attr_name, None)
		if callable(attr_value):
			try:
				attr_value = attr_value()
			except Exception:
				continue
		_collect(attr_value)

	action_results = getattr(result, "action_results", None)
	if callable(action_results):
		try:
			results = action_results()
		except Exception:
			results = []
		for action_result in reversed(results):
			extracted = getattr(action_result, "extracted_content", None)
			if isinstance(extracted, str) and extracted.strip():
				collected.append(extracted.strip())
				break

	result_text = str(result).strip()
	if result_text:
		collected.append(result_text)

	for text in collected:
		if '"items"' in text and "{" in text:
			return text
	for text in collected:
		if '"candidates"' in text and ("{" in text or "[" in text):
			return text
	for text in collected:
		if "{" in text or "[" in text:
			return text

	return collected[0] if collected else ""


def _classify_source_type(url: str) -> Literal["official", "yelp", "third_party"]:
	lower_url = url.lower()
	if "yelp.com" in lower_url:
		return "yelp"
	if any(token in lower_url for token in ["official", "restaurant", ".menu"]):
		return "official"
	return "third_party"


def _build_browser_use_llm():
	gemini_key = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
	openai_key = os.getenv("OPENAI_API_KEY", "").strip()
	# Default must be a model Google still serves for new API keys (gemini-2.0-flash returns 404).
	browser_model = os.getenv("GEMINI_BROWSER_MODEL", "").strip() or "gemini-2.5-flash"

	if gemini_key and BrowserUseChatGoogle is not None:
		return BrowserUseChatGoogle(model=browser_model, api_key=gemini_key)

	if openai_key and BrowserUseChatOpenAI is not None:
		return BrowserUseChatOpenAI(model="gpt-4o-mini", api_key=openai_key)

	raise RuntimeError(
		"No supported LLM configured for browser-use. Set GEMINI_API_KEY (or GOOGLE_API_KEY) "
		"or OPENAI_API_KEY, and ensure browser-use with its LLM model wrappers is installed."
	)


def _candidate_from_payload(item: dict) -> MenuCandidate | None:
	name = str(item.get("name", "")).strip()
	if not name:
		return None

	raw_price = item.get("price")
	price: float | None = None
	if raw_price is not None:
		try:
			price = float(raw_price)
		except (TypeError, ValueError):
			price = None

	url = str(item.get("source_url", item.get("url", ""))).strip() or "https://unknown-source.local"
	raw_type = str(item.get("source_type", "")).strip().lower()
	if raw_type in {"official", "yelp", "third_party"}:
		source_type = raw_type  # type: ignore[assignment]
	else:
		source_type = _classify_source_type(url)

	return MenuCandidate(name=name, price=price, source_url=url, source_type=source_type)


def _candidate_from_free_text(
	text: str,
	fallback_name: str,
	fallback_price: float,
) -> MenuCandidate | None:
	"""Best-effort parse when agent returns plain text instead of JSON."""
	if not text or not text.strip():
		return None

	url_match = re.search(r"https?://[^\s'\")]+", text)
	url = url_match.group(0) if url_match else "https://unknown-source.local"

	name = ""
	quoted_name = re.search(r"identified\s+['\"]([^'\"]+)['\"]", text, re.IGNORECASE)
	if quoted_name:
		name = quoted_name.group(1).strip()
	else:
		as_name = re.search(r"match\s+for\s+['\"][^'\"]+['\"]\s+.*?\s+is\s+['\"]([^'\"]+)['\"]", text, re.IGNORECASE)
		if as_name:
			name = as_name.group(1).strip()

	if not name:
		strong_match_name = re.search(r"strong\s+match\s+for\s+['\"]([^'\"]+)['\"]", text, re.IGNORECASE)
		if strong_match_name:
			name = strong_match_name.group(1).strip()

	if not name and re.search(r"\b(strong|confident)\s+match\b|\bidentified\b|\bfound\b", text, re.IGNORECASE):
		name = fallback_name.strip()

	if not name:
		return None

	price_match = re.search(r"\$\s*([0-9]+(?:\.[0-9]{2})?)", text)
	if not price_match:
		price_match = re.search(r"price\s*(?:of|is)?\s*([0-9]+(?:\.[0-9]{2})?)", text, re.IGNORECASE)
	price = float(price_match.group(1)) if price_match else fallback_price

	source_type = "official" if re.search(r"\bofficial\b", text, re.IGNORECASE) else _classify_source_type(url)

	return MenuCandidate(
		name=name,
		price=price,
		source_url=url,
		source_type=source_type,
	)



def heal_item(
	item: UncertainItem,
	candidates: list[MenuCandidate],
) -> HealingResult:
	if not candidates:
		return HealingResult(
			original_item_text=item.item_text,
			best_match_name=None,
			best_match_price=None,
			match_confidence=0.0,
			decision="unresolved",
			reason="No candidates were returned by browser search.",
			sources=[],
			top_candidates=[],
		)

	ranked = [_rank_candidate(item, c) for c in candidates]
	ranked.sort(key=lambda c: c.score, reverse=True)
	best = ranked[0]
	decision, reason = _decision_from_score(best.score)

	sources = [
		{
			"url": r.source_url,
			"type": r.source_type,
		}
		for r in ranked[:3]
	]

	return HealingResult(
		original_item_text=item.item_text,
		best_match_name=best.name,
		best_match_price=best.price,
		match_confidence=best.score,
		decision=decision,
		reason=reason,
		sources=sources,
		top_candidates=[asdict(r) for r in ranked[:5]],
	)


async def gather_candidates_with_browser_use_async(
	restaurant_name: str,
	item_hint: str,
	item_price: float,
) -> list[MenuCandidate]:
	if Agent is None:
		raise RuntimeError("browser-use is not installed. Install it first to enable web healing.")

	llm = _build_browser_use_llm()

	prompt = f"""
	You are a web research agent for restaurant menu verification.

	Task:
	- Restaurant: {restaurant_name}
	- Uncertain item text: {item_hint}
	- OCR price: {item_price:.2f}

	First step (required):
	- Use the search action with engine google to query:
	  "{restaurant_name}" menu {item_hint}
	  Do not skip search. Do not call done before you have searched and opened a relevant page.

	Quality first:
	- Open the official site menu (or PDF menu) when possible and confirm the item text or a clear
	  variant appears there before calling done. Scroll the menu if it is long or in sections.
	- If the official site is unclear, use one backup source (e.g. Yelp menu or Google snippet)
	  before giving up — aim for up to 3 solid candidates with real URLs.
	- Do not stop after a vague guess: prefer one verified line on a menu page over a hasty match.

	Search for likely matching menu items using official restaurant website first.
	Only use Yelp/menu aggregators if you cannot find a plausible name match on official sources.

	IMPORTANT:
	- This is verification only. Never place an order, add to cart, start checkout,
	  sign in, pick pickup/delivery, or customize anything.
	- When you have at least one strong match (name seen on menu or menu-like page), include it in
	  candidates and you may finish — but if confidence is low, try one more page or source first.
	- Price may be null if not shown; focus on the correct dish name.
	- If you need a search engine, use Google (engine: google), not DuckDuckGo.
	- Final answer must be JSON only (no prose). Use the done action with the JSON object.
	- Do not treat JSON template values as URLs to visit.

	Return STRICT JSON only in this exact shape:
	{{
	  "candidates": [
	    {{
	      "name": "string",
	      "price": 0.0,
	      "source_url": "(menu page URL where you found the dish)",
	      "source_type": "official|yelp|third_party"
	    }}
	  ]
	}}

	Rules:
	- Return up to 3 candidates.
	- Use numeric prices where available.
	- If a price is missing, use null.
	- Do not include explanation text. JSON only.
	""".strip()

	# Balance: enough steps for menu navigation; planning helps multi-step flows.
	# Lower BROWSER_USE_MAX_STEPS in .env only if you want faster, less thorough runs.
	max_steps = int(os.getenv("BROWSER_USE_MAX_STEPS", "32"))
	if BrowserProfile is not None:
		browser_profile = BrowserProfile(
			wait_between_actions=0.08,
			minimum_wait_page_load_time=0.18,
			wait_for_network_idle_page_load_time=0.45,
		)
	else:
		browser_profile = None

	# directly_open_url=False: the task text includes a JSON-schema appendix that can contain a
	# single stray http:// link — browser-use would auto-navigate there and exit before searching.
	agent = Agent(
		task=prompt,
		llm=llm,
		output_model_schema=BrowserUseCandidateResponse,
		browser_profile=browser_profile,
		directly_open_url=False,
		enable_planning=True,
		use_thinking=False,
		use_judge=False,
		vision_detail_level="auto",
		llm_timeout=60,
		step_timeout=120,
		max_actions_per_step=5,
	)
	result = await agent.run(max_steps=max_steps)
	raw_text = _extract_agent_output_text(result)

	try:
		json_blob = _extract_json_blob(raw_text)
		payload = json.loads(json_blob)
	except (ValueError, json.JSONDecodeError):
		fallback = _candidate_from_free_text(
			raw_text,
			fallback_name=item_hint,
			fallback_price=item_price,
		)
		return [fallback] if fallback is not None else []

	items = payload.get("candidates", []) if isinstance(payload, dict) else payload
	if not isinstance(items, list):
		return []

	candidates: list[MenuCandidate] = []
	for raw in items:
		if not isinstance(raw, dict):
			continue
		candidate = _candidate_from_payload(raw)
		if candidate is not None:
			candidates.append(candidate)

	return candidates


def _menu_candidates_from_raw_list(raw_items: list[object]) -> list[MenuCandidate]:
	out: list[MenuCandidate] = []
	for raw in raw_items:
		if not isinstance(raw, dict):
			continue
		candidate = _candidate_from_payload(raw)
		if candidate is not None:
			out.append(candidate)
	return out


def _parse_batch_browser_payload(
	payload: object,
	num_lines: int,
) -> dict[int, list[MenuCandidate]]:
	"""Map 0-based line index -> candidates. Missing indices get empty lists."""
	by_index: dict[int, list[MenuCandidate]] = {i: [] for i in range(num_lines)}
	if not isinstance(payload, dict):
		return by_index

	items = payload.get("items")
	if not isinstance(items, list):
		# Single-item shape: treat root "candidates" as line 0 only
		single = payload.get("candidates")
		if isinstance(single, list) and num_lines >= 1:
			by_index[0] = _menu_candidates_from_raw_list(single)
		return by_index

	for block in items:
		if not isinstance(block, dict):
			continue
		try:
			idx_1 = int(block.get("index", 0))
		except (TypeError, ValueError):
			continue
		if idx_1 < 1:
			continue
		idx0 = idx_1 - 1
		if idx0 >= num_lines:
			continue
		raw_cands = block.get("candidates")
		if isinstance(raw_cands, list):
			by_index[idx0] = _menu_candidates_from_raw_list(raw_cands)

	return by_index


async def gather_candidates_batch_with_browser_use_async(
	restaurant_name: str,
	batch_lines: list[tuple[str, float]],
) -> dict[int, list[MenuCandidate]]:
	"""
	One browser-use run for multiple uncertain OCR lines at the same restaurant.

	batch_lines: ordered (item_hint, ocr_price) pairs; index i in the result dict is 0-based.
	"""
	if Agent is None:
		raise RuntimeError("browser-use is not installed. Install it first to enable web healing.")

	n = len(batch_lines)
	if n == 0:
		return {}

	if n == 1:
		hint, price = batch_lines[0]
		cands = await gather_candidates_with_browser_use_async(
			restaurant_name=restaurant_name,
			item_hint=hint,
			item_price=price,
		)
		return {0: cands}

	llm = _build_browser_use_llm()

	numbered = "\n".join(
		f'{i + 1}. Uncertain OCR text: "{hint}" — OCR price: ${price:.2f}'
		for i, (hint, price) in enumerate(batch_lines)
	)

	prompt = f"""
	You are a web research agent for restaurant menu verification.

	Restaurant: {restaurant_name}

	You must verify ALL of the following OCR lines from the same receipt. Prefer finding the official
	menu (or PDF) once, then match each line to real menu items. Use one backup source (e.g. Yelp)
	only if the official menu is missing a line.

	Numbered lines (use these exact 1-based index values in your JSON):
	{numbered}

	Workflow:
	1. Search Google for: "{restaurant_name}" menu
	2. Open the official site menu or a reliable menu page; scroll sections as needed.
	3. For each numbered line above, collect up to 3 strong name matches with real page URLs.
	4. Price on the menu may differ from OCR; include menu price when visible, else null.

	IMPORTANT:
	- Verification only: never order, checkout, sign in, or customize.
	- Use Google (engine: google) for search. Do not skip search.
	- Return candidates grouped by the same index as the list above (1..{n}).
	- Final answer must be JSON only. Use the done action with the JSON object.

	Return STRICT JSON only in this exact shape:
	{{
	  "items": [
	    {{
	      "index": 1,
	      "candidates": [
	        {{
	          "name": "string",
	          "price": 0.0,
	          "source_url": "https://...",
	          "source_type": "official|yelp|third_party"
	        }}
	      ]
	    }}
	  ]
	}}

	Rules:
	- Include one object in "items" per OCR line (indices 1 through {n}).
	- Each line: up to 3 candidates; use null for missing prices.
	- JSON only, no prose.
	""".strip()

	base_steps = int(os.getenv("BROWSER_USE_MAX_STEPS", "32"))
	batch_extra = int(os.getenv("BROWSER_USE_BATCH_MAX_STEPS", "").strip() or "0")
	if batch_extra > 0:
		max_steps = batch_extra
	else:
		max_steps = min(64, max(base_steps, 12 * n))

	if BrowserProfile is not None:
		browser_profile = BrowserProfile(
			wait_between_actions=0.08,
			minimum_wait_page_load_time=0.18,
			wait_for_network_idle_page_load_time=0.45,
		)
	else:
		browser_profile = None

	agent = Agent(
		task=prompt,
		llm=llm,
		output_model_schema=BrowserUseBatchResponse,
		browser_profile=browser_profile,
		directly_open_url=False,
		enable_planning=True,
		use_thinking=False,
		use_judge=False,
		vision_detail_level="auto",
		llm_timeout=90,
		step_timeout=150,
		max_actions_per_step=5,
	)
	result = await agent.run(max_steps=max_steps)
	raw_text = _extract_agent_output_text(result)

	try:
		json_blob = _extract_json_blob(raw_text)
		payload = json.loads(json_blob)
	except (ValueError, json.JSONDecodeError):
		return {i: [] for i in range(n)}

	return _parse_batch_browser_payload(payload, n)


def gather_candidates_with_browser_use(
	restaurant_name: str,
	item_hint: str,
	item_price: float,
) -> list[MenuCandidate]:
	try:
		return asyncio.run(
			gather_candidates_with_browser_use_async(
				restaurant_name=restaurant_name,
				item_hint=item_hint,
				item_price=item_price,
			)
		)
	except RuntimeError as err:
		if "event loop" not in str(err).lower():
			raise
		loop = asyncio.new_event_loop()
		try:
			return loop.run_until_complete(
				gather_candidates_with_browser_use_async(
					restaurant_name=restaurant_name,
					item_hint=item_hint,
					item_price=item_price,
				)
			)
		finally:
			loop.close()


def heal_item_via_browser_use(item: UncertainItem) -> HealingResult:
	candidates = gather_candidates_with_browser_use(
		restaurant_name=item.restaurant_name,
		item_hint=item.item_text,
		item_price=item.ocr_price,
	)
	return heal_item(item=item, candidates=candidates)


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="Receipt item healer with optional browser-use integration.")
	parser.add_argument("--mock-demo", action="store_true", help="Use mock candidates instead of web search.")
	parser.add_argument("--restaurant", default="Example Restaurant", help="Restaurant name from CV")
	parser.add_argument("--item", default="Example Item", help="Uncertain OCR item text from CV")
	parser.add_argument("--price", type=float, default=0.0, help="OCR item price from CV")
	args = parser.parse_args()

	sample_item = UncertainItem(
		restaurant_name=args.restaurant,
		item_text=args.item,
		ocr_price=args.price,
		ocr_confidence=0.42,
	)

	if args.mock_demo:
		sample_candidates = [
			MenuCandidate(
				name="Example Burger",
				price=0.0,
				source_url="https://example.com/menu/example-burger",
				source_type="official",
			),
			MenuCandidate(
				name="Example Burger Deluxe",
				price=0.0,
				source_url="https://www.yelp.com/menu/example-restaurant",
				source_type="yelp",
			),
			MenuCandidate(
				name="Example Sandwich",
				price=0.0,
				source_url="https://example-thirdparty.com/example-menu",
				source_type="third_party",
			),
		]

		result = heal_item(item=sample_item, candidates=sample_candidates)
		print(json.dumps(asdict(result), indent=2))
	else:
		result = heal_item_via_browser_use(sample_item)
		print(json.dumps(asdict(result), indent=2))

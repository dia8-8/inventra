import { useEffect, useId, useRef, useState } from "react";
import { loadGooglePlaces } from "../lib/googleMaps";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 400;
const COOL_OFF_MS = 60_000; // after Google refuses a request (quota, key), stop asking for a minute

// One address box. You can always just type the address; once you pause typing, Google
// suggestions appear below it and picking one fills the box with the full address.
// The list is our own, so it follows the light / dark theme, and requests are kept to a minimum
// (pause + 3 letters) because Google bills and limits them per request.
export default function AddressAutocomplete({ label, value, onChange }) {
  const listId = useId();
  const wrapRef = useRef(null);
  const places = useRef(null); // Google "places" library once loaded
  const sessionToken = useRef(null);
  const timer = useRef(null);
  const latest = useRef(0); // ignore answers to searches that are no longer current
  const pausedUntil = useRef(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => () => clearTimeout(timer.current), []);

  // close when clicking anywhere else
  useEffect(() => {
    function away(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  async function search(text) {
    const mine = ++latest.current;
    if (Date.now() < pausedUntil.current) return;
    setBusy(true);
    try {
      if (!places.current) places.current = await loadGooglePlaces();
      const { AutocompleteSuggestion, AutocompleteSessionToken } = places.current;
      if (!sessionToken.current) sessionToken.current = new AutocompleteSessionToken();
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, sessionToken: sessionToken.current });
      if (mine !== latest.current) return;
      setItems(suggestions.filter((s) => s.placePrediction));
      setActive(-1);
      setOpen(true);
      setProblem("");
    } catch {
      if (mine !== latest.current) return;
      pausedUntil.current = Date.now() + COOL_OFF_MS;
      setItems([]);
      setOpen(false);
      setProblem("Address suggestions aren't available right now. You can still type the address yourself.");
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }

  function handleType(e) {
    const text = e.target.value;
    onChange(text);
    clearTimeout(timer.current);
    latest.current++; // whatever was in flight is stale now
    if (text.trim().length < MIN_CHARS) {
      setItems([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    timer.current = setTimeout(() => search(text.trim()), DEBOUNCE_MS);
  }

  async function choose(suggestion) {
    const prediction = suggestion.placePrediction;
    const fallback = prediction.text?.text || "";
    latest.current++;
    clearTimeout(timer.current);
    setOpen(false);
    setItems([]);
    onChange(fallback); // show something right away
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress"] });
      if (place.formattedAddress) onChange(place.formattedAddress);
    } catch {
      /* the suggestion's own text is already in the box */
    } finally {
      sessionToken.current = null; // a pick ends the Google session; the next search starts a new one
    }
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // choosing a suggestion must not submit the surrounding form
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        value={value}
        onChange={handleType}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder="Start typing an address…"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        className="input w-full"
      />
      {busy && <span className="absolute right-3 top-[2.1rem] h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 animate-spin" aria-hidden="true" />}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/5 py-1"
        >
          {items.map((s, i) => {
            const p = s.placePrediction;
            const main = p.mainText?.text || p.text?.text || "";
            const secondary = p.secondaryText?.text || "";
            return (
              <li
                key={p.placeId || i}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()} // keep focus in the input
                onClick={() => choose(s)}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2 cursor-pointer text-sm ${i === active ? "bg-brand-50 dark:bg-gray-700" : ""}`}
              >
                <span className="text-gray-900 dark:text-gray-100">{main}</span>
                {secondary && <span className="ml-1.5 text-gray-500 dark:text-gray-400">{secondary}</span>}
              </li>
            );
          })}
          <li className="px-3 pt-1 pb-1.5 text-[10px] text-right text-gray-400 dark:text-gray-500 select-none" aria-hidden="true">
            Powered by Google
          </li>
        </ul>
      )}

      {problem && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{problem}</p>}
    </div>
  );
}

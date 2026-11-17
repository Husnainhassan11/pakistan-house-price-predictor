"use client";

// This page runs in the browser. It does three things:
// 1. loads the dropdown values from the API (GET /options)
// 2. sends the form to the API (POST /predict)
// 3. shows the estimated price and the likely range

import { useEffect, useState } from "react";

// Address of the API. On Vercel we can change it with the NEXT_PUBLIC_API_URL setting.
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://pakistan-house-price-predictor.onrender.com"
).replace(/\/$/, "");

const GITHUB_URL = "https://github.com/Husnainhassan11/pakistan-house-price-predictor";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatNumber = (n) => Number(n).toLocaleString("en-US");

// Turn the error sent by the API into a short readable message
function readDetail(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail)) {
    return data.detail
      .map((d) => `${(d.loc || []).slice(1).join(" ")}: ${d.msg}`)
      .join("; ");
  }
  return `The server returned an error (${status}).`;
}

// Call the API. The free server can take up to a minute to wake up, so we wait up to 90 seconds.
async function fetchJson(path, init = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(readDetail(data, response.status));
      error.fromServer = true;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(err) {
  if (err && err.fromServer) return err.message;
  if (err && err.name === "AbortError") {
    return "The server took too long to answer. It may be waking up, so please try again in a minute.";
  }
  return "Could not reach the server. Check your internet connection and try again.";
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200";

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function Home() {
  // "State" is data that the page remembers. When it changes, the page updates.
  const [options, setOptions] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading, ready or error
  const [reloadKey, setReloadKey] = useState(0);

  const [city, setCity] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("10");
  const [bedrooms, setBedrooms] = useState("3");
  const [baths, setBaths] = useState("3");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Load the dropdown values once when the page opens (and again if the user clicks "Try again")
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState("loading");
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const data = await fetchJson("/options");
          if (cancelled) return;
          const defaultCity = data.cities.includes("Lahore") ? "Lahore" : data.cities[0];
          setOptions(data);
          setCity(defaultCity);
          setPropertyType(data.property_types.includes("House") ? "House" : data.property_types[0]);
          setLocation((data.locations[defaultCity] || [])[0] || "");
          setLoadState("ready");
          return;
        } catch (err) {
          if (cancelled) return;
          if (attempt === 3) {
            setLoadState("error");
            return;
          }
          await sleep(4000);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const locations = options ? options.locations[city] || [] : [];

  function handleCityChange(newCity) {
    setCity(newCity);
    setLocation((options.locations[newCity] || [])[0] || "");
    setResult(null);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault(); // stop the browser from reloading the page
    setError("");
    setResult(null);

    const areaNum = Number(area);
    const bedNum = Number(bedrooms);
    const bathNum = Number(baths);

    if (!location.trim()) return setError("Please enter a location.");
    if (!(areaNum >= 1 && areaNum <= 100)) return setError("Area must be between 1 and 100 marla.");
    if (!Number.isInteger(bedNum) || bedNum < 1 || bedNum > 15)
      return setError("Bedrooms must be a whole number from 1 to 15.");
    if (!Number.isInteger(bathNum) || bathNum < 1 || bathNum > 15)
      return setError("Bathrooms must be a whole number from 1 to 15.");

    setSubmitting(true);
    try {
      const data = await fetchJson("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_type: propertyType,
          city,
          location: location.trim(),
          area_marla: areaNum,
          bedrooms: bedNum,
          baths: bathNum,
        }),
      });
      setResult({
        ...data,
        summary: `${propertyType} in ${location.trim()}, ${city} (${areaNum} marla, ${bedNum} bed, ${bathNum} bath)`,
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Where the estimate sits inside the low to high range (0 to 100 percent)
  let marker = 50;
  if (result && result.high_pkr > result.low_pkr) {
    marker = ((result.price_pkr - result.low_pkr) / (result.high_pkr - result.low_pkr)) * 100;
    marker = Math.min(100, Math.max(0, marker));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">🏠 Pakistan House Price Predictor</h1>
          <p className="mt-2 text-slate-600">
            Enter the details of a house to get an estimated sale price and a likely price range, based
            on a machine learning model trained on 80,000+ Zameen.com listings.
          </p>
        </header>

        {/* Loading */}
        {loadState === "loading" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="font-medium">Connecting to the prediction server...</p>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              The free server goes to sleep when nobody uses it, so the first visit can take up to a
              minute. Thanks for waiting.
            </p>
          </div>
        )}

        {/* Could not load */}
        {loadState === "error" && (
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm" role="alert">
            <p className="font-medium text-red-700">Could not reach the prediction server.</p>
            <p className="mt-1 text-sm text-slate-600">
              Check your internet connection. If it is working, the server may still be waking up.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* The form */}
        {loadState === "ready" && options && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="city" label="City">
                <select
                  id="city"
                  className={inputClass}
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value)}
                >
                  {options.cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="propertyType" label="Property type">
                <select
                  id="propertyType"
                  className={inputClass}
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                >
                  {options.property_types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="sm:col-span-2">
                <Field
                  id="location"
                  label="Location"
                  hint="Click and type to search, then pick a suggestion for the most reliable estimate."
                >
                  <input
                    id="location"
                    list="location-list"
                    className={inputClass}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    autoComplete="off"
                    placeholder="For example: DHA Defence"
                  />
                  <datalist id="location-list">
                    {locations.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <Field id="area" label="Area (marla)" hint="1 kanal = 20 marla. From 1 to 100 marla.">
                <input
                  id="area"
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  className={inputClass}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field id="bedrooms" label="Bedrooms">
                  <input
                    id="bedrooms"
                    type="number"
                    min="1"
                    max="15"
                    step="1"
                    className={inputClass}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                  />
                </Field>
                <Field id="baths" label="Bathrooms">
                  <input
                    id="baths"
                    type="number"
                    min="1"
                    max="15"
                    step="1"
                    className={inputClass}
                    value={baths}
                    onChange={(e) => setBaths(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Estimating..." : "Estimate price"}
            </button>
          </form>
        )}

        {/* The result */}
        {result && (
          <section
            aria-live="polite"
            className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">Estimated sale price</p>
            <p className="mt-1 text-4xl font-bold text-emerald-700">
              {result.price_crore.toFixed(2)} crore
            </p>
            <p className="mt-1 text-slate-600">PKR {formatNumber(result.price_pkr)}</p>
            <p className="mt-1 text-sm text-slate-500">{result.summary}</p>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-slate-700">
                Likely range (about 80% of real prices fall in it)
              </p>
              <div className="relative h-3 rounded-full bg-emerald-100">
                <div
                  className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded bg-emerald-700"
                  style={{ left: `calc(${marker}% - 3px)` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-sm text-slate-600">
                <span>{result.low_crore.toFixed(2)} crore</span>
                <span>{result.high_crore.toFixed(2)} crore</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                PKR {formatNumber(result.low_pkr)} to PKR {formatNumber(result.high_pkr)}
              </p>
            </div>

            {result.note && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {result.note}
              </p>
            )}
          </section>
        )}
          
      
        {/* Footer */}
        <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span>Built by Husnain Hassan</span>
          <a className="underline hover:text-slate-700" href={GITHUB_URL} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
          <a className="underline hover:text-slate-700" href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
            API docs
          </a>
        </footer>
      </div>
    </main>
  );
}
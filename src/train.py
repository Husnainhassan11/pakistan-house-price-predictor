"""Train the final model and save everything the API needs.

Run from the project root:   python -m src.train

Reads  : data/cleaned_house_prices.csv   (created by notebooks/01_eda.ipynb)
Writes : models/house_price_model.joblib (the model, not committed to Git)
         models/options.json             (dropdown values, metrics, price range)
"""
import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.house_model import FEATURES, add_features

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "cleaned_house_prices.csv"
MODEL_PATH = ROOT / "models" / "house_price_model.joblib"
OPTIONS_PATH = ROOT / "models" / "options.json"


def main():
    start = time.time()
    df = pd.read_csv(DATA_PATH)
    df = add_features(df)
    print(f"Loaded {len(df):,} houses")

    X, y = df[FEATURES], df["price"]
    # Same split as notebook 03, so the scores match
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    preprocess = ColumnTransformer(
        transformers=[
            ("small_categories", OneHotEncoder(handle_unknown="ignore", sparse_output=False),
             ["property_type", "city"]),
            ("location", OneHotEncoder(handle_unknown="infrequent_if_exist",
                                       min_frequency=30, sparse_output=False),
             ["city_location"]),
        ],
        remainder="passthrough",
    )
    model = Pipeline([
        ("prep", preprocess),
        ("model", HistGradientBoostingRegressor(max_iter=400, learning_rate=0.08, random_state=42)),
    ])

    model.fit(X_train, np.log1p(y_train))

    # Honest scores on the houses the model has not seen
    pred = np.expm1(model.predict(X_test))
    metrics = {
        "mae_crore": round(mean_absolute_error(y_test, pred) / 1e7, 3),
        "rmse_crore": round(float(np.sqrt(mean_squared_error(y_test, pred))) / 1e7, 3),
        "r2_price": round(r2_score(y_test, pred), 3),
        "median_pct_error": round(float(np.median(np.abs(pred - y_test) / y_test) * 100), 2),
    }
    for limit in (10, 20, 30):
        metrics[f"within_{limit}_pct"] = round(float((np.abs(pred - y_test) / y_test <= limit / 100).mean() * 100), 1)

    # Price range: where do the real prices fall compared with the prediction?
    ratio = y_test.values / pred
    low_ratio, high_ratio = np.quantile(ratio, [0.10, 0.90])

    # Values for the website dropdowns (only locations with at least 10 listings)
    locations = {}
    for city, group in df.groupby("city"):
        counts = group["location"].value_counts()
        locations[city] = counts[counts >= 10].index.tolist()

    options = {
        "model_name": "Gradient Boosting",
        "n_training_houses": int(len(X_train)),
        "property_types": sorted(df["property_type"].unique().tolist()),
        "cities": sorted(df["city"].unique().tolist()),
        "locations": locations,
        "interval_ratio": [round(float(low_ratio), 3), round(float(high_ratio), 3)],
        "metrics": metrics,
    }

    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    with open(OPTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(options, f, indent=2, ensure_ascii=False)

    size_mb = MODEL_PATH.stat().st_size / 1024 / 1024
    print("Scores on the test houses:", metrics)
    print(f"80% of real prices fall between {low_ratio:.2f}x and {high_ratio:.2f}x the prediction")
    print(f"Saved model ({size_mb:.1f} MB) and options in {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()

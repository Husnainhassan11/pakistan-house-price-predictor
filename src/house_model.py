"""Shared code for training the model and predicting prices.

Both src/train.py and api/main.py use this file, so the features are built
in exactly the same way when the model learns and when it predicts.
"""
import numpy as np
import pandas as pd

# The columns the model uses (all of them are things a user can type into a website)
FEATURES = [
    "area_marla", "log_area", "bedrooms", "baths",
    "property_type", "city", "city_location",
]


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the two extra columns the model needs to a table of houses."""
    df = df.copy()
    df["city_location"] = df["city"] + " | " + df["location"]   # same name can exist in two cities
    df["log_area"] = np.log1p(df["area_marla"])                 # helps the model with size
    return df


def make_input_frame(property_type, city, location, area_marla, bedrooms, baths) -> pd.DataFrame:
    """Turn the details of ONE house into the one-row table the model expects."""
    return pd.DataFrame([{
        "area_marla": area_marla,
        "log_area": np.log1p(area_marla),
        "bedrooms": bedrooms,
        "baths": baths,
        "property_type": property_type,
        "city": city,
        "city_location": f"{city} | {location}",
    }])


def estimate_price(model, options: dict, property_type, city, location,
                   area_marla, bedrooms, baths) -> dict:
    """Predict the price of one house and give a likely range.

    Raises ValueError with a clear message if the property type or city is unknown.
    """
    if property_type not in options["property_types"]:
        raise ValueError(f"Unknown property_type '{property_type}'. "
                         f"Choose one of: {', '.join(options['property_types'])}")
    if city not in options["cities"]:
        raise ValueError(f"Unknown city '{city}'. Choose one of: {', '.join(options['cities'])}")

    house = make_input_frame(property_type, city, location, area_marla, bedrooms, baths)
    price = float(np.expm1(model.predict(house)[0]))        # the model predicts the log price

    # Range: on the test houses, 80% of real prices were between these two multiples of the prediction
    low_ratio, high_ratio = options["interval_ratio"]
    low, high = price * low_ratio, price * high_ratio

    note = None
    if location not in options["locations"].get(city, []):
        note = "This location is not in the training data, so the estimate is less reliable."

    return {
        "price_pkr": int(round(price, -3)),
        "price_crore": round(price / 1e7, 2),
        "low_pkr": int(round(low, -3)),
        "high_pkr": int(round(high, -3)),
        "low_crore": round(low / 1e7, 2),
        "high_crore": round(high / 1e7, 2),
        "note": note,
    }

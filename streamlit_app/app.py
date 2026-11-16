"""Streamlit demo for the Pakistan House Price Predictor.

Run from the project root:   streamlit run streamlit_app/app.py
"""
import json
import sys
from pathlib import Path

import joblib
import streamlit as st

# Make the project root importable, so we can use the shared code in src/
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.house_model import estimate_price  # noqa: E402

MODEL_PATH = ROOT / "models" / "house_price_model.joblib"
OPTIONS_PATH = ROOT / "models" / "options.json"

st.set_page_config(page_title="Pakistan House Price Predictor", page_icon="🏠", layout="centered")


@st.cache_resource
def load_model():
    """Load the model once and keep it in memory (not on every click)."""
    model = joblib.load(MODEL_PATH)
    with open(OPTIONS_PATH, encoding="utf-8") as f:
        options = json.load(f)
    return model, options


model, options = load_model()

# ---------- Header ----------
st.title("🏠 Pakistan House Price Predictor")
st.write("Enter the details of a house to get an estimated **sale price** and a likely price range.")

# ---------- Inputs ----------
col1, col2 = st.columns(2)

with col1:
    city = st.selectbox("City", options["cities"])
    property_type = st.selectbox("Property type", options["property_types"],
                                 index=options["property_types"].index("House")
                                 if "House" in options["property_types"] else 0)
    # The list of locations depends on the chosen city
    location = st.selectbox("Location (type to search)", options["locations"].get(city, []))

with col2:
    area_marla = st.number_input("Area (marla)", min_value=1.0, max_value=100.0,
                                 value=10.0, step=0.5,
                                 help="1 kanal = 20 marla. Areas from 1 to 100 marla are supported.")
    bedrooms = st.number_input("Bedrooms", min_value=1, max_value=15, value=3, step=1)
    baths = st.number_input("Bathrooms", min_value=1, max_value=15, value=3, step=1)

# ---------- Prediction ----------
if st.button("Estimate price", type="primary"):
    if not location:
        st.error("Please choose a location.")
    else:
        result = estimate_price(model, options, property_type, city, location,
                                area_marla, bedrooms, baths)

        st.subheader("Estimated price")
        c1, c2, c3 = st.columns(3)
        c1.metric("Estimate", f"{result['price_crore']:.2f} crore")
        c2.metric("Likely low", f"{result['low_crore']:.2f} crore")
        c3.metric("Likely high", f"{result['high_crore']:.2f} crore")

        st.write(f"About **PKR {result['price_pkr']:,}**, with a likely range of "
                 f"PKR {result['low_pkr']:,} to PKR {result['high_pkr']:,}.")

        if result["note"]:
            st.warning(result["note"])

        st.caption("The range shows where about 80% of real prices fell compared with the model's "
                   "prediction on houses it had never seen.")

# ---------- About ----------
with st.expander("About this model"):
    m = options["metrics"]
    st.write(
        f"- **Model:** {options['model_name']}, trained on {options['n_training_houses']:,} listings "
        f"from Zameen.com (2018 to 2019)\n"
        f"- **Typical error:** about {m['median_pct_error']:.0f}% (median)\n"
        f"- **Within 20% of the real price:** {m['within_20_pct']:.0f}% of test houses\n"
        f"- **Within 30% of the real price:** {m['within_30_pct']:.0f}% of test houses\n"
        f"- **R² (price):** {m['r2_price']}"
    )
    st.write("This is a learning project. Prices are from 2018 to 2019 and the model does not see a "
             "house's condition, street or floor, so use the result as a rough guide only.")

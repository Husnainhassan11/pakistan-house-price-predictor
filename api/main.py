"""FastAPI backend for the Pakistan House Price Predictor.

Run from the project root:   uvicorn api.main:app --reload
Then open:                   http://127.0.0.1:8000/docs
"""
import json
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.house_model import estimate_price

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "house_price_model.joblib"
OPTIONS_PATH = ROOT / "models" / "options.json"

# Load the model once, when the server starts
model = joblib.load(MODEL_PATH)
with open(OPTIONS_PATH, encoding="utf-8") as f:
    options = json.load(f)

app = FastAPI(
    title="Pakistan House Price Predictor API",
    description="Estimates the sale price of a house in a Pakistani city.",
    version="1.0.0",
)

# CORS lets a website (the Next.js frontend) call this API from the browser.
# Later we will add the Vercel address to this list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HouseInput(BaseModel):
    """The details of one house, sent by the user."""
    property_type: str = Field(..., examples=["House"])
    city: str = Field(..., examples=["Lahore"])
    location: str = Field(..., examples=["DHA Defence"])
    area_marla: float = Field(..., gt=0, le=100, examples=[10])
    bedrooms: int = Field(..., ge=1, le=15, examples=[4])
    baths: int = Field(..., ge=1, le=15, examples=[4])


class PredictionOut(BaseModel):
    """The answer sent back to the user."""
    price_pkr: int
    price_crore: float
    low_pkr: int
    high_pkr: int
    low_crore: float
    high_crore: float
    note: str | None = None


@app.get("/")
def health():
    """Quick check that the server is running."""
    return {"status": "ok", "model": options["model_name"]}


@app.get("/options")
def get_options():
    """Values for the website dropdowns, and the model's scores."""
    return {
        "property_types": options["property_types"],
        "cities": options["cities"],
        "locations": options["locations"],
        "area_range_marla": [1, 100],
        "metrics": options["metrics"],
    }


@app.post("/predict", response_model=PredictionOut)
def predict(house: HouseInput):
    """Predict the price of one house."""
    try:
        return estimate_price(model, options, **house.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err))

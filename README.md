# Pakistan House Price Predictor

Predicts house **sale prices** in Pakistani cities from the property type, city, location, area, bedrooms and bathrooms, and returns a likely price range.

**Live demo (Streamlit):** https://YOUR-APP-NAME.streamlit.app
**Live API (FastAPI docs):** https://pakistan-house-price-predictor.onrender.com/docs

> The API runs on a free plan and sleeps when unused. The first request can take 30 to 60 seconds to wake it up.

![Streamlit demo](images/streamlit_demo.png)

**Status:** Data cleaning, analysis, model, API and Streamlit demo are done and deployed. A Next.js frontend on Vercel is next.

**Pipeline:** cleaned data, trained model, FastAPI backend (deployed on Render), Streamlit demo (deployed on Streamlit Community Cloud), Next.js frontend on Vercel (planned).

---

## Dataset

- **Source:** [Pakistan House Price Dataset (Kaggle)](https://www.kaggle.com/datasets/jillanisofttech/pakistan-house-price-dataset), based on Zameen.com listings (2018 to 2019)
- **Original size:** 168,446 listings and 20 columns
- **After cleaning:** 80,351 listings (64,280 for training and 16,071 for testing)
- **Target:** `price` in PKR. Charts show prices in crore (1 crore = 10,000,000 PKR)

The raw CSV is not stored in this repository. Download it from Kaggle and place it in the `data/` folder.

---

## Data cleaning

Notebook: [`notebooks/01_eda.ipynb`](notebooks/01_eda.ipynb)

| Step | Rows removed | Why |
|---|---|---|
| Rental listings | 47,791 | Monthly rent and sale price mean different things, so they cannot share one `price` column |
| Duplicate listings | 38,286 | The same listing posted more than once would leak into both the training and test sets |
| Area outliers | 486 | Areas of 0 and up to 12,000 marla are data errors; kept 1 to 100 marla |
| Price outliers | 1,532 | Removed prices outside the 1st to 99th percentile |
| **Total removed** | **88,095** | **80,351 rows kept (47.7%)** |

Other cleaning steps:

- **Area units:** converted Kanal to Marla (1 Kanal = 20 Marla) into one column, `area_marla`, and verified the conversion
- **Dates:** converted `date_added` from text to a real date
- **Hidden missing values:** zeros in `bedrooms` and `baths` meant "not entered". They were replaced with the median of the same property type
- **Dropped columns:** `agency`, `agent`, `page_url`, `property_id`, `purpose` and the old area columns

The duplicate rule compares every column except the dates. It may also remove some different units in the same project that share price, size and coordinates. A milder rule is planned as a later experiment.

---

## Exploratory analysis

Notebook: [`notebooks/02_eda_charts.ipynb`](notebooks/02_eda_charts.ipynb)

![Price by city](images/02_price_by_city.png)
![Price vs area](images/03_price_vs_area.png)
![Correlation heatmap](images/05_correlation_heatmap.png)

### Key insights

1. **Area is the strongest driver of price.** The correlation between price and `area_marla` is 0.84, higher than bedrooms (0.64) or baths (0.63).
2. **City matters, and a few expensive listings pull averages up.** Islamabad has the highest median price (1.63 crore) and Faisalabad the lowest (0.90 crore). In every city the mean is above the median, and in Islamabad it is about 70% higher (2.77 vs 1.63 crore), so I predict the log of the price.
3. **More bedrooms raise the price, with diminishing returns.** The median rises from 0.38 crore (1 bedroom) to 3.25 crore (6 bedrooms), then stays around 3.5 to 4 crore for 7 to 11 bedrooms.
4. **Two property types dominate the data.** Houses (58,434) and flats (18,765) make up about 96% of the listings, while there are only 18 rooms, so rare types are hard to predict.
5. **Bedrooms and baths carry similar information.** Their correlation is 0.83. Latitude and longitude show almost no straight-line correlation with price, but the city chart shows location matters, so `city` and `location` are used as categories.

---

## Model

Notebook: [`notebooks/03_modeling.ipynb`](notebooks/03_modeling.ipynb) | Training script: [`src/train.py`](src/train.py)

**Features** (all things a user can type into a website): property type, city, location, area, bedrooms and baths.
**Method:** the models learn the log of the price. Categories are one-hot encoded, and rare locations (fewer than 30 listings) are grouped together. All scores are measured on 16,071 houses the model never saw during training.

### Model comparison

| Model | MAE (crore) | RMSE (crore) | R² (price) | Median % error |
|---|---|---|---|---|
| Dummy baseline (always the typical price) | 1.557 | 2.884 | -0.121 | 60.0% |
| Linear Regression | 0.547 | 1.137 | 0.826 | 18.4% |
| Random Forest | 0.480 | 1.005 | 0.864 | 15.2% |
| **Gradient Boosting** | **0.475** | **0.988** | **0.868** | 15.4% |

Random Forest and Gradient Boosting are almost tied. I deploy **Gradient Boosting** because it wins on four of five metrics and its saved model is 1.5 MB, compared with 147.6 MB for Random Forest.

### Final model results (Gradient Boosting)

| Metric | Result |
|---|---|
| R² (price) | 0.868 |
| Median error | 15.4% |
| Mean absolute error | 0.475 crore PKR |
| Predictions within 10% of the real price | 33.6% |
| Predictions within 20% of the real price | 60.9% |
| Predictions within 30% of the real price | 77.0% |

The API and the demo also return a price range, because one number looks more certain than it is: 80% of real prices fell between **0.72x and 1.39x** the prediction.

### Evaluation charts (from the Random Forest run in notebook 03)

![Model errors](images/08_model_errors.png)
![Feature importance](images/09_feature_importance.png)

**Most important features:** area (`log_area` 0.241 and `area_marla` 0.233, the same information in two forms), then location (`city_location` 0.132 and `city` 0.101), then property type (0.053), bedrooms (0.050) and baths (0.032).

### Limitations

- Very expensive houses (above about 10 crore) are under-predicted
- Rare property types such as Penthouse and Farm House have errors above 30%, because there are few examples
- The data covers 2018 to 2019, so today's prices are different and the model needs fresh data
- The test set is a random split, so similar houses from the same project may appear in both sets

---

## API

Code: [`api/main.py`](api/main.py) (FastAPI) | Live docs: https://pakistan-house-price-predictor.onrender.com/docs

| Endpoint | Purpose |
|---|---|
| `GET /` | Health check |
| `GET /options` | Cities, property types, locations and model scores (for website dropdowns) |
| `POST /predict` | Predict the price of one house |

**Example request:**
```json
{"property_type": "Flat", "city": "Islamabad", "location": "G-10",
 "area_marla": 5, "bedrooms": 2, "baths": 1}
```

**Example response:**
```json
{
  "price_pkr": 7702000,
  "price_crore": 0.77,
  "low_pkr": 5538000,
  "high_pkr": 10729000,
  "low_crore": 0.55,
  "high_crore": 1.07,
  "note": null
}
```

Unknown cities or property types return a clear `422` error, and an unknown location still returns a price with a warning in `note`.

---

## Deployment

| Part | Where | Notes |
|---|---|---|
| FastAPI backend | Render (free plan) | Build: `pip install -r requirements-api.txt`. Start: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`. Python version set with the `PYTHON_VERSION` environment variable |
| Streamlit demo | Streamlit Community Cloud | Main file: `streamlit_app/app.py`, with its own `streamlit_app/requirements.txt` |
| Next.js frontend | Vercel (planned) | Will call the Render API |

- The websites allowed to call the API are set with the `ALLOWED_ORIGINS` environment variable (comma separated). It defaults to `http://localhost:3000`.
- The model file is small (1.5 MB), so it is stored in the repository.
- Package versions (scikit-learn, pandas, numpy, joblib) are pinned, because a saved model depends on the versions used to train it.

---

## Project structure

```
pakistan-house-price-predictor/
├── api/
│   └── main.py                    # FastAPI backend
├── data/                          # raw and cleaned CSVs (not tracked by Git)
├── images/                        # charts and screenshots
├── models/
│   ├── house_price_model.joblib   # trained Gradient Boosting pipeline (1.5 MB)
│   └── options.json               # dropdown values, scores and price range
├── notebooks/
│   ├── 01_eda.ipynb               # data cleaning
│   ├── 02_eda_charts.ipynb        # charts and insights
│   └── 03_modeling.ipynb          # model training and evaluation
├── src/
│   ├── house_model.py             # shared feature and prediction code
│   └── train.py                   # trains and saves the final model
├── streamlit_app/
│   ├── app.py                     # Streamlit demo
│   └── requirements.txt
├── requirements.txt
├── requirements-api.txt
└── README.md
```

## How to run locally

1. Clone the repository and create a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate        # Windows
   pip install -r requirements.txt
   pip install -r requirements-api.txt
   pip install streamlit
   ```
2. Download the CSV from Kaggle and save it as `data/zameen-updated.csv`
3. Run `notebooks/01_eda.ipynb` from top to bottom. It creates `data/cleaned_house_prices.csv`
4. (Optional) Retrain the model: `python -m src.train`
5. Start the API from the project root: `uvicorn api.main:app --reload`, then open http://127.0.0.1:8000/docs
6. Start the Streamlit demo from the project root: `streamlit run streamlit_app/app.py`

## Roadmap

- [x] Data cleaning
- [x] Exploratory data analysis
- [x] Model training and comparison
- [x] FastAPI prediction API
- [x] Streamlit demo (deployed)
- [x] API deployed online (Render)
- [ ] Next.js frontend deployed on Vercel
- [ ] Cross-validation, tuning, and a milder duplicate rule

## Author

**Husnain Hassan**, Software Engineering graduate (UMT), aspiring AI engineer
GitHub: [Husnainhassan11](https://github.com/Husnainhassan11)

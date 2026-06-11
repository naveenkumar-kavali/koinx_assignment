# Transaction Reconciliation Engine

A fast, robust, and scalable Transaction Reconciliation Engine built in **Node.js** and **MongoDB** designed to ingest messy cryptocurrency transaction data from user-imported files and exchange exports, match them based on configurable tolerances, and generate detailed side-by-side reconciliation reports.

## Features & Core Logic

1. **Ingestion & Data Quality Validation:**
   - Parses CSV streams using `csv-parser` to support scalable file processing.
   - Normalizes assets (e.g. `bitcoin` to `BTC`, case-insensitive).
   - Normalizes types (e.g. `TRANSFER_OUT` on the user side corresponds to `TRANSFER_IN` on the exchange side).
   - Validates data rows. Rows with negative quantities, malformed timestamps, or missing fields are marked as invalid and saved to MongoDB with `isValid: false` and a list of `validationErrors` (they are not dropped silently).

2. **Matching Engine (with Proximity Resolution):**
   - Pairs user transactions with exchange transactions chronologically.
   - Uses configurable matching tolerances:
     - **Timestamp:** Within `TIMESTAMP_TOLERANCE_SECONDS` (default: 300s / 5 minutes).
     - **Quantity:** Within `QUANTITY_TOLERANCE_PCT` (default: 0.01%).
   - Evaluates a **Proximity Window** (default: 24 hours) for detecting potential conflicts:
     - **Matched:** Transactions that fall within both timestamp and quantity tolerances.
     - **Conflicting:** Transactions of the same asset and type that fall within the proximity window but exceed either the timestamp or quantity tolerances (e.g. quantity discrepancies or time drifts).
     - **Unmatched:** Transactions that do not match any candidates within the proximity window.
   - Handles duplicates by ensuring that once an exchange transaction matches, it is marked as `isMatched: true` and excluded from subsequent matching pools (preventing double-matching).

3. **Side-by-Side Reconciliation CSV Report:**
   - Generates CSV reports aligning matching user and exchange records in a single side-by-side row format, alongside a detailed categorization and explanation for the outcome (e.g. exact difference percentages, specific validation issues).

---

## Technical Stack
- **Runtime:** Node.js (v22+)
- **Database:** MongoDB / Mongoose
- **Framework:** Express.js
- **CSV Processing:** csv-parser

---

## Configuration

Tolerances and connection URLs are configured via a `.env` file at the root of the project:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/reconciliation
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
PROXIMITY_WINDOW_SECONDS=86400
```

---

## REST API Documentation

### 1. Trigger Reconciliation Run
- **Endpoint:** `POST /reconcile`
- **Body Options (Optional overrides):**
  ```json
  {
    "timestampToleranceSeconds": 300,
    "quantityTolerancePct": 0.01,
    "proximityWindowSeconds": 86400,
    "userCsvPath": "./user_transactions.csv",
    "exchangeCsvPath": "./exchange_transactions.csv"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Reconciliation run completed successfully",
    "run": {
      "_id": "6a2838bb493c94355358f277",
      "status": "completed",
      "config": {
        "timestampToleranceSeconds": 300,
        "quantityTolerancePct": 0.01,
        "proximityWindowSeconds": 86400
      },
      "summary": {
        "matchedCount": 21,
        "conflictingCount": 1,
        "unmatchedUserCount": 4,
        "unmatchedExchangeCount": 3,
        "invalidUserCount": 3,
        "invalidExchangeCount": 0
      },
      "createdAt": "2026-06-09T16:00:59.727Z"
    }
  }
  ```

### 2. Fetch Full Reconciliation Report
- **Endpoint:** `GET /report/:runId`
- **Parameters:** `runId` - The ID of the reconciliation run.
- **Query Params:** `?format=csv` (Optional) - Returns the report as a downloadable side-by-side CSV file.
- **Accept Header:** `text/csv` - Can also be set to request the CSV format.

### 3. Fetch Reconciliation Run Summary
- **Endpoint:** `GET /report/:runId/summary`
- **Response:** Returns statistics and configurations for the run.

### 4. Fetch Unmatched & Conflicting Transactions
- **Endpoint:** `GET /report/:runId/unmatched`
- **Query Params:** `?format=csv` (Optional) - Returns the unmatched records as a downloadable CSV.

---

## Ingestion & Verification Scripts

We provide two pre-configured verification scripts:

1. **`test_reconcile.js`**: Runs the ingestion and matching processes locally inside Node.js, prints the database results, and asserts that crucial test cases (strict matching, alias resolution, quantity conflicts, malformed timestamps, and unmatched exchange rows) reconcile correctly.
   ```bash
   node test_reconcile.js
   ```

2. **`test_api.js`**: Automatically triggers the running Express web server, calls the REST APIs (`POST /reconcile`, `GET /report/:runId/summary`, `GET /report/:runId/unmatched`, and `GET /report/:runId?format=csv`), and asserts response validity.
   ```bash
   node test_api.js
   ```

---

## Setup & Running Guide

1. **Ensure MongoDB is running:**
   ```bash
   # Linux service check
   sudo systemctl start mongod
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Express API Server:**
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Verify the Engine:**
   Run the verification test scripts in separate terminals:
   ```bash
   node test_reconcile.js  # Test the database reconciliation engine logic
   node test_api.js        # Test the REST API endpoints
   ```

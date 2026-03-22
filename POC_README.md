# DataLoom PoC -- Multi-Format Ingestion & Automated Quality Engine

Proof-of-concept for the GSoC 2026 project:
*"DataLoom -- A Web-Based Data Wrangling Tool with Git-Like Checkpoint/Revert, Multi-Format Support, Data Profiling, Formula Columns, Visualization, and Automated Quality Engine"*

## What This Demonstrates

This PoC implements the two foundational backend modules that the rest of the
project builds on, following DataLoom's existing code conventions exactly.

### 1. Multi-Format Ingestion & Export (`app/services/format_handler.py`)

Loads **CSV, XLSX, JSON, Parquet, and TSV** files into pandas DataFrames and
exports DataFrames back to any of those formats. Each loader handles
format-specific edge cases (encoding fallback for CSV/TSV, orientation
auto-detection for JSON, openpyxl engine for XLSX, pyarrow engine for Parquet).

This is the foundation for the project -- DataLoom currently only accepts CSV.
Without multi-format support, the tool cannot be the first step in a real data
pipeline.

### 2. Automated Data Quality Engine (`app/services/quality_engine.py`)

The core mechanism of the project. Given a DataFrame, the engine:

1. **Profiles** every column (null %, unique %, min/max/mean/std/median, top values)
2. **Detects duplicates** (exact row matches)
3. **Detects outliers** per numeric column (IQR method with configurable threshold)
4. **Computes a composite 0--100 quality score** (weighted: completeness 35%, uniqueness 35%, consistency 30%)
5. **Suggests ranked one-click fixes** with confidence scores (remove duplicates, fill nulls with median/mode, remove outliers)
6. **Applies fixes** as pure functions (DataFrame in -> DataFrame out), following the same contract as DataLoom's `transformation_service.py` so that fixes slot directly into the existing checkpoint/replay system

### 3. Quality API Endpoint (`app/api/endpoints/quality.py`)

A single endpoint (`POST /projects/{id}/quality/profile`) wired into the
existing FastAPI router structure, showing how the quality engine integrates
with DataLoom's API layer and dependency injection.

## How to Run

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager

### Install Dependencies

```bash
cd dataloom-backend
uv sync
```

### Run Tests

```bash
cd dataloom-backend
uv run pytest tests/test_format_handler.py tests/test_quality_engine.py -v
```

## Files

### Added

| File | Purpose |
|------|---------|
| `app/services/format_handler.py` | Multi-format ingestion & export (CSV, XLSX, JSON, Parquet, TSV) |
| `app/services/quality_engine.py` | Data quality profiling, detection, scoring, fix suggestion & application |
| `app/api/endpoints/quality.py` | Quality assessment API endpoint |
| `tests/test_format_handler.py` | 25 tests: loaders, round-trip export, edge cases |
| `tests/test_quality_engine.py` | 25 tests: profiling, detection, scoring, fixes, end-to-end |

### Modified

| File | Change |
|------|--------|
| `pyproject.toml` | Added `openpyxl>=3.1` and `pyarrow>=12.0` dependencies |
| `app/config.py` | Expanded `allowed_extensions` to include `.xlsx`, `.json`, `.parquet`, `.tsv` |
| `app/main.py` | Mounted the quality API router |

## Design Decisions

**Why these two modules?** Multi-format ingestion is the prerequisite for every
other planned feature (you can't wrangle data you can't load). The quality
engine is the most technically complex new feature and the one that best
demonstrates understanding of the data preparation domain.

**Pure function pattern.** Every quality engine function follows the same
contract as `transformation_service.py`: take a DataFrame (and parameters),
return a result with no side effects. This means `apply_fix()` integrates
with the existing checkpoint/replay system without any changes to that system --
a fix is just another logged transformation.

**No over-engineering.** The PoC uses only pandas and standard library tools
for all detection logic (IQR for outliers, `df.duplicated()` for duplicates).
scikit-learn and other ML libraries are reserved for the full implementation
where IsolationForest and other advanced methods will be added.

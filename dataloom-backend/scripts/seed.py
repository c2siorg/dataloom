"""Standalone seed script for development environments.

Creates sample projects with demo CSV data for local development and testing.
Run manually after setting up the database:

    uv run python scripts/seed.py

This script uses in-app service functions so it automatically stays in sync
with the codebase.
"""

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.database import get_db
from app.services import auth_service
from app.services.project_service import create_project

DEV_USER_EMAIL = "test@test.com"
DEV_USER_PASSWORD = "testpassword"

SAMPLE_PROJECTS = [
    {
        "name": "Sales Data 2024",
        "description": "Sales transactions across regions and product categories",
        "filename": "seed_sales_data_2024",
        "headers": ["Product", "Region", "Amount", "Units", "Date"],
        "rows": [
            ["Laptop", "North", "1200.00", "5", "2024-01-15"],
            ["Keyboard", "South", "75.00", "20", "2024-01-18"],
            ["Monitor", "East", "450.00", "8", "2024-02-03"],
            ["Mouse", "West", "25.00", "50", "2024-02-10"],
            ["Laptop", "South", "1150.00", "3", "2024-03-01"],
            ["Headset", "North", "85.00", "15", "2024-03-12"],
            ["Webcam", "East", "60.00", "12", "2024-04-05"],
            ["Monitor", "West", "430.00", "6", "2024-04-20"],
            ["Keyboard", "North", "80.00", "25", "2024-05-08"],
            ["Laptop", "East", "1250.00", "4", "2024-05-22"],
        ],
    },
    {
        "name": "Employee Directory",
        "description": "Company employee records with department and role information",
        "filename": "seed_employee_directory",
        "headers": ["Name", "Department", "Role", "Salary", "Hire_Date"],
        "rows": [
            ["Alice Johnson", "Engineering", "Senior Developer", "95000", "2020-03-15"],
            ["Bob Smith", "Marketing", "Campaign Manager", "72000", "2021-06-01"],
            ["Carol Davis", "Engineering", "Tech Lead", "115000", "2019-01-10"],
            ["Dan Wilson", "Sales", "Account Executive", "68000", "2022-02-20"],
            ["Eve Martinez", "Engineering", "Junior Developer", "65000", "2023-07-12"],
            ["Frank Brown", "HR", "Recruiter", "58000", "2021-11-05"],
            ["Grace Lee", "Marketing", "Content Strategist", "70000", "2022-08-15"],
            ["Henry Chen", "Sales", "Sales Manager", "88000", "2020-05-22"],
            ["Ivy Patel", "Engineering", "DevOps Engineer", "98000", "2021-03-30"],
            ["Jack Taylor", "HR", "HR Manager", "82000", "2019-09-18"],
        ],
    },
    {
        "name": "Weather Observations",
        "description": "Daily weather measurements from various cities",
        "filename": "seed_weather_observations",
        "headers": ["City", "Temperature_C", "Humidity_Pct", "Wind_Speed_Kmh", "Date"],
        "rows": [
            ["New York", "22", "65", "18", "2024-06-01"],
            ["London", "15", "78", "22", "2024-06-01"],
            ["Tokyo", "28", "70", "12", "2024-06-01"],
            ["Sydney", "14", "55", "25", "2024-06-01"],
            ["New York", "25", "60", "15", "2024-06-02"],
            ["London", "17", "72", "20", "2024-06-02"],
            ["Tokyo", "30", "75", "10", "2024-06-02"],
            ["Sydney", "12", "50", "28", "2024-06-02"],
            ["New York", "20", "68", "22", "2024-06-03"],
            ["London", "14", "80", "18", "2024-06-03"],
        ],
    },
    {
        "name": "Student Grades",
        "description": "Academic performance records across subjects and semesters",
        "filename": "seed_student_grades",
        "headers": ["Student", "Subject", "Grade", "Semester", "Year"],
        "rows": [
            ["Emma Wilson", "Mathematics", "A", "Fall", "2024"],
            ["Emma Wilson", "Physics", "B+", "Fall", "2024"],
            ["Liam Garcia", "Mathematics", "B", "Fall", "2024"],
            ["Liam Garcia", "Chemistry", "A-", "Fall", "2024"],
            ["Sophia Kim", "English", "A", "Fall", "2024"],
            ["Sophia Kim", "History", "A", "Fall", "2024"],
            ["Noah Brown", "Physics", "C+", "Fall", "2024"],
            ["Noah Brown", "Mathematics", "B-", "Fall", "2024"],
            ["Olivia Chen", "Chemistry", "A", "Spring", "2024"],
            ["Olivia Chen", "English", "B+", "Spring", "2024"],
        ],
    },
]

SEPARATOR = "-" * 60
INDENT = "  "


def write_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    """Write CSV file with headers and rows."""
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def print_header() -> None:
    print(SEPARATOR)
    print("  Database Seed")
    print(SEPARATOR)


def print_footer(count: int) -> None:
    print(SEPARATOR)
    print(f"  {count} project(s) seeded successfully.")
    print(SEPARATOR)


def seed_dev_user(db) -> "auth_service.models.User":
    """Get or create the development test user.

    Idempotent so repeated `uv run python scripts/seed.py` runs do not error.
    """
    existing = auth_service.get_user_by_email(db, DEV_USER_EMAIL)
    if existing is not None:
        print(f"{INDENT}[ok]  dev user already exists: {DEV_USER_EMAIL}")
        return existing
    user = auth_service.create_user(db, DEV_USER_EMAIL, DEV_USER_PASSWORD)
    print(f"{INDENT}[ok]  created dev user: {DEV_USER_EMAIL} / {DEV_USER_PASSWORD}")
    return user


def seed() -> None:
    """Create the dev user and sample projects owned by them."""
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)

    db = next(get_db())
    seeded = 0

    print_header()

    try:
        dev_user = seed_dev_user(db)
        for sample in SAMPLE_PROJECTS:
            original_path = upload_dir / f"{sample['filename']}.csv"
            copy_path = upload_dir / f"{sample['filename']}_copy.csv"

            write_csv(original_path, sample["headers"], sample["rows"])
            write_csv(copy_path, sample["headers"], sample["rows"])

            create_project(
                db=db,
                name=sample["name"],
                file_path=str(copy_path),
                description=sample["description"],
                owner_id=dev_user.id,
            )

            seeded += 1
            print(f"{INDENT}[ok]  {sample['name']}")

        print()
        print_footer(seeded)

    except Exception as e:
        print()
        print(f"{INDENT}[error]  Seeding failed: {e}")
        print(SEPARATOR)
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed()

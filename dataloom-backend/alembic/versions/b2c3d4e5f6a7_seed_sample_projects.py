"""seed sample projects

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-22 14:00:00.000000

"""

import csv
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op
from app.config import get_settings

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SAMPLE_PROJECTS = [
    {
        "project_id": "00000000-0000-0000-0000-000000000001",
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
        "project_id": "00000000-0000-0000-0000-000000000002",
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
        "project_id": "00000000-0000-0000-0000-000000000003",
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
        "project_id": "00000000-0000-0000-0000-000000000004",
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


def _write_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def upgrade() -> None:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)

    bind = op.get_bind()

    for sample in SAMPLE_PROJECTS:
        original_path = upload_dir / f"{sample['filename']}.csv"
        copy_path = upload_dir / f"{sample['filename']}_copy.csv"

        _write_csv(original_path, sample["headers"], sample["rows"])
        _write_csv(copy_path, sample["headers"], sample["rows"])

        bind.execute(
            sa.text(
                "INSERT INTO projects (project_id, name, description, file_path, upload_date, last_modified)"
                " VALUES (:project_id, :name, :description, :file_path, now(), now())"
            ),
            {
                "project_id": sample["project_id"],
                "name": sample["name"],
                "description": sample["description"],
                "file_path": str(copy_path),
            },
        )


def downgrade() -> None:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()

    bind = op.get_bind()

    for sample in SAMPLE_PROJECTS:
        bind.execute(
            sa.text("DELETE FROM projects WHERE project_id = :project_id"),
            {"project_id": sample["project_id"]},
        )

        original_path = upload_dir / f"{sample['filename']}.csv"
        copy_path = upload_dir / f"{sample['filename']}_copy.csv"
        original_path.unlink(missing_ok=True)
        copy_path.unlink(missing_ok=True)

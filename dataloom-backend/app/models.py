"""SQLModel ORM models for the DataLoom application.

Defines the database schema for datasets, transformation change logs,
and save checkpoints.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, Relationship, SQLModel

import sqlalchemy as sa


class Dataset(SQLModel, table=True):
    """A user-uploaded dataset with metadata and file reference."""

    __tablename__ = "datasets"

    dataset_id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str | None = None
    upload_date: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )
    last_modified: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )
    file_path: str

    logs: list["DatasetChangeLog"] = Relationship(
        back_populates="dataset",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    checkpoints: list["Checkpoint"] = Relationship(
        back_populates="dataset",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class DatasetChangeLog(SQLModel, table=True):
    """A record of a single transformation applied to a dataset."""

    __tablename__ = "user_logs"

    change_log_id: int | None = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="datasets.dataset_id")
    action_type: str = Field(max_length=50)
    action_details: dict = Field(sa_column=sa.Column(sa.JSON, nullable=False))
    timestamp: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )
    checkpoint_id: int | None = Field(default=None, foreign_key="checkpoints.id")
    applied: bool = Field(
        default=False,
        sa_column=sa.Column(sa.Boolean, server_default="false", nullable=False),
    )

    dataset: Dataset | None = Relationship(back_populates="logs")


class Checkpoint(SQLModel, table=True):
    """A save point marking a set of applied transformations."""

    __tablename__ = "checkpoints"

    id: int | None = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="datasets.dataset_id")
    message: str
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )

    dataset: Dataset | None = Relationship(back_populates="checkpoints")

"""SQLModel ORM models for the DataLoom application.

Defines the database schema for projects, transformation change logs,
and save checkpoints.
"""

import uuid as uuid_mod
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, Relationship, SQLModel
from uuid6 import uuid7


class User(SQLModel, table=True):
    """Application user that owns uploaded projects."""

    __tablename__ = "users"

    id: uuid_mod.UUID = Field(
        default_factory=uuid7,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid7),
    )
    email: str = Field(sa_column=Column(sa.String(320), nullable=False, unique=True, index=True))
    password_hash: str = Field(sa_column=Column(sa.String(1024), nullable=False))
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )

    projects: list["Project"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"passive_deletes": True},
    )


class Project(SQLModel, table=True):
    """A user-uploaded project with metadata and file reference."""

    __tablename__ = "projects"

    project_id: uuid_mod.UUID = Field(
        default_factory=uuid_mod.uuid4,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid_mod.uuid4),
    )
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
    owner_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    file_path: str

    owner: User = Relationship(back_populates="projects")
    logs: list["ProjectChangeLog"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    checkpoints: list["Checkpoint"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ProjectChangeLog(SQLModel, table=True):
    """A record of a single transformation applied to a project."""

    __tablename__ = "user_logs"

    change_log_id: int | None = Field(default=None, primary_key=True)
    project_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("projects.project_id"), nullable=False),
    )
    action_type: str = Field(max_length=50)
    action_details: dict = Field(sa_column=sa.Column(sa.JSON, nullable=False))
    timestamp: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )
    checkpoint_id: uuid_mod.UUID | None = Field(
        default=None,
        sa_column=Column(sa.Uuid, sa.ForeignKey("checkpoints.id"), nullable=True),
    )
    applied: bool = Field(
        default=False,
        sa_column=sa.Column(sa.Boolean, server_default="false", nullable=False),
    )

    project: Project | None = Relationship(back_populates="logs")


class Checkpoint(SQLModel, table=True):
    """A save point marking a set of applied transformations."""

    __tablename__ = "checkpoints"

    id: uuid_mod.UUID = Field(
        default_factory=uuid_mod.uuid4,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid_mod.uuid4),
    )
    project_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("projects.project_id"), nullable=False),
    )
    message: str
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now()),
    )

    project: Project | None = Relationship(back_populates="checkpoints")

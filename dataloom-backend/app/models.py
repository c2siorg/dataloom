"""SQLModel ORM models for the DataLoom application.

Defines the database schema for projects, transformation change logs,
and save checkpoints.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

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


class PasswordResetToken(SQLModel, table=True):
    """Time-limited token for password reset requests."""

    __tablename__ = "password_reset_tokens"

    id: int | None = Field(default=None, primary_key=True)
    user_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    )
    token_hash: str = Field(sa_column=Column(sa.String(64), nullable=False, index=True))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    used: bool = Field(
        default=False,
        sa_column=sa.Column(sa.Boolean, server_default="false", nullable=False),
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
        sa_column=Column(DateTime, server_default=func.now(), onupdate=func.now()),
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
    files: list["ProjectFile"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ProjectFile(SQLModel, table=True):
    """An immutable source file added to a project after the initial upload.

    Forms the project's file inventory: the stored file is never modified or
    deleted by data operations, so an append that is later undone or reverted
    away can always be re-applied from the inventory.
    """

    __tablename__ = "project_files"

    id: uuid_mod.UUID = Field(
        default_factory=uuid_mod.uuid4,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid_mod.uuid4),
    )
    project_id: uuid_mod.UUID = Field(
        sa_column=Column(
            sa.Uuid,
            sa.ForeignKey("projects.project_id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    file_path: str
    original_filename: str
    uploaded_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )

    project: Project | None = Relationship(back_populates="files")


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
    # The undo step this row was logged by. NULL for rows logged before undo
    # steps existed and for rows whose step was cleared by a save or revert.
    undo_step_id: int | None = Field(
        default=None,
        sa_column=Column(
            sa.Integer,
            sa.ForeignKey("undo_steps.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )

    project: Project | None = Relationship(back_populates="logs")


UNDO_STEP_DONE = "done"
UNDO_STEP_UNDONE = "undone"


class UndoStep(SQLModel, table=True):
    """One user action's worth of unsaved work, and the snapshots that undo and redo it.

    A transform, a whole pipeline Run and a file append are each one step, so
    one Undo reverses exactly what the user did in one click. ``entries`` keeps
    the step's change-log rows verbatim: undo deletes those rows from
    ``user_logs``, and redo re-inserts them from here, so the change log keeps
    meaning "applied transformations" for every other reader.

    ``before_path`` is a byte copy of the working copy taken just before the
    step, and ``after_path`` one taken just before it was undone. Either may be
    NULL: old ``before_path`` snapshots are evicted past the retention limit,
    and ``after_path`` only exists while the step is undone.

    ``id`` orders steps (never ``created_at``, which ties within a request),
    and ``undone_seq`` orders the redo stack, last undone first.
    """

    __tablename__ = "undo_steps"

    id: int | None = Field(default=None, primary_key=True)
    project_id: uuid_mod.UUID = Field(
        sa_column=Column(
            sa.Uuid,
            sa.ForeignKey("projects.project_id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    status: str = Field(sa_column=Column(sa.String(10), nullable=False))
    entries: list = Field(sa_column=Column(sa.JSON, nullable=False))
    before_path: str | None = Field(default=None, sa_column=Column(sa.String, nullable=True))
    after_path: str | None = Field(default=None, sa_column=Column(sa.String, nullable=True))
    undone_seq: int | None = Field(default=None, sa_column=Column(sa.Integer, nullable=True))
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )


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


class Pipeline(SQLModel, table=True):
    """A named, reusable sequence of transformation steps owned by a user."""

    __tablename__ = "pipelines"

    id: uuid_mod.UUID = Field(
        default_factory=uuid_mod.uuid4,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid_mod.uuid4),
    )
    name: str = Field(max_length=200)
    description: str | None = None
    owner_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    created_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime, server_default=func.now(), nullable=False),
    )

    steps: list["PipelineStep"] = Relationship(
        back_populates="pipeline",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "PipelineStep.step_order"},
    )


class PipelineStep(SQLModel, table=True):
    """One transformation step of a pipeline.

    ``action_type`` and ``action_details`` are copied verbatim from a
    ``user_logs`` row, so a step replays through the same transformation
    registry as the save path.
    """

    __tablename__ = "pipeline_steps"

    id: int | None = Field(default=None, primary_key=True)
    pipeline_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    step_order: int = Field(sa_column=Column(sa.Integer, nullable=False))
    action_type: str = Field(max_length=50)
    action_details: dict = Field(sa_column=sa.Column(sa.JSON, nullable=False))

    pipeline: Pipeline | None = Relationship(back_populates="steps")


JOB_QUEUED = "queued"
JOB_RUNNING = "running"
JOB_SUCCEEDED = "succeeded"
JOB_FAILED = "failed"
JOB_CANCELLED = "cancelled"
JOB_ACTIVE_STATUSES = (JOB_QUEUED, JOB_RUNNING)
JOB_TERMINAL_STATUSES = (JOB_SUCCEEDED, JOB_FAILED, JOB_CANCELLED)

# At most one exclusive (write) job per project may be queued or running. Both
# dialects get the same predicate so the SQLite test schema enforces it too.
_ACTIVE_EXCLUSIVE_JOB = "is_exclusive AND status IN ('queued', 'running')"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Job(SQLModel, table=True):
    """One execution of slow work off the request path.

    A Job is how work runs, never what the work is: a pipeline Run executed as a
    Job is still a Run, and appears in the Change Log exactly as a synchronous
    one does. The row holds the work's parameters, its progress and a small
    result — never row data.

    ``status`` moves ``queued`` → ``running`` → ``succeeded`` | ``failed`` |
    ``cancelled``; a queued job may also be cancelled directly. Every transition
    is a conditional UPDATE on the expected current status, so a cancel racing a
    worker's claim resolves to exactly one outcome.

    ``is_exclusive`` marks work that rewrites the project (a Run, a revert); the
    partial unique index keeps at most one such job active per project.
    ``cancel_requested`` stays set on a job that finished anyway, so the client
    can say the cancel arrived too late.
    """

    __tablename__ = "jobs"
    __table_args__ = (
        sa.Index(
            "ux_jobs_active_exclusive_project",
            "project_id",
            unique=True,
            postgresql_where=sa.text(_ACTIVE_EXCLUSIVE_JOB),
            sqlite_where=sa.text(_ACTIVE_EXCLUSIVE_JOB),
        ),
        sa.Index("ix_jobs_project_id_status", "project_id", "status"),
        sa.Index("ix_jobs_owner_id_status", "owner_id", "status"),
    )

    id: uuid_mod.UUID = Field(
        default_factory=uuid7,
        sa_column=Column(sa.Uuid, primary_key=True, default=uuid7),
    )
    owner_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    )
    project_id: uuid_mod.UUID = Field(
        sa_column=Column(sa.Uuid, sa.ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False),
    )
    kind: str = Field(sa_column=Column(sa.String(32), nullable=False))
    is_exclusive: bool = Field(sa_column=Column(sa.Boolean, nullable=False))
    status: str = Field(default=JOB_QUEUED, sa_column=Column(sa.String(16), nullable=False))
    progress_current: int = Field(default=0, sa_column=Column(sa.Integer, nullable=False))
    progress_total: int | None = Field(default=None, sa_column=Column(sa.Integer, nullable=True))
    progress_message: str = Field(default="", sa_column=Column(sa.String(200), nullable=False))
    params: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
    result: dict | None = Field(default=None, sa_column=Column(sa.JSON, nullable=True))
    error: str | None = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    cancel_requested: bool = Field(
        default=False,
        sa_column=Column(sa.Boolean, server_default=sa.false(), nullable=False),
    )
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    started_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    finished_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))

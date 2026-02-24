"""use_uuids_for_dataset_and_checkpoint_ids

Revision ID: 34e620d988fc
Revises: 
Create Date: 2026-02-22 10:52:35.360767

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34e620d988fc'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Creates all tables from scratch with UUID primary/foreign keys.
    This is the initial migration for a fresh database.
    """
    # Create datasets table with UUID primary key
    op.create_table(
        'datasets',
        sa.Column('dataset_id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.VARCHAR(), nullable=False),
        sa.Column('description', sa.VARCHAR(), nullable=True),
        sa.Column('upload_date', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_modified', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('file_path', sa.VARCHAR(), nullable=False),
        sa.PrimaryKeyConstraint('dataset_id'),
    )

    # Create checkpoints table with UUID primary key and FK to datasets
    op.create_table(
        'checkpoints',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('message', sa.VARCHAR(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], name='checkpoints_dataset_id_fkey', ondelete='CASCADE'),
    )

    # Create user_logs table with integer PK and UUID FKs
    op.create_table(
        'user_logs',
        sa.Column('change_log_id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('action_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('action_details', sa.JSON(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('checkpoint_id', sa.Uuid(), nullable=True),
        sa.Column('applied', sa.Boolean(), server_default='false', nullable=False),
        sa.PrimaryKeyConstraint('change_log_id'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], name='user_logs_dataset_id_fkey', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['checkpoint_id'], ['checkpoints.id'], name='user_logs_checkpoint_id_fkey', ondelete='SET NULL'),
    )


def downgrade() -> None:
    """Downgrade schema. Drops all created tables."""
    op.drop_table('user_logs')
    op.drop_table('checkpoints')
    op.drop_table('datasets')

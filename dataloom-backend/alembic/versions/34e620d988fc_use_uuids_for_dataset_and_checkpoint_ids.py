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
    """Create initial tables with UUID primary keys."""
    # datasets table (will be renamed to projects in a later migration)
    op.create_table(
        'datasets',
        sa.Column('dataset_id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('upload_date', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_modified', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('dataset_id'),
    )
    op.create_index(op.f('ix_datasets_name'), 'datasets', ['name'], unique=False)

    # checkpoints table
    op.create_table(
        'checkpoints',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], name='checkpoints_dataset_id_fkey'),
        sa.PrimaryKeyConstraint('id'),
    )

    # user_logs table
    op.create_table(
        'user_logs',
        sa.Column('change_log_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('action_details', sa.JSON(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('checkpoint_id', sa.Uuid(), nullable=True),
        sa.Column('applied', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['checkpoint_id'], ['checkpoints.id'], name='user_logs_checkpoint_id_fkey'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.dataset_id'], name='user_logs_dataset_id_fkey'),
        sa.PrimaryKeyConstraint('change_log_id'),
    )


def downgrade() -> None:
    op.drop_table('user_logs')
    op.drop_table('checkpoints')
    op.drop_index(op.f('ix_datasets_name'), table_name='datasets')
    op.drop_table('datasets')


"""add hierarchy_level to job_catalog and job_catalog_id to users

Revision ID: 2296a3fa00ca
Revises: 001
Create Date: 2026-02-21 21:57:38.784098

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '2296a3fa00ca'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('job_catalog', sa.Column('hierarchy_level', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('users', sa.Column('job_catalog_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_users_job_catalog', 'users', 'job_catalog', ['job_catalog_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_users_job_catalog', 'users', type_='foreignkey')
    op.drop_column('users', 'job_catalog_id')
    op.drop_column('job_catalog', 'hierarchy_level')

"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Org Units
    op.create_table(
        'org_units',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('overhead_multiplier', sa.Numeric(4, 2), server_default='1.00'),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('org_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('org_units.id'), nullable=True),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Budgets
    op.create_table(
        'budgets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('org_units.id'), nullable=False),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('approved_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('locked', sa.Boolean(), server_default='false'),
        sa.Column('locked_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('locked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('org_unit_id', 'month', name='uq_budget_org_month'),
    )

    # Forecasts
    op.create_table(
        'forecasts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('org_units.id'), nullable=False),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('source', sa.String(50), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('org_unit_id', 'month', name='uq_forecast_org_month'),
    )

    # Actuals
    op.create_table(
        'actuals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('org_units.id'), nullable=False),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('finalized', sa.Boolean(), server_default='false'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.UniqueConstraint('org_unit_id', 'month', name='uq_actual_org_month'),
    )

    # Job Catalog
    op.create_table(
        'job_catalog',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('job_family', sa.String(100), nullable=False),
        sa.Column('level', sa.String(20), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('monthly_cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Requisitions
    op.create_table(
        'requisitions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_unit_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('org_units.id'), nullable=False),
        sa.Column('job_catalog_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('job_catalog.id'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('priority', sa.String(10), server_default='P2'),
        sa.Column('status', sa.String(20), server_default='DRAFT'),
        sa.Column('target_start_month', sa.String(7), nullable=True),
        sa.Column('estimated_monthly_cost', sa.Numeric(15, 2), nullable=True),
        sa.Column('has_candidate_ready', sa.Boolean(), server_default='false'),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Offers
    op.create_table(
        'offers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('requisition_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('requisitions.id'), nullable=False),
        sa.Column('candidate_name', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), server_default='DRAFT'),
        sa.Column('proposed_monthly_cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('final_monthly_cost', sa.Numeric(15, 2), nullable=True),
        sa.Column('currency', sa.String(3), server_default='BRL'),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('hold_reason', sa.Text(), nullable=True),
        sa.Column('hold_until', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Audit Logs
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('changes', postgresql.JSONB(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )

    # Indexes
    op.create_index('idx_audit_entity', 'audit_logs', ['entity_type', 'entity_id'])
    op.create_index('idx_audit_user', 'audit_logs', ['user_id'])
    op.create_index('idx_audit_created', 'audit_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('offers')
    op.drop_table('requisitions')
    op.drop_table('job_catalog')
    op.drop_table('actuals')
    op.drop_table('forecasts')
    op.drop_table('budgets')
    op.drop_table('users')
    op.drop_table('org_units')

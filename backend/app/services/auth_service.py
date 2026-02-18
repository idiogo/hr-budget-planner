import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import User
from app.utils.security import verify_password, get_password_hash


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str
) -> User | None:
    """Authenticate user by email and password."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .where(User.email == email, User.active == True)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    if not verify_password(password, user.password_hash):
        return None
    
    return user


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Get user by ID with org_unit loaded."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .where(User.id == user_id, User.active == True)
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
    role: str,
    org_unit_id: uuid.UUID | None = None
) -> User:
    """Create a new user."""
    user = User(
        email=email,
        name=name,
        password_hash=get_password_hash(password),
        role=role,
        org_unit_id=org_unit_id
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

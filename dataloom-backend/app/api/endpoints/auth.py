"""Authentication router."""

from fastapi import APIRouter, Depends

from app.api.dependencies import current_active_user
from app.models import User
from app.schemas import UserCreate, UserRead
from app.services.auth_service import auth_backend, fastapi_users

router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/jwt")
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))


@router.get("/me", response_model=UserRead)
async def get_current_user_profile(user: User = Depends(current_active_user)) -> User:
    """Return the currently authenticated user."""
    return user

"""Authentication API endpoints: signup, signin, logout, and current user."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_current_user
from app.config import get_settings
from app.services import auth_service
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()

ACCESS_TOKEN_COOKIE = "access_token"


def _set_auth_cookie(response: Response, token: str) -> None:
    """Attach the JWT auth token to the response as an httpOnly cookie."""
    settings = get_settings()
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.jwt_expiry_hours * 3600,
        path="/",
    )


@router.post("/signup", response_model=schemas.UserResponse, status_code=201)
def signup(payload: schemas.SignupRequest, response: Response, db: Session = Depends(database.get_db)):
    """Register a new user and issue an auth cookie."""
    if auth_service.get_user_by_email(db, payload.email) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = auth_service.create_user(db, payload.email, payload.password)
    _set_auth_cookie(response, auth_service.create_access_token(user.id))
    return user


@router.post("/signin", response_model=schemas.UserResponse)
def signin(payload: schemas.SigninRequest, response: Response, db: Session = Depends(database.get_db)):
    """Authenticate an existing user and issue an auth cookie."""
    user = auth_service.authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _set_auth_cookie(response, auth_service.create_access_token(user.id))
    return user


@router.post("/logout")
def logout(response: Response):
    """Clear the auth cookie. The token stays valid until it expires (stateless)."""
    settings = get_settings()
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    return {"success": True, "message": "Logged out"}


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user

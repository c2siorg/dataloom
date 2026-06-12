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


@router.post("/forgot-password")
async def forgot_password(
    payload: schemas.ForgotPasswordRequest,
    db: Session = Depends(database.get_db),
):
    """Requests a password reset email."""
    settings = get_settings()
    user = auth_service.get_user_by_email(db, payload.email)
    if user:
        auth_service.create_reset_token(db, user, settings.frontend_url)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(database.get_db),
):
    """Reset password using a valid reset token."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    try:
        reset_token = auth_service.validate_reset_token(db, payload.token)
        auth_service.reset_user_password(db, reset_token, payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {"message": "Password reset successful"}


@router.patch("/me/email", response_model=schemas.UserResponse)
def update_email(
    payload: schemas.UpdateEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update the currently authenticated user's email."""
    try:
        return auth_service.update_user_email(db, current_user, payload.email)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e


@router.patch("/me/password")
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """Change the currently authenticated user's password."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    try:
        auth_service.change_user_password(
            db,
            current_user,
            payload.current_password,
            payload.new_password,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {"message": "Password changed successfully"}

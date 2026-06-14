"""Email utility for sending password reset emails."""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger(__name__)


def send_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password reset email via SMTP.

    Args:
        to_email: Recipient email address.
        reset_url: The full reset URL containing the token.
    """
    settings = get_settings()
    msg = MIMEMultipart()
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg["Subject"] = "Reset your DataLoom password"

    body = f"""Hi,

You requested a password reset for your DataLoom account.
Click the link below to reset your password. This link expires in 1 hour.

{reset_url}

If you did not request this, please ignore this email.

— The DataLoom Team
"""
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        logger.info("Reset email sent to %s", to_email)
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", to_email, e)
        raise

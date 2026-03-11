const DETAIL_MESSAGES = {
  LOGIN_BAD_CREDENTIALS: "Invalid email or password.",
  LOGIN_USER_NOT_VERIFIED: "Your account is not verified.",
  REGISTER_USER_ALREADY_EXISTS: "An account with this email already exists.",
};

export function getAuthErrorMessage(error, fallbackMessage) {
  if (error.message === "Network Error") {
    return "Cannot reach the backend API. Check that the backend is running on http://localhost:4200 and that your frontend origin is allowed by CORS.";
  }

  const detail = error.response?.data?.detail;

  if (typeof detail === "string") {
    return DETAIL_MESSAGES[detail] || detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail[0]?.msg || fallbackMessage;
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.reason === "string") {
      return detail.reason;
    }

    if (typeof detail.code === "string" && DETAIL_MESSAGES[detail.code]) {
      return DETAIL_MESSAGES[detail.code];
    }
  }

  return fallbackMessage;
}

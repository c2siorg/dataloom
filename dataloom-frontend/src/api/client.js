/**
 * Configured Axios HTTP client for DataLoom API communication.
 * @module api/client
 */
import axios from "axios";
import { API_BASE_URL, API_TIMEOUT } from "../config/apiConfig";

/**
 * Pre-configured Axios instance with base URL, timeout, and error logging.
 */
const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  withCredentials: true,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const { config, response } = error;
    // A 401 from the auth bootstrap just means "not logged in" — not noteworthy.
    const isAuthProbe = response?.status === 401 && config?.url === "/auth/me";
    if (!isAuthProbe) {
      console.error("[API Error]", {
        url: config?.url,
        method: config?.method,
        status: response?.status,
        message: response?.data?.detail || error.message,
      });
    }
    return Promise.reject(error);
  },
);

export default client;

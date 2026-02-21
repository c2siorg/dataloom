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
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const { config, response } = error;
    console.error("[API Error]", {
      url: config?.url,
      method: config?.method,
      status: response?.status,
      message: response?.data?.detail || error.message,
    });
    return Promise.reject(error);
  }
);

export default client;

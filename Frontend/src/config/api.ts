const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const localApiBaseUrl = "http://localhost:5000";

export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? localApiBaseUrl : "");

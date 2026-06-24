const RENDER_API_BASE_URL = "https://mohid-s-questionfinder.onrender.com";

const isLocalFrontend =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (isLocalFrontend && window.location.port !== "5000"
    ? "http://localhost:5000"
    : RENDER_API_BASE_URL);

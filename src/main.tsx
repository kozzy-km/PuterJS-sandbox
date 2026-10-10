import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Kill the pre-paint boot splash once React has taken over.
const boot = document.getElementById("boot");
if (boot) {
  boot.style.opacity = "0";
  setTimeout(() => boot.remove(), 400);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

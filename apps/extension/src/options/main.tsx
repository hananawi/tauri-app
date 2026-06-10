import React from "react";
import { createRoot } from "react-dom/client";
import { OptionsPage } from "./OptionsPage";
import "./options.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);

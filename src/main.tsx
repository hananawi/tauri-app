import { attachConsole, info, warn } from "@tauri-apps/plugin-log";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./global.css";

async function init() {
  try {
    await attachConsole();
    console.log("console.log -> 应该进终端和 DevTools");
    info("info() 直连后端");
  } catch (error) {
    warn(`Unable to attach Tauri console logger, error: ${error}`);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

void init();

import { Route, Routes } from "react-router-dom";
import "./App.css";
import { ClipPage } from "./pages/ClipPage";
import { LlmResultPage } from "./pages/LlmResultPage";
import { SettingsPage } from "./pages/SettingsPage";

function App() {
  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<ClipPage />} />
        <Route path="/clip" element={<ClipPage />} />
        <Route path="/llm-result" element={<LlmResultPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}

export default App;

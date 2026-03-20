import { Route, Routes } from "react-router-dom";
import "./App.css";
import { ClipPage } from "./pages/ClipPage";

function App() {
  return (
    <div className="h-full">
      <Routes>
        <Route path="/" element={<ClipPage />} />
        <Route path="/clip" element={<ClipPage />} />
      </Routes>
    </div>
  );
}

export default App;

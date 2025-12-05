import { Route, Routes } from "react-router-dom";
import "./App.css";
import { ClipPage } from "./pages/ClipPage";
import MainPage from "./pages/MainPage";
import SplashScreen from "./pages/SplashScreen";

function App() {
  return (
    <>
      {/* <nav className="flex gap-4 p-4">
        <Link to="/">Main</Link>
        <Link to="/ocr">Ocr</Link>
        <Link to="/mask">Mask</Link>
      </nav> */}

      <div className="h-full">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/splashscreen" element={<SplashScreen />} />
          {/* <Route path="/ocr" element={<OcrPage />} /> */}
          <Route path="/clip" element={<ClipPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;

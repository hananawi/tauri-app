import { Route, Routes } from "react-router-dom";
import "./App.css";
import MainPage from "./pages/MainPage";
import { MaskPage } from "./pages/MaskPage";
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
          <Route path="/mask" element={<MaskPage />} />
        </Routes>
      </div>
    </>
  );
}

export default App;

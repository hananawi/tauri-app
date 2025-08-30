import { Link, Route, Routes } from "react-router-dom";
import "./App.css";
import MainPage from "./pages/MainPage";
import SplashScreen from "./pages/SplashScreen";

function App() {
  return (
    <>
      <nav style={{ display: "flex", gap: 12, padding: 12 }}>
        <Link to="/">Main</Link>
        <Link to="/splashscreen">Splashscreen</Link>
      </nav>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/splashscreen" element={<SplashScreen />} />
      </Routes>
    </>
  );
}

export default App;

import { useEffect } from "react";
import { setup } from "../utils";

function SplashScreen() {
  useEffect(() => {
    setup();
  }, []);

  return (
    <main className="container">
      <h1>Splashscreen</h1>
      <p>This is the splashscreen page rendered via React Router.</p>
    </main>
  );
}

export default SplashScreen;

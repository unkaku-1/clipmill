import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Interface fonts
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";

// Fonts available inside the video (unicode-range slices load on demand)
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-sc/900.css";
import "@fontsource/noto-serif-sc/700.css";
import "@fontsource/zcool-kuaile/400.css";
import "@fontsource/zcool-qingke-huangyou/400.css";
import "@fontsource/ma-shan-zheng/400.css";
import "@fontsource/long-cang/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/900.css";
import "@fontsource/space-grotesk/400.css";

import "@/styles/index.css";
import App from "@/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

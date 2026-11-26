import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AddScreen } from "./features/add/AddScreen";
import { CompleteScreen } from "./features/complete/CompleteScreen";
import { VoiceLabScreen } from "./features/dev/VoiceLabScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { ReviewScreen } from "./features/review/ReviewScreen";
import { SharedListBoot } from "./features/share/SharedListBoot";
import { ShopScreen } from "./features/shop/ShopScreen";
import { PwaUpdate } from "./pwa/PwaUpdate";
import { AdventureProvider } from "./state/AdventureContext";

function ScrollReset() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <AdventureProvider>
          <ScrollReset />
          <PwaUpdate />
          <SharedListBoot />
          <div className="app">
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/l/:id" element={<HomeScreen />} />
              <Route path="/s/:id" element={<HomeScreen />} />
              <Route path="/toevoegen" element={<AddScreen />} />
              <Route path="/controleren" element={<ReviewScreen />} />
              <Route path="/winkel" element={<ShopScreen />} />
              <Route path="/klaar" element={<CompleteScreen />} />
              {import.meta.env.DEV ? <Route path="/dev/voice-lab" element={<VoiceLabScreen />} /> : null}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </AdventureProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}

import { useEffect } from "react";
import { LandingHeader } from "../components/LandingHeader";
import { Hero } from "../components/Hero";
import { TechnicalSection } from "../components/TechnicalSection";
import { LandingFooter } from "../components/LandingFooter";

export function LandingPage() {
  useEffect(() => {
    document.title = "Meridian - Payment Pipeline";
  }, []);

  return (
    <div className="md-landing min-h-screen">
      <LandingHeader />
      <Hero />
      <TechnicalSection />
      <LandingFooter />
    </div>
  );
}

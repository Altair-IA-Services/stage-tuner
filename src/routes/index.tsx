import { createFileRoute } from "@tanstack/react-router";
import { TunerScreen } from "@/components/tuner/TunerScreen";
import { Toaster } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WeirdTune — Accordeur guitare pour accordages alternatifs" },
      {
        name: "description",
        content:
          "Accordeur de guitare PWA rapide et précis (YIN), pensé pour les accordages alternatifs rock/metal : Standard, Eb, Drop C#. Offline, thème scène, mode strobe, gaucher.",
      },
      { property: "og:title", content: "WeirdTune — Accordeur guitare alternatif" },
      {
        property: "og:description",
        content:
          "Accordeur PWA pour guitare avec Standard, Eb, Drop C#. Détection YIN précise, mode scène, offline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <TunerScreen />
      <Toaster theme="dark" position="top-center" />
    </>
  );
}

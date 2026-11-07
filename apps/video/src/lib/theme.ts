import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadViet } from "@remotion/google-fonts/BeVietnamPro";

// The Osaka Jade dark tokens from apps/frontend/src/global.css, so the mock
// UI in the video reads as the real console.
export const T = {
  bg: "#111c18",
  bgDeep: "#0c1512",
  surface: "#192820",
  surface2: "#23372b",
  border: "#304639",
  borderStrong: "#607b69",
  text: "#f1f2df",
  text2: "#bdcbbf",
  muted: "#a1b3a5",
  brand: "#8cbea2",
  brandHover: "#a4cfb7",
  brandSoft: "#253e30",
  brandInk: "#102319",
  warning: "#e5bd83",
  danger: "#f0a8ad",
  dangerSoft: "#49292b",
  // Logo greens and the synthwave accents used only in the 3D world.
  logo: "#509475",
  logoLight: "#bcd6cb",
  avalanche: "#e84142",
  sunset: "#ff7a59",
  dusk: "#c86bfa",
} as const;

export const { fontFamily: sans } = loadGeist("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
export const { fontFamily: mono } = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});
/** Be Vietnam Pro: for anything with Vietnamese diacritics. */
export const { fontFamily: viet } = loadViet("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["vietnamese", "latin"],
});

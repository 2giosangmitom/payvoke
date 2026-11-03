/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// Share the frontend's public folder: the song lives in one place.
Config.setPublicDir("../frontend/public");
// Three.js needs a WebGL context in headless Chrome. angle-egl renders on
// the GPU (about 6x faster than software); on a machine without a GPU,
// pass --gl=swangle.
Config.setChromiumOpenGlRenderer("angle-egl");

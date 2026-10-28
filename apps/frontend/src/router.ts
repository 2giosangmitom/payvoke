import { createRouter } from "@tanstack/react-router";
import { createAppHead, type AppHead } from "@/src/app/head";
import { routeTree } from "./routeTree.gen";
import "./global.css";

export type RouterContext = { head: AppHead };

// Start creates a router per server request, so each request gets its own head.
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    context: { head: createAppHead() },
  });
}

import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./global.css";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  return router;
}

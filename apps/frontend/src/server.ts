import {
  createStartHandler,
  defaultRenderHandler,
  defineHandlerCallback,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { transformHtmlTemplate } from "@unhead/react/server";
import type { RouterContext } from "./router";

// Renders each page whole, then writes the tags its components declared with
// unhead (title, description, icon, font preloads) into the document head.
const renderWithHead = defineHandlerCallback(async (ctx) => {
  const result = await defaultRenderHandler(ctx);
  const response = result instanceof Response ? result : result.response;
  if (!response.headers.get("content-type")?.startsWith("text/html")) return result;
  const { head } = ctx.router.options.context as RouterContext;
  const page = await response.text();
  // The page is read whole; release whatever the render kept for streaming.
  if (!(result instanceof Response) && result.serverSsrCleanup === "stream") result.dispose();
  const html = await transformHtmlTemplate(
    head as Parameters<typeof transformHtmlTemplate>[0],
    page,
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export default createServerEntry({ fetch: createStartHandler(renderWithHead) });

import { test, expect } from "@playwright/test";

for (const resetStream of [false, true]) {
  test(`private workspace, ${resetStream ? "snapshot reset" : "streaming"}, saved history, and mobile layout`, async ({
    page,
  }) => {
    const userId = "00000000-0000-4000-8000-000000000001";
    await page.addInitScript(
      ({ userId }) => {
        localStorage.setItem(
          "sb-workspace-test-auth-token",
          JSON.stringify({
            access_token: "browser-test-token",
            refresh_token: "browser-test-refresh",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: {
              id: userId,
              aud: "authenticated",
              role: "authenticated",
              email: "buyer@example.test",
              app_metadata: {},
              user_metadata: {},
              created_at: new Date().toISOString(),
            },
          }),
        );
      },
      { userId },
    );
    let workspace: Record<string, unknown> | undefined;
    let conversation: Record<string, unknown> | undefined;
    let messages: { id: string; role: string; content: string }[] = [];
    let posts = 0;
    let subscriptions = 0;
    await page.route("http://localhost:8100/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const headers = {
        "access-control-allow-origin": "http://localhost:3100",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      expect(req.headers().authorization).toBe("Bearer browser-test-token");
      if (url.pathname === "/v1/workspaces") {
        if (req.method() === "POST")
          workspace = {
            ...req.postDataJSON(),
            brief: "",
            revision: 0,
            createdAt: new Date().toISOString(),
          };
        return route.fulfill({
          json: req.method() === "GET" ? (workspace ? [workspace] : []) : workspace,
          headers,
        });
      }
      if (url.pathname.endsWith("/brief")) {
        workspace = {
          ...workspace,
          ...req.postDataJSON(),
          revision: Number(workspace?.revision) + 1,
        };
        return route.fulfill({ json: workspace, headers });
      }
      if (url.pathname.endsWith("/conversations")) {
        if (req.method() === "POST")
          conversation = {
            ...req.postDataJSON(),
            workspaceId: workspace?.id,
            revision: 0,
            createdAt: new Date().toISOString(),
          };
        return route.fulfill({
          json: req.method() === "GET" ? (conversation ? [conversation] : []) : conversation,
          headers,
        });
      }
      if (url.pathname.endsWith("/runs")) {
        posts++;
        const input = req.postDataJSON();
        messages = [
          input.messages.at(-1),
          {
            id: "assistant-answer",
            role: "assistant",
            content: "Development responder — your message is saved.",
          },
        ];
        return route.fulfill({ json: { runId: input.runId }, headers });
      }
      if (url.pathname.endsWith("/events")) {
        subscriptions++;
        const runId = url.pathname.split("/").at(-2);
        const events = [
          { type: "RUN_STARTED", threadId: conversation?.id, runId },
          { type: "TEXT_MESSAGE_START", messageId: "assistant-answer", role: "assistant" },
          {
            type: "TEXT_MESSAGE_CONTENT",
            messageId: "assistant-answer",
            delta: messages[1]!.content,
          },
          { type: "TEXT_MESSAGE_END", messageId: "assistant-answer" },
          { type: "RUN_FINISHED", threadId: conversation?.id, runId },
        ];
        const wireEvents = !resetStream
          ? events
          : subscriptions === 1
            ? events
                .slice(0, 3)
                .map((event) =>
                  event.type === "TEXT_MESSAGE_CONTENT"
                    ? { ...event, delta: "partial response" }
                    : event,
                )
            : [events[0], { type: "MESSAGES_SNAPSHOT", messages }, events[4]];
        return route.fulfill({
          contentType: "text/event-stream",
          body: wireEvents
            .map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(""),
          headers: {
            ...headers,
            "access-control-expose-headers": "x-stream-reset",
            "x-stream-reset": String(resetStream && subscriptions > 1),
          },
        });
      }
      return route.fulfill({ json: { conversation, messages, responder: "development" }, headers });
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/workspace");
    await page.getByLabel("New workspace", { exact: true }).fill("Research sprint");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.getByRole("button", { name: "New conversation", exact: true }).click();
    await page.getByLabel("Task brief", { exact: true }).fill("Find primary sources.");
    await page.getByRole("button", { name: "Save brief" }).click();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Research this topic 🌏");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText("Development responder — your message is saved.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("partial response", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Research this topic 🌏", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Research this topic 🌏", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Development responder — your message is saved.", { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(1);
    await page.screenshot({ path: "/tmp/opencode/workspace-desktop.png" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/opencode/workspace-mobile.png" });
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
    await expect(page.getByRole("button", { name: "New conversation", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Conversation / }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("workspace requires sign-in", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Your private workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

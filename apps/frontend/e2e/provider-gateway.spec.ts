import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type {
  CommandInvocation,
  ProviderApplication,
  CommandRevision,
} from "../src/lib/provider-commands";
import type { Manifest } from "../src/lib/catalog";

test("applications, one-time keys, playground, pinned publication and workspace slash commands", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const userId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000021";
  const conversationId = "00000000-0000-4000-8000-000000000022";
  const revisionId = "00000000-0000-4000-8000-000000000023";
  const now = new Date().toISOString();
  const httpManifest = JSON.parse(
    readFileSync(
      new URL("../../../packages/logo-designer/src/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  await page.addInitScript(
    ({ userId, now }) =>
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
            email: "provider@example.test",
            app_metadata: {},
            user_metadata: {},
            created_at: now,
          },
        }),
      ),
    { userId, now },
  );
  const revision: CommandRevision = {
    id: revisionId,
    digest: "a".repeat(64),
    createdAt: now,
    commands: [
      {
        name: "logo",
        description: "Design one simple logo symbol",
        inputSchema: {
          type: "object",
          properties: {
            brief: { type: "string", maxLength: 8000 },
            style: { type: "string", maxLength: 20, enum: ["geometric", "organic"] },
          },
          required: ["brief"],
          additionalProperties: false,
        },
      },
    ],
  };
  const apps: ProviderApplication[] = [];
  const keys: {
    id: string;
    label: string;
    prefix: string;
    scopes: string[];
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
  }[] = [];
  const invocations: CommandInvocation[] = [];
  const reads = new Map<string, number>();
  let listing: {
    id: string;
    paused: boolean;
    publishedVersionId: string | null;
    createdAt: string;
  } | null = null;
  let version: {
    id: string;
    manifest: Manifest;
    digest: string;
    state: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    createdAt: string;
  } | null = null;
  let keyPosts = 0;
  let sandboxPosts = 0;
  let commandPosts = 0;
  let droppedCommandResponse = false;
  let normalPosts = 0;
  const secret = `ane_${"x".repeat(43)}`;
  const cors = {
    "access-control-allow-origin": "http://localhost:3100",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  };
  function advance(items: CommandInvocation[]) {
    for (const invocation of items) {
      if (invocation.state !== "queued" && invocation.state !== "running") continue;
      const count = (reads.get(invocation.id) ?? 0) + 1;
      reads.set(invocation.id, count);
      if (count >= 2) {
        invocation.state = "running";
        invocation.progress = "Preparing a synthetic symbol";
      }
      if (count >= 3) {
        invocation.state = "completed";
        invocation.result =
          '```svg\n<svg viewBox="0 0 256 256"><circle cx="128" cy="128" r="64"/></svg>\n```';
      }
    }
    return items;
  }
  await page.route("http://localhost:8100/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(req.headers().authorization).toBe("Bearer browser-test-token");
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status, headers: cors });
    if (path === "/v1/provider/profile")
      return reply({ displayName: "Example Studio", createdAt: now });
    if (path === "/v1/provider/applications") {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        apps.push({
          id: body.id,
          name: body.name,
          gatewayConnected: false,
          currentRevisionId: revisionId,
          createdAt: now,
        });
        return reply(apps.at(-1));
      }
      return reply(apps);
    }
    if (path.endsWith("/keys")) {
      if (req.method() === "POST") {
        keyPosts++;
        const body = req.postDataJSON();
        expect(body.scopes).toEqual(["gateway:connect", "commands:write"]);
        const key = {
          id: "00000000-0000-4000-8000-000000000024",
          label: body.label,
          prefix: secret.slice(0, 12),
          scopes: body.scopes,
          expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(),
          revokedAt: null,
          createdAt: now,
        };
        keys.push(key);
        return reply({ key, secret });
      }
      return reply(keys);
    }
    if (req.method() === "DELETE" && path.includes("/keys/")) {
      keys[0]!.revokedAt = now;
      return reply({ revoked: true });
    }
    if (path.startsWith("/v1/provider/applications/") && path.endsWith("/commands"))
      return reply(revision);
    if (path.includes("/dev-invocations")) {
      if (req.method() === "POST") {
        sandboxPosts++;
        const body = req.postDataJSON();
        const existing = invocations.find((item) => item.id === body.id);
        if (existing) return reply(existing);
        const item: CommandInvocation = {
          ...body,
          applicationId: apps[0]!.id,
          conversationId: null,
          listingVersionId: null,
          state: "queued",
          progress: null,
          result: null,
          deadlineAt: new Date(Date.now() + 300_000).toISOString(),
          createdAt: now,
          developmentOnly: true,
        };
        invocations.unshift(item);
        return reply(item);
      }
      const id = path.split("/dev-invocations/")[1];
      return reply(
        id ? advance(invocations.filter((item) => item.id === id))[0] : advance(invocations),
      );
    }
    if (path === "/v1/provider/listings") {
      if (req.method() === "POST") {
        listing = {
          id: req.postDataJSON().id,
          paused: true,
          publishedVersionId: null,
          createdAt: now,
        };
        return reply(listing);
      }
      return reply(
        listing
          ? [
              {
                ...listing,
                name: version?.manifest.name ?? null,
                candidateVersionId: version?.id ?? null,
                candidateState: version?.state ?? null,
              },
            ]
          : [],
      );
    }
    if (path === `/v1/provider/listings/${listing?.id}`)
      return reply({
        ...listing,
        name: version?.manifest.name ?? null,
        candidateVersionId: version?.id ?? null,
        candidateState: version?.state ?? null,
      });
    if (path.endsWith("/versions")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        expect(body.manifest.schemaVersion).toBe(2);
        expect(body.manifest.gateway).toEqual({
          applicationId: apps[0]!.id,
          commandRevisionId: revisionId,
        });
        expect(body.manifest).not.toHaveProperty("endpoint");
        expect(body.manifest).not.toHaveProperty("actions");
        version = {
          ...body,
          digest: "b".repeat(64),
          state: "draft",
          reviewedAt: null,
          reviewNote: null,
          createdAt: now,
        };
        return reply(version);
      }
      return reply(version ? [version] : []);
    }
    if (path.endsWith("/submit")) {
      version!.state = "submitted";
      return reply(version);
    }
    if (path.endsWith("/publish")) {
      expect(version!.state).toBe("approved");
      listing!.publishedVersionId = version!.id;
      listing!.paused = false;
      return reply(listing);
    }
    if (path === "/v1/workspaces")
      return reply([
        {
          id: workspaceId,
          title: "Logo workspace",
          brief: "Keep the symbol simple",
          revision: 0,
          createdAt: now,
        },
      ]);
    if (path.endsWith("/conversations"))
      return reply([
        { id: conversationId, workspaceId, title: "Brand direction", revision: 0, createdAt: now },
      ]);
    if (path === `/v1/conversations/${conversationId}/commands`)
      return reply(
        listing?.publishedVersionId && version
          ? [
              {
                listingId: listing.id,
                versionId: version.id,
                applicationId: apps[0]!.id,
                applicationName: "Logo Designer",
                revisionId,
                gatewayConnected: true,
                limits: httpManifest.limits,
                commands: revision.commands,
              },
            ]
          : [],
      );
    if (path === `/v1/conversations/${conversationId}/command-invocations`) {
      if (req.method() === "POST") {
        commandPosts++;
        const body = req.postDataJSON();
        expect(body.confirmModelExpense).toBe(true);
        expect(body.listingId).toBe(listing!.id);
        expect(body.versionId).toBe(version!.id);
        const existing = invocations.find((item) => item.id === body.id);
        if (existing) return reply(existing);
        const item: CommandInvocation = {
          id: body.id,
          applicationId: apps[0]!.id,
          conversationId,
          listingVersionId: version!.id,
          revisionId,
          command: body.command,
          input: body.input,
          state: "queued",
          progress: null,
          result: null,
          deadlineAt: new Date(Date.now() + 300_000).toISOString(),
          createdAt: now,
          developmentOnly: true,
        };
        invocations.push(item);
        if (!droppedCommandResponse) {
          droppedCommandResponse = true;
          return route.abort("failed");
        }
        return reply(item);
      }
      return reply(advance(invocations.filter((item) => item.conversationId === conversationId)));
    }
    if (path.endsWith("/runs")) {
      normalPosts++;
      return reply({ message: "Slash commands must not use normal chat runs" }, 400);
    }
    if (path === `/v1/conversations/${conversationId}`)
      return reply({
        conversation: { id: conversationId, title: "Brand direction", revision: 0, workspaceId },
        messages: [],
        responder: "development",
      });
    return reply({ message: "Unexpected test request" }, 404);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/provider?section=applications");
  await page.getByRole("button", { name: "Create application", exact: true }).click();
  await page.getByLabel("Application name").fill("Logo Designer");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create application", exact: true })
    .click();
  await expect(page.getByText("Gateway offline", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create API key" }).click();
  await page.getByLabel("Key label").fill("Development server");
  await page.getByRole("combobox", { name: "Key permissions" }).click();
  await page.getByRole("option", { name: "Register commands + connect", exact: true }).click();
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "New API key secret" })).toHaveValue(secret);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      (secret) =>
        JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(
          secret,
        ),
      secret,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "I saved the key" }).click();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "New API key secret" })).toHaveCount(0);
  expect(keyPosts).toBe(1);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke key", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  apps[0]!.gatewayConnected = true;
  await page.getByRole("link", { name: "Commands", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registered commands" })).toBeVisible();
  await page.getByRole("link", { name: "Playground", exact: true }).click();
  await page.getByLabel("brief", { exact: false }).fill("A geometric moon");
  await expect(
    page.getByRole("button", { name: "Run development command", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Run development command", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Command /logo" }).getByText("Completed", { exact: true }),
  ).toBeVisible();
  expect(sandboxPosts).toBe(1);
  await page.reload();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  expect(sandboxPosts).toBe(1);
  await page.screenshot({ path: "/tmp/opencode/gateway-playground-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "/tmp/opencode/gateway-playground-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Listings", exact: true }).click();
  await page.getByRole("button", { name: "Create listing", exact: true }).click();
  await page.getByLabel("Complete manifest JSON").fill(JSON.stringify(httpManifest));
  await page.getByRole("combobox", { name: "Bind application" }).click();
  await page.getByRole("option", { name: "Logo Designer", exact: true }).click();
  await page.getByRole("button", { name: "Pin this command revision" }).click();
  const draft = JSON.parse(await page.getByLabel("Complete manifest JSON").inputValue());
  expect(draft.gateway.commandRevisionId).toBe(revisionId);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Awaiting operator review" })).toBeDisabled();
  // Operator decision is external to the provider UI.
  version!.state = "approved";
  version!.reviewedAt = now;
  await page.reload();
  await page.getByRole("button", { name: "Publish this version", exact: true }).click();
  await expect(page.getByRole("button", { name: "Current published version" })).toBeDisabled();
  await page.goto(`/workspace?workspace=${workspaceId}&conversation=${conversationId}`);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("/lo");
  await expect(page.getByRole("listbox", { name: "Slash commands" })).toBeVisible();
  await page.getByRole("combobox", { name: "Message", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("brief", { exact: false })
    .fill("A moon symbol for the workspace");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Run development command", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Retrying unchanged input recovers the same invocation",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Run development command", exact: true })
    .click();
  const history = page.getByRole("region", { name: "Provider command history" });
  await expect(history.getByText("Completed", { exact: true })).toBeVisible();
  await expect(history.locator("svg, script, iframe, img")).toHaveCount(0);
  expect(commandPosts).toBe(2);
  expect(invocations.filter((item) => item.conversationId === conversationId)).toHaveLength(1);
  expect(normalPosts).toBe(0);
  await page.reload();
  await expect(history.getByText("Completed", { exact: true })).toBeVisible();
  expect(commandPosts).toBe(2);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "/tmp/opencode/gateway-workspace-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Choose slash command" }).click();
  await page.getByRole("option", { name: /\/logo/ }).click();
  await page.screenshot({
    path: "/tmp/opencode/gateway-command-mobile.png",
    animations: "disabled",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  const commandInvocation = invocations.find((item) => item.conversationId === conversationId)!;
  commandInvocation.state = "uncertain";
  commandInvocation.result = "Connection interrupted; external work may have occurred.";
  await page.reload();
  await expect(history.getByText("Uncertain", { exact: true })).toBeVisible();
  expect(commandPosts).toBe(2);
  apps[0]!.name =
    "Logo Designer — a purpose-built symbol design application with a long deployment name";
  await page.goto(`/provider?section=applications&application=${apps[0]!.id}&view=playground`);
  await expect(page.getByRole("heading", { name: "Run a development command" })).toBeVisible();
  for (const width of [800, 768, 480, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

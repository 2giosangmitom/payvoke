import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../../packages/logo-designer/src/manifest.json", import.meta.url),
    "utf8",
  ),
);
const listingId = "00000000-0000-4000-8000-000000000011";
const versionId = "00000000-0000-4000-8000-000000000012";
const agent = {
  id: listingId,
  versionId,
  digest: "a".repeat(64),
  providerName: "Example Studio",
  manifest,
  verification: "catalog-review-only",
  executionEnabled: false,
};
const cors = {
  "access-control-allow-origin": "http://localhost:3100",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};
async function signIn(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "sb-workspace-test-auth-token",
      JSON.stringify({
        access_token: "browser-test-token",
        refresh_token: "browser-test-refresh",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "provider@example.test",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    ),
  );
}
test("wallet-free store, search, direct agent details, and mobile navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:8100/**", async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      json: new URL(route.request().url()).pathname === "/v1/agents" ? [agent] : agent,
      headers: cors,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Logo Designer", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/opencode/store-desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "Search agents" }).fill("no matching task");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No agents on this page match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("link", { name: "View agent" }).click();
  await expect(page.getByRole("heading", { name: "Logo Designer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execution unavailable" })).toBeDisabled();
  await page.getByRole("tab", { name: "Input", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A clear brief is all it needs" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Input", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.screenshot({ path: "/tmp/opencode/agent-detail-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "/tmp/opencode/agent-detail-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Provider console", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Publish your focused skill" })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("catalog errors and empty states do not manufacture sample listings", async ({ page }) => {
  let failed = true;
  await page.route("http://localhost:8100/**", (route) =>
    route.fulfill({
      status: failed ? 500 : 200,
      json: failed ? { message: "Unavailable" } : [],
      headers: cors,
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByText("No published agents yet. Listings appear after operator review."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logo Designer" })).toHaveCount(0);
});

test("provider profile, immutable manifest draft, review gate, publish and pause", async ({
  page,
}) => {
  await signIn(page);
  let profile: { displayName: string; createdAt: string } | null = null;
  let listing: {
    id: string;
    paused: boolean;
    publishedVersionId: string | null;
    createdAt: string;
  } | null = null;
  let version: {
    id: string;
    manifest: typeof manifest;
    digest: string;
    state: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    createdAt: string;
  } | null = null;
  let writes = 0;
  await page.route("http://localhost:8100/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(req.headers().authorization).toBe("Bearer browser-test-token");
    if (req.method() === "POST") writes++;
    if (path === "/v1/provider/applications") return route.fulfill({ json: [], headers: cors });
    if (path === "/v1/provider/profile") {
      if (req.method() === "POST")
        profile = {
          displayName: req.postDataJSON().displayName,
          createdAt: new Date().toISOString(),
        };
      return route.fulfill({
        status: profile ? 200 : 404,
        json: profile ?? { code: "NOT_FOUND", message: "No provider profile" },
        headers: cors,
      });
    }
    if (path === "/v1/provider/listings") {
      if (req.method() === "POST") {
        listing = {
          id: req.postDataJSON().id,
          paused: true,
          publishedVersionId: null,
          createdAt: new Date().toISOString(),
        };
        return route.fulfill({ json: listing, headers: cors });
      }
      return route.fulfill({
        json: listing
          ? [
              {
                ...listing,
                name: version?.manifest.name ?? null,
                candidateVersionId: version?.id ?? null,
                candidateState: version?.state ?? null,
              },
            ]
          : [],
        headers: cors,
      });
    }
    if (path === `/v1/provider/listings/${listing?.id}`)
      return route.fulfill({
        json: {
          ...listing,
          name: version?.manifest.name ?? null,
          candidateVersionId: version?.id ?? null,
          candidateState: version?.state ?? null,
        },
        headers: cors,
      });
    if (path.endsWith("/versions")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        version = {
          id: body.id,
          manifest: body.manifest,
          digest: "a".repeat(64),
          state: "draft",
          reviewedAt: null,
          reviewNote: null,
          createdAt: new Date().toISOString(),
        };
        return route.fulfill({ json: version, headers: cors });
      }
      return route.fulfill({ json: version ? [version] : [], headers: cors });
    }
    if (path.endsWith("/submit")) {
      version!.state = "submitted";
      return route.fulfill({ json: version, headers: cors });
    }
    if (path.endsWith("/publish")) {
      expect(version!.state).toBe("approved");
      listing!.publishedVersionId = version!.id;
      listing!.paused = false;
      return route.fulfill({ json: listing, headers: cors });
    }
    if (path.endsWith("/pause")) {
      listing!.paused = true;
      return route.fulfill({ json: listing, headers: cors });
    }
    return route.fulfill({ status: 404, json: { message: "Not found" }, headers: cors });
  });
  await page.goto("/provider");
  await page.getByLabel("Provider name").fill("Example Studio");
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await page.getByRole("button", { name: "Create listing", exact: true }).click();
  await page.getByLabel("Complete manifest JSON").fill("invalid JSON");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid JSON");
  expect(writes).toBe(2);
  await page.getByLabel("Complete manifest JSON").fill(JSON.stringify(manifest));
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Awaiting operator review" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish this version" })).toHaveCount(0);
  // Simulate an external operator decision; the provider UI has no approval endpoint/control.
  version!.state = "approved";
  version!.reviewedAt = new Date().toISOString();
  await page.reload();
  await page.getByRole("button", { name: "Publish this version" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Catalog version published" }),
  ).toContainText("Execution remains disabled");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/opencode/provider-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Pause listing", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Listing paused" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/opencode/provider-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

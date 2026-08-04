import { expect, test } from "@playwright/test";

test("map page renders the basemap, mode switcher and legend with no failed API calls", async ({
  page,
}) => {
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/api/map/")) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto("/map");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Map layer mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Filters/ })).toBeVisible();

  expect(failedRequests).toEqual([]);
});

test("switching map modes does not produce failed API calls", async ({ page }) => {
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/api/map/")) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto("/map");
  await page.waitForLoadState("networkidle");

  for (const mode of ["Heatmap", "Clusters", "KSI only", "Pedestrian", "Hexagons"]) {
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await page.waitForTimeout(600);
  }

  expect(failedRequests).toEqual([]);
});

test("the results table shows an accessible empty state with no data ingested", async ({ page }) => {
  await page.goto("/map");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("No collisions in the current view")).toBeVisible();
});

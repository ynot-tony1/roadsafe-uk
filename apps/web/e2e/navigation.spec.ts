import { expect, test } from "@playwright/test";

const NAV_PAGES = [
  { path: "/", heading: "National dashboard" },
  { path: "/map", heading: "Collision map" },
  { path: "/local-authorities", heading: "Local authorities" },
  { path: "/road-users", heading: "Road users" },
  { path: "/hotspots", heading: "Hotspots" },
  { path: "/about/data", heading: "About the data" },
  { path: "/status", heading: "Status" },
];

for (const { path, heading } of NAV_PAGES) {
  test(`${path} loads without console errors and shows its heading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    expect(errors).toEqual([]);
  });
}

test("primary nav links to every top level page", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const { path } of NAV_PAGES) {
    const href = path === "/" ? "/" : path;
    await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
  }
});

test("unknown collision index returns a 404 page", async ({ page }) => {
  const response = await page.goto("/collisions/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("unknown local authority code returns a 404 page", async ({ page }) => {
  const response = await page.goto("/local-authorities/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("theme toggle switches between light and dark", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  await toggle.click();
  await expect(html).toHaveClass(/dark|light/);
});

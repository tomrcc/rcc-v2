import { defineConfig } from "astro/config";

// Deliberately bare: no React/Tailwind/MDX/editable-regions. RCC works directly
// off the rendered `data-rosey` HTML, so a fixture only needs Astro itself.
export default defineConfig({
  // Trailing slash so page URLs (/nested/) match the keys Rosey derives.
  trailingSlash: "always",
});

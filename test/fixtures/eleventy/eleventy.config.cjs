const pluginBookshop = require("@bookshop/eleventy-bookshop");

// Lean Eleventy site covering both 11ty editing styles — Bookshop (index.md) and
// editable regions (regions.md). Proves RCC is SSG-agnostic (alternate `_site`
// build dir), that both render paths emit data-rosey, and that 3-layer Rosey
// config resolves. Nothing RCC-specific belongs here: install-client writes the
// client into _site after this build finishes.
module.exports = function (eleventyConfig) {
  eleventyConfig.setLiquidOptions({ root: ["./src", "./component-library"] });

  eleventyConfig.addPlugin(
    pluginBookshop({ bookshopLocations: ["component-library"], pathPrefix: "" }),
  );
  return { dir: { input: "src", output: "_site" } };
};

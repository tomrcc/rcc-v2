const pluginBookshop = require("@bookshop/eleventy-bookshop");

// Lean Eleventy + Bookshop site. Its job in the test suite: prove RCC is
// SSG-agnostic (alternate `_site` build dir), that the Bookshop render path
// produces the data-rosey markup Rosey scans, and that 3-layer Rosey config
// resolves (rosey.yml + ROSEY_LANGUAGES env + CLI flag).
module.exports = function (eleventyConfig) {
  eleventyConfig.setLiquidOptions({ root: ["./src", "./component-library"] });
  eleventyConfig.addPlugin(
    pluginBookshop({ bookshopLocations: ["component-library"], pathPrefix: "" }),
  );
  return { dir: { input: "src", output: "_site" } };
};

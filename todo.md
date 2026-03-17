# Left todo - RCC V2

## Set up tool (CLI)
A script that prompts its users in a CLI, takes that info, and configures your site to use the RCC.

*What locales would you like to translate to?*

*Would you like to use the built-in writeLocales function or write your own?*

*Should we serve a redirect page as the homepage of your site? (all original content will have to be prefixed with its locale tag (default `/en/`) for this to work)*

*Are there translations you want to edit via a data file, instead of using CloudCannon's Visual Editor? (useful if you want to edit translations that don’t appear visually on a page in CloudCannon, like attributes, information in the `<head>` of a page, etc)*

## Using your own writeLocales
Why would you want to in the first place?
What youd have to cover to replace it
- Read the existing locales files (if any)
- Adds any new translations
- Deletes unused translations
- As part of writing to each obj in the `locales/*.json`, include an extra key called `_base_original`. This key should have the latest `${key}.original` from the base.json. The key `_base_original` powers the stale translation detection. If theres a mismatch between `_base_original` & `original` its a stale translation and needs reviewed. 
- Could still use writeLocales, then just run your own piece of middleware on the results of that (eg. add smartling translations)

---

## Migration 
### A guide
1. Get your locales files completely up to date by saving any ongoing translations, and running a build.
2. Change your postbuild contents.
3. Change your CC config (data_config).
4. Remove unnecessary html attributes from elements (data-rcc, data-auto-tagger)
5. Del translation files (and Smartling or any other unused bits)
6. New name for SYNC_PATHS
7. Replace generateRoseyId() - we recommend replacing it with static ids (not changing them with content), and making use of new the stale translations feature

### A CLI tool
Maybe just the last two questions of the setup CLI tool, then run everything we need to if thats all the info we need to migrate from v1 to v2

## Separate packages
  - Auto-tagger
  - Write-locales
  - Smartling integration


## Agent Skills.md
Develop agents skills to help users migrate their site to a multilingual one using Rosey.

- Takes any site built with an SSG (or any plain static site) and make it multilingual using Rosey
- Adds the Rosey-CloudCannon-Connector with all of the things it needs configured
- Could decide whether its better to translate some parts of the site by directory, rather than with Rosey (with the auto-tagger)
- Could also take existing Rosey sites (not using rcc) and set them up with the rcc

## Clean up boths sets of docs
- The Rosey docs section about writing locales (getting started, *and* its own sneaky page)
- The RCC docs should completely reworked
- Maybe archive v1 but keep it visible
- Definitely a migration guide from v1 -> v2
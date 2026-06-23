> Rosey is an open-source internationalization (i18n) tool for static sites, developed and maintained by CloudCannon. Rosey works with any Static Site Generator (SSG) — you tag the HTML elements you want to localize with data-rosey attributes, and Rosey generates complete locale-specific versions of your Site from JSON translation files during the build process.

- Rosey works with any set of static html files, which in our world are commonly built via ssgs
- "during the build process" could be a bit misleading as we don't hook into the ssgs build process per-se, we would run an extra step after our normal build usually

---

> Stale translation detection
> Rosey tracks when source content changes. If a tagged string changes after a locale file has been created, Rosey marks that translation as stale so translators know it needs updating. This keeps your translations in sync with your source content without manual tracking.

- Does it actually? What does Rosey check do? The RCC checks for stale translations, but not sure about how rosey check handles it

---

```html
<img src="/images/hero.jpg" alt="A team working together" data-rosey-attr="alt" data-rosey-attr-value="hero.image-alt" />
<meta name="description" content="We build great things." data-rosey-attr="content" data-rosey-attr-value="meta.description" />
```

- Check thats how the `value` part works. I think it is, but double check that `attr-value` still links to a rosey key, not a literal value

---

```yaml
source: _site
tag: data-rosey
```

- Do we want to change the 11ty defaults to Astro as part of this rewrite? (would be `dist` instead of `_site`)

---

```json
{
  "hero.heading": { "original": "Welcome to our site" },
  "hero.subheading": { "original": "We build great things." }
}
```

- Is this a real looking base.json though? Maybe we should be more accurate to what it actually will look like. Could keep it simple for the guide though as well.

---

> The staging workflow is incompatible with the Rosey CloudCannon Connector. The Connector requires Rosey to have run on your editing branch so it can surface translations in the Visual Editor. If you intend to use the Connector, update your Collection URLs instead.

- I dont actually know if thats true. We dont require the rosey build step to have run. The rosey build step doesn't actually generate any locales files so isnt necessary for it to run.
- We *do* require a locale file to have been generated that contains all the data-rosey translations present on a page when we're editing said page in the visual editor with the RCC. We look at the built page's html for `data-rosey` tags, then look for the ids (the value of those tags) in the locale file of the locale we switch to. Then we can present, and make editable, the translation present in the locale file that matches the id in the html.
- To complicate things further, you would not be able to edit on production since your collections will be configured to be unprefixed with the locale code since you're editing on staging, where rosey build hasnt run, and therefore the pages living at the prefix havent been generated yet. So your config file will have to serve editing on staging - whatever is in your staging config will flow through to your prod config when pushed (no env variables available in CC config).
- I should prob test this as well

---

> What is the Rosey CloudCannon Connector?

- It also ships a helper that you can run in your postbuild that writes locale files for you so you dont have to manually write json. It helps bridge the gap between the base.json and the eventual rosey/locales/*.json files that Rosey uses for the actual build step. This helper can be run as a script in the postbuild. Other scripts can run after it if you want to integrate external services (like AI or an external agency translating content for you) as part of your translation workflow. These external services could modify the already written locales files. Alternatively, you are welcome to write your own middleware that helps generate the locales files for you. 
- The RCC is not dependent on the locales file writing step, but the connector does need locales files in place when an editor opens a page with translations on it in the visual editor.

---

> --collection generates the optional collections_config entry in your CloudCannon Configuration File for editing locale files in the Data Editor or Content Editor Sidebar.

- Maybe worth noting this is already set up in a previous page in the Rosey guide. This flag adds the locales files as a collection that editors can open in CC. 
- We could link to it further down the page: `Locale files as a Collection`. Basically this:

```yaml
collections_config:
  locales:
    path: rosey/locales/

collection_groups:
  <add stuff in here as well if collection_groups is defined>
```

---


> Prevents team members from creating, rearranging, or individually configuring locale files. Locale files are managed by Rosey and the Connector, not created manually.

- We *could* create them in CC though. I think its best to best to say they're best generated programmatically from the base.json, or created by a developer. 
- Maybe in other words: Since the files are expected in a certain format, it would be risky to allow non-technical editors to just create new locale files in CC and expect them to work in the correct way.

--- 

> Visible but read-only, so translators can see the current source text for reference while translating. This field is written by write-locales on every build and should not be edited manually.

- Do we want to mention that if you create or modify the locales files themselves its important to write the _base_original if you want stale translation detection? The stale translations on the client side package are powered by writing the current value of the original phrase from base.json to each locale file, seeing if they differ, and if they do marking the old translation present in the locales file as stale (the original has changed since the last translation for that Rosey key was entered)
- Its not an official Rosey key (Rosey doesnt mind it being there, but also doesn't require it - the RCC does)

---

```bash
echo "Installing dependencies"
npm install
```

- We prob don't need to npm install in our postbuild and shouldn't encourage it in our examples (it'll just slow the build down)

---

```bash
--exclusions "\.(html?)$"
```

- Maybe we should talk about this flag. We hopefully wont need this soon.
- We're overriding the default of `--exclusions "\.(json|html?)$"` or something similar
- We let JSON files through to the build Rosey site, which is not the default (usually we dont want the rosey locales files being included or something)
- With the RCC, we have a locales.json that lets the client side know what locales are configured on the server (ssg build) side. Thats what the exclusions override is letting through.
- Soon we won't need the locales json. Once we get a plural datasets() in the API (as opposed to just dataset()) we can use the API to search for locales. We'll look at datasets(), filter out all the datasets that follow the syntax locales_* and use the value of *. I'm prob going to need to do some work to see if its a bit fragile to expect a certain named data_config entry and if there is any easier/more robust way. At the very least we should be able to configure the syntax of that (prob add it to our rosey.yml file)

---





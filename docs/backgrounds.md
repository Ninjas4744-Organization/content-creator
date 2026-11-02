# Content backgrounds

New projects require a top-level `background` object in `content.json`, with a stable `id`, local `image` path (relative to `assets/`), optional `coverImage`, and nonempty `selectionReason`. PNG and JPEG are supported. Every new presentation and video must select something; choose by description and topic, or use your judgment about visual fit. Do not ask the user to choose when you can make that decision.

The supplied space-challenge set is `brand/space-content.png` with `brand/space-hero.png` for the cover. It depicts a blue lunar landscape, orbital diagrams and a rover, with room for text. Choose it for the spaceship challenge or other fitting space, science and robotics topics. To use the site's managed backgrounds, download the current creator kit from the admin and follow its background selection helper.

```json
{"background":{"id":"space-challenge","image":"brand/space-content.png","coverImage":"brand/space-hero.png","selectionReason":"The lunar landscape supports this spaceship challenge."}}
```

The same selection is used by HTML, PowerPoint, previews and video. Images cover the 16:9 canvas with a centered crop; test text readability in the storyboard. Text colors adapt for predominantly light images. Older documents without a `background` key retain the supplied backgrounds, and imported source decks retain their original appearance. New projects have an explicit null selection and cannot render until it is filled. Keep custom image references in the content document so source packages include them.

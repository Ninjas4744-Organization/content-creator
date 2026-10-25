---
name: davinci-presentation
description: "Create or revise a Da Vinci 4744 branded Hebrew presentation, slide deck, PowerPoint, training or FIRST introduction using this repository's assets. Use for requests such as צור מצגת, הכשרה, שקפים, or update an existing presentation. Produces editable PPTX, offline HTML slides and visual previews."
---

# Create a Da Vinci presentation

Work from the repository root, located three directories above this file. Read `docs/brand.md` and `docs/content-format.md` as needed. Use the user's language; default to Hebrew and RTL for this team.

1. Establish the topic, audience, desired outcome and approximate duration from the conversation or `projects/<name>/brief.md`. Ask only for genuinely blocking gaps; otherwise state reasonable assumptions and continue.
2. Create a project with `.venv/bin/python -m davinci_creator new <name> --title "..."`. If `.venv` is missing, run `python3 scripts/setup.py`. On Windows use `.venv\Scripts\python.exe`.
3. Write a coherent outline and then edit `projects/<name>/content.json`. Start with a clear promise, explain the concepts with concrete examples, and finish with a practical next step. Use speaker notes for detail. Source current or specialist factual claims from primary references. Never invent team accomplishments or statistics.
4. Choose layouts to suit the explanation: `cover`, `cards`, `photo`, `timeline`, `statement`. Vary the pacing; avoid filling every slide with the same list. Keep headings short and readable. Use the supplied backgrounds and fonts, English FIRST value names where relevant, and Gracious Professionalism® with its mark.
5. Build using `.venv/bin/python -m davinci_creator deck projects/<name>/content.json --out projects/<name>/output/deck`. This creates editable `presentation.pptx`, self-contained `presentation.html`, individual preview PNGs and a storyboard.
6. Inspect the storyboard and any dense slides. Open the HTML in a browser when available. Verify RTL word order, mixed English/Hebrew, wrapping, visual hierarchy, contrast and image proportions. Shorten or split crowded content, rebuild and inspect again. The shared preview renderer is a geometry check; a native PowerPoint or LibreOffice view is the final authority for PPTX rendering.
7. Deliver links to the PPTX and HTML, with a concise account of what was created. Keep the editable JSON and brief in the project. Apply later corrections to the JSON and rebuild, so exports stay consistent.

The repository includes `examples/community/content.json` and the supplied visual-reference PDF. Use them as design/content examples when relevant, not as a required topic for every presentation. See `docs/apps.md` for app-specific loading and `docs/commands.md` for preview and serving commands.

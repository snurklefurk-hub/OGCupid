# OG Cupid Historical Research Archive

This is the permanent, version-controlled home for OG Cupid's **historical OkCupid research and preservation work**, separate from the live site's code.

## Available in this commit

- [Dating Persona recovery records](dating-personas/restored-descriptions.json): all **32** original character names, the **18** period-result writeups transcribed so far, and status/source metadata for the **14** still missing.
- [Three original illustrations from historical result screenshots](dating-personas/original-artwork/three-persona-screenshot-sprite.webp): screenshot-derived art for **Genghis Khunt, The Peach, and The Playstation**. These are not the original 2004 GIF files; the image is an extracted/compressed display asset previously embedded in `index.html`.
- [Inventory of uploaded historical PNG screenshots](source-inventory.json): SHA-256 fingerprints, image dimensions, duplicate detection, and descriptions. **Important: the original full-resolution PNG uploads are not stored in this repository yet.** A separate binary-import workflow is needed.

## Preservation rules

1. Keep *original material*, *screenshot-derived copies*, *historical references*, and *modern OG Cupid reconstructions* explicitly distinct.
2. Preserve source URLs, dates (when verifiable), SHA-256 hashes, transcription confidence, and recovery status.
3. Never mark an image **recovered** merely because an old URL or filename was found.
4. Avoid publishing private member information or historic screenshots containing identifiable dating profiles without privacy review.
5. Respect the original creators' rights; these materials are for historical reference and research, not a claim of ownership or affiliation.
6. Keep all test scoring claims precise: the current 28-question quiz is an OG Cupid recreation, **not** a recovered original scoring engine.

## Future imports

For files on the Windows computer (`C:\Users\Lou\Downloads\OGCupid`), use an explicitly authorized local-file workspace or transfer a ZIP for a dedicated binary import. Regular ChatGPT Project uploads are readable in chat but do **not** synchronize their original file bytes to GitHub.

Use organized paths:
`archive/screenshots/`, `archive/dating-personas/original-artwork/`, `archive/historical-pages/`, `archive/compatibility-system/`, and `archive/technical-documentation/`.

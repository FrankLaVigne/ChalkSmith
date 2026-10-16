# Spike: can `.whiteboard` files be read offline?

Status: **inconclusive, blocked at the access layer** (2026-10-16).
Legend: **[C]** confirmed by observation · **[H]** hypothesis.

## Question

OneDrive-backed boards (work/school accounts) appear in OneDrive as
`<name>.whiteboard` files. Does such a file hold the full board (ink, images,
positions) in a form ChalkSmith could read without Microsoft services?

## Where boards are stored

| Account type | Storage | A file you can copy? |
|---|---|---|
| Work/school, migrated or new | OneDrive for Business, as `.whiteboard` files under `Documents/Whiteboards/` (Teams meeting annotation boards under `Whiteboards/Annotations/`) | Listed as files; see below |
| Work/school, legacy (unmigrated) | Microsoft's Azure-backed Whiteboard service | **No.** Deleted after 2026-10-16 (MC1441775) |
| Personal Microsoft account (Outlook/Hotmail) | Microsoft's Azure-backed Whiteboard service | **No.** Never stored in OneDrive. OneDrive-backed Whiteboard is reportedly unavailable to personal accounts (secondary source) |

- **[C]** A personal OneDrive sync folder contained no `.whiteboard` files.
- **[C]** A work OneDrive search returned `.whiteboard` files in the user's
  own drive and in drives shared with them.

## Observations on a `.whiteboard` file (user's own, work account)

1. **[C]** OneDrive reports the MIME type `application/octet-stream`, a
   binary file of about 10 KB, for a board with content.
2. **[C]** In the local OneDrive sync folder the file is a Files-On-Demand
   **cloud-only placeholder**. Attributes `0x401620` = recall-on-data-access
   | offline | sparse | reparse point | archive.
3. **[C]** Reading the placeholder fails with *Permission denied*. The sync
   client does not hydrate it, so no bytes are available locally.
   **[H]** OneDrive deliberately does not sync `.whiteboard` content, since
   these are live Fluid Framework documents opened only through Microsoft's
   apps.
4. **[C]** A Microsoft Graph–based file connector cannot return the content
   either. It only reads Office, PDF, image and text types.
5. **[H]** About 10 KB is too small for a full board with images. The file is
   probably a summary snapshot or a container pointer, with the operation
   history held in Fluid/OneDrive service storage.

No access control was bypassed: no sync settings were changed, no files were
pinned, and no private service APIs were called. The original file was not
modified.

## Not yet tried

- A manual **Download** of the file from OneDrive on the web, by the file's
  owner. If OneDrive offers only "Open", that would itself indicate Microsoft
  keeps raw `.whiteboard` content behind its apps.

## Implications for ChalkSmith

- Personal-account and legacy boards can only be rescued through the
  **Full Export ZIP** (`../spec/whiteboard-html-export.md`), and only while the
  web app still serves them.
- For work/school boards the export ZIP is also the **supported input** until
  a `.whiteboard` file's bytes can be obtained through normal user means and
  shown to contain the board. Reading `.whiteboard` directly stays a
  research item, not an M0 feature.
- If bytes are obtained later, decoding should compare a synthetic board's
  `.whiteboard` file with its Full Export of the same content, using
  synthetic boards only for anything published.

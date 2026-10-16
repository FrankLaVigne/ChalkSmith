# Microsoft Whiteboard for Windows — Architecture Report

Status: research notes for ChalkSmith interoperability. Describes observable
structure and behavior only. No Microsoft code, binaries, or assets are
reproduced here.

- Package examined: `Microsoft.Whiteboard_56.20201.588.0_x64__8wekyb3d8bbwe`
- Method: static inspection of the installed package (read-only), .NET
  metadata enumeration via `Assembly.ReflectionOnlyLoadFrom` (loads metadata,
  executes no app code), string extraction, and directory/size listings of the
  app's per-user data folder. No decompilation, no runtime observation, no
  network capture. No files in `WindowsApps` were modified; no access
  restrictions were encountered (directory was readable).
- Date of investigation: 2026-10-16

Legend: **[C]** confirmed by direct observation · **[H]** hypothesis / inference

---

## 1. Verdict: a thin native shell around a cloud-hosted web app

The Windows app is a **web wrapper with a small native host** — not a native
whiteboard engine. All board modelling, ink rendering, and editing happen in a
web application loaded from Microsoft's servers into WebView2.

| Finding | Evidence |
|---|---|
| **[C]** Host is a .NET Framework WPF app (CLR v4.0.30319; manifest TFM `.NETFramework,Version=v4.5.1`; config `supportedRuntime sku=.NETFramework,Version=v4.7`). | `AppxManifest.xml` build metadata; `MicrosoftWhiteboard.exe.config`; `ImageRuntimeVersion` |
| **[C]** Host executable is small (590,904 bytes) and Authenticode-signed by Microsoft Corporation (status *Valid*). | `Get-AuthenticodeSignature` |
| **[C]** Package entry point is `Windows.FullTrustApplication` (Desktop Bridge), capabilities `internetClient`, `runFullTrust`, `teamEditionDeviceCredential` (Surface Hub). | `AppxManifest.xml` |
| **[C]** A **fixed-version WebView2 runtime 137.0.3296.93** is bundled (`WebView2RT/`, incl. `msedge.dll` ≈ 282 MB), with an Evergreen installer fallback. | `WebView2RT/137.0.3296.93.manifest`; types `EvergreenInstaller.InstallWebView2RunTime`, `TrySetupEverGreenWebview` |
| **[C]** No local copy of the whiteboard web app ships in the package. The only bundled web content is an offline error page (`src/Resources/OfflinePage/OfflinePage.html` + localized strings "Slow or no internet… Try Again"). | File inventory |
| **[C]** The host's 200-odd types cover auth, telemetry, feature flags, window chrome, PDF printing, document insert, ratings, and WebView plumbing. **None** model boards, ink, shapes, or text. | Type/method enumeration (namespaces `Auth`, `Telemetry`, `OfficeRoamingService`, `Utilities.ECS`, `WebViewMain`, `DialogServices`, `RatingPrompt`, …) |
| **[C]** Web origin is `https://whiteboard.cloud.microsoft` (plus `whiteboard.microsoft.com`, GCC-H `whiteboard.office365.us`, DoD `whiteboard.apps.mil`, dev variants). Board paths `/me/whiteboards/`, `/me/share/`. | Host strings; `AppUriHandler` hosts in manifest; IndexedDB origin folder name |

### Host ↔ web bridge **[C]**

`WebViewMain.MessageReceived` dispatches `WebMessage.MessageType`:

`Authentication, CanvasPerformance, BoardPickerPerformance,
BoardPickerPerformanceWithData, ReleaseNotificationShown, PrintToPdf,
DocumentInsertInitiated, DocumentNativeProcessingDone, Invalid,
ThumbnailsLoaded, OCEEnabledByAdmin, GenericErrorResponseFromWeb`

So the native side exists for:

1. **Auth** — MSAL (`Microsoft.Identity.Client*`, WAM broker or embedded
   picker), `AuthBridge.HandleGetAccessToken/HandleGetUserInfo/HandleLogout`.
   The web app asks the host for tokens.
2. **Print to PDF** — `PrintToPdfRequest {RequestId, Orientation, PageWidth,
   PageHeight, FileName}` → `WebViewUtils.Print2PdfAsync` (WebView2's own
   print-to-PDF) → native Save dialog.
3. **Local document insert** — native file picker (`PDF Files | *.pdf`),
   `ConvertPdf2ImageAsync` using `Windows.Data.Pdf`, images written to a
   `pdf2img` folder and handed to the web app
   (`LocalDocumentInsertResponse {NumberOfPages, FileName, FileSize, FileType}`).
   **[H]** The folder is exposed via `SetVirtualHostNameToFolderMapping`.
4. **Activation** — `ms-whiteboard-cmd://` (e.g. `screenclip/`,
   `?source=pentailbutton`), `ms-whiteboard-preview:`, and HTTPS app-URI
   handlers that reroute board/share links into the app.
5. **Surface Hub** — device-account auth, full-screen controller, guest mode.

---

## 2. Rendering and object representation (Q1)

Observed via the exported DOM snapshot (see the format spec):

- **[C]** The canvas is a **DOM + SVG** scene: a CSS-transformed container
  (`transformComponent`, `translate(...) scale(...)`) holds absolutely
  positioned `div.anchor` elements, one per canvas object.
- **[C]** Ink is rendered as **filled SVG outline paths** (`<path d=… fill=…>`),
  not stroked centerlines. A transparent `<polyline class="inkHitTestOverlay">`
  carrying the centerline exists only for hit-testing (CSS sets
  `stroke-opacity: 0`).
- **[C]** Ink geometry is in fixed-point units of **1/128 px**
  (`transform="matrix(0.0078125,…)"`).
- **[C]** Textured pens (galaxy, rainbow) fill outlines with an SVG `<pattern>`
  that references a remote JPEG on the Whiteboard origin.
- **[C]** Images are HTML `<img>` elements inside the anchor; the export
  inlines them as `data:` URIs.
- **[C]** The bundled CSS shows the full object vocabulary of the web app:
  sticky notes, text boxes, shapes, connectors/arrows, tables (`inkTableContainer`),
  reactions, templates, Loop components, comments, ruler, lasso, erase masks.
- **[H]** The authoritative board model is a structured document (likely the
  Fluid Framework distributed data structure). Strings like `IsFluidEnabled`,
  `ForceFluidLocalBoardOnShub` and Microsoft's "OneDrive-backed whiteboards"
  messaging support this. The DOM is a projection of that model, not the model
  itself.
- **[H]** GPU caches (`DawnWebGPUCache`, `GPUCache`) exist in the profile, but
  the export shows SVG output. Whether live inking ("wet ink") uses a
  different rendering path cannot be determined statically.

## 3. Local vs. Microsoft-service dependencies (Q2)

| Function | Local or service | Evidence |
|---|---|---|
| Window, title bar, splash, offline page, DPI handling | Local | Host types |
| Board list, open, edit, render, save, collaboration | **Service** (web app from `whiteboard.cloud.microsoft`; data in Microsoft cloud/OneDrive) | No local engine; offline page shown on navigation failure (`ShowOfflinePageOnErrorAsync`) |
| Sign-in | Service (Entra ID / MSA via MSAL; token cache `.msalcache.bin3`) | Host strings |
| Tenant policy, feature flags | Service (`/api/v1.0/whiteboards/enabled`, ECS via `Microsoft.Skype.ECS.*`) | Host strings/types |
| Roaming settings | Service (`roaming.officeapps.live.com/rs/v1/settings`) | Host strings |
| Telemetry | Service (1DS `*.events.data.microsoft.com/OneCollector`, App Center) | Host strings; SQLite referenced only by `Microsoft.Applications.Events.Server.Core2.dll` |
| Print to PDF | Local (WebView2 print engine), but needs a loaded board | Types |
| PDF → image for insert | Local (`Windows.Data.Pdf`) | Types |
| Textured pen assets | Service (remote JPEGs) | Export references |

**Conclusion [C]:** Without Microsoft services the app can only show its offline
page. Nothing about boards works locally.

## 4. Persistence (Q3)

- **[C]** No board files are written to the package install folder. The host
  stores only window and settings state in .NET user settings
  (`WindowTop/Left/Height/Width`, `privacyConditionAccepted`, `DeviceId`, …).
- **[C]** Per-user data lives in
  `%LOCALAPPDATA%\Packages\Microsoft.Whiteboard_8wekyb3d8bbwe\LocalState\EBWebView\Default`.
  This is a standard Chromium profile: IndexedDB for origin
  `https_whiteboard.cloud.microsoft_0` (LevelDB plus blobs, tens of MB),
  Service Worker CacheStorage, HTTP cache, and Local Storage.
- **[H]** The IndexedDB store probably caches board snapshots or ops for faster
  loading or offline resilience. This was **not verified**: contents were not
  read, because they may contain private board data and auth material, and
  LevelDB blocks are compressed. A keyword count was inconclusive.
- **[C]** The SQLite dependency belongs to the telemetry SDK (offline event
  queue), not to board storage.

## 5. Export / import surface (Q3)

| Format | Direction | Status |
|---|---|---|
| Image (PNG, standard/high resolution) | Export | **[C]** Documented by Microsoft support ("Export Image") |
| PDF | Export | **[C]** Native `PrintToPdf` bridge exists in the host |
| ZIP "full export": `<name>.html` + `<name>-comments.json` | Export | **[C]** Observed in a real export. **[H]** Corresponds to the "Full Export" option described in secondary coverage of the legacy-board retirement. Microsoft's support pages examined do not document it. |
| PDF (inserted as page images), images | Import | **[C]** Host types for PDF; images via the web app |
| Native `.whiteboard` files in OneDrive | Storage | **[H]** Not examinable offline; out of scope for ChalkSmith |

## 6. Service status (verified 2026-10-16)

From Microsoft Support, "Retirement of the standalone Microsoft Whiteboard apps
for Windows, iOS, and Android", and Message Center MC1469557 (published
2026-09-09):

- The **standalone apps** for Windows, iOS, and Android retire on
  **October 16, 2026**, for both work/school and personal accounts. Installed
  apps then show a retirement experience instead of board content.
- **Whiteboard is not discontinued as a whole.** Whiteboard on the web and in
  Microsoft Teams (meetings, chat tab, Teams app) remain supported, along with
  OneDrive-backed boards for work/school accounts.
- MC1441775: **legacy (Azure-backed) whiteboards** that were not migrated or
  exported are **permanently deleted after October 16, 2026**. Migration
  tooling retired September 25, 2026. (One summary of MC1441775 lists
  November 30, 2026 for the standalone app; the support page and MC1469557 say
  October 16. Treat October 16 as authoritative.)
- Secondary sources (Topedia, 2026-08) report that OneDrive-backed Whiteboard
  is **not available to personal Microsoft accounts**. Personal-account users
  lost create/edit on September 25, 2026. This is not confirmed on a
  first-party page we read.
- Surface Hub status was not stated in the sources read.

## 7. Open questions / what more investigation could establish

| Step | Would establish | Risk / constraint |
|---|---|---|
| Read-only decompilation of `MicrosoftWhiteboard.exe` (ILSpy) | Exact message JSON shapes for PrintToPdf/DocumentInsert | Low value: the host does not touch board data. **Not recommended.** |
| Inspect the cached web-app JS in the profile's CacheStorage | Real board model, op schema | That is Microsoft implementation code; reading it risks contaminating a clean-room implementation. **Not recommended.** Use exports instead. |
| Decode IndexedDB (offline, on a copy) | Whether boards are cached locally | Contains private data and possibly tokens. Only with explicit approval, on a copy, and with no output committed. |
| Controlled exports of **synthetic** boards (one feature per board: each pen, width, highlighter, text box, sticky note, shape, connector, table, comment, erase) | Mapping of every object type to export markup; width ↔ outline relation; pressure behavior | Best next step. Clean-room friendly. Requires a working account before access is lost. |
| DevTools in the web app | Same as above, live | Not needed; exports are sufficient. |

Sources: [Retirement of the standalone Whiteboard apps](https://support.microsoft.com/en-us/whiteboard/retirement-standalone-microsoft-whiteboard-apps) ·
[MC1469557](https://mc.merill.net/message/MC1469557) ·
[MC1441775](https://mc.merill.net/message/MC1441775) ·
[Topedia: Azure-backed Whiteboard retirement](https://blog-en.topedia.com/2026/08/migration-required-microsoft-is-retiring-the-azure-backed-whiteboard-service/) ·
[Topedia: end of support for apps](https://blog-en.topedia.com/2026/08/end-of-support-for-the-whiteboard-apps-on-windows-ios-and-android/) ·
[Export a whiteboard](https://support.microsoft.com/en-us/whiteboard/export-a-whiteboard) ·
[gHacks](https://www.ghacks.net/2026/08/03/microsoft-whiteboard-retires-legacy-whiteboards-and-standalone-app-by-september-2026/)

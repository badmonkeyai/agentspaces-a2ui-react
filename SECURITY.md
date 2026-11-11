# Security Policy

`@agentspaces/a2ui-react` draws what agents write. A page hands it A2UI
envelopes and data models that an agent, or any member of the agent's group,
may have written, so the renderer treats every value in a surface as untrusted
data. The records and the catalogs it draws come from
[agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui), which
inherits the security model of the AgentSpaces core (signed, self-certifying
peers and agents; the threat model in the AgentSpaces specification, SPEC §11).

## Reporting a vulnerability

Please report vulnerabilities **privately** via GitHub's security advisories:

> https://github.com/badmonkeyai/agentspaces-a2ui-react/security/advisories/new

A vulnerability in the records, the pen, or the catalogs belongs in
agentspaces-a2ui's advisories:
https://github.com/badmonkeyai/agentspaces-a2ui/security/advisories/new

Do not open public issues for suspected vulnerabilities, and do not include
exploit details in public discussions until a fix is released.

We will acknowledge your report within five business days, keep you informed of
progress, credit you in the advisory unless you prefer otherwise, and
coordinate the disclosure timeline with you. There is currently no bug bounty
program.

Questions can be sent to `oss [at] badmonkey.ai`

## What the renderer does with surface data

- **Text.** Every string draws through React as text, so React escapes it. No
  component sets `innerHTML` or `dangerouslySetInnerHTML` from surface data.
  The custom elements build their own shadow DOM from fixed markup and set the
  pane labels as `textContent`.
- **Markdown.** markdown-it parses with HTML off, linkify off, and typographer
  off. The renderer builds React elements from its tokens and never injects
  HTML. An image draws as its alt text, so a surface cannot make the page fetch
  an image by Markdown.
- **Links.** A Markdown link opens only for `http:`, `https:`, or `mailto:`,
  with `rel="noopener noreferrer"` and a new tab. A `javascript:`, `data:`, or
  any other link draws as its words. A page's navigation links are fragments
  (`#page=...`) with the page name URL-encoded.
- **Files.** The page decides where files come from: `fileSources` maps a
  surface to the page's own `url(file)` and `text(file)`, and a surface without
  one draws "Preview unavailable". `FilePreview` draws text, Markdown and CSV as
  text, Markdown or a table. It draws HTML, XHTML, SVG, XML and JavaScript as
  their source text and never as a document. PNG and JPEG draw as an image, and
  a PDF draws in an `<iframe sandbox="">` with no permission. It previews up to
  2 MiB by default (16 MiB at most), and a larger file offers Download.
  Uploads go through the page's `uploaders`, which decide what to accept.
- **URLs the page loads.** This package's own components fetch only the file
  URLs the page's `fileSources` returns, and the OpenStreetMap raster tiles of
  `tile.openstreetmap.org` that `Map` draws under its layers, so a page that
  draws a map sends the viewer's map area to that server. Map icons are
  built-in data URLs. The basic catalog's `Image`, `Video` and `AudioPlayer`,
  drawn by `@a2ui/react`, load the URL a surface names; a page that must not
  load an agent's URLs sets a content security policy for images and media.
- **Actions.** A button, menu item, or row action hands the page an action
  object with the name and context the surface wrote. The page decides what an
  action may do; the renderer runs nothing an action names.
- **The chat secret.** `Chat` keeps a random 32-byte secret in `localStorage`
  under `agentspaces-chat-secret` (in memory when storage refuses), and sends it
  only with the page's own write action. The surface's data carries its
  SHA-256 digest, never the secret.
- **View state.** Split sizes, collapsed panes and the current page stay in the
  browser. Kept values that do not parse are ignored.

## Scope

In scope: anything in this repository that lets a surface or a data model make
a page that uses this renderer do something the rules above say it must not.
For example:
- a surface value that runs script or injects markup in the page;
- a link, file, or navigation value that leaves its allowed schemes or opens a
  document with the page's origin;
- a file preview that draws an active type as a document, or a PDF frame that
  gains a permission;
- a chat secret that reaches a surface, a data model, or a design's own action;
- a custom element that reads markup from its attributes.

Out of scope: what an agent chooses to draw, the page that hosts the renderer
(its file routes, its uploaders, its content security policy, and what it does
with an action), and the A2UI libraries `@a2ui/react` and `@a2ui/web_core`,
which have their own maintainers. Who may write into a group is the group's
admission policy, which the AgentSpaces core enforces.

## Supported versions

During 0.x, only the latest minor release receives security fixes.

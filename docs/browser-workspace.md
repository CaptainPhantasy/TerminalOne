# Browser workspace
Use New browser tab to open an isolated Chromium page on the terminal host. Enter a web address, search phrase or localhost URL. Browser navigation, clicking, typing and scrolling happen in that real page, independent of iframe policies.
Each tab has its own cookie context. These are workspace browser tabs, not an attachment to an existing Safari or Chrome profile. Browser audio, file upload/download dialogs, extensions and password-manager integration are not provided by the image-based viewer.

## Sharing
Human tabs start Private. Select View only or Allow control, then Copy connection. Paste the connection JSON into your terminal agent. Changing permission rotates the token; choosing Private immediately rejects subsequent token requests. Commands already executing can finish. Closing a tab destroys its context.
The supplied endpoint accepts a Bearer token in the Authorization header:
- GET /content: current URL, title and visible text.
- GET /snapshot: current URL, title and JPEG image in base64.
- POST /action with JSON: navigate (url), back, forward, reload, click (x,y in the dimensions returned by /snapshot), type (text), key (Puppeteer key name), scroll (deltaY).
View tokens cannot invoke actions or change grants. Never paste the token into a visited web page.
Choose Agent browser to create a separate context with control granted. Hide view keeps the browser running headless. Reopen Agent browser to observe the same context. Revoking access also works on the agent context.
The viewer samples images once per second when open. This is remote interaction, not a native browser DOM exposed to the viewer's assistive technology. Agents can use /content for text. Keyboard Tab moves through the workspace UI; the Send text field, Tab and Enter buttons interact with page inputs.
Localhost means the terminal server host, not the phone or tablet. HTTP and HTTPS are supported; file URLs and embedded URL credentials are rejected.

## Runtime and trust
Puppeteer is a production dependency; npm install downloads its compatible Chromium. TERMINALONE_CHROME can select an operator-installed compatible binary. Use the pinned runtime by default.
The existing loopback listener and request-origin checks protect workspace routes. User control keys stay in page memory and are never embedded in page URLs. API responses use no-store. At most eight contexts can remain open.
Grants protect cooperative API clients, not hostile processes that already have unrestricted access to the host shell or browser owner's application. The local server has the user's existing authority. Keep remote access behind the existing authenticated proxy.
Browser sessions and grants are in memory. Restarting the server closes them; saved browser profiles and seamless session persistence are not implemented.

## Validation
Run node tests/workspace-journeys.cjs against a local server at port 11357. The test starts its own local preview site at 11358 and captures evidence at 393×852, 820×1180, 1440×900 and 1920×1080.
DESIGN.md lists the four motions and device-specific structures.

# TerminalOne v1.0.0 — Pre-Release Notes

## Or: The Terminal App That Got Tired Of Waiting For Permission

---

**DOCUMENT CLASSIFICATION:** Pre-Release / Barely Containing Itself
**DATE RECORDED:** 2026-06-22 — 2:47 AM, Obviously
**LOCATION:** The Garage, Brown County, Indiana
**BEVERAGE:** Coffee that completed its arc from "bold roast" to "war crime"
**CURRENT STATE:** 39 features deep and questioning everything

---

## What TerminalOne Is

A terminal emulator that lives in your browser.

That's it. That's the pitch. No App Store. No provisioning profile. No $99/year to put a command prompt on your own iPad. No subscription that auto-renews while you sleep. You run a command, a browser tab opens, and you have a real terminal — PTY, scrollback, the works — on whatever screen is in front of you.

Thirty-nine features deep. One port. Zero monthly invoices.

---

## Why It Had To Exist

Because somewhere along the line, the industry decided that a terminal emulator — literally the oldest category of software application, older than the mouse, older than the GUI, older than most of the people reading this — was worth a monthly subscription.

A terminal. A subscription. For a terminal.

We stared at that for a while. Then Bella stared at us. Then we started coding.

TerminalOne exists because the most basic tool in computing should not be trapped behind a paywall, an app store review board, and a "trusted developer" certificate that you have to renew like a driver's license for software you already own.

---

## The Numbers (All Real, All Counted This Session)

| Claim | Reality |
|---|---|
| Feature modules shipped | 38 |
| ShellFish-parity features | 20, all passing |
| Monthly subscription | $0 |
| App Store approval needed | None |
| Ports required | 1 (11001) |
| Keystrokes to launch | 2 (`t1`) |
| Cats involved in QA | 1 (Bella, who walks on the actual keyboard being tested) |

---

## What's In The Box

**Connectivity**
WebSocket to a real PTY. Reconnects when the network drops. Stays alive when it shouldn't. Health-checks itself like a hypochondriac.

**Sessions**
Multi-session tabs. Rename them. Reorder them. Switch with a swipe. Lock one when you don't trust yourself not to fat-finger `rm` into it.

**Input**
Configurable on-screen key bar for tablets. Hardware keyboard shortcuts for people who own a real keyboard. Haptic feedback for people who need to feel the void they're typing into. Stylus support for reasons we'll explain later. (We don't have a good reason. Bowser walked across the trackpad and we committed.)

**Clipboard**
OSC 52 bridge. Copy from the server's clipboard to yours. Select-all. Paste. The things a terminal is supposed to do.

**Search**
Regex. Case-sensitivity toggle. The search box that was missing from every "modern" terminal for some reason.

**Sessions, again, because there's more**
Autosave scrollback to localStorage. Reload the page, get your terminal back. Export the whole thing as a text file when you need to prove to someone what you typed.

**Notifications**
OSC 777 → browser notifications. Your build finishes, your browser tells you. Your script crashes, your browser tells you. Bella knocks your coffee over, your browser cannot help you.

**Themes**
Full theme catalog. System dark/light detection. A command palette. Font sizing with pinch-to-zoom because reading 8pt output at 2 AM is how you go blind.

**Status**
Footer with uptime, latency, shell type. The terminal tells you how it's feeling. It's usually fine. It's lying.

---

## What's NOT In The Box

- A subscription form
- An "Upgrade to Pro" modal
- A data collection pipeline
- A trust dialog asking permission to run on the device you already own
- Analytics
- A board of directors

---

## Known Behaviors

- **Bowser** (Technical Director, skinny, monitors routers) has been observed sitting on the keyboard during session-switch testing. Sessions switched. This is either a feature or a fireable offense. We haven't decided.
- The install script writes a macOS LaunchAgent that auto-starts TerminalOne at login. This is intentional. You wanted an always-on terminal. You got one. If you didn't want one, there's an uninstall script. We're not clingy.
- PWA install works on iPad. Once installed, it runs standalone — no browser chrome, no address bar, just the terminal. The way computing was supposed to work before someone invented the address bar.

---

## How To Start It

```
./start.sh
```

Or if you installed the service: type `t1` and press Enter.

That's the entire installation section. We refuse to make it longer.

---

┌──────────────────────────────────────────────────────────┐
│  DOCUMENT METADATA                                        │
├──────────────────────────────────────────────────────────┤
│  Classification:   Pre-Release Notes                      │
│  Cat Supervision:  Bella Approved (keyboard walked on)    │
│  Bowser Status:    Monitoring routers, sitting on tabs    │
│  "I Don't Suck":   ✅ PASS                                │
│  Corporate Feelings: HURT (intended)                      │
│  Subscription Treadmill: OFF                              │
└──────────────────────────────────────────────────────────┘

**DOCUMENT ENDS**

*— Builder, Floyd's Labs*
*Brown County, Indiana — The Garage*
*"We built a terminal because someone put a terminal behind a paywall. That's the whole story."*

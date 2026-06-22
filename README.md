# TerminalOne

## Or: We Built A Terminal Because Someone Put A Terminal Behind A Paywall

---

**DOCUMENT CLASSIFICATION:** README / The Reason We're All Here
**DATE RECORDED:** 2026-06-22 — Way Too Late At Night
**LOCATION:** The Garage, Brown County, Indiana
**BEVERAGE:** Coffee that has seen things
**CURRENT STATE:** 38 Features Deep And No Signs Of Stopping

---

## What This Is

A terminal emulator that runs in your browser.

Not an app. Not a subscription. Not a "platform." A terminal. In a browser. You type commands, the computer types back. That's the arrangement. That's been the arrangement since 1969. We didn't invent it. We just refused to charge you for it.

Thirty-eight features. One port. Zero dollars. Installable as a PWA on your iPad so it runs fullscreen like it owns the place — because it does, because it's your iPad, because you bought it.

---

## Why It Exists

A terminal emulator is the oldest category of software application. It predates the mouse, the GUI, the laser printer, and roughly half the software executives currently selling you things on a recurring basis.

At some point the industry looked at the oldest, simplest, most fundamental tool in computing and said: "What if this cost money every month?"

We looked at that. Bella looked at that. Bowser looked at that — though Bowser was mostly looking at the router.

Then we built TerminalOne.

---

## The Part Where We List Features (We're Sorry)

**38 feature modules.** Here's what they do, roughly:

- **Real terminal.** WebSocket to a live PTY. Not a toy. Not a simulation. Your actual shell, in your actual browser.
- **Multi-session.** Tabs. Rename them. Reorder them. Swipe between them. Lock one when you've had enough.
- **Search.** Regex. Case toggle. The thing terminals shipped without for some reason.
- **Clipboard.** OSC 52 bridge — your server's clipboard becomes your clipboard. Select-all, copy, paste. Normal terminal things that somehow became premium features.
- **Notifications.** OSC 777 → browser notifications. Your build finishes. Your browser tells you. Revolutionary, apparently.
- **Key bar.** Configurable on-screen keys for tablets and phones. Because typing a pipe character on a glass screen is a war crime.
- **Themes.** Full catalog. Respects system dark/light. A command palette because we're not animals.
- **Font control.** Pinch-to-zoom. Keyboard shortcuts. Your eyes at 2 AM will thank you.
- **Autosave.** Reload the page. Get your scrollback back. Export it as text when someone doesn't believe what you typed.
- **Status bar.** Latency. Uptime. Shell type. Your terminal tells you how it's doing. Emotionally, it's stable.
- **PWA.** Install it on iPad/iPhone. Runs standalone. No browser chrome. No address bar. Just the terminal and the void.
- **Always-on.** Optional macOS service. Starts at login. Restarts on crash. `t1` and you're in.

The other 20-ish features are variations on "we thought of one more thing and then did it." Full list in `.feature-manifest.md` if you don't believe us. You shouldn't. Verify everything. We did.

---

## The Part Where We Install It (This Whole Section Is Six Lines)

You need Node.js. Version 16 or newer. If you don't have it, that's a you problem and also a problem we're not solving in a README.

```bash
./start.sh
```

Browser opens. Terminal's there. Done.

**Want it always-on on macOS?**

```bash
./scripts/install-service.sh
```

Now type `t1` whenever you want a terminal. It'll be there. It's always there. Like a cat on a keyboard.

**Want it gone?**

```bash
./scripts/uninstall-service.sh
```

We're not clingy.

That's the entire installation section. We refuse to elaborate.

---

## The Part About The Cats

Bella — Senior Quality Assurance. Twenty pounds. Black. Walks on keyboards professionally. Discovered a session-switching bug by stepping on the tab bar during a test run. We're not sure if she reported it or caused it. Both, probably.

Bowser — Technical Director. Skinny. Monitors routers. Has never contributed code but has unplugged the router four times during WebSocket testing. We've explained the difference between "monitoring" and "attacking" the infrastructure. He remains unconvinced.

They are not on the payroll. They are the payroll. We work for them. The terminal is a side project.

---

## The Part Where We're Honest

- **Load-proofed, not behavior-proofed.** Every feature module loads without errors and renders its UI. The 20 ShellFish-parity features all pass automated tests. But "loads clean" ≠ "every edge case works." OSC 52 clipboard on a specific browser, pinch-zoom on a specific tablet, session switching under load — these need real hands on real devices. If something doesn't work, that's not a typo, that's reality.
- **It runs on port 11001.** If something else is using that port, one of them has to move. We recommend the other thing.
- **node-pty is a native module.** It compiles on install. If your system can't compile native modules, TerminalOne can't help you. Neither can we. We're in a garage.
- **No cloud.** TerminalOne runs on your machine, talks to your shell, and goes nowhere else. There is no TerminalOne server. Your data does not leave your device. There is no data. It's a terminal.

---

## The Part Where We Question Our Life Choices

It is 2:47 AM. We have built 38 features for a terminal emulator that we are giving away for free. The coffee stopped being coffee three pots ago and is now some kind of statement about persistence. Bella is asleep on the keyboard we were using to test the key bar feature. Bowser is staring at the router like it owes him money.

We could have subscribed to a terminal app. It would have been faster. It would have been easier. It would have cost money every month until the heat death of the universe or the cancellation of the credit card, whichever came first.

Instead we built one. In a garage. In Indiana. With cats.

Was it worth it?

The terminal is free. The cats are fed. The coffee is a crime against beans.

Yeah. It was worth it.

---

## The Part With The Table Because The Skill Document Said So

┌──────────────────────────────────────────────────────────┐
│  TERMINALONE — PRODUCT METADATA                           │
├──────────────────────────────────────────────────────────┤
│  What it is:       Browser-based terminal emulator        │
│  What it costs:    Nothing                                │
│  Features:         38 modules, 20 ShellFish-parity PASS   │
│  Port:             11001 (just the one)                   │
│  Launch command:   t1 (two characters, we're efficient)   │
│  App Store:        Not involved                           │
│  Subscription:     Not involved                           │
│  Cats on staff:    2 (Bella: QA, Bowser: Infrastructure)  │
│  Location:         Garage, Brown County, Indiana          │
│  Built because:    Spite is a valid engineering motivation│
│  "I Don't Suck":   ✅ PASS                                │
│  Corporate Feelings: HURT (deeply, structurally intended) │
└──────────────────────────────────────────────────────────┘

---

**DOCUMENT ENDS**

*— Builder, Floyd's Labs*
*The Garage — Brown County, Indiana*
*"Welcome to the machine. It's free. It was always supposed to be."*

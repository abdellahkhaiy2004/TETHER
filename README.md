<div align="center">

# ⬡ TETHER

### *Tug-of-war meets poker at 200 BPM.*

A rapid-fire, 2-player **kinetic resource-bidding** PvP arcade game.
Two players fight to pull a floating geometric **Core** into their scoring zone by
secretly allocating limited energy across competing force vectors — all within a
brutal **3-second decision window**.

No health bars. No direct combat. Victory belongs to the player who outreads,
outbluffs, and out-allocates their opponent across dozens of lightning-fast rounds.

![Status](https://img.shields.io/badge/status-prototype%20v0.1-00f0ff)
![Tech](https://img.shields.io/badge/built%20with-vanilla%20JS%20%2B%20Canvas-ff00aa)
![Platform](https://img.shields.io/badge/platform-Web%20%2B%20Android-ffd700)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## The Concept

Each round follows a tight loop — **ALLOCATE → REVEAL → RESOLVE → REGEN** — resolving in
under 5 seconds. Players blind-allocate a pool of energy across:

- **3 Force Vectors (A / B / C)** — directional pulls on the Core (45° left, center, 45° right).
- **Traps (Gravity Wells)** — placed this round, they bend the Core's path next round.
- **Shields (Vector Nullifiers)** — guess and cancel one of the opponent's vectors.

Because forces are **2D vectors, not scalars**, you can win by attacking the *angle* your
opponent neglects — not just by out-spending them. The Core has **mass, inertia, and
momentum that carries between rounds**, creating natural back-and-forth rallies.

> First to **5 points** wins. A full match lasts ~60–90 seconds.

---

## Features

-  **Simultaneous blind input** — no turn-order advantage; pure read-and-react mind games.
-  **Strategic triangle** — direct force ⟷ shields ⟷ traps form an extended rock-paper-scissors.
-  **Custom 2D physics** — vector forces, damping, velocity caps, wall bounces, momentum carry-over.
-  **"Neon Blueprint" aesthetic** — glowing geometry on pure black, particles, screen shake, and bloom.
-  **Touch-native local multiplayer** — split-screen multi-touch on a single device.
-  **Desktop keyboard controls** for quick testing.
-  **Android build** via Capacitor (a prebuilt debug APK is included).

---

##  Controls

**Touch (mobile):** Each player taps the buttons on their own half of the screen —
`A` `B` `C` to add energy to a vector, `SHD` to cycle a shield target, `TRP` to arm a trap,
`CLR` to reset the round's allocation.

**Keyboard (desktop testing):**

| Action      | Player 1 (bottom) | Player 2 (top) |
|-------------|:-----------------:|:--------------:|
| Vector A    | `Q`               | `I`            |
| Vector B    | `W`               | `O`            |
| Vector C    | `E`               | `P`            |
| Shield      | `A`               | `K`            |
| Trap        | `S`               | `L`            |
| Reset       | `R`               | `T`            |

---

##  Run It

### Play in a browser
```bash
# from the project root
npx serve .
# then open the printed localhost URL
```
Or simply open `index.html` directly in a modern browser.

### Try it on Android
Install the prebuilt debug build: **[`TETHER-debug.apk`](./TETHER-debug.apk)**
(enable "install from unknown sources" first).

### Build the Android app yourself
```bash
npm install
npm run sync      # npx cap copy && npx cap sync android
npm run android   # opens the project in Android Studio
```

---

## Tech Stack

| Layer       | Technology                                         |
|-------------|----------------------------------------------------|
| Rendering   | HTML5 Canvas 2D (hand-written render loop, 60 fps) |
| Logic       | Vanilla JavaScript (no frameworks, no engine)      |
| Physics     | Custom 2D vector math (force, damping, collisions)  |
| Styling     | Plain CSS                                           |
| Mobile      | [Capacitor](https://capacitorjs.com/) → Android    |

---

## Project Structure

```
.
├── index.html          # Canvas host page
├── styles.css          # Neon Blueprint base styles
├── game.js             # Entire game: state machine, physics, input, rendering
├── GDD.md              # Full Game Design Document (mechanics, balance, roadmap)
├── capacitor.config.json
├── android/            # Capacitor Android project
└── TETHER-debug.apk    # Prebuilt debug build
```

---

## Roadmap

The included **[Game Design Document](./GDD.md)** details the full vision beyond this prototype:
online network PvP (lockstep, server-authoritative), AI opponents, ranked progression,
cosmetics, accessibility modes, and a tunable balance system.

---

## License

Released under the [MIT License](./LICENSE).

<div align="center">
<sub>Designed & built by Abdellah Khaiy.</sub>
</div>

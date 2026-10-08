# Engine recordings (optional)

The game synthesises each engine from its cylinder layout and firing order. If you own
recordings of the real cars, drop them here and list them in `manifest.json`; the
`AudioManager` then cross-fades them by rpm instead of using the synthesiser.

Each car id (`porsche`, `ferrari`, `lamborghini`, `lotus`, `corvette`) maps to a list of
seamless loops recorded at a steady rpm, on load (`"on"`, full throttle) and off load (`"off"`):

```json
{
    "porsche": [
        { "rpm": 1000, "load": "off", "file": "assets/audio/engines/porsche/idle.ogg" },
        { "rpm": 3000, "load": "on", "file": "assets/audio/engines/porsche/on_3000.ogg" },
        { "rpm": 3000, "load": "off", "file": "assets/audio/engines/porsche/off_3000.ogg" },
        { "rpm": 6000, "load": "on", "file": "assets/audio/engines/porsche/on_6000.ogg" },
        { "rpm": 6000, "load": "off", "file": "assets/audio/engines/porsche/off_6000.ogg" }
    ]
}
```

Only use recordings you have the rights to. Interior (cockpit) recordings sound best, since
the game is played from the driver's seat.

# Engine recordings

Each car's engine is built from short, seamless loops cut from real recordings and listed in
`manifest.json`; the `AudioManager` cross-fades them by rpm and pitch-shifts them
(`playbackRate = rpm / loop.rpm`), on load (`"on"`, throttle pressed) and off load (`"off"`, lifted).
A car missing from the manifest falls back to the engine synthesiser.

```json
{
    "porsche": [
        { "rpm": 1332, "load": "off", "file": "assets/audio/engines/porsche/off_1332.wav" },
        { "rpm": 1549, "load": "on", "file": "assets/audio/engines/porsche/on_1549.wav" }
    ]
}
```

The loops are 16-bit mono PCM WAV at 22050 Hz (WAV loops gaplessly in every browser, iOS Safari
included), 0.55 to 1 s long. They are generated, not hand-edited: rebuild them with
`scripts/import-engine.mjs` (below).

## Sources

Only recordings that carry a reuse licence: YouTube videos published under the Creative Commons
Attribution licence (CC BY 3.0, "reuse allowed") and Freesound sounds released as CC0. "Stand-in"
marks a recording of a related engine rather than the game's car; the importer uses the car's own
recordings first and stand-ins only for rpm bands they leave empty.

| Car | Recording | Uploader | Licence | Engine | Loops |
| --- | --- | --- | --- | --- | --- |
| porsche | [Porsche Club Tourcoing (Croix en Ternois) Trackday 2014](https://www.youtube.com/watch?v=nFFq-kr-Ne8), onboard | Seppe Vanrolleghem | CC BY 3.0 | the car: 930 Turbo (1989) | off 963, 1332; on 1549, 1997, 2825, 3869 |
| porsche | [RUF CTR "Yellow Bird" (1988) Racing Demonstration](https://www.youtube.com/watch?v=7ex3IILPJxc), onboard | NelloRacing | CC BY 3.0 | stand-in: 930-derived twin-turbo flat-6 | off 1718, 4206; on 5736 |
| ferrari | [POV Drive: Ferrari Testarossa on Austria's Perfect Mountain Road](https://www.youtube.com/watch?v=y54WIBl-YkQ), onboard | Jason #jcr_cars | CC BY 3.0 | the car | off 1431, 2104; on 1511, 2052 |
| ferrari | [This is What a Ferrari Testarossa Was Built For](https://www.youtube.com/watch?v=SgcndXGRDJ8), onboard | Jason #jcr_cars | CC BY 3.0 | the car | off 1028; on 2846 |
| lamborghini | [Lamborghini Countach LP500S in Singapore - Startup, Idle and Departure](https://www.youtube.com/watch?v=uYv1l31kgKc), exterior | automobilemusicengines | CC BY 3.0 | the car (LP500S/5000S) | off 857, 1277; on 1633 |
| lamborghini | [Lambo idle and rev](https://freesound.org/people/cheesepuff/sounds/112075/), exterior | cheesepuff | CC0 | stand-in: unidentified Lamborghini (its harmonics fit a V12) | off 3434; on 3460, 4663 |
| lotus | [1995 Lotus Esprit S4s "Monterey Edition" Drive-By, Starting and Coming to a Stop](https://www.youtube.com/watch?v=JOoPKIHNxN8), exterior | Thomas Fletcher | CC BY 3.0 | stand-in: Esprit S4s 2.2 turbo I4, same engine family | off 1189, 1637, 3952; on 1922, 3076, 4776 |
| lotus | [1995 Lotus Esprit S4s "Monterey Edition" - Test Drive](https://www.youtube.com/watch?v=g3TB56F4sO8), interior | Thomas Fletcher | CC BY 3.0 | stand-in: as above | none (the exterior covers every band) |
| corvette | [1986 Chevrolet Corvette C4 Exhaust Sound](https://www.youtube.com/watch?v=2m56Th1DQ1g), exterior | LUNI Classic Cars | CC BY 3.0 | the car: C4 L98 V8 | off 635, 810, 1341; on 1308 |
| corvette | [1986 Chevrolet Corvette C4 Walkaround, Startup and Sound](https://www.youtube.com/watch?v=qcrtbrzZJRM), exterior | LUNI Classic Cars | CC BY 3.0 | the car (same audio as above, longer) | none |
| corvette | [auto performance corvette int top open key in ignition, start, rev, accelerate…](https://freesound.org/people/kyles/sounds/637188/), interior | kyles | CC0 | stand-in: Corvette of unstated generation | none |
| corvette | [auto performance corvette int top open accelerate quickly to fast speed…](https://freesound.org/people/kyles/sounds/637183/), interior | kyles | CC0 | stand-in: as above | none |

Loops are named by load and rpm (`on_1549.wav`). `node scripts/import-engine.mjs` prints which
seconds of which recording every loop came from, with its measurements.

## Rebuilding the loops

All work files live in the git-ignored `tmp/`. Install yt-dlp in a local virtualenv (it needs
Python 3.10 or newer and a JavaScript runtime for YouTube; Node is enough):

```sh
python3 -m venv tmp/tools/venv && tmp/tools/venv/bin/pip install yt-dlp
```

Download each source into its own folder, `tmp/engine-cache/<source>/source.<ext>`. For a YouTube
video, first check that its watch page still carries the CC BY licence and skip it if it does not:

```sh
id=nFFq-kr-Ne8   # and 7ex3IILPJxc y54WIBl-YkQ SgcndXGRDJ8 uYv1l31kgKc g3TB56F4sO8 JOoPKIHNxN8 2m56Th1DQ1g qcrtbrzZJRM
if curl -sL -A "Mozilla/5.0" -H "Accept-Language: en-US" "https://www.youtube.com/watch?v=$id&hl=en" \
    | grep -q "Creative Commons Attribution license (reuse allowed)"; then
    mkdir -p tmp/engine-cache/yt-$id
    tmp/tools/venv/bin/yt-dlp --no-playlist --js-runtimes node -f bestaudio \
        -o "tmp/engine-cache/yt-$id/source.%(ext)s" "https://www.youtube.com/watch?v=$id"
fi
```

Freesound sounds come from the public high-quality preview linked on each sound's page (the
original-file download needs an account; check the page still says CC0):

```sh
mkdir -p tmp/engine-cache/fs-112075 tmp/engine-cache/fs-637188 tmp/engine-cache/fs-637183
curl -sL -o tmp/engine-cache/fs-112075/source.mp3 https://cdn.freesound.org/previews/112/112075_682033-hq.mp3
curl -sL -o tmp/engine-cache/fs-637188/source.mp3 https://cdn.freesound.org/previews/637/637188_612689-hq.mp3
curl -sL -o tmp/engine-cache/fs-637183/source.mp3 https://cdn.freesound.org/previews/637/637183_612689-hq.mp3
```

Then, with ffmpeg on the `PATH` (or `FFMPEG=/path/to/ffmpeg`):

```sh
node scripts/import-engine.mjs            # every car (several minutes: the RUF video is 19 min)
node scripts/import-engine.mjs lotus      # one car
node scripts/import-engine.mjs --track    # also dump rpm tracks and every measured stretch to tmp/engine-work/
```

## How the importer decides

1. **Track the rpm.** Every 46 ms a harmonic comb (peak minus valley over the first and prime
   harmonics) is scored across the car's rpm range and a Viterbi pass picks the steadiest strong
   path. The comb locks onto one line of the engine's harmonic series; `order` in the script's
   source list says which engine order that line is, so `rpm = 60 · f / order`.
2. **Cut candidate stretches** of 1.3 s (steady, under a quarter-octave of sweep) or 0.8 s (up to
   0.4 octave) where the track is continuous, does not wobble, and the level neither drops out nor
   fades. Each stretch is resampled to a constant pitch (a sweep becomes a steady note).
3. **Measure and reject.** Tonality (spectrum power over its running-median floor, at least 4 dB),
   the firing line's prominence at `rpm · cylinders / 120` (at least 6 dB), head-to-tail pitch
   drift after flattening (at most 20 cents), and the stretch's harmonic signature against the
   recording's usual one (correlation at least 0.7, and no better match at a third, half, double or
   triple of the tracked line, which would mean the tracker slipped). Wind-dominated driving
   fails the tonality check; `exclude` in the source list removes spans that are not the engine
   but measured well (a key-in chime, a steady background tone the tracker locked onto).
4. **Load.** Anything near idle (under 1.5 × idle rpm) or falling faster than 0.1 octave/s is off
   load; the rest is on load, a rising stretch ranking ahead of a steady one.
5. **Select** per load the best stretch in each 0.6-octave rpm band, at least 0.35 octave apart.
6. **Loop**: the loop length (near 1 s or 0.6 s) whose continuation best matches the head, the
   first 80 ms crossfaded (equal power) with the audio that follows the cut, so the last sample
   flows into the first. **Level**: on load −16 dBFS RMS at redline falling 3 dB per octave below
   it, off load 6 dB quieter, peaks held under −1 dBFS.

### How each `order` was established

The tracker follows the strongest comb, which is not always the firing line, so each recording's
order was read off its own spectrum and checked against an anchor:

- **porsche (1.5)**: in the 930 onboard the comb sits at half the firing line (a flat-6 fires 3
  times a revolution and shows a strong order 1.5); a steady stretch with lines at 41, 82, 123,
  165, 206 Hz has its strongest line at 82 Hz, the firing line at 1640 rpm, and a finer 13.7 Hz
  series (order 0.5) that gives the same rpm.
- **ferrari (3)**: the flat-12 fires 6 times a revolution; cruising stretches show the firing line
  at twice the comb (203 Hz with the comb at 101.6 Hz: 2030 rpm in a mountain-road drive).
- **lamborghini (6)**: the comb sits on the firing line; the stand-in's idle shows lines at 29.6 Hz
  spacing (order 1.5) with the strongest at 118 Hz, a V12 idling at 1180 rpm.
- **lotus (2)**: the inline-4's comb is its firing line; the exterior recording idles right after
  start-up with lines at multiples of 40 Hz, 1190 rpm (twice that would be an implausible idle).
- **corvette (4)**: the V8's firing line is the brightest line at idle, 50 to 62 Hz, 750 to 930 rpm.

## Limitations

The recordings are camera and phone audio: automatic gain, wind, a few background tones. The
checks keep only stretches whose energy sits on the engine's harmonics, which leaves gaps: the
Testarossa has no stretch that passes above about 2850 rpm, and the C4 Corvette none above about
1350 rpm (its revs are blips too short and fast to loop), so those cars pitch their top loop up
toward redline. The Countach's own recording is a distant exterior start-up; above 1650 rpm its
loops come from the unidentified Lamborghini stand-in. Interior and exterior recordings are mixed
where a car's own recording does not cover a band. The rpm labels rest on the engine-order
reading above; where a recording is ambiguous (the Testarossa's full-throttle runway runs could
read as 2700 or 4000 rpm) the stretches fail the checks and are left out rather than guessed.

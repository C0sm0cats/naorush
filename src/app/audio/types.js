// Shared JSDoc types of the audio engine (no runtime code).

/**
 * @typedef {object} ToneOpts
 * @property {number} f start frequency (Hz)
 * @property {number} t start time (context clock)
 * @property {number} d duration (s)
 * @property {OscillatorType} [type]
 * @property {'pulse25'|'pulse12'|'flute'|'reed'|'organ'} [wave] custom waveform (overrides type)
 * @property {number} [v] peak gain
 * @property {number} [to] end frequency (exponential glide)
 * @property {number} [from] start frequency, gliding to `f` over `glide` seconds (portamento)
 * @property {number} [glide]
 * @property {number} [a] attack (s)
 * @property {number} [sus] sustain level (fraction of `v`); unset: the note decays over `d`
 * @property {number} [dec] decay to the sustain level (s)
 * @property {number} [rel] release at the end of the note (s)
 * @property {number} [lp] lowpass cutoff (Hz)
 * @property {number} [lpTo] lowpass cutoff at the end (filter envelope)
 * @property {number} [lpT] time the filter takes to reach `lpTo` (default: the whole note)
 * @property {BiquadFilterType} [ft] filter type for `lp` (default lowpass; bandpass = formant)
 * @property {number} [q] lowpass resonance
 * @property {number} [det] adds a second oscillator detuned by this many cents
 * @property {number} [pan] stereo position -1..1
 * @property {[number, number] | [number, number, number]} [vib] vibrato: [rate (Hz), depth (cents), delay (s)]
 * @property {[number, number] | [number, number, number]} [fm] FM: [ratio, index, index at the end]
 */
/**
 * @typedef {object} NoiseOpts
 * @property {number} t
 * @property {number} d
 * @property {BiquadFilterType} [type]
 * @property {number} [f] filter frequency
 * @property {number} [to] end filter frequency
 * @property {number} [q]
 * @property {number} [v]
 * @property {number} [a]
 * @property {number} [pan]
 */
/**
 * Each call returns its (main) source node, so callers can hook its end.
 * @typedef {{ now: number, tone: (o: ToneOpts) => AudioScheduledSourceNode, noise: (o: NoiseOpts) => AudioScheduledSourceNode }} Voice
 */
/**
 * One note handed to an instrument recipe (voice.js PATCHES).
 * @typedef {object} NoteOpts
 * @property {number} f frequency (Hz)
 * @property {number} t start
 * @property {number} d length (s)
 * @property {number} g level
 * @property {number} [pan]
 * @property {number} [from] previous note's frequency, to glide from
 * @property {number} [lp] brightness (Hz), for the patches that take one
 */
/** @typedef {'carpet'|'concrete'|'metal'|'gravel'|'tile'|'wood'} Floor */
/** @typedef {'kevin'|'charline'} Hero */
/**
 * Context handed to every effect recipe: who is walking, on what, and who is speaking.
 * @typedef {object} Foley
 * @property {Hero} hero
 * @property {Floor} floor
 * @property {string} who speaker (CAST id or dialogue role), '' when none
 * @property {number} foot 0 / 1, alternates on each call (left / right foot)
 */
/**
 * Optional per-call settings of `Audio.sfx`.
 * @typedef {object} SfxOpts
 * @property {number} [delay] seconds before the effect starts
 * @property {number} [pitch] frequency multiplier
 * @property {Floor} [floor] overrides the stage floor (e.g. a metal lift)
 * @property {string} [who] speaker, for voiced effects ('talk', 'bubble')
 */
/**
 * A chord: root in semitones above the track's tonic, and its intervals (root first).
 * @typedef {object} Chord
 * @property {number} root
 * @property {boolean} minor
 * @property {number[]} tones
 */
/**
 * Everything a song section can set. The track itself is the first section's settings;
 * each `form` section overrides what it names for its bars.
 * Patterns are 8 chars (eighth notes) or 16 chars (sixteenth notes) per bar.
 * @typedef {object} Part
 * @property {Chord[][]} [chords] one entry per bar (two chords: half a bar each)
 * @property {string[]} [melody] one pattern per bar: scale degree (base 36, Shift = sharp),
 *   '.' rest, '-' hold
 * @property {string[]} [counter] countermelody, melody syntax, `counterOct` below the melody
 * @property {string[]} [descant] high line of the lead layer (replaces its arpeggio)
 * @property {string[]} [finale] line of the finale layer (boss's last phase)
 * @property {number} [key] transposition of the section (semitones)
 * @property {number[]} [scale]
 * @property {number} [lead] melody octave offset above root (semitones)
 * @property {string} [patch] melody instrument (voice.js PATCHES)
 * @property {string} [counterPatch]
 * @property {number} [counterOct] counter octave below the melody (semitones, default 12)
 * @property {string} [descantPatch]
 * @property {string} [finalePatch]
 * @property {number} [finaleOct] finale line octave below the melody (semitones, default 0)
 * @property {number} [level] melody level
 * @property {number} [lp] brightness of the saw lead
 * @property {number} [glide] legato portamento between melody notes
 * @property {string} [double] melody doubling: 'bells' (octave up), 'octave' (octave down,
 *   same patch), 'horns' (brass an octave down on held notes), 'strings' (unison strings)
 * @property {string} bass 1 root, 2 octave, 3 third, 4 fourth, 5 fifth, 6 sixth, 7 chord
 *   seventh, b flat seventh, 0 octave below, w / u chromatic approach to the next root from
 *   below / above, x dead note
 * @property {'triangle'|'saw'|'slap'|'pluck'|'sub'|'fm'|'synth'|'upright'} [bassWave]
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat '1' closed, 'o' open
 * @property {string} [clap]
 * @property {string} [stab] chord stabs
 * @property {string} [rim] rimshot / clave
 * @property {string} [ride]
 * @property {string} [tamb] tambourine
 * @property {string} [comp] chord comping pattern
 * @property {'pop'|'big'|'electro'|'brush'|'march'} [kit]
 * @property {number} [arp] arpeggio resolution: 8 or 16
 * @property {string} [arpPatch]
 * @property {string} [arpSeq] arpeggio figure on the chord: 1 root, 3 third, 5 fifth,
 *   7 seventh, 8 octave, a third + octave, c fifth + octave (e.g. '5358', the motif)
 * @property {string} [pad] chord pad: 'warm', 'strings', 'choir', 'organ', 'glass'
 * @property {string} [compPatch] 'clav', 'epiano', 'guitar', 'organ', 'piano'
 * @property {string} [stabPatch] 'brass', 'strings', 'epiano', 'organ'
 * @property {boolean} [sev] sevenths on the plain triads of pad, comp and stabs
 * @property {boolean} [hum] server-room drone
 * @property {boolean} [drone] bagpipe drones (tonic and fifth)
 * @property {boolean} [pulse] sixteenth-note resonant bass sequence, filter swept over 4 bars
 * @property {number} [pump] pad ducking on each kick (0..1)
 * @property {boolean} [thin] breakdown: the drive layer drops its kicks and claps
 * @property {boolean} [intro] plays once; the loop restarts after it
 * @property {boolean} [nofill] no drum fill at the end of the section
 * @property {Partial<Part>} [kevin] Kévin's variant of the section
 * @property {Partial<Part>} [charline] Charline's variant of the section
 */
/**
 * @typedef {Part & {
 *   bpm: number,
 *   root: number,
 *   lead: number,
 *   scale: number[],
 *   chords: Chord[][],
 *   melody: string[],
 *   once?: boolean,
 *   swing?: number,
 *   echo?: number,
 *   reverb?: number,
 *   chorus?: number,
 *   form?: Partial<Part>[],
 * }} Track
 *   root: bass tonic (MIDI); echo / reverb / chorus: send levels 0..1; swing: off-beat
 *   eighths late by this fraction of a sixteenth; once: plays once instead of looping
 */
/**
 * One compiled bar of a song form.
 * @typedef {object} Bar
 * @property {Part & Track} def the settings in force (track, then section)
 * @property {Chord[]} chords one or two (half bars)
 * @property {number} key
 * @property {string} mel
 * @property {string} counter
 * @property {string} descant
 * @property {string} finale
 * @property {boolean} thin
 * @property {number} sec section index in the form
 * @property {boolean} start first bar of its section
 * @property {boolean} fill last bar of its section (drum fill)
 * @property {boolean} intro
 * @property {number} next root of the following bar's first chord, key included (wraps)
 */
/**
 * @typedef {'title'|'parking'|'office'|'datacenter'|'copil'|'rooftop'|'intercontrat'|'cafe'|'seminar'|'bossJulien'|'bossRodolphe'|'win'|'gameover'|'credits'} TrackName
 */
/**
 * @typedef {object} Run
 * @property {TrackName} name
 * @property {Track} def
 * @property {Bar[]} bars
 * @property {number} loop first bar of the loop (after the intro)
 * @property {GainNode} bus
 * @property {GainNode} base
 * @property {GainNode} drive
 * @property {GainNode} lead
 * @property {GainNode} finale
 * @property {GainNode} wet melody send (to base, echo and reverb)
 * @property {GainNode} pad chord pads (to base, chorus and reverb; ducked by `pump`)
 * @property {GainNode | null} verb reverb send of this run
 * @property {{ base: Voice, wet: Voice, pad: Voice, drive: Voice, lead: Voice, finale: Voice }} voices one per layer, reused
 * @property {AudioNode[]} nodes everything to disconnect on stop
 * @property {AudioScheduledSourceNode[]} lfos running modulators to stop
 * @property {ReturnType<typeof setInterval> | null} timer
 * @property {number} step sixteenth index
 * @property {number} next
 * @property {number} prev last melody note (MIDI), for glides
 * @property {number} prevEnd when it ends
 */

export {};

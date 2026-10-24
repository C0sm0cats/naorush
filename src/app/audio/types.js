// Shared JSDoc types of the audio engine (no runtime code).

/**
 * @typedef {object} ToneOpts
 * @property {number} f start frequency (Hz)
 * @property {number} t start time (context clock)
 * @property {number} d duration (s)
 * @property {OscillatorType} [type]
 * @property {number} [v] peak gain
 * @property {number} [to] end frequency (exponential glide)
 * @property {number} [a] attack (s)
 * @property {number} [lp] lowpass cutoff (Hz)
 * @property {number} [lpTo] lowpass cutoff at the end (filter envelope)
 * @property {BiquadFilterType} [ft] filter type for `lp` (default lowpass; bandpass = formant)
 * @property {number} [q] lowpass resonance
 * @property {number} [det] adds a second oscillator detuned by this many cents
 * @property {number} [pan] stereo position -1..1
 * @property {[number, number]} [vib] vibrato: [rate (Hz), depth (cents)]
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
 * Patterns are 8 chars (eighth notes) or 16 chars (sixteenth notes) per bar.
 * @typedef {object} Track
 * @property {number} bpm
 * @property {number} root bass tonic (MIDI)
 * @property {number} lead melody octave offset above root (semitones)
 * @property {number[]} scale
 * @property {[number, boolean][]} chords one per bar: [semitone offset, isMinor]
 * @property {string[]} melody one pattern per bar: scale degree (base 36), '.' rest, '-' hold
 * @property {OscillatorType} wave
 * @property {number} cutoff
 * @property {string} bass 1 root, 2 octave, 3 third, 4 fourth, 5 fifth, b flat seventh,
 *   w chromatic approach to the next bar's root
 * @property {'triangle'|'saw'|'slap'|'pluck'} [bassWave] pluck: short pizzicato notes
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat '1' closed, 'o' open
 * @property {string} [clap]
 * @property {string} [stab] chord stabs
 * @property {string} [rim] rimshot / clave
 * @property {number} [arp] base arpeggio resolution: 8 or 16
 * @property {boolean} [pad]
 * @property {OscillatorType} [padWave]
 * @property {boolean} [comp]
 * @property {boolean} [hum] server-room drone
 * @property {boolean} [bells] sine doubling of the melody one octave up
 * @property {boolean} [big] stadium drums
 * @property {number} [det] lead detune (cents)
 * @property {number} [echo] melody echo send 0..1
 * @property {OscillatorType} [leadWave] intensity-1 arpeggio wave
 * @property {boolean} [once] plays once instead of looping
 * @property {number} [swing] off-beat eighths late by this fraction of a sixteenth
 * @property {boolean} [sev] seventh chords in the comp, pad and stabs
 * @property {boolean} [rhodes] electric-piano stabs (sine tines) instead of saw stabs
 * @property {boolean} [shaker] softer, duller hats
 * @property {boolean} [mallet] marimba-like melody (struck, short decay)
 * @property {boolean} [pulse] sixteenth-note resonant bass sequence, filter swept over 4 bars
 * @property {boolean} [choir] vowel-formant choir pad instead of the plain pad
 * @property {boolean} [horns] long melody notes doubled by a brass section an octave below
 * @property {Section[]} [form] song form; each section lasts as long as its melody (default: once)
 */
/**
 * One song section; unset fields inherit the track's own (A section) values.
 * @typedef {object} Section
 * @property {[number, boolean][]} [chords]
 * @property {string[]} [melody]
 * @property {string[]} [counter] countermelody, melody syntax, one octave below the melody
 * @property {string} [bass]
 * @property {string} [kick]
 * @property {string} [snare]
 * @property {string} [hat]
 * @property {string} [clap]
 * @property {string} [stab]
 * @property {string} [rim]
 * @property {boolean} [thin] breakdown: the drive layer drops its kicks and claps
 */
/**
 * One compiled bar of a song form.
 * @typedef {object} Bar
 * @property {[number, boolean]} chord
 * @property {string} mel
 * @property {string} counter
 * @property {string} bass
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat
 * @property {string} clap
 * @property {string} stab
 * @property {string} rim
 * @property {boolean} thin
 * @property {number} sec section index in the form
 * @property {boolean} start first bar of its section
 * @property {boolean} fill last bar of its section (drum fill)
 * @property {number} next chord offset of the following bar (wraps at the loop point)
 */
/**
 * @typedef {'title'|'parking'|'office'|'datacenter'|'copil'|'rooftop'|'intercontrat'|'cafe'|'seminar'|'bossJulien'|'bossRodolphe'|'win'|'gameover'|'credits'} TrackName
 */
/**
 * @typedef {object} Run
 * @property {TrackName} name
 * @property {Track} def
 * @property {Bar[]} bars
 * @property {GainNode} bus
 * @property {GainNode} base
 * @property {GainNode} drive
 * @property {GainNode} lead
 * @property {GainNode} wet melody send (to base + echo)
 * @property {{ base: Voice, wet: Voice, drive: Voice, lead: Voice }} voices one per layer, reused
 * @property {AudioNode[]} nodes everything to disconnect on stop
 * @property {ReturnType<typeof setInterval> | null} timer
 * @property {number} step sixteenth index
 * @property {number} next
 */

export {};

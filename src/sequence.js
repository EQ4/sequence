
(function(window) {
	if (!window.console || !window.console.log) { return; }

	console.log('Sequence');
	console.log('http://github.com/soundio/sequencer');
	console.log('–––––––––––––––––––––––––––––––––––');
})(this);

(function(window) {
	"use strict";

	var assign = Object.assign;

	var defaults = {
		rate: 1
	};

	function isDefined(val) {
		return val !== undefined && val !== null;
	}

	function getListeners(object) {
		if (!object.sequenceListeners) {
			Object.defineProperty(object, 'sequenceListeners', { value: [] });
		}

		return object.sequenceListeners;
	}

	function clockBeatAtBeat(sequence, beat) {
		return sequence.startBeat + beat / sequence.rate ;
	}

	function beatAtClockBeat(sequence, clockBeat) {
		return (clockBeat - sequence.startBeat) * sequence.rate ;
	}

	function mergeNoteEvents(data) {
		var n = -1;
		var m, e1, e2, e3;

		while (++n < data.length) {
			e1 = data[n];
			if (e1[1] === "noteon") {
				m = n - 1;
				while (++m < data.length) {
					e2 = data[m];
					if (e2[1] === "noteoff" && e2[3] === e1[3]) {
						e3 = e1.slice();
						e3[1] = "note";
						e3[4] = e2[0] - e1[0];

						data.splice(n, 1, e3);
						data.splice(m, 1);
						break;
					} 
				}
			}
		}
	}

	function cue(sequence, e, trigger) {
		if (e[1] === 'note') {
			sequence.cue(e[0], trigger, 'noteon', e[2], e[3]);
			sequence.cue(e[0] + e[4], trigger, 'noteoff', e[2]);
		}
		else {
			sequence.cue(e[0], trigger, e[1], e[2], e[3], e[4], e[5], e[6]);
		}
	}

	function uncue(sequence, e, trigger) {
		// TODO: This is dodgy, it will remove untelated events
		// that happen to be at the same time. Uh-oh.

		if (e[1] === 'note') {
			sequence.uncue(e[0], trigger);
			sequence.uncue(e[0] + e[4], trigger);
		}
		else {
			sequence.uncue(e[0], trigger);
		}
	}

	function Sequence(clock, data, settings) {
		if (this === undefined || this === window) {
			// If this is undefined the constructor has been called without the
			// new keyword, or without a context applied. Do that now.
			return new Sequence(clock, data, settings);
		}

		var audio = clock.audio;
		var options = assign({}, defaults, settings);

		var rateNode     = audio.createGain();
		var durationNode = audio.createGain();

		rateNode.channelCount = 1;
		durationNode.channelCount = 1;
		rateNode.gain.value = options.rate;
		durationNode.gain.value = 1 / options.rate;

		// The rate of this sequence is a multiplier of the parent clock's rate
		AudioObject.getOutput(clock, "rate").connect(rateNode);
		AudioObject.getOutput(clock, "duration").connect(durationNode);

		// Set up clock as an audio object with outputs "rate" and
		// "duration" and audio property "rate". 
		AudioObject.call(this, audio, undefined, {
			rate:     rateNode,
			duration: durationNode,
		}, {
			rate: {
				set: function(value, time, duration, curve) {
					// For the time being, only support step changes to tempo
					AudioObject.automate(rateNode.gain, value, time, duration, curve);
					AudioObject.automate(durationNode.gain, 1 / value, time, duration, curve);

					// A tempo change must be created where rate has been set
					// externally. Calls to addRate from within clock should
					// first set addRate to noop to avoid this.
					//addRate(clock, cues, time, value);
				},
				value: options.rate,
				curve: 'exponential',
				duration: 0.004
			}
		});

		// TODO: Audio Object is not picking up default values grrrrrrr
		this.rate = options.rate;
		this.notes = {};

		var sequence = this;
		var startBeat;

		// Delegate parent clock's events
		clock.on(this);

		// If parent sequence stops, also stop this. Since parent sequence
		// is already responsible for cueing, it should have uncued all
		// this sequence's cues already.
		clock
		.on('stop', function(clock, time) {
			this.uncue(trigger);
			startBeat = undefined;
		});

		function spawn(time, type, data, rate) {
			var settings = {};

			if (rate) { settings.rate = rate; }

			var childSequence = new Sequence(sequence, data, settings);

			// Listen to children's events and retrigger them
			childSequence.plug(trigger);
			childSequence.start(sequence.beatAtTime(time));
		}

		function trigger(time, type, number) {
			var listeners = getListeners(sequence).slice();
			var fn, childSequence, duration;

			// Sequence control events are listened to by the sequencer and
			// are not retransmitted
			if (type === 'sequence') {
				spawn.apply(null, arguments);
			}
			else if (type === 'stop') {
				sequence.stop(time);
			}
			else {
				for (fn of listeners) {
					fn.apply(sequence, arguments);
				}
			}

			// Keep a record of current noteons
			if (type === "noteon") {
				sequence.notes[number] = true;
			}
			else if (type === "noteoff") {
				delete sequence.notes[number];
			}
		}

		data = data.slice();
		mergeNoteEvents(data);

		// Set up sequence as a collection.
		Collection.call(this, data || []);

		Object.defineProperties(this, {
			clock: { value: clock },
			startBeat: { get: function() { return startBeat; }}
		});

		assign(this, {
			start: function(beat) {
				startBeat = isDefined(beat) ? beat : this.clock.beat ;

				var l = this.length;
				var n = -1;
				var e;

				while (++n < l) {
					e = this[n];
					cue(sequence, e, trigger);
				}

				this.playing = true;
				Collection.prototype.trigger.call(this, 'start', beat);

				//for (e of this) {
				//	this.cue(e[0], trigger, e[1], e[2], e[3], e[4], e[5], e[6]);
				//}

				//deleteTimesAfterBeat(this, 0);
				//recueAfterBeat(cues, this, 0);
				//this.trigger('start', starttime);
				return this;
			},

			stop: function(time) {
				this.uncue(trigger);

				var notes = this.notes;

				// Stop currently playing notes
				this.cue(this.beat, function(time) {
					var number;

					for (number in notes) {
						number = parseInt(number);
						trigger(time, "noteoff", number);
					}
				});

				startBeat = undefined;
				this.playing = false;
				Collection.prototype.trigger.call(this, 'stop', time);
			}
		});

		this
		.on('add', function(sequence, e) {
			if (e[0] >= this.beat) {
				cue(sequence, e, trigger);
			}
		})
		.on('remove', function(sequence, e) {
			if (e[0] >= this.beat) {
				uncue(sequence, e, trigger);
			}
		});
	}

	Object.defineProperties(assign(Sequence.prototype, Clock.prototype, {
		plug: function(fn) {
			var listeners = getListeners(this);

			if (listeners.indexOf(fn) === -1) {
				listeners.push(fn);
			}

			return this;
		},

		unplug: function(fn) {
			var listeners = getListeners(this);
			var i = listeners.indexOf(fn);

			if (i > -1) {
				listeners.splice(i, 1);
			}

			return this;
		},

		beatAtTime: function(time) {
			var clockBeat = this.clock.beatAtTime(time);
			return beatAtClockBeat(this, clockBeat);
		},

		timeAtBeat: function(beat) {
			var clockBeat = clockBeatAtBeat(this, beat);
			return this.clock.timeAtBeat(clockBeat);
		},

		cue: function(beat, fn) {
			// Replace beat with parent beat and call parent .cue()
			arguments[0] = clockBeatAtBeat(this, beat);
			this.clock.cue.apply(this.clock, arguments);
			return this;
		},

		uncue: function(beat, fn) {
			// TODO: how do we make sure only fns from this sequence are
			// being uncued? Not a worry at the mo, because we are
			// uncueing trigger, which only exists in this sequence...
			// but what about outside calls?

			if (typeof beat === 'number') {
				beat = clockBeatAtBeat(this, beat);
			}

			this.clock.uncue(beat, fn);
			return this;
		},

		on: Collection.prototype.on,
		trigger: Collection.prototype.trigger
	}), {
		startTime: { get: function() { return this.clock.timeAtBeat(this.startBeat); } },
		beat: { get: function() { return beatAtClockBeat(this, this.clock.beat); } }
	});

	window.Sequence = Sequence;





	function EnvelopeSequence(clock, data, settings) {
		if (this === undefined || this === window) {
			// If this is undefined the constructor has been called without the
			// new keyword, or without a context applied. Do that now.
			return new EnvelopeSequence(clock, data, settings);
		}

		var audio = clock.audio;
		var options = assign({}, defaults, settings);

		var sequence = this;
		var startBeat;

		// Delegate parent clock's events
		clock.on(this);

		// If parent sequence stops, also stop this. Since parent sequence
		// is already responsible for cueing, it should have uncued all
		// this sequence's cues already.
		clock
		.on('stop', function(clock, time) {
			this.uncue(trigger);
		});

		function trigger(time, type, number) {
			var listeners = getListeners(sequence).slice();
			var fn, childSequence, duration;

			// Sequence control events are listened to by the sequencer and
			// are not retransmitted
			if (type === 'sequence') {
				spawn.apply(null, arguments);
			}
			else if (type === 'stop') {
				sequence.stop(time);
			}
			else {
				for (fn of listeners) {
					fn.apply(sequence, arguments);
				}
			}

			// Keep a record of current noteons
			if (type === "noteon") {
				sequence.notes[number] = true;
			}
			else if (type === "noteoff") {
				delete sequence.notes[number];
			}
		}

		data = data.slice();

		// Set up sequence as a collection.
		Collection.call(this, data || []);

		Object.defineProperties(this, {
			clock: { value: clock },
			startBeat: { get: function() { return startBeat; }}
		});

		assign(this, {
			start: function(beat) {
				startBeat = isDefined(beat) ? beat : this.clock.beat ;

				var l = this.length;
				var n = -1;
				var e;

				while (++n < l) {
					e = this[n];
					cue(sequence, e, trigger);
				}

				this.playing = true;
				Collection.prototype.trigger.call(this, 'start', beat);

				//for (e of this) {
				//	this.cue(e[0], trigger, e[1], e[2], e[3], e[4], e[5], e[6]);
				//}

				//deleteTimesAfterBeat(this, 0);
				//recueAfterBeat(cues, this, 0);
				//this.trigger('start', starttime);
				return this;
			},

			stop: function(time) {
				this.uncue(trigger);

				var notes = this.notes;

				// Stop currently playing notes
				this.cue(this.beat, function(time) {
					var number;

					for (number in notes) {
						number = parseInt(number);
						trigger(time, "noteoff", number);
					}
				});

				startBeat = undefined;
				this.playing = false;
				Collection.prototype.trigger.call(this, 'stop', time);
			}
		});

		this
		.on('add', function(sequence, e) {
			if (e[0] >= this.beat) {
				cue(sequence, e, trigger);
			}
		})
		.on('remove', function(sequence, e) {
			if (e[0] >= this.beat) {
				uncue(sequence, e, trigger);
			}
		});
	}

	Object.defineProperties(assign(EnvelopeSequence.prototype, Clock.prototype), {});

	window.EnvelopeSequence = EnvelopeSequence;
})(window);

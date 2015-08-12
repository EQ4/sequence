
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
		if (!object.listeners) {
			Object.defineProperty(object, 'listeners', { value: [] });
		}

		return object.listeners;
	}

	function clockBeatAtBeat(sequence, beat) {
		return sequence.startBeat + beat / sequence.rate ;
	}

	function beatAtClockBeat(sequence, clockBeat) {
		return (clockBeat - sequence.startBeat) * sequence.rate ;
	}

	function Sequence(clock, data, settings) {
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

		// Listen to parent clock's events
		clock.on(this);

		var sequence = this;
		var startBeat;

		function spawn(time, type, data) {
			var child = new Sequence(sequence, data);

			// Listen to children's events and retrigger them
			child.plug(trigger);
			child.start(sequence.beatAtTime(time));
		}

		function trigger(time, type) {
			var listeners = getListeners(sequence).slice();
			var fn, childSequence;

			for (fn of listeners) {
				fn.apply(sequence, arguments);
			}

			if (type === 'sequence') {
				spawn.apply(null, arguments);
			}
		}

		// Set up sequence as a collection.
		Collection.call(this, data || [], { index: 0 });

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
					this.cue(e[0], trigger, e[1], e[2], e[3], e[4], e[5], e[6]);
				}

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
				startBeat = undefined;
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
		}
	}), {
		startTime: { get: function() { return this.clock.timeAtBeat(this.startBeat); } },
		beat: { get: function() { return beatAtClockBeat(this.clock.beat); } }
	});

	window.Sequence = Sequence;
})(window);
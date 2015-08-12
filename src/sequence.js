(function(window) {
	"use strict";

	var assign = Object.assign;

	function getListeners(object) {
		if (!object.listeners) {
			Object.defineProperty(object, 'listeners', { value: [] });
		}

		return object.listeners;
	}

	function parentBeatAtBeat(clock, sequence, beat) {
		var rate = sequence.rate;
		return clock.beatAtTime(sequence.startTime) + beat * rate ;
	}

	function Sequence(clock, data) {
		var rateNode     = audio.createGain();
		var durationNode = audio.createGain();

		rateNode.channelCount = 1;
		durationNode.channelCount = 1;

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
				defaultValue: 1,
				curve: 'exponential',
				duration: 0.004
			}
		});

		var startTime = audio.currentTime;
		var cues = [];

		function trigger() {
			var listeners = getListeners(sequence).slice();
			var fn;

			for (fn of listeners) {
				fn.apply(this, arguments);
			}
		}

		// Set up sequence as a collection.
		Collection.call(this, data || [], { index: 0 });

		Object.defineProperties(this, {
			clock: { value: clock },
			startTime: { get: function() { return startTime; }},
			time: { get: function() { return audio.currentTime; }},
			beat: { get: function() { return this.beatAtTime(audio.currentTime); }}
		});

		assign(this, {
			start: function(time) {
				startTime = isDefined(time) ? time : audio.currentTime ;

				var sequence = this;
				var e;

				for (e of this) {
					this.cue(e[0], trigger, e[1], e[2], e[3], e[4], e[5]);
				}

				//deleteTimesAfterBeat(this, 0);
				//recueAfterBeat(cues, this, 0);
				//this.trigger('start', starttime);
				return this;
			},

			stop: function(time) {
				
			},

			cue: function(beat, fn) {
				// Replace beat with parent beat and call parent .cue()
				arguments[0] = parentBeatAtBeat(clock, this, beat);
				clock.cue.apply(clock, arguments);
				return this;
			}
		});
	}

	assign(Sequence.prototype, Clock.prototype, {
		on: function(fn) {
			var listeners = getListeners(this);

			if (listeners.indexOf(fn) === -1) {
				listeners.push(fn);
			}

			return this;
		},

		off: function(fn) {
			var listeners = getListeners(this);
			var i = listeners.indexOf(fn);

			if (i > -1) {
				listeners.splice(i, 1);
			}

			return this;
		}
	});
})(window);
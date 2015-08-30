
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

	var collectionSettings = {
		sort: byTime
	};

	function isDefined(val) {
		return val !== undefined && val !== null;
	}

	function byTime(a, b) {
		return a[0] > b[0];
	}

	function getSubscribers(object) {
		if (!object.subscribers) {
			Object.defineProperty(object, 'subscribers', { value: [] });
		}

		return object.subscribers;
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

	function getSequenceDuration(sequence) {
		var duration = 0;
		var n = sequence.length;
		var e, t;

		while (n--) {
			e = sequence[n];
			t = e[0] + getEventDuration(e);

			if (t > duration) { duration = t; }
		}

		return duration;
	}

	function getEventDuration(e) {
		return e[1] === "note" ? e[4] :
			e[1] === "sequence" ? getSequenceDuration(e[2]) :
			0 ;
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
			childSequence.subscribe(trigger);
			childSequence.start(sequence.beatAtTime(time));

			sequence.trigger("spawn", childSequence);
		}

		function publish(time, event, sequence) {
			// Remember we are 50ms ahead of the event at this point, so we're
			// not necessarily time critical, although we don't want to be doing
			// too much.

			var e = event.slice();
			var subscribers = getSubscribers(sequence).slice();
			var fn;

			// Set the time in absolute time
			e[0] = time;

			// Set the duration in absolute time
			if (e[1] === "note") {
				e[4] = sequence.timeAtBeat(event[0] + event[4]) - e[0];
			}

			// Sequence control events are listened to by the sequencer and
			// are not transmitted to subscribers
			if (e[1] === 'sequence') {
				spawn.apply(null, e);
			}

			// All other events call the subscribers
			else {
				for (fn of subscribers) {
					// Call fn(time, type, data...) with sequence as context
					fn.apply(sequence, e);
				}
			}

			// Keep a record of current noteons
			// TODO: Sort this out!
			if (e[1] === "note" || e[1] === "noteon") {
				sequence.notes[e[2]] = event;
			}
			else if (e[1] === "noteoff") {
				delete sequence.notes[e[2]];
			}

			// The last event in sequence cues the sequence to stop
			if (event === sequence[sequence.length - 1]) {
				// Find the end time of the sequence
				var duration = getSequenceDuration(sequence);
console.log(Math.ceil(duration));
				sequence.cue(Math.ceil(duration), function(time) {
					console.log(time);
					sequence.stop(time);
				});
			}
		}

		function stop(sequence, time) {
			sequence.uncue(publish);
			startBeat = undefined;
			sequence.playing = false;
			Collection.prototype.trigger.call(sequence, 'stop', time);
		}

		data = data.slice();
		mergeNoteEvents(data);

		// Set up sequence as a collection.
		Collection.call(this, data || [], collectionSettings);

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
					this.cue(e[0], publish, e, this);
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
				var sequence = this;
				var notes = this.notes;
				var t = time - audio.currentTime;

				if (t < 0.01) {
					stop(sequence, time);
				}
				else {
					setTimeout(function() {
						stop(sequence, time);
					}, t * 1000);
				}
			}
		});

		this
		.on('add', function(sequence, e) {
			if (e[0] >= sequence.beat) {
				sequence.cue(e[0], publish, e, sequence);
			}
		})
		.on('remove', function(sequence, e) {
			if (e[0] >= sequence.beat) {
				sequence.uncue(e[0], publish, e, sequence);
			}
		});
	}

	Object.defineProperties(assign(Sequence.prototype, Clock.prototype, {
		subscribe: function(fn) {
			var subscribers = getSubscribers(this);

			if (subscribers.indexOf(fn) === -1) {
				subscribers.push(fn);
			}

			return this;
		},

		unsubscribe: function(fn) {
			var subscribers = getSubscribers(this);
			var i = subscribers.indexOf(fn);

			if (i > -1) {
				subscribers.splice(i, 1);
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









	function publish(time, event, sequence) {
		var subscribers = getSubscribers(sequence).slice();
		var e = event.slice();
		var fn;

		e[0] = time;

		for (fn of subscribers) {
			// Call fn(time, type, data...)
			fn.apply(sequence, e);
		}
	}

	function EnvelopeSequence(clock, data) {
		if (this === undefined || this === window) {
			// If this is undefined the constructor has been called without the
			// new keyword, or without a context applied. Do that now.
			return new EnvelopeSequence(clock, data);
		}

		var audio = clock.audio;

		data = data.slice();

		// Set up sequence as a collection.
		Collection.call(this, data || [], collectionSettings);

		this.clock = clock;
		this.startTime = undefined;
	}

	assign(EnvelopeSequence.prototype, {
		subscribe: function(fn) {
			var subscribers = getSubscribers(this);

			if (subscribers.indexOf(fn) === -1) {
				subscribers.push(fn);
			}

			return this;
		},

		unsubscribe: function(fn) {
			var subscribers = getSubscribers(this);
			var i = subscribers.indexOf(fn);

			if (i > -1) {
				subscribers.splice(i, 1);
			}

			return this;
		},

		start: function(time) {
			this.startTime = isDefined(time) ? time : this.clock.time ;

			var l = this.length;
			var n = -1;
			var e;

			while (++n < l) {
				e = this[n];
				this.cue(e[0], publish, e, this);
			}

			return this;
		},

		stop: function(time) {
			this.uncue(publish);
			startBeat = undefined;
			return this;
		},

		cue: function(time, fn) {
			arguments[0] = this.startTime + time;
			this.clock.cueTime.apply(this.clock, arguments);
			return this;
		},

		uncue: function(time, fn) {
			arguments[0] = this.startTime + time;
			this.clock.uncueTime(time, fn);
			return this;
		}
	});

	window.EnvelopeSequence = EnvelopeSequence;
})(window);

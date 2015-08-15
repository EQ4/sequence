# soundio-sequencer

Experimental sequencer for [sound.io](http://github.com/soundio).

    git clone https://github.com/grimborg/soundio-sequencer
    cd soundio-sequencer
    git clone https://github.com/soundio/soundio
    cd soundio
    git submodule update --init
    cd ..
    open index.html

See [index.html](https://github.com/grimborg/soundio-sequencer/blob/master/index.html) for an example.


## Sequence(clock, data, settings)

To create a sequence call the <code>Sequence</code> constructor, passing in a
clock.

    var audio = new window.AudioContext();
    var clock = new Clock(audio);
    var sequence1 = new Sequence(clock, [
        [0, "noteon", 49, 0.2],
        [1, "noteoff", 49]
    ]);
    
    sequence1.start();

A sequence itself is a form of clock, so dependent sequences can be created by
passing in an existing sequence as the <code>clock</code> parameter.

    var sequence2 = new Sequence(sequence, [
        [0, "noteon", 49, 0.2],
        [1, "noteoff", 49]
    ]);

<code>sequence2</code> is now slaved to <code>sequence1</code>. When
<code>sequence1</code> stops, <code>sequence2</code> stops.


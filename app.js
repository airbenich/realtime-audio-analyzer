// fork getUserMedia for multiple browser versions, for those
// that need prefixes

navigator.getUserMedia = (navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMedia ||
                          navigator.msGetUserMedia);

// set up forked web audio context, for multiple browsers
// window. is needed otherwise Safari explodes

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var voiceSelect = document.getElementById("voice");
var source;
var stream;

// grab the mute button to use below

var mute = document.querySelector('.mute');

//set up the different audio nodes we will use for the app

var analyser = audioCtx.createAnalyser();
analyser.minDecibels = -100;
analyser.maxDecibels = 0;
analyser.smoothingTimeConstant = 0.8;

var distortion = audioCtx.createWaveShaper();
var gainNode = audioCtx.createGain();
var biquadFilter = audioCtx.createBiquadFilter();
var convolver = audioCtx.createConvolver();

// mute output
gainNode.gain.value = 0;

// set up canvas context for visualizer
var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");

// get dimensions
var intendedWidth = document.querySelector('.wrapper').clientWidth;
var intendedHeight = document.querySelector('.wrapper').clientHeight;
canvas.setAttribute('width',intendedWidth);
canvas.setAttribute('height',intendedHeight);
var drawVisual;

//main block for doing the audio stuff
if (navigator.getUserMedia) {
   console.log('getUserMedia supported.');
   navigator.getUserMedia (
      // constraints - only audio needed for this app
      {
         audio: true
      },

      // Success callback
      function(stream) {
         source = audioCtx.createMediaStreamSource(stream);
         source.connect(analyser);
         analyser.connect(distortion);
         distortion.connect(biquadFilter);
         biquadFilter.connect(convolver);
         convolver.connect(gainNode);
         gainNode.connect(audioCtx.destination);

      	 visualize();

      },

      // Error callback
      function(err) {
         console.log('The following gUM error occured: ' + err);
      }
   );
} else {
   console.log('getUserMedia not supported on your browser!');
}



function visualize() {
  WIDTH = canvas.width;
  HEIGHT = canvas.height;

  ANALYZERWIDTH = canvas.width;
  ANALYZERHEIGHT = canvas.height-100;
  HEIGHTRATIO = ANALYZERHEIGHT/140;

  PEAKTHRESHOLD = 100;

  //analyser.fftSize = 4096;
  analyser.fftSize = 2048;
  var bufferLength = analyser.frequencyBinCount;
  console.log(bufferLength);
  var dataArray = new Float32Array(bufferLength);
  var dataVisualArray = new Array(bufferLength);
  var frequency = new Array();
  var barWidth = new Array();

  // calculate frequency and barWidth
  for(var i = 0; i < bufferLength; i++) {
    frequency[i] = i * audioCtx.sampleRate / analyser.fftSize;

    // calculate bar width -> exponential -> logarithm
    barWidth[i] = (Math.log(i+2)-Math.log(i+1))*ANALYZERWIDTH/10;

    //barWidth[i] = ANALYZERWIDTH/bufferLength;
  }

  // clear
  canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

  function draw() {
    drawVisual = requestAnimationFrame(draw); // automatic repainting
    analyser.getFloatFrequencyData(dataArray); // get current frequency data

    // pink noise to flat
    for(var i = 0; i < bufferLength; i++) {
      //if(frequency[i] != 0) dataArray[i] = dataArray[i]*(1-(1/frequency[i]));
    }

    // clear canvas
    canvasCtx.fillStyle = 'rgb(0, 0, 0)';
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    // draw bottom
    canvasCtx.fillStyle = 'rgb(40, 40, 40)';
    canvasCtx.fillRect(0, ANALYZERHEIGHT+1, WIDTH, HEIGHT);

    // draw x-scale stroke
    canvasCtx.beginPath();
    canvasCtx.moveTo(0,ANALYZERHEIGHT+5);
    canvasCtx.lineTo(ANALYZERWIDTH,ANALYZERHEIGHT+5);
    canvasCtx.strokeStyle = 'rgb(170,170,170)';
    canvasCtx.stroke();

    // draw peak threshold stroke
    canvasCtx.beginPath();
    canvasCtx.moveTo(60,ANALYZERHEIGHT-PEAKTHRESHOLD*HEIGHTRATIO);
    canvasCtx.lineTo(ANALYZERWIDTH,ANALYZERHEIGHT-PEAKTHRESHOLD*HEIGHTRATIO);
    canvasCtx.strokeStyle = 'rgb(170,170,170)';
    canvasCtx.setLineDash([5]);
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);

    // calc visualisation data
    var x = 0;

    // draw frequency (rotated so rotate back!!)
    canvasCtx.rotate( Math.PI / 2 );
    canvasCtx.fillStyle = 'rgb(170,170,170)';
    var fontSize = 14;
    canvasCtx.font = 'bold ' + fontSize + 'px Arial';
    for(var i = 0; i < bufferLength; i++) {

      // draw frequence scale – but not every frequence (remember its exponential!)
      if((frequency[i] < 215 || i%2 == 0)
      && (frequency[i] < 500 || i%3 == 0)
      && (frequency[i] < 1000 || i%4 == 0)
      && (frequency[i] < 5000 || i%4.5 == 0)) {

        // insert "kilo" herz
        if(frequency[i] >= 1000) {
          canvasCtx.fillText(Math.round(frequency[i]/1000*10)/10+ ' kHz', HEIGHT-80, -x -barWidth[i]/2 + fontSize/2);
        } else {
          canvasCtx.fillText(Math.round(frequency[i])+ ' Hz', HEIGHT-80, -x + fontSize/2);
        }

        // draw small scale identifyer
        canvasCtx.beginPath();
        canvasCtx.moveTo(ANALYZERHEIGHT,-x+1);
        canvasCtx.lineTo(ANALYZERHEIGHT+10,-x+1);
        canvasCtx.strokeStyle = 'rgb(170,170,170)';
        canvasCtx.stroke();

      }
      x += barWidth[i] + 1;
    }

    // rotate back
    canvasCtx.rotate( -(Math.PI / 2) );
    x = 0;

    console.log(dataArray);

    // draw bars (rectangles)
    for(var i = 0; i < bufferLength; i++) {
      var barHeight = (dataArray[i]+140)*HEIGHTRATIO;
      if(barHeight < 0) barHeight = 0;

      // draw bar
      //canvasCtx.fillStyle = 'rgb(0,'+(barHeight+50)+',0)';
      canvasCtx.fillStyle = 'rgb(70,70,180)';
      if(dataArray[i]+140 > PEAKTHRESHOLD) canvasCtx.fillStyle = 'rgb(255,255,255)';
      //if(barHeight > PEAKTHRESHOLD) canvasCtx.fillStyle = 'rgb('+((70+barHeight-PEAKTHRESHOLD)*2)+','+((70+barHeight-PEAKTHRESHOLD)*2)+','+((180+barHeight-PEAKTHRESHOLD)*2)+')';
      //canvasCtx.fillRect(x,ANALYZERHEIGHT-barHeight*HEIGHTRATIO,barWidth[i],barHeight*HEIGHTRATIO);
      canvasCtx.fillRect(x,ANALYZERHEIGHT-barHeight,barWidth[i],barHeight);
      x += barWidth[i] + 1;
    }

    // draw left scale
    analyser.minDecibels = -100;
    analyser.maxDecibels = 0;
    var stepSize = 10;
    var steps = (analyser.maxDecibels - analyser.minDecibels)/stepSize;

    canvasCtx.fillStyle = 'rgb(170,170,170)';
    var y = analyser.maxDecibels;
    for(var i = 0; i < steps;i++) {
      // draw text
      canvasCtx.fillText(y + ' db', 10, ANALYZERHEIGHT/steps*i+30);

      // draw small scale identifyer
      canvasCtx.beginPath();
      canvasCtx.moveTo(55,ANALYZERHEIGHT/steps*i+25);
      canvasCtx.lineTo(65,ANALYZERHEIGHT/steps*i+25);
      canvasCtx.strokeStyle = 'rgb(170,170,170)';
      canvasCtx.stroke();
      y -= stepSize;
    }

    // draw y-scale stroke
    canvasCtx.beginPath();
    canvasCtx.moveTo(60,0);
    canvasCtx.lineTo(60,ANALYZERHEIGHT+5);
    canvasCtx.strokeStyle = 'rgb(170,170,170)';
    canvasCtx.stroke();
  };

  draw();

}

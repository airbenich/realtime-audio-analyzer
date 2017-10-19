//jshint esnext:true

/* ----- A METTRE DANS JS.JS ----- */

// An adaptation / improvement of https://github.com/airbenich/realtime-audio-analyzer
// Rewrote by ek as an ES6 class that extends AnalyzerNode
// Author Michel Buffa @micbuffa on github/twitter/WebAudio slack channel
let audioCtx; 

window.onload=()=>{
	console.log("page chargee");

	audioCtx = new AudioContext();
	let wrapperDiv= document.querySelector('.wrapper');

	//main block for doing the audio stuff
	if (navigator.mediaDevices.getUserMedia) {
		console.log('getUserMedia supported.');
		navigator.mediaDevices.getUserMedia (
		// constraints - only audio needed for this app
		{
			audio:
			{
				mandatory: {echoCancellation: false}
			}
		}).then((stream)=>{
			let fa = new FrequencyAnalyzer(audioCtx,wrapperDiv,"A resizeable freq analyzer");
			/*
			let params={
				colorFreqBar:"olive"
			};
			fa.parameter=params;
			*/

			let source = audioCtx.createMediaStreamSource(stream);
			source.connect(fa);
			fa.connect(audioCtx.destination);
			fa.start();
		})/*.catch((err)=>{
			console.log('The following gUM error occured: ' + err);
		});*/
	} else {
		console.log('getUserMedia not supported on your browser!');
		alert('getUserMedia not supported on your browser! Please use Firefox or Google Chrome.');
	}
}






/* ----- A METTRE DANS FREQUENCYANALYZER.JS ----- */

// inherit default property values, connect methods, etc.
// behaviour that enable other nodes to connect to this one
// etc.
// TO ADD:
// -zoom in out to focus on some parts. Ideal way = click and drag + a reset button
// and/or two sliders one vertical and one horizontal for scaling.
// Instead of a ctx.scale, the whole analysis parameter should be modified
// - color for bars, for peaks,
// - mouse move display a reticulum for accurate measure of some freqs
// - smoothing should be settable using a slider too
// - display as a smoothed curve instead of bars
// - come with some integrated oscillators for testing, or with a demo
// - settable dashed bar position

class FrequencyAnalyzer extends AnalyserNode {
  // instances are an analyzernode

  constructor(audioContext, parent, label) {
    // parent is for example a div that will contain the analyzer
    super(audioContext);

    // params
    this.params={
      fontSize:14,
      fftSize:2048,
      barPosition:100,
      smoothingTimeConstant:0.8,
      decibelMin:-100,
      decibelMax:0,
      colorDashBar:"#f4be00",
      colorFreqBar:"#2874c8",
      colorAxisBar:"#eeeeee"
    };

    // analyzer part
    this.audioContext = audioContext;
    this.parent = parent;
    this.label = label;

    this.fftSize = this.params.fftSize;
    // frequencyBinCount = fftSize/2
    this.bufferLength = this.frequencyBinCount;

    this.dataArray = new Float32Array(this.bufferLength);
    this.dataVisualArray = new Array(this.bufferLength);
    this.frequency = [];

    // canvas part
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add("freqAnalyzer");
    // get dimensions, by default the ones from the parent element
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;

    this.canvasParent = parent;
    this.canvasParent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.WIDTH = this.canvas.width;
    this.HEIGHT = this.canvas.height;

    this.resize(this.WIDTH, this.HEIGHT);

    this.addListener();

    // start drawing frequencies
    // requestAnimationFrame(this.update.bind(this)); 
  }

  start() {
    this.rAF = requestAnimationFrame(this.animate.bind(this));
  }

  stop() {
    cancelAnimationFrame(this.rAF);
    this.rAF = null;
  }
  

  get parameter(){
    return this.params;
  }

  set parameter(params){
    this.params={
      fontSize:(params.fontSize||this.parameter.fontSize),
      fftSize:(params.fftSize||this.parameter.fftSize),
      barPosition:(params.barPosition||this.parameter.barPosition),
      smoothingTimeConstant:(params.smoothingTimeConstant||this.parameter.smoothingTimeConstant),
      decibelMin:(params.decibelMin||this.parameter.decibelMin),
      decibelMax:(params.decibelMax||this.parameter.decibelMax),
      colorDashBar:(params.colorDashBar||this.parameter.colorDashBar),
      colorFreqBar:(params.colorFreqBar||this.parameter.colorFreqBar),
      colorAxisBar:(params.colorAxisBar||this.parameter.colorAxisBar)
    };
  }

  // call this method if there is a need to resize the freq analyzer
  resize(w, h) {
    //console.log("resize");
    this.canvas.width = w;
    this.canvas.height = h;
    this.WIDTH = w;
    this.HEIGHT = h;
    this.ANALYZERWIDTH = w;
    this.ANALYZERHEIGHT = h-100;
    this.HEIGHTRATIO = this.ANALYZERHEIGHT/140;

    this.barWidth = [];

    this.fftSize = this.parameter.fftSize;
    // frequencyBinCount = fftSize/2
    this.bufferLength = this.frequencyBinCount;

    // calculate frequency and barWidth
    for(var i = 0; i < this.bufferLength; i++) {
      this.frequency[i] = i * this.audioContext.sampleRate / this.fftSize;

      // calculate bar width -> exponential -> logarithm
      this.barWidth[i] = (Math.log(i+2)-Math.log(i+1))*this.ANALYZERWIDTH/Math.log(this.bufferLength);

      //this.barWidth[i] = this.ANALYZERWIDTH/this.bufferLength;
    }
    // clear
    this.clearCanvas();
  }
  
  updateFreqDataArrayToPlot() {
    // get current frequency data
    this.getFloatFrequencyData(this.dataArray); 
  }
  
  drawPeakTresholdDashedBar() {
    this.ctx.save();
    
    // draw peak threshold stroke
    this.PEAKTHRESHOLD=this.parameter.barPosition;
    this.ctx.beginPath();
    this.ctx.moveTo(60,this.ANALYZERHEIGHT-this.PEAKTHRESHOLD*this.HEIGHTRATIO);
    this.ctx.lineTo(this.ANALYZERWIDTH,this.ANALYZERHEIGHT-this.PEAKTHRESHOLD*this.HEIGHTRATIO);
    this.ctx.strokeStyle = this.parameter.colorDashBar;
    this.ctx.setLineDash([5]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    this.ctx.restore();
  }
  
  drawOneLabel2(i, x, widthInBars, color) {
    let fontSize = this.parameter.fontSize;
    if(this.WIDTH < 600) {
      fontSize = 8;
    } else if(this.WIDTH < 400) {
      fontSize = 4;
    }

    this.ctx.font = fontSize + 'px Arial';
    this.ctx.fillStyle = color;

    var sumBar=0;
    for (var l=0;l<widthInBars;l++){
      sumBar+=this.barWidth[i-l]+1;
    }
    //distance=-x+fontSize/2;
    //let distance=-x-widthInBars*this.barWidth[i]/2+(fontSize/2);
    var distance=-x+((fontSize-sumBar)/2);

    this.ctx.save();
    // insert "kilo" herz
    if(this.frequency[i] >= 1000) {
      this.ctx.fillText(Math.round(this.frequency[i+1]/100)/10+ ' kHz', this.HEIGHT-80,distance);
    } else {
      this.ctx.fillText(Math.round(this.frequency[i+1])+ ' Hz', this.HEIGHT-80,distance);
    }
    // draw small scale identifyer
    this.ctx.beginPath();
    this.ctx.moveTo(this.ANALYZERHEIGHT,-x+1);
    this.ctx.lineTo(this.ANALYZERHEIGHT+10,-x+1);
    this.ctx.strokeStyle = this.parameter.colorAxisBar;
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawFrequencyLabels() {
    this.ctx.save();

    // draw bottom in dark grey
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, this.ANALYZERHEIGHT+1, this.WIDTH, this.HEIGHT);

    // Draw rotated freq labels
    this.ctx.save();

    // draw frequency labels (rotated 90 degree to be vertically drawn)
    this.ctx.rotate(Math.PI / 2);

    var x=0, a=0, b=0, c=0, d=0;
    for(let i = 0; i < this.bufferLength; i++) {
      if (i<16)
      {
        this.drawOneLabel2(i,x,1,this.parameter.colorAxisBar);
      }
      else if(i<32) 
      {
        if (a%2===0) this.drawOneLabel2(i,x,2,this.parameter.colorAxisBar);
        a++;
      }
      else if(i<64)
      {
        if (b%4===0) this.drawOneLabel2(i,x,4,this.parameter.colorAxisBar);
        b++;
      }
      else if(i<128)
      {
        if (c%8===0) this.drawOneLabel2(i,x,8,this.parameter.colorAxisBar);
        c++;
      }
      else {
        if(d%16===0) this.drawOneLabel2(i,x,16,this.parameter.colorAxisBar);
        d++;
      }
      x+=this.barWidth[i]+1;
    }
    this.ctx.restore();

    // draw x-scale stroke
    this.ctx.beginPath();
    this.ctx.moveTo(0,this.ANALYZERHEIGHT+5);
    this.ctx.lineTo(this.ANALYZERWIDTH,this.ANALYZERHEIGHT+5); 
    this.ctx.strokeStyle = this.parameter.colorAxisBar;
    this.ctx.stroke();
    
    this.ctx.restore();
  }
  
  drawLeftDbScale() {
    this.ctx.save();
    // draw left scale
    this.minDecibels = this.parameter.decibelMin;
    this.maxDecibels = this.parameter.decibelMax;
    
    let stepSize = 10;
    let steps = (this.maxDecibels - this.minDecibels)/stepSize;

    this.ctx.fillStyle =this.parameter.colorAxisBar;
    let fontSize = this.parameter.fontSize;
    if(this.HEIGHT < 250) {
      fontSize = 8;
    } else if(this.HEIGHT < 100) {
      fontSize = 4;
    }

    this.ctx.font = 'normal ' + fontSize + 'px Arial';
    var y = this.maxDecibels;
    
    for(let i = 0; i < steps;i++) {
      // draw text
      this.ctx.fillText(y + ' db', 10, this.ANALYZERHEIGHT/steps*i+30);

      // draw small scale identifier
      this.ctx.beginPath();
      this.ctx.moveTo(55,this.ANALYZERHEIGHT/steps*i+25);
      this.ctx.lineTo(65,this.ANALYZERHEIGHT/steps*i+25);
      this.ctx.strokeStyle = this.parameter.colorAxisBar;
      this.ctx.stroke();
      y -= stepSize;
    }

    // draw y-scale axis
    this.ctx.beginPath();
    this.ctx.moveTo(60,0);
    this.ctx.lineTo(60,this.ANALYZERHEIGHT+5);
    this.ctx.strokeStyle = this.parameter.colorAxisBar;
    this.ctx.stroke();

    this.ctx.restore();
  }

  drawFrequencyBars() {
    this.ctx.save();

    this.smoothingTimeConstant =this.parameter.smoothingTimeConstant;



    this.fftSize = this.parameter.fftSize;
    // frequencyBinCount = fftSize/2
    this.bufferLength = this.frequencyBinCount;

    let x = 0;
    // draw bars (rectangles)
    for(let i = 0; i < this.bufferLength; i++) {
      let barHeight = (this.dataArray[i]+140)*this.HEIGHTRATIO;
      
      barHeight /= (90 / (this.maxDecibels - this.minDecibels));
      
      if(barHeight < 0) barHeight = 0;

      // draw bar
      // this.ctx.fillStyle = 'rgb(0,'+(barHeight+50)+',0)';
      // nice blue....
      this.ctx.fillStyle = this.parameter.colorFreqBar;
      
      // If above treshold, highlight the frequencies in white
      if(this.dataArray[i]+140 > this.PEAKTHRESHOLD) this.ctx.fillStyle = 'white';

      // draw a bar
      this.ctx.fillRect(x,this.ANALYZERHEIGHT-barHeight,this.barWidth[i],barHeight);
      x += this.barWidth[i] + 1;
    }
    
    this.ctx.restore();
  }
  
  drawLabel() {
    this.ctx.save();

    let fontSize = this.parameter.fontSize;
    this.ctx.font =  fontSize + 'px Arial';
    this.ctx.testAlign='center';
    this.ctx.fillStyle = this.parameter.colorAxisBar;
    this.ctx.fillText(this.label, this.WIDTH/2-40, 30);

    this.ctx.restore();
  }
  
  clearCanvas() {
    // clear canvas
    this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);    
  }

  // Main animation loop
  update() {   
    this.clearCanvas();

    this.updateFreqDataArrayToPlot();
    this.drawPeakTresholdDashedBar();
    this.drawFrequencyLabels();
    this.drawFrequencyBars();
    this.drawLeftDbScale();
    this.drawLabel();
  }

  animate(){
    this.update();

    // repaint 60 times/s
    requestAnimationFrame(this.animate.bind(this)); 
  }

  convert(value){
    if (value<=32) value = 32;
    else if (value<=64) value = 64;
    else if (value<=128) value = 128;
    else if (value<=256) value = 256;
    else if (value<=512) value = 512;
    else if (value<=1024) value = 1024;
    else if (value<=2048) value = 2048;
    else value = 4096;
    return parseInt(value);
  }

  updateZoom(_left,_width){
    let divZoom = document.querySelector('#div_zoom');
    divZoom.style.left=_left+"px";
    divZoom.style.width=_width+"px";
  }
  // ECOUTEURS : EventListener
  addListener(){
    window.addEventListener('resize', evt => this.resize(this.canvasParent.clientWidth,this.canvasParent.clientHeight));

    var gui = new dat.GUI({
      load: JSON,
      preset: 'settings_1'
    });
    var analyzerParams=this.params;
    gui.remember(analyzerParams);

    var  ctrlBarPosition=gui.add(analyzerParams, "barPosition").min(0).max(140);
    ctrlBarPosition.onChange(value=>this.parameter.barPosition=value);

    var  ctrlSmooth=gui.add(analyzerParams, "smoothingTimeConstant").min(0.00).max(0.95).step(0.05);
    ctrlSmooth.onChange(value=>this.parameter.smoothingTimeConstant=value);

    var  ctrlFFTSize=gui.add(analyzerParams, "fftSize",32,4096,2);
    ctrlFFTSize.onChange(value=>{
      this.parameter.fftSize=this.convert(value);
      this.resize(this.WIDTH, this.HEIGHT);
    });

    var  ctrlDBMin=gui.add(analyzerParams, "decibelMin").min(-100).max(-20);
    ctrlDBMin.onChange(value=>{
      this.parameter.decibelMin=value;
      console.log(value);
    });

    // COLOR
    var f1 = gui.addFolder('tresholdBar');
    var colorTresholdBBar=f1.addColor(analyzerParams,'colorDashBar');
    colorTresholdBBar.onChange(value=>this.parameter.colorDashBar=value);
    var f2 = gui.addFolder('frequencydBars');
    var colorFrequencydBars=f2.addColor(analyzerParams,"colorFreqBar");
    colorFrequencydBars.onChange(value=>this.parameter.colorFreqBar=value);
    var f3 = gui.addFolder('axisLabels');
    var colorAxisLabels=f3.addColor(analyzerParams,"colorAxisBar");
    colorAxisLabels.onChange(value=>this.parameter.colorAxisBar=value);

    // _ Z O O M _
    let _zoom=9;
    let positionZoom=0;
    let positionZoomB=0;

    this.parent.addEventListener('click',()=>{
      // on initialise la position et la width de la zone zoomable à 0
      this.updateZoom(0,0);
    });
    this.parent.addEventListener('dragstart',(e)=>{
      //e.dataTransfer.setData("Text", e.target.id);
      // on initialise la position et la width de la zone zoomable à 0
      this.updateZoom(0,0);
      // on récupère la position de la souris au point de drague
      let rect = e.target.getBoundingClientRect();
      let mouseX = e.x - rect.left;
      //let mouseY = e.y - rect.top;
      // on set la position du zoom à la position de la souris
      positionZoom=mouseX;
      this.updateZoom(positionZoom,0);
    });
    this.parent.addEventListener('drag',(e)=>{
      // on récupère la nouvelle position de la souris durant le drague
      let rect = e.target.getBoundingClientRect();
      let mouseX = e.x - rect.left;
      if (mouseX>0){
        positionZoomB=mouseX;         
      }
      //let mouseY = e.y - rect.top;
      // on compare la position du zoom à la nouvelle position de la souris
      // on set la width du zoom en faisant la différence entre la nouvelle position et la position du zoom
      this.updateZoom(positionZoom,positionZoomB-positionZoom);
    });
    this.parent.addEventListener('dragend',(e)=>{
      if (positionZoomB>positionZoom)
      {
        _zoom++;
        if (_zoom>=9)
        {
          _zoom=9;
        }
      }
      else
      {
        _zoom--;
        if (_zoom<=1)
        {
          _zoom=1;
        }
      }
      //fa.setWidth(_zoom);
      //fa.zoom(positionZoom,positionZoomB);
    });
  }
}
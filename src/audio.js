const Meyda = require('meyda')
const getUserMedia = require('getusermedia')

class Audio {
  constructor ({
    numBins = 4,
    cutoff = 2,
    smooth = 0.4,
    max = 15,
    scale = 10,
    isDrawing = false
  }) {
    this.vol = 0
    this.sensitivty = 1
    this.scale = scale
    this.max = max
    this.cutoff = cutoff
    this.smooth = smooth
    this.setBins(numBins)

    // beat detection from: https://github.com/therewasaguy/p5-music-viz/blob/gh-pages/demos/01d_beat_detect_amplitude/sketch.js
    this.beat = {
      holdFrames: 15,
      threshold: 3,
      _cutoff: 0, // adaptive based on sound state
      decay: 0.98,
      _framesSinceBeat: 0 ,// keeps track of frames
      last: null, // time of last beat
    }

    this.onBeat = () => {
      console.log("beat")
    }

    this.canvas = document.createElement('canvas')
    this.canvas.width = 100
    this.canvas.height = 80
    this.canvas.style.width = "100px"
    this.canvas.style.height = "80px"
    this.canvas.style.position = 'absolute'
    this.canvas.style.right = '0px'
    this.canvas.style.bottom = '0px'
    document.body.appendChild(this.canvas)

    this.isDrawing = isDrawing
    this.ctx = this.canvas.getContext('2d')
    this.ctx.fillStyle="#DFFFFF"
    this.ctx.strokeStyle="#0ff"
    this.ctx.lineWidth=0.5

    getUserMedia(
      {video: false, audio: true},
      (err, stream) => {
        if(err) {
          console.log('ERROR', err)
        } else {
          console.log('got mic stream', stream)
          this.stream = stream
          this.context = new AudioContext()
        //  this.context = new AudioContext()
          let audio_stream = this.context.createMediaStreamSource(stream)

          console.log(this.context)
          this.meyda = Meyda.createMeydaAnalyzer({
            audioContext: this.context,
            source: audio_stream,
            featureExtractors: [
              'loudness',
            //  'perceptualSpread',
            //  'perceptualSharpness',
            //  'spectralCentroid'
            ]
          })
        }
      })
  }

  detectBeat(time, level, threshold) {
    //console.log(level, this.beat)

    if (level > this.beat._cutoff && level > threshold) {
      this.onBeat()
      this.beat.last = time
      this.beat._cutoff = level * 1.2
      this.beat._framesSinceBeat = 0
    } else {
      if (this.beat._framesSinceBeat <= this.beat.holdFrames){
        this.beat._framesSinceBeat++;
      } else {
        this.beat._cutoff *= this.beat.decay
        this.beat._cutoff = Math.min(  this.beat._cutoff, threshold);
      }
    }
  }

  tick(time) {
   if(this.meyda){
     var features = this.meyda.get()
     if(features && features !== null){
       this.vol = this.sensitivty * Math.max(0, features.loudness.total - (this.cutoff * this.bins.length))
       this.detectBeat(time, this.vol, this.beat.threshold * this.bins.length)
       // reduce loudness array to number of bins
       const reducer = (accumulator, currentValue) => accumulator + currentValue;
       let spacing = Math.floor(features.loudness.specific.length/this.bins.length)
       this.prevBins = this.bins.slice(0)
       this.bins = this.bins.map((bin, index) => {
         return this.sensitivty * features.loudness.specific.slice(index * spacing, (index + 1)*spacing).reduce(reducer)
       }).map((bin, index) => {
         // map to specified range

        // return (bin * (1.0 - this.smooth) + this.prevBins[index] * this.smooth)
          return (bin * (1.0 - this.settings[index].smooth) + this.prevBins[index] * this.settings[index].smooth)
       })
       // var y = this.canvas.height - scale*this.settings[index].cutoff
       // this.ctx.beginPath()
       // this.ctx.moveTo(index*spacing, y)
       // this.ctx.lineTo((index+1)*spacing, y)
       // this.ctx.stroke()
       //
       // var yMax = this.canvas.height - scale*(this.settings[index].scale + this.settings[index].cutoff)
       this.fft = this.bins.map((bin, index) => (
         // Math.max(0, (bin - this.cutoff) / (this.max - this.cutoff))

         // scale is the amount above the cutoff

         Math.max(0, (bin - this.settings[index].cutoff)/this.settings[index].scale)
       ))
       if(this.isDrawing) this.draw(time)
     }
   }
  }

  _handleArrayParam(arr, param) {
    // if not enough array values for each bin then just copy the last
    let i = 0
    for (let el of this.settings) {
      el[param] = arr[i]
      if (i < arr.length - 1) i++
    }
  }

  setSensitivity(sensitivty) {
    this.sensitivty = sensitivty
  }

  setCutoff (cutoff) {
    if (Array.isArray(cutoff)) {
      this._handleArrayParam(cutoff, 'cutoff')
      const sum = (accumulator, el) => accumulator + el.cutoff;
      this.cutoff = this.settings.reduce(sum)
    } else {
      this.cutoff = cutoff
      this.settings = this.settings.map((el) => {
        el.cutoff = cutoff
        return el
      })
    }
  }

  setSmooth (smooth) {
    if (Array.isArray(smooth)) {
      this._handleArrayParam(smooth, 'smooth')
      const sum = (accumulator, el) => accumulator + el.smooth;
      this.smooth = this.settings.reduce(sum)
    } else {
      this.smooth = smooth
      this.settings = this.settings.map((el) => {
        el.smooth = smooth
        return el
      })
    }
  }

  setBins (numBins) {
    this.bins = Array(numBins).fill(0)
    this.prevBins = Array(numBins).fill(0)
    this.fft = Array(numBins).fill(0)
    this.settings = Array(numBins).fill(0).map(() => ({
      cutoff: this.cutoff,
      scale: this.scale,
      smooth: this.smooth
    }))
    // to do: what to do in non-global mode?
    this.bins.forEach((bin, index) => {
      window['a' + index] = (scale = 1, offset = 0) => () => (a.fft[index] * scale + offset)
    })
    console.log(this.settings)
  }

  setScale(scale){
    if (Array.isArray(scale)) {
      // TODO: check vs each cutoff
      this._handleArrayParam(scale, 'scale')
      const sum = (accumulator, el) => accumulator + el.scale;
      this.scale = this.settings.reduce(sum)
    } else {
      if (scale < this.cutoff) {
        console.log("Cannot set scale less than cutoff")
        return
      }
      this.scale = scale
      this.settings = this.settings.map((el) => {
        el.scale = scale
        return el
      })
    }
  }

  setMax(max) {
    this.max = max
    console.log('set max is deprecated')
  }

  hide() {
    this.isDrawing = false
    this.canvas.style.display = 'none'
  }

  show() {
    this.isDrawing = true
    this.canvas.style.display = 'block'
  }

  draw (time) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    var spacing = this.canvas.width / this.bins.length
    var scale = this.canvas.height / (this.max * 2)

    // beats are green
    if (this.beat.last && time - this.beat.last < 0.12) {
      this.ctx.fillStyle="#88FF88"
    } else {
      this.ctx.fillStyle="#DFFFFF"
    }

    //  console.log(this.bins)
    this.bins.forEach((bin, index) => {

      var height = this.canvas.height - bin * scale
      var y = this.canvas.height - scale*this.settings[index].cutoff
      var yMax = this.canvas.height - scale*(this.settings[index].scale + this.settings[index].cutoff)

      if (height < yMax) {
        this.ctx.fillStyle="#DD0000"
      }
      else if (height < y) {
        this.ctx.fillStyle="#FF9900"
      } else {
        this.ctx.fillStyle="#DFFFFF"
      }

      this.ctx.fillRect(index * spacing, height, spacing, height)

      //   console.log(this.settings[index])

      // cutoff line
      this.ctx.beginPath()
      this.ctx.moveTo(index*spacing, y)
      this.ctx.lineTo((index+1)*spacing, y)
      this.ctx.stroke()

      // scale line
      this.ctx.beginPath()
      this.ctx.moveTo(index*spacing, yMax)
      this.ctx.lineTo((index+1)*spacing, yMax)
      this.ctx.stroke()

      //console.log("bins", index, y, yMax)
    })


    /*var y = this.canvas.height - scale*this.cutoff
    this.ctx.beginPath()
    this.ctx.moveTo(0, y)
    this.ctx.lineTo(this.canvas.width, y)
    this.ctx.stroke()

    var yMax = this.canvas.height - scale*this.max
    this.ctx.beginPath()
    this.ctx.moveTo(0, yMax)
    this.ctx.lineTo(this.canvas.width, yMax)
    this.ctx.stroke()*/
  }
}

module.exports = Audio

// some utility functions for managing time within hydra
// to do: add easing functions: https://github.com/bameyrick/js-easing-functions

// accepts a sequence of values as an array
const seq = (arr = []) => ({time, bpm}) =>
{
   let speed = arr.speed ? arr.speed : 1
   return arr[Math.floor(time * speed * (bpm / 60) % (arr.length))]
}

// base sin oscillation
const sin = (amplitude = 1, period = 0.1, offset = 0, offsetTime = 0) => ({time, bpm}) => {
	return amplitude * Math.sin((time + offsetTime) * period * (bpm / 60)) + offset
}

// continuously increasing
const ramp = (scale = 1, offset = 0) => ({time, bpm}) => (time * scale + offset)

// rate of change with acceleration and velocity
// takes a "thrust" function which in turn takes time, bpm
// thrust can also be a single value which will ramp up from minV to maxV
// drag:      multiplies acceleration (0 = no drag)
// friction:  changes velocity towards 0 (0 = no friction)
//            (NOTE: not towards minV)
// NOTE: it would be weird to have minA and maxA be different, but maybe
//       something can speed up more than it can slow down?
//
//    k = 0
//    keyBinds.bindKey('NUMPAD4',
//      () => k = 3,
//      () => k++,
//      () => k = 0)
//    kdt = dt( () => k, {minV: 3, maxV: 10, friction: 2} )
//    shape( kdt ).out()
//
// TODO: how to write this in ES6?
const vel = function (
  o = {},
  thruster, // function or value, or null to use default ( o.dir * o.thrust )
  ) {
    // this is weird, we *really* don't want to make a new object
    // we want to set defaults for anything that hasn't been set
    const defaults = {
      a: 0,
      v: 0,
      thrust: 0,
      dir: 1,
      decay: 0.1,
      minV: -1.0,
      maxV:  1.0,
      minA: -1.0,
      maxA:  1.0,
      scale: 1.0
    }
    for (const [prop, value] of Object.entries(defaults)) {
        if (!o.hasOwnProperty(prop)) o[prop] = value
    }

    let t = 0
    let dt = 0
    if (typeof o.thruster !== "function") {
      if (typeof thruster === "undefined") {
        // default thuster takes existing thrust converts to acceleration and set thrust back to 0
        o.thruster = () => { r = o.thrust; o.thrust = 0; return r }
      } else {
        o.thruster = () => thrust
      }
    }

    return (timeObj) =>
    {
      if (t == 0) { t = time; return o.v }

      dt = time - t
      if (dt <= 0) {
        // no time passed
        return o.v
      }
      t = time

      let thrust = o.thruster(timeObj) // NOTE: important that this is called only once! (per frame)

      // calculate acceleration
      o.a = Math.max(o.minA * o.scale, Math.min(o.maxA * o.scale, dt * thrust * o.dir * o.scale ))
      //  TODO: add friction/drag?
      // decay velocity if no acceleration and velcoty not 0
      if (o.a == 0) {
        if (o.v != 0)
          o.v = o.v > 0 ? Math.max(0, o.v - o.decay * o.scale * dt) : Math.min(0, o.v + o.decay * o.scale * dt)
      }
      else {
        o.v += o.a // apply acceleration
      }
      // apply limits: TODO: soft limits
      o.v = Math.max(o.minV * o.scale, Math.min(o.maxV * o.scale, o.v))

      if (isNaN(o.v)) console.log("velcity is broken", o)
      //if (o.v != 0) console.log("vel:", o.v)
      return o.v
    }
}

// used with pos() as a finishFn
// combine with thrust function that includes dir
//
// go = {dir: 1, thrust: 10}
// go.move = () => go.dir * go.thrust
// pos(go, vel(go, go.move), 0, 100, sweep())
//
const sweep = () => (o) => {
  o.dir = -o.dir
  return false
}

const bounce = (bounciness = 1.0) => (o) => {
  o.dir = -o.dir
  o.v = -o.v * bounciness
  return false
}

// used with pos() as a finishFn
const repeat = (start_pos = 0) => (o) => {
  if (o.p == start_pos) {
    //console.log("at start, stop", o.v)
    o.v = 0
  } else {
    //console.log("at the end")
  }
  o.p = start_pos
  return false
}

// end == null if no end
// finishFn should return true if done, or false if continuing (repeat, sweep, etc)
const pos = function(o, velFn, start=0, end=1, finishFn ) {
  // base do ndirection, begin at start or end
  if (o.dir >= 0) {
    o.p = start
  } else {
    o.p = end
  }
  let finished = false

  return (timeObj) => {
    if (!finished) {
      if (velFn(timeObj) != 0) {
        // NOTE: o.v set in velFn
        o.p += o.v
        // constrain to start and end (null == no end)
        if (end !== null) {
          o.p = Math.min(end, o.p)
          if (o.dir >= 0 && o.p == end) {
            if (finishFn) {
              finished = finishFn(o)
            } else {
              o.v = 0 // stop
            }
          }
        }
        if (start !== null) {
          o.p = Math.max(start, o.p)
          if (o.dir <= 0 && o.p == start) {
            if (finishFn) {
              finished = finishFn(o)
            } else {
              o.v = 0 // stop
            }
          }
        }
        //console.log("pos", o.p)
      }
    }
    return o.p
  }
}



// Utility functions and variables for managing fade in and outs:
// creates a set of variables to store state.
// usage: osc(f0(10, 100)).out() , where there variables are: minimum, maximum, and multiple in time
// call fadeIn(0) to fade in all instances of f0, and fadeOut(0) to fadeOut
function createFades (numFades) {
  // variables containing current state of fade
  const gain = Array(numFades).fill().map(() => ({ progress: 0, dir: 0, mult: 1}))

  // fade function to use as parameter
  const fade = (i) => (min = 0, max = 10, mult = 1) => () => {
    if (gain[i].dir == 0) return gain[i].value || min

  	gain[i].progress++
    //console.log(i, "gain", gain[i])

    if (gain[i].dir > 0) {
  		gain[i].value = Math.min(max, min + gain[i].progress * mult * gain[i].mult)
      if (gain[i].value == max) gain[i].dir = 0 // stop
      return gain[i].value
    } else {
  		gain[i].value = Math.max(min, max - gain[i].progress * mult * gain[i].mult)
      if (gain[i].value == min) gain[i].dir = 0 // stop
      return gain[i].value
  	}
  }

  // to do: put this code somewhere else
  gain.forEach((gain, index) => {
    window['f'+index] = fade(index)
  })

  window.fadeIn = (index, _mult) => {
  	gain[index] = {
  		progress: 0, dir: 1, mult: _mult ? _mult : 1
  	}
  }
  //
  window.fadeOut = (index, _mult) => {
  	gain[index] = {
  		progress: 0, dir: -1, mult: _mult ? _mult : 1
  	}
  }
}

module.exports = {
  seq: seq,
  sin: sin,
  ramp: ramp,
  vel: vel,
  pos: pos,
  sweep: sweep,
  bounce: bounce,
  repeat: repeat,
  createFades: createFades
}

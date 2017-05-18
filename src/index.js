var createBackground = require('./bg');
var isMobile = require('ismobilejs');
// console.log(isMobile.any);

var glslify = require('glslify');
var render_fs = glslify(__dirname + '/glsl/render_fs.glsl');
var render_vs = glslify(__dirname + '/glsl/render_vs.glsl');
var simulation_fs = glslify(__dirname + '/glsl/simulation_fs.glsl');
var simulation_vs = glslify(__dirname + '/glsl/simulation_vs.glsl');


var scene, camera, renderer;
var simulationShader, renderShader;
var textureA, textureB, extraTexture;
var textures, currentIdx;

var w, h;

// Mouse parallax effect
var cameraDistance = 1.75; //isMobile ? 2 : 1.75;
var theta = 0 * Math.PI / 180;
var angleOffset = 40;
var mouseOffset = new THREE.Vector2();
var tmpQuat1 = new THREE.Quaternion();
var tmpQuat2 = new THREE.Quaternion();
var AXIS_X = new THREE.Vector3(1, 0, 0);
var AXIS_Y = new THREE.Vector3(0, 1, 0);

// Camera target
var target;

// Texture size should be large enough to contain all the vertices of each model.
// All extra vertices will be hidden (alpha = 0).
var textureSize = 256;

// BG
var background;

// OBJ model preloaded
var model;

// If the anim is transitioning set true
var inTransition = false;

// GUI
var parameters = {
  transition: 0,
  amplitude: 0, //96;
  frequency: 0.01,
  maxDistance: 48,
  interval: 5,
  transitionDuration: 3
};
var gui = new dat.GUI({autoPlace: false});
// gui.add(parameters, 'transition', 0, 1).listen();
gui.add(parameters, 'amplitude', 0, 20).listen();
// gui.add(parameters, 'frequency', 0, 0.02).step(0.00001).listen();
// gui.add(parameters, 'maxDistance', 0, 100).listen();
var transitionController = gui.add(parameters, 'transitionDuration', 1, 20).step(1).listen();
transitionController.onChange(function (value) {
  parameters.interval = value + 2;
});
document.getElementById('ui').appendChild(gui.domElement);

// Stats
var stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
stats.dom.id = 'stats';
document.getElementById('ui').appendChild(stats.dom);

function init() {
  document.body.classList.remove('show-loader');
  document.body.classList.add('show-ui-btn');

  //regular scene creation
  renderer = new THREE.WebGLRenderer({alpha: true});
  // renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, w / h, 1, 10000);
  camera.position.z = 500;
  target = new THREE.Vector3();
  document.body.appendChild(renderer.domElement);
  onResize();

  // Orbit controls
//    controls = new THREE.OrbitControls(camera);

  var width = textureSize;
  var height = textureSize;

  // BG
  if (!isMobile.any) {
    background = createBackground();
    scene.add(background);
  }

  // model
  var dataA = parseMesh(model);
  textureA = new THREE.DataTexture(dataA, width, height, THREE.RGBAFormat, THREE.FloatType, THREE.DEFAULT_MAPPING, THREE.RepeatWrapping, THREE.RepeatWrapping);
  textureA.needsUpdate = true;

  // sphere
  var radius = textureSize * 0.66;
  var dataB = getSphere(width * height, radius);
  textureB = new THREE.DataTexture(dataB, width, height, THREE.RGBAFormat, THREE.FloatType, THREE.DEFAULT_MAPPING, THREE.RepeatWrapping, THREE.RepeatWrapping);
  textureB.needsUpdate = true;

  // cube
  var side = textureSize; // the side of a square
  var dataC = getRandomData(side, textureSize, 'RGBA');
  extraTexture = new THREE.DataTexture(dataC, width, height, THREE.RGBAFormat, THREE.FloatType, THREE.DEFAULT_MAPPING, THREE.RepeatWrapping, THREE.RepeatWrapping);
  extraTexture.needsUpdate = true;

//    console.log(textureA, textureB);

  simulationShader = new THREE.ShaderMaterial({
    uniforms: {
      textureA: {type: 't', value: textureA},
      textureB: {type: 't', value: textureB},
      transition: {type: 'f', value: parameters.transition},

      // Noise related uniforms
      timer: {type: 'f', value: 0},
      frequency: {type: 'f', value: parameters.frequency},
      amplitude: {type: 'f', value: parameters.amplitude},
      maxDistance: {type: 'f', value: parameters.maxDistance}
    },
    vertexShader: simulation_vs,
    fragmentShader: simulation_fs
  });

  renderShader = new THREE.ShaderMaterial({
    uniforms: {
      positionsTexture: {type: 't', value: null},
      alpha: {type: 'f', value: 0.5},
      pointSize: {type: "f", value: 1}
    },
    vertexShader: render_vs,
    fragmentShader: render_fs,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending
  });

  FBO.init(width, height, renderer, simulationShader, renderShader);
  scene.add(FBO.particles);

  onResize();
  update();

  // Setup transition
  textures = [textureA, textureB, extraTexture];
  currentIdx = 0;
  function transitionLoop() {
    setTimeout(() => {
      if (!inTransition) {
        transition();
      }
      transitionLoop();
    }, parameters.interval * 1000);
  }

  transitionLoop();

  // Mouse parallax
  document.addEventListener('mousemove', (e) => {
    var x = e.clientX;
    var y = e.clientY;
    TweenMax.to(mouseOffset, 0.5, {
      x: (x / w * 2 - 1),
      y: (y / h * 2 - 1),
      ease: 'expoOut',
      overwrite: 'all'
    });
  });

  // events
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('click', () => {
    transition(true);
  });


  // Show/hide UI button
  document.getElementById('ui-btn').addEventListener('click', (e) => {
    document.body.classList.toggle('show-ui');
  });
}

/**
 * Cube root function (and polyfill).
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cbrt
 **/
Math.cbrt = Math.cbrt || function (x) {
    var y = Math.pow(Math.abs(x), 1 / 3);
    return x < 0 ? -y : y;
  };
function getPoint(v, radius) {
  var phi = Math.random() * 2 * Math.PI;
  var costheta = Math.random() * 2 - 1;
  var u = Math.random();

  var theta = Math.acos(costheta);
  var r = radius * Math.cbrt(u);

  v.x = r * Math.sin(theta) * Math.cos(phi);
  v.y = r * Math.sin(theta) * Math.sin(phi);
  v.z = r * Math.cos(theta);
  return v;
}

function getSphere(count, radius) {
  var len = count * 4;
  var data = new Float32Array(len);
  var p = new THREE.Vector4();
  for (var i = 0; i < len; i += 4) {
    getPoint(p, radius);
    data[i] = p.x;
    data[i + 1] = p.y;
    data[i + 2] = p.z;
    data[i + 3] = 1; // alpha // Math.random();
  }
  return data;
}

// returns an array of random 3D coordinates for RGBA points (4 values)
// (basically fills a cube with points)
function getRandomData(size, textureSize, format) {
  var values = format === 'RGBA' ? 4 : 3;
  var textureArea = textureSize * textureSize;
  var radius = size / 2;
  var data = new Float32Array(textureSize * textureSize * values);
  for (var i = 0; i < textureArea; i++) {
    data[i * values] = -radius + Math.random() * size;
    data[i * values + 1] = -radius + Math.random() * size;
    data[i * values + 2] = -radius + Math.random() * size;
    data[i * values + 3] = 1; // alpha
  }
  return data;
}

function loadMesh() {
  var bl = new THREE.BinaryLoader();
  bl.load('model/bust.js', function (m) {
    model = m;
    init();
  });

//    var loader = new THREE.OBJLoader();
//    loader.load('obj/dog.obj', init, onProgress, onError);
}

/**
 * Create an Float32Array with the size of the texture and push all the vertices of the 3D mesh.
 * Each vertex will be represented in RGBA format (so it requires 4 values: xyz + alpha).
 * When vertices are over, fill the remaining array positions with
 * random values and hide those extra points by setting the alpha value to 0.
 *
 * NOTE: hidden points (with alpha 0) must be drawn first, so they must be at the
 * beginning of the array! Otherwise you will see black dots, instead of transparent.
 * See the problem here: https://en.wikipedia.org/wiki/Painter%27s_algorithm
 *
 * @param g The mesh data.
 * @returns {Float32Array} An array of floats, based on RGBA format, that can be used as data in a DataTexture.
 */
function parseMesh(g) {
  var vertices = g.vertices;
  var verticesCount = vertices.length;
  // var radius = textureSize / 2;
  var textureArea = textureSize * textureSize;
  var data = new Float32Array(textureArea * 4);
//        var dataLength = data.length;

  var s = 1.2; // scale

  console.log(textureArea, verticesCount);

  var hiddenPoints = textureArea - verticesCount;

  for (var i = 0; i < textureArea; i++) {
    if (i < hiddenPoints) {

      // Hide points (alpha = 0)
//        data[i * 4] = 0; // -radius + Math.random() * textureSize;
//        data[i * 4 + 1] = 0; //-radius + Math.random() * textureSize;
//        data[i * 4 + 2] = 0; //-radius + Math.random() * textureSize;
//        data[i * 4 + 3] = 0; // alpha

      // Alternative technique: place points where there are already other points
      data[i * 4] = s * vertices[i].x;
      data[i * 4 + 1] = s * vertices[i].y;
      data[i * 4 + 2] = s * vertices[i].z;
      data[i * 4 + 3] = 0; // alpha
    } else {
      data[i * 4] = s * vertices[i - hiddenPoints].x;
      data[i * 4 + 1] = s * vertices[i - hiddenPoints].y;
      data[i * 4 + 2] = s * vertices[i - hiddenPoints].z;
      data[i * 4 + 3] = 1; // alpha
    }
  }

  return data;
}

function onResize() {
  w = window.innerWidth;
  h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}


function update() {
  requestAnimationFrame(update);

  stats.begin();
  //update params
  simulationShader.uniforms.transition.value = parseFloat(parameters.transition);
  simulationShader.uniforms.amplitude.value = parseFloat(parameters.amplitude);
  simulationShader.uniforms.frequency.value = parseFloat(parameters.frequency);
  simulationShader.uniforms.maxDistance.value = parseFloat(parameters.maxDistance);
  simulationShader.uniforms.timer.value += 0.01;

  // Rotate particles
  FBO.particles.rotation.y -= Math.PI / 180 * .05;

  if (!isMobile.any) {
    // Camera + mouse parallax effect
    const phi = Math.PI / 2;
    camera.position.x = Math.sin(phi) * Math.sin(theta);
    camera.position.y = Math.cos(phi);
    camera.position.z = 300 * (Math.sin(phi) * Math.cos(theta));
    const radius = cameraDistance;
    const radianOffset = angleOffset * Math.PI / 180;
    const xOff = mouseOffset.y * radianOffset;
    const yOff = mouseOffset.x * radianOffset;
    tmpQuat1.setFromAxisAngle(AXIS_X, -xOff);
    tmpQuat2.setFromAxisAngle(AXIS_Y, -yOff);
    tmpQuat1.multiply(tmpQuat2);
    camera.position.applyQuaternion(tmpQuat1);
    camera.position.multiplyScalar(radius);
    target.set(0, 0, 0);
    camera.lookAt(target);

    // bg
    background.style({
      aspect: w / h,
      aspectCorrection: true,
      scale: 2.0,
      offset: [0.2 * yOff, -0.2 * xOff], // [-0.2 * xOff, 0.25 * yOff],
      // ensure even grain scale based on width/height
      grainScale: 1.5 / Math.min(w, h)
    });
  }

  //update simulation
  FBO.update();

  //render the particles at the new location
  renderer.render(scene, camera);

  stats.end();
}


var ampTimeline = new TimelineMax({paused: true});
// var trans = {amplitude: 42, maxDistance: 57, frequency: 0.01};
// var stop = {amplitude: 0, maxDistance: 48, frequency: 0.022};
var trans = {maxDistance: 36, frequency: 0.01};
var stop = {maxDistance: 20, frequency: 0.035};
ampTimeline.fromTo(parameters, parameters.transitionDuration, stop, trans);
ampTimeline.to(parameters, parameters.transitionDuration, stop);


function transition(resetRotation) {
  // cycle through textures
  var A = currentIdx;
  var B = currentIdx + 1;
  if (A >= textures.length) {
    A = 0;
    B = A + 1;
    currentIdx = 0;
  } else if (B >= textures.length) {
    A = currentIdx;
    B = 0;
  }

  currentIdx++;

  simulationShader.uniforms.textureA.value = textures[A];
  simulationShader.uniforms.textureB.value = textures[B];

  // Rotate the particles to the starting position, while transitioning
  if (resetRotation) {
    TweenMax.to(FBO.particles.rotation, parameters.transitionDuration, {
      y: 0, overwrite: 'all'
    });
  }

  // Animate transition
  TweenMax.fromTo(parameters, parameters.transitionDuration, {
    transition: 0
  }, {
    transition: 1,
    onStart: () => {
      inTransition = true;
    },
    onUpdate: function (tween) {
      ampTimeline.progress(tween.progress());
    },
    onComplete: () => {
      inTransition = false;
    },
    onUpdateParams: ['{self}'],
    overwrite: 'all'
    // ease: Power3.easeInOut
  });
}


window.onload = () => {
  loadMesh();
};

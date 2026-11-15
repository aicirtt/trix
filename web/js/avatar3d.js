// "Show me how": a 3D avatar acting out each procedure step (three.js, works offline after scripts/setup_vendor.py).
// Both people are a realistic human model (Ready Player Me avatar from the three.js examples) in flight-suit colours:
// the helper in navy, the patient in light blue. The hat is hidden (crew do not wear one inside the spacecraft).
// Poses are built by pointing bones in given directions, so no motion-capture files are needed.

let L = null;
async function lib() {
  if (L) return L;
  const local = async () => ({
    THREE: await import('/vendor/three/three.module.min.js'),
    GLTF: (await import('/vendor/three/addons/GLTFLoader.js')).GLTFLoader,
    Orbit: (await import('/vendor/three/addons/OrbitControls.js')).OrbitControls,
    Skel: await import('/vendor/three/addons/SkeletonUtils.js'),
    models: '/vendor/avatar/',
  });
  const cdn = async () => ({                       // online fallback when setup_vendor.py was not run
    THREE: await import('https://esm.sh/three@0.170.0'),
    GLTF: (await import('https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js')).GLTFLoader,
    Orbit: (await import('https://esm.sh/three@0.170.0/examples/jsm/controls/OrbitControls.js')).OrbitControls,
    Skel: await import('https://esm.sh/three@0.170.0/examples/jsm/utils/SkeletonUtils.js'),
    models: 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/',
  });
  try { L = await local(); } catch (e) { L = await cdn(); }
  return L;
}

export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

const HEIGHT = 1.75;
const BPM = 110;

// directions are in the figure's own frame: +x = its left, +y = up, +z = forward (towards the camera)
const STAND = {
  LeftArm: [0.25, -1, 0.05], LeftForeArm: [0.15, -1, 0.15], RightArm: [-0.25, -1, 0.05], RightForeArm: [-0.15, -1, 0.15],
  LeftUpLeg: [0.05, -1, 0], LeftLeg: [0, -1, -0.05], RightUpLeg: [-0.05, -1, 0], RightLeg: [0, -1, -0.05],
};
const FLOAT = { ...STAND, LeftUpLeg: [0.1, -1, 0.25], LeftLeg: [0.05, -1, -0.35], RightUpLeg: [-0.1, -1, 0.15], RightLeg: [-0.05, -1, -0.3],
  LeftArm: [0.5, -0.8, 0.15], RightArm: [-0.5, -0.8, 0.15] };
const reach = (side, dir, fore = dir) => ({ [`${side}Arm`]: dir, [`${side}ForeArm`]: fore });

// Each step: helper pose (h), optional patient (p), props, where to look. Root: pos [x,y,z], rot [x,y,z] in radians.
const P = Math.PI;
const SCENES = {
  'CPR-MG-01': { patient: true, cam: [3.4, 1.7, 1.6], look: [0, 1.25, -0.2], steps: [
    { h: { root: { pos: [-0.85, 0.55, 0.25], rot: [0, P / 2 - 0.4, 0] }, pose: { ...FLOAT, ...reach('Right', [-0.4, 1, 0.3], [-0.1, 1, 0.3]), ...reach('Left', [0.3, 0.6, 0.8], [0.1, 0.9, 0.6]) } },
      p: { root: { pos: [0, 0.75, 0.8], rot: [-P / 2, 0, 0] }, pose: STAND }, props: ['board', 'aed_float'], focus: 'aed', tip: 'Defibrillator (AED)', label: 'Call the crew · bring the defibrillator' },
    { h: { root: { pos: [-0.62, 0.45, -0.05], rot: [0, P / 2, 0] }, pose: FLOAT, touch: [{ hand: 'Left', at: 'strapL' }, { hand: 'Right', at: 'strapR' }] },
      p: { root: { pos: [0, 0.75, 0.8], rot: [-P / 2, 0, 0] }, pose: STAND }, props: ['board', 'straps', 'aed_float'], focus: 'chest', tip: 'Straps across chest, hips and legs', label: 'Strap the patient to the restraint' },
    { h: { root: { pos: [0, 2.2, 0], rot: [0, P / 2, P] }, pose: { ...STAND, LeftArm: [0.12, 1, 0.05], LeftForeArm: [0.08, 1, 0.05], RightArm: [-0.12, 1, 0.05], RightForeArm: [-0.08, 1, 0.05],
      LeftUpLeg: [0.12, -1, 0], RightUpLeg: [-0.12, -1, 0] }, anchor: { at: 'chest', up: 0.02 }, pump: true },
      p: { root: { pos: [0, 0.75, 0.8], rot: [-P / 2, 0, 0] }, pose: STAND }, props: ['board', 'straps', 'ceiling', 'aed_float'], focus: 'chest', tip: 'Hands here · push 5 cm', label: `Handstand brace · push the centre of the chest ${BPM} a minute` },
    { h: { root: { pos: [-0.8, 0.55, 0.05], rot: [0, P / 2, 0] }, pose: { ...FLOAT, ...reach('Left', [0.4, 0.9, 0.3], [0.2, 1, 0.1]), ...reach('Right', [-0.4, 0.9, 0.3], [-0.2, 1, 0.1]) } },
      p: { root: { pos: [0, 0.75, 0.8], rot: [-P / 2, 0, 0] }, pose: STAND }, props: ['board', 'straps', 'aed_on', 'pads'], focus: 'chest', tip: 'Pads upper right, lower left · hands off', label: 'Pads on · hands off for the shock' },
  ] },
  'CARD-ECG-01': { patient: true, cam: [0.4, 1.35, 2.4], look: [0, 1.25, 0], steps: [1, 2, 3, 4, 5, 6].map((n) => ({
    h: { root: { pos: [0.5, 0, 0.42], rot: [0, -P / 2 - 0.35, 0] }, pose: STAND, touch: n <= 5 ? [{ hand: 'Right', at: 'sticker' }] : [] },
    p: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND }, props: [`stickers${Math.min(n, 5)}`, ...(n === 6 ? ['trace'] : [])],
    focus: n <= 5 ? 'sticker' : 'monitor', tip: n <= 5 ? ['Below the right collarbone', 'Below the left collarbone', 'Lower left ribs', 'Lower right ribs', 'Right of the breastbone'][n - 1] : 'Keep still · recording',
    label: n <= 5 ? `Sticker ${n}` : 'Keep still for 30 seconds' })) },
  'US-A4C-01': { patient: true, cam: [0.6, 1.35, 2.3], look: [0, 1.2, 0], steps: [
    { h: { root: { pos: [0.5, 0, 0.42], rot: [0, -P / 2 - 0.35, 0] }, pose: STAND, touch: [{ hand: 'Right', at: 'heart' }] }, p: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND }, props: ['probe'], focus: 'heart', tip: 'Under the left breast · aim at the right shoulder', label: 'Probe under the left breast · aim at the right shoulder' },
    { h: { root: { pos: [0.5, 0, 0.42], rot: [0, -P / 2 - 0.35, 0] }, pose: STAND, touch: [{ hand: 'Right', at: 'heart' }], slide: true }, p: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND }, props: ['probe'], focus: 'heart', tip: 'Slide slowly, then hold', label: 'Slide slowly · hold still 5 seconds' },
    { h: { root: { pos: [0.5, 0, 0.42], rot: [0, -P / 2 - 0.35, 0] }, pose: STAND }, p: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND }, props: [], focus: 'heart', tip: 'Wipe the gel', label: 'Wipe the gel · stow the probe' },
  ] },
  'LAND-01': { cam: [2.2, 1.3, 2.6], look: [0, 0.9, 0], steps: [
    { h: { root: { pos: [0, 0.35, 0], rot: [-P / 2, 0, 0] }, pose: STAND }, props: ['board', 'cuff'], focus: 'h:cuff', tip: 'Cuff on the bare upper arm', label: 'Lie still for 2 minutes' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND }, props: ['loops', 'cuff'], focus: 'h:feet', tip: 'Feet in the loops', label: 'Stand in the foot loops for 3 minutes' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: STAND, sway: true }, props: ['loops'], focus: 'h:head', tip: 'Eyes closed · stand still', label: 'Eyes closed · stand still 30 seconds' },
  ] },
  'O2-01': { cam: [2.5, 1.5, 1.5], look: [0, 1.15, 0.15], steps: [
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: { ...FLOAT, ...reach('Left', [0.2, -0.2, 1], [0.1, 0.1, 1]) } }, props: ['clip'], focus: 'h:handL', tip: 'Clip on another finger', label: 'Re-check on another finger · hand still' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0.7, 0] }, pose: { ...FLOAT, ...reach('Right', [-0.2, 0.1, 1], [-0.1, 0.3, 1]) } }, props: ['panel'], focus: 'panel', tip: 'Cabin oxygen and CO₂', label: 'Check cabin oxygen and CO₂' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Right', at: 'h:face' }] }, props: ['mask'], focus: 'h:face', tip: 'Mask over nose and mouth', label: 'Below 92%: oxygen mask on · call the medical officer' },
  ] },
  'GLU-01': { cam: [2.5, 1.5, 1.5], look: [0, 1.15, 0.15], steps: [
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Left', at: 'h:front' }, { hand: 'Right', at: 'h:front' }] }, props: ['loops', 'wipe'], focus: 'h:front', tip: 'Wipe and dry your hands', label: 'Wash hands · foot in the loop' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Left', at: 'h:frontL' }] }, props: ['loops', 'meter'], focus: 'h:frontL', tip: 'Strip into the meter', label: 'Strip into the meter' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Left', at: 'h:frontL' }, { hand: 'Right', at: 'h:handL' }] }, props: ['loops', 'meter', 'drop'], focus: 'h:handL', tip: 'Side of the fingertip', label: 'Prick the side of a fingertip · touch the strip' },
  ] },
  'EVA-POST-01': { cam: [2.5, 1.5, 1.5], look: [0, 1.15, 0.15], steps: [
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Right', at: 'h:face' }] }, props: ['question'], focus: 'h:face', tip: 'Any symptoms?', label: 'Joint pain, tingling, itching or tiredness?' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: { ...FLOAT, ...reach('Left', [0.3, -0.1, 1], [0.1, 0.1, 1]), ...reach('Right', [-0.3, -0.1, 1], [-0.1, 0.1, 1]) }, turnHands: true }, props: [], focus: 'h:handL', tip: 'Palms, then backs', label: 'Show both hands: palms, then backs' },
    { h: { root: { pos: [0, 0, 0], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Right', at: 'h:shoulderL' }] }, props: [], focus: 'h:shoulderL', tip: 'Where does it hurt?', label: 'Rate any shoulder pain, 0 to 10' },
  ] },
  'RAD-SHELTER-01': { cam: [2.6, 1.5, 3.0], look: [0, 1, -0.4], steps: [
    { h: { root: { pos: [1.2, 0.3, 0.4], rot: [0, -2.2, -0.2] }, pose: FLOAT, glide: [[1.2, 0.3, 0.4], [0, 0.3, -0.6]] }, props: ['shelter'], focus: 'shelter', tip: 'Storm shelter', label: 'Stop your task · go to the shelter now' },
    { h: { root: { pos: [0, 0.3, -0.6], rot: [0, 0, 0] }, pose: FLOAT, touch: [{ hand: 'Right', at: 'h:dosi' }] }, props: ['shelter', 'dosimeter'], focus: 'h:dosi', tip: 'Dosimeter on your chest', label: 'Keep your dosimeter on you' },
    { h: { root: { pos: [0, 0.3, -0.6], rot: [0, 0, 0] }, pose: FLOAT }, props: ['shelter', 'dosimeter'], focus: 'shelter', tip: 'Stay until the all-clear', label: 'Stay until the all-clear' },
  ] },
};

export const HAS = (id) => !!SCENES[id];

export async function createStage(box, { weightless = true, still = false } = {}) {
  const { THREE, GLTF, Orbit, Skel, models } = await lib();
  const W = () => box.clientWidth || 600, H = () => box.clientHeight || 380;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071330);
  scene.fog = new THREE.Fog(0x071330, 6, 14);
  const cam = new THREE.PerspectiveCamera(36, W() / H(), 0.05, 50);
  const ctl = new Orbit(cam, renderer.domElement);
  ctl.enableDamping = !still; ctl.enablePan = false; ctl.minDistance = 1.2; ctl.maxDistance = 6;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10203f, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x60a5fa, 1.4); rim.position.set(-3, 2, -2); scene.add(rim);
  // module floor or Moon ground
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshStandardMaterial({ color: weightless ? 0x10285a : 0x3a3f4a, roughness: 0.95 }));
  floor.rotation.x = -P / 2; scene.add(floor);
  const grid = new THREE.PolarGridHelper(2.6, 12, 6, 64, 0x2a4682, 0x1c3263); grid.position.y = 0.002; scene.add(grid);

  const loader = new GLTF();
  const load = (n) => new Promise((ok, bad) => loader.load(`${models}${n}.glb`, ok, undefined, bad));
  const human = await load('readyplayer.me');

  function figure(gltf, tint) {
    const root = new THREE.Group();
    const m = Skel.clone(gltf.scene);
    m.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (/Headwear/.test(o.name)) o.visible = false;
        if (tint && o.material && /Outfit_(Top|Bottom)/.test(o.name)) { o.material = o.material.clone(); o.material.map = null; o.material.color = new THREE.Color(tint); o.material.roughness = 0.8; o.material.metalness = 0; }
      }
    });
    const bb = new THREE.Box3().setFromObject(gltf.scene);   // the original: a fresh clone's skinned bounds are not ready yet
    const s = HEIGHT / (bb.max.y - bb.min.y);
    m.scale.setScalar(s);
    m.position.y = -bb.min.y * s;
    // make every model face +z with its left hand at +x (the Soldier model faces -z)
    const pos = (n) => { let v = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse((o) => { if (o.isBone && o.name.endsWith(n)) { v = new THREE.Vector3(); o.getWorldPosition(v); } }); return v; };
    const la = pos('LeftArm'), ra = pos('RightArm');
    if (la && ra && la.x < ra.x) m.rotation.y = P;
    root.add(m);
    const bones = {};
    m.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    const rest = Object.fromEntries(Object.entries(bones).map(([k, b]) => [k, b.quaternion.clone()]));
    // which way the model faces: Mixamo characters face +z
    scene.add(root);
    return { root, model: m, bones, rest };
  }
  const helper = figure(human, 0x1b3466);
  const patient = figure(human, 0x7fa2d6);

  const V = (a) => new THREE.Vector3(...a);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), qW = new THREE.Quaternion(), qP = new THREE.Quaternion(), qD = new THREE.Quaternion();
  const ORDER = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const CHILD = { LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot',
    RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1' };

  function aim(f, name, dirLocal) {
    const b = f.bones[name], c = f.bones[CHILD[name]];
    if (!b || !c) return;
    f.root.updateMatrixWorld(true);
    b.getWorldPosition(tmpA); c.getWorldPosition(tmpB);
    const cur = tmpB.sub(tmpA).normalize();
    const want = V(dirLocal).normalize().applyQuaternion(f.root.quaternion);
    qD.setFromUnitVectors(cur, want);
    b.getWorldQuaternion(qW);
    b.parent.getWorldQuaternion(qP);
    b.quaternion.copy(qP.invert().multiply(qD.multiply(qW)));
    b.updateMatrixWorld(true);
  }
  function aimWorld(f, name, dirWorld) {
    const inv = f.root.quaternion.clone().invert();
    aim(f, name, dirWorld.clone().applyQuaternion(inv).toArray());
  }
  // two-bone reach: shoulder -> elbow -> hand on the target, elbow bending down and outward
  function touch(f, side, target) {
    f.root.updateMatrixWorld(true);
    const sh = new THREE.Vector3(), el = new THREE.Vector3(), ha = new THREE.Vector3();
    f.bones[`${side}Arm`].getWorldPosition(sh); f.bones[`${side}ForeArm`].getWorldPosition(el); f.bones[`${side}Hand`].getWorldPosition(ha);
    const a = sh.distanceTo(el), b = el.distanceTo(ha) + 0.07;
    const d = target.clone().sub(sh), len = Math.min(d.length(), a + b - 0.005);
    const dn = d.clone().normalize();
    const out = V([side === 'Left' ? 1 : -1, 0, 0]).applyQuaternion(f.root.quaternion);
    let pole = V([0, -1, 0]).applyQuaternion(f.root.quaternion).add(out.multiplyScalar(0.6));
    pole.sub(dn.clone().multiplyScalar(pole.dot(dn))).normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + len * len - b * b) / (2 * a * len))), A = Math.acos(cosA);
    const elbow = sh.clone().add(dn.clone().multiplyScalar(Math.cos(A) * a)).add(pole.multiplyScalar(Math.sin(A) * a));
    aimWorld(f, `${side}Arm`, elbow.clone().sub(sh));
    f.bones[`${side}ForeArm`].getWorldPosition(el);
    aimWorld(f, `${side}ForeArm`, target.clone().sub(el));
  }
  function handsMid(f) {
    const l = new THREE.Vector3(), r = new THREE.Vector3();
    f.root.updateMatrixWorld(true); f.bones.LeftHand.getWorldPosition(l); f.bones.RightHand.getWorldPosition(r);
    return l.add(r).multiplyScalar(0.5);
  }
  function target(name, i = 0) {
    if (name.startsWith('h:')) {
      const h = helper, q = h.root.quaternion, w = (n) => { const v = new THREE.Vector3(); h.root.updateMatrixWorld(true); h.bones[n].getWorldPosition(v); return v; };
      if (name === 'h:face') return w('Head').add(V([0, -0.02, 0.15]).applyQuaternion(q));
      if (name === 'h:shoulderL') return w('LeftArm').add(V([0, 0.03, 0.08]).applyQuaternion(q));
      if (name === 'h:handL') return w('LeftHand').add(V([0.0, 0.06, 0.03]).applyQuaternion(q));
      if (name === 'h:front') return w('Spine1').add(V([0, -0.05, 0.32]).applyQuaternion(q));
      if (name === 'h:cuff') return w('LeftArm').lerp(w('LeftForeArm'), 0.45);
      if (name === 'h:feet') return w('LeftFoot').lerp(w('RightFoot'), 0.5);
      if (name === 'h:head') return w('Head').add(V([0, 0.1, 0]).applyQuaternion(q));
      if (name === 'h:dosi') return w('Spine2').add(V([0.08, 0.02, 0.2]).applyQuaternion(q));
      if (name === 'h:frontL') return w('Spine1').add(V([0.05, 0.02, 0.36]).applyQuaternion(q));
    }
    if (name === 'aed') return V([-0.75, 0.95, 0.4]);
    if (name === 'panel') return V([0.35, 1.45, 0.85]);
    if (name === 'shelter') return V([0, 1.9, -0.6]);
    if (name === 'monitor') return V([-0.6, 1.45, 0.25]);
    const f = patient;
    if (name === 'chest') return sternum(f, 0.85);
    if (name === 'heart') return surface(f, bonePos(f, 'Spine1').lerp(bonePos(f, 'Spine2'), 0.2), 0.09);
    if (name === 'sticker') return STICK(f)[i];
    if (name === 'strapL') { const h = bonePos(f, 'Spine1'); return V([-0.2, h.y + 0.14, h.z]); }
    if (name === 'strapR') { const h = bonePos(f, 'Hips'); return V([-0.2, h.y + 0.14, h.z]); }
    return null;
  }
  function pose(f, spec) {
    for (const [k, q] of Object.entries(f.rest)) f.bones[k].quaternion.copy(q);
    f.root.position.set(...spec.root.pos);
    f.root.rotation.set(...spec.root.rot);
    f.root.updateMatrixWorld(true);
    for (const k of ORDER) if (spec.pose[k]) aim(f, k, spec.pose[k]);
  }
  function finish(spec, idx) {
    for (const t of spec.touch || []) { const p = target(t.at, idx); if (p) touch(helper, t.hand, p); }
    if (spec.anchor) {
      const p = target(spec.anchor.at, idx);
      if (p) { const m = handsMid(helper); helper.root.position.add(p.sub(m)).add(V([0, spec.anchor.up || 0, 0])); helper.root.updateMatrixWorld(true); }
    }
  }

  // ---- props ----
  const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: e ? c : 0x000000, emissiveIntensity: e, roughness: 0.5 });
  const props = new THREE.Group(); scene.add(props);
  const bonePos = (f, n, off = [0, 0, 0]) => { f.root.updateMatrixWorld(true); const v = new THREE.Vector3(); f.bones[n].getWorldPosition(v); return v.add(V(off).applyQuaternion(f.root.quaternion)); };
  // a point on the front of the chest: move from inside the body forward to the skin
  function surface(f, p, depth = 0.11) { return p.add(V([0, 0, depth]).applyQuaternion(f.root.quaternion)); }
  function across(f, x) { return V([x, 0, 0]).applyQuaternion(f.root.quaternion); }
  function sternum(f, k) { return surface(f, bonePos(f, 'Spine2').lerp(bonePos(f, 'Spine1'), k), 0.12); }
  // ECG sticker spots in step order (the patient's right is -x): below right collarbone, below left collarbone,
  // lower left ribs, lower right ribs, right of the breastbone
  const STICK = (f) => {
    const clav = (side) => bonePos(f, side > 0 ? 'LeftShoulder' : 'RightShoulder').lerp(bonePos(f, side > 0 ? 'LeftArm' : 'RightArm'), 0.35).add(V([0, -0.06, 0]).applyQuaternion(f.root.quaternion));
    const rib = (side) => bonePos(f, 'Spine').lerp(bonePos(f, 'Spine1'), 0.4).add(across(f, side * 0.13));
    return [surface(f, clav(-1), 0.105), surface(f, clav(1), 0.105), surface(f, rib(1), 0.1), surface(f, rib(-1), 0.1), sternum(f, 0.35).add(across(f, -0.045))];
  };
  function addProps(list, f) {
    props.clear();
    const q = f.root.quaternion;
    for (const name of list) {
      let m = null;
      if (name === 'board') { m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 1.95), mat(0x31476f)); m.position.set(0, 0.62, -0.05); if (!patient.root.visible) m.position.set(0, 0.22, -0.1); }
      if (name === 'straps') { m = new THREE.Group(); for (const b of ['Spine1', 'Hips', 'LeftLeg']) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.05, 0.08), mat(0xfbbf24, 0.2)); const at = bonePos(f, b); s.position.set(0, at.y + 0.13, at.z); m.add(s); } }
      if (name === 'ceiling') {
        const t = new THREE.Vector3(); helper.bones.LeftToeBase.getWorldPosition(t);
        const h = new THREE.Vector3(); helper.bones.Hips.getWorldPosition(h);
        m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.0), mat(0x31476f)); m.position.set(h.x, t.y + 0.06, h.z);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 8), mat(0xfbbf24, 0.3)); bar.rotation.z = P / 2; bar.position.y = -0.05; m.add(bar);
      }
      if (name === 'aed_float' || name === 'aed_on') { m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.24), mat(name === 'aed_on' ? 0x2dd4bf : 0xfc3d21, 0.35)); m.position.set(-0.75, 0.95, 0.4); m.rotation.set(0.3, 0.4, 0.1); }
      if (name === 'pads') { m = new THREE.Group(); for (const pt of [sternum(f, 0.15).add(across(f, -0.1)), sternum(f, 1.05).add(across(f, 0.14))]) { const pad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.15), mat(0xffffff, 0.3)); pad.position.copy(pt); m.add(pad); } }
      if (name.startsWith('stickers')) {
        const n = +name.slice(8), spots = STICK(f);
        m = new THREE.Group();
        spots.slice(0, n).forEach((pt, i) => {
          const d = new THREE.Mesh(new THREE.SphereGeometry(i === n - 1 ? 0.028 : 0.022, 16, 12), mat(i === n - 1 ? 0xfbbf24 : 0x2dd4bf, 0.8));
          d.position.copy(pt); m.add(d);
        });
      }
      if (name === 'trace') { m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ map: ecgTex(), side: THREE.DoubleSide })); m.position.set(-0.6, 1.45, 0.25); m.lookAt(0.5, 1.4, 2.4); }
      if (name === 'probe') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.14, 16), mat(0xe6edf7)); m.position.copy(target('heart')); m.quaternion.setFromUnitVectors(V([0, 1, 0]), V([-0.5, 0.6, -0.6]).normalize().applyQuaternion(q)); }
      if (name === 'loops') { m = new THREE.Group(); for (const x of [-0.12, 0.12]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 24), mat(0xfbbf24, 0.3)); t.rotation.x = P / 2; t.position.set(x, 0.05, 0.05); m.add(t); } }
      if (name === 'cuff') m = attach(helper, 'LeftArm', new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 20, 1, true), Object.assign(mat(0x1f3b73), { side: THREE.DoubleSide })));
      if (name === 'clip') m = attach(helper, 'LeftHand', new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), mat(0x60a5fa, 0.5)), [0, 0.12, 0]);
      if (name === 'mask') m = attach(helper, 'Head', new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12, 0, P * 2, 0, P / 2), mat(0x9fe1cb, 0.2)), [0, 0.02, 0.14], [P / 2, 0, 0]);
      if (name === 'meter') m = attach(helper, 'LeftHand', new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), mat(0xe6edf7)), [0, 0.1, 0.03]);
      if (name === 'drop') m = attach(helper, 'RightHand', new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), mat(0xfc3d21, 0.6)), [0, 0.16, 0]);
      if (name === 'dosimeter') m = attach(helper, 'Spine2', new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), mat(0xfbbf24, 0.6)), [0.08, 0.05, 0.16]);
      if (name === 'panel') { m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ map: panelTex(), side: THREE.DoubleSide })); m.position.set(0.35, 1.45, 0.85); m.lookAt(2.5, 1.5, 1.5); }
      if (name === 'wipe') m = attach(helper, 'LeftHand', new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.005, 0.09), mat(0xffffff, 0.2)), [0, 0.09, 0.03]);
      if (name === 'question') { m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: textTex(['Joint pain?', 'Tingling or itching?', 'Unusual tiredness?']), transparent: true, side: THREE.DoubleSide })); m.position.set(0.5, 1.55, 0.75); m.lookAt(2.5, 1.5, 1.5); }
      if (name === 'shelter') { m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a4682, transparent: true, opacity: 0.22, side: THREE.DoubleSide })); m.position.set(0, 1.15, -0.6);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xfbbf24 })); m.add(e); }
      if (m && !m.userData.attached) props.add(m);
    }
  }
  const attached = [];
  function attach(f, bone, mesh, off = [0, 0, 0], rot = [0, 0, 0]) {
    const ws = new THREE.Vector3(); f.root.updateMatrixWorld(true); f.bones[bone].getWorldScale(ws);
    const s = 1 / ws.x;
    mesh.scale.setScalar(s); mesh.position.set(off[0] * s, off[1] * s, off[2] * s); mesh.rotation.set(...rot);
    if (bone === 'LeftArm') { const c = f.bones.LeftForeArm.position; mesh.position.copy(c).multiplyScalar(0.45); mesh.quaternion.setFromUnitVectors(V([0, 1, 0]), c.clone().normalize()); }
    f.bones[bone].add(mesh); mesh.userData.attached = true; attached.push(mesh);
    return mesh;
  }
  function textTex(lines) {
    const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
    g.fillStyle = 'rgba(11,28,62,.92)'; g.fillRect(0, 0, 400, 240); g.strokeStyle = '#fbbf24'; g.lineWidth = 5; g.strokeRect(3, 3, 394, 234);
    g.fillStyle = '#e6edf7'; g.font = 'bold 34px sans-serif'; lines.forEach((l, i) => g.fillText(l, 22, 64 + i * 64));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function ecgTex() {
    const c = document.createElement('canvas'); c.width = 400; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#0b1c3e'; g.fillRect(0, 0, 400, 256); g.strokeStyle = '#60a5fa'; g.lineWidth = 6; g.strokeRect(3, 3, 394, 250);
    g.fillStyle = '#cfe0ff'; g.font = 'bold 26px sans-serif'; g.fillText('ECG · RECORDING 30 s', 18, 40);
    g.strokeStyle = '#2dd4bf'; g.lineWidth = 4; g.beginPath();
    for (let x = 10; x < 390; x += 2) { const k = (x % 95) / 95; const y = 160 - (k > 0.42 && k < 0.46 ? 70 : k > 0.46 && k < 0.5 ? -30 : k > 0.62 && k < 0.72 ? 14 * Math.sin((k - 0.62) * 31) : 0); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function panelTex() {
    const c = document.createElement('canvas'); c.width = 384; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#0b1c3e'; g.fillRect(0, 0, 384, 256); g.strokeStyle = '#60a5fa'; g.lineWidth = 6; g.strokeRect(3, 3, 378, 250);
    g.fillStyle = '#cfe0ff'; g.font = 'bold 30px sans-serif'; g.fillText('CABIN AIR', 24, 52);
    g.font = '28px monospace'; g.fillStyle = '#2dd4bf'; g.fillText('O2   21.0 %', 24, 120); g.fillStyle = '#fbbf24'; g.fillText('CO2  3.1 mmHg', 24, 180);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---- guidance: a pulsing marker and a label on where to act, a push arrow for CPR ----
  const marker = new THREE.Group();
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 40), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false, transparent: true }));
  const dotM = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false }));
  ringM.renderOrder = dotM.renderOrder = 10; marker.add(ringM, dotM); scene.add(marker);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), new THREE.MeshBasicMaterial({ color: 0xfc3d21, depthTest: false }));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 14), new THREE.MeshBasicMaterial({ color: 0xfc3d21, depthTest: false }));
  shaft.position.y = 0.1; head.rotation.x = P; head.position.y = 0.0; shaft.renderOrder = head.renderOrder = 11; arrow.add(shaft, head); scene.add(arrow);

  // ---- on-screen controls ----
  const ui = document.createElement('div');
  ui.className = 'avui';
  ui.innerHTML = `<div class="avtip" hidden></div><div class="avbeat" hidden></div>
    <div class="avtools" role="toolbar" aria-label="3D view controls">
      <button type="button" data-a="in" aria-label="Zoom in" title="Zoom in">+</button><button type="button" data-a="out" aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" data-a="left" aria-label="Turn left" title="Turn left">⟲</button><button type="button" data-a="right" aria-label="Turn right" title="Turn right">⟳</button>
      <button type="button" data-a="spin" aria-pressed="false" title="Spin 360°">360°</button><button type="button" data-a="reset" title="Reset the view">Reset</button></div>
    <div class="avviews" role="group" aria-label="Camera views"><button type="button" data-v="front" class="on">Front</button><button type="button" data-v="side">Side</button><button type="button" data-v="top">Top</button><button type="button" data-v="close">Close-up</button></div>
    <div class="avplay" role="group" aria-label="Playback"><button type="button" data-p="replay" title="Replay this step">↺ Replay</button><button type="button" data-p="pause" aria-pressed="false">❚❚ Pause</button><button type="button" data-p="slow" aria-pressed="false">½× Slow</button></div>
    <div class="avhint">Drag to turn 360° · scroll or pinch to zoom</div>`;
  box.appendChild(ui);
  const tipEl = ui.querySelector('.avtip'), beatEl = ui.querySelector('.avbeat');
  let speed = still ? 0 : 1, paused = still, view = 'front';
  const camTween = { t: 1, from: null, to: null, fromT: null, toT: null };
  function flyTo(pos, look, dur = 0.8) {
    camTween.from = cam.position.clone(); camTween.fromT = ctl.target.clone();
    camTween.to = pos.clone(); camTween.toT = look.clone(); camTween.t = still ? 1 : 0; camTween.dur = dur;
    if (still) { cam.position.copy(pos); ctl.target.copy(look); }
  }
  function viewPos(v) {
    const sc = cur.sc, look = V(sc.look), base = V(sc.cam), off = base.clone().sub(look), d = off.length();
    if (v === 'side') return [look.clone().add(off.clone().applyAxisAngle(V([0, 1, 0]), P / 2)), look];
    if (v === 'top') return [look.clone().add(V([0.01, d, 0.01])), look];
    if (v === 'close') { const f = cur.focus || look; const dir = base.clone().sub(f).normalize(); return [f.clone().add(dir.multiplyScalar(0.85)), f.clone()]; }
    return [base, look];
  }
  function setView(v) {
    view = v; ui.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    const [p, l] = viewPos(v); flyTo(p, l);
  }
  ui.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => setView(b.dataset.v));
  ui.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    const a = b.dataset.a, off = cam.position.clone().sub(ctl.target);
    if (a === 'in' || a === 'out') { const len = Math.min(ctl.maxDistance, Math.max(ctl.minDistance, off.length() * (a === 'in' ? 0.75 : 1.33))); flyTo(ctl.target.clone().add(off.setLength(len)), ctl.target.clone(), 0.35); }
    if (a === 'left' || a === 'right') flyTo(ctl.target.clone().add(off.applyAxisAngle(V([0, 1, 0]), a === 'left' ? -P / 4 : P / 4)), ctl.target.clone(), 0.45);
    if (a === 'spin') { ctl.autoRotate = !ctl.autoRotate; ctl.autoRotateSpeed = 4; b.setAttribute('aria-pressed', ctl.autoRotate); b.classList.toggle('on', ctl.autoRotate); }
    if (a === 'reset') { ctl.autoRotate = false; ui.querySelector('[data-a="spin"]').classList.remove('on'); setView('front'); }
  });
  ui.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
    const a = b.dataset.p;
    if (a === 'replay' && cur) setStep(cur.pid, cur.i, true);
    if (a === 'pause') { paused = !paused; b.setAttribute('aria-pressed', paused); b.classList.toggle('on', paused); b.textContent = paused ? '▶ Play' : '❚❚ Pause'; }
    if (a === 'slow') { speed = speed === 1 ? 0.35 : 1; b.setAttribute('aria-pressed', speed !== 1); b.classList.toggle('on', speed !== 1); }
  });
  renderer.domElement.addEventListener('pointerdown', () => ui.querySelector('.avhint')?.remove(), { once: true });

  // ---- steps, with smooth movement from the previous pose ----
  const snap = (f) => ({ q: Object.fromEntries(Object.entries(f.bones).map(([k, b]) => [k, b.quaternion.clone()])), p: f.root.position.clone(), r: f.root.quaternion.clone(), vis: f.root.visible });
  const apply = (f, a, b, k) => {
    for (const n in f.bones) f.bones[n].quaternion.slerpQuaternions(a.q[n], b.q[n], k);
    f.root.position.lerpVectors(a.p, b.p, k); f.root.quaternion.slerpQuaternions(a.r, b.r, k);
  };
  let cur = null, tt = 0, raf = 0, alive = true, last = performance.now(), tween = null;
  function build(sc, st, i) {
    attached.splice(0).forEach((m) => m.parent?.remove(m));
    patient.root.visible = !!(sc.patient && st.p);
    if (patient.root.visible) pose(patient, st.p);
    pose(helper, st.h);
    finish(st.h, Math.min(i, 4));
  }
  function setStep(pid, i, replay = false) {
    const sc = SCENES[pid]; if (!sc) return false;
    i = Math.min(i, sc.steps.length - 1);
    const st = sc.steps[i];
    const sameProc = cur && cur.pid === pid;
    if (replay && i > 0) build(sc, sc.steps[i - 1], i - 1);           // replay: start from the previous step's pose
    const fromH = snap(helper), fromP = snap(patient);
    build(sc, st, i);
    addProps(st.props || [], patient.root.visible ? patient : helper);
    const toH = snap(helper), toP = snap(patient);
    tween = (sameProc || replay) && !still ? { t: 0, dur: 0.9, fromH, toH, fromP: fromP.vis ? fromP : toP, toP } : null;
    if (tween) { apply(helper, fromH, toH, 0); if (patient.root.visible) apply(patient, tween.fromP, toP, 0); }
    const focus = st.focus ? target(st.focus, Math.min(i, 4)) : null;
    cur = { pid, i, sc, st, base: toH.p.clone(), focus, focusName: st.focus };
    tt = 0;
    if (!sameProc) { const [p, l] = [V(sc.cam), V(sc.look)]; cam.position.copy(p); ctl.target.copy(l); ctl.update(); view = 'front'; ui.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === 'front')); }
    else if (view === 'close') setView('close');
    tipEl.textContent = st.tip || ''; tipEl.hidden = !st.tip;
    arrow.visible = !!st.h.pump; beatEl.hidden = !st.h.pump;
    return st.label;
  }
  const proj = new THREE.Vector3();
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = paused ? 0 : speed;
    tt += dt * k;
    if (tween) {
      tween.t += dt * k;
      const e = Math.min(1, tween.t / tween.dur), ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      apply(helper, tween.fromH, tween.toH, ease);
      if (patient.root.visible) apply(patient, tween.fromP, tween.toP, ease);
      if (e >= 1) { tween = null; tt = 0; }
    } else if (cur && !still) {
      const st = cur.st, t = tt;
      if (st.h.pump) {
        const ph = (t * BPM / 60) % 1, push = Math.max(0, Math.sin(ph * 2 * P));
        helper.root.position.y = cur.base.y - push * 0.05;
        beatEl.textContent = `${Math.floor(t * BPM / 60) % 30 + 1} / 30 · ${BPM} a minute`;
        if (cur.focus) { arrow.position.copy(cur.focus).add(V([0.16, 0.12 - push * 0.05, 0])); arrow.scale.setScalar(1 + push * 0.2); }
      } else if (st.h.glide) { const g = Math.min(1, t / 3), [a, b] = st.h.glide; helper.root.position.set(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g); }
      else if (st.h.sway) helper.root.rotation.z = Math.sin(t * 1.3) * 0.025;
      else if (weightless) helper.root.position.y = cur.base.y + Math.sin(t * 0.9) * 0.02;
      if (weightless && patient.root.visible && cur.sc !== SCENES['CPR-MG-01']) patient.root.position.y = Math.sin(t * 0.8 + 1) * 0.015 + 0.015;
    }
    // marker and label follow the focus point (it moves with the body)
    if (cur && cur.focusName) {
      const f = target(cur.focusName, Math.min(cur.i, 4)) || cur.focus;
      if (f) {
        cur.focus = f; marker.visible = true; marker.position.copy(f); marker.quaternion.copy(cam.quaternion);
        const pulse = 1 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 260)); ringM.scale.setScalar(pulse);
        proj.copy(f).project(cam);
        const x = (proj.x + 1) / 2 * W(), y = (1 - proj.y) / 2 * H();
        tipEl.style.transform = `translate(${Math.round(Math.min(W() - 20, Math.max(20, x + 18)))}px, ${Math.round(Math.min(H() - 30, Math.max(10, y - 34)))}px)`;
        tipEl.style.visibility = proj.z < 1 ? 'visible' : 'hidden';
      }
    } else marker.visible = false;
    if (camTween.to && camTween.t < 1) {
      camTween.t = Math.min(1, camTween.t + dt / (camTween.dur || 0.8));
      const e = 1 - Math.pow(1 - camTween.t, 3);
      cam.position.lerpVectors(camTween.from, camTween.to, e); ctl.target.lerpVectors(camTween.fromT, camTween.toT, e);
    }
    ctl.update();
    renderer.render(scene, cam);
  }
  loop();
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); });
  ro.observe(box);
  return {
    setStep,
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); renderer.dispose(); renderer.domElement.remove(); ui.remove(); },
  };
}

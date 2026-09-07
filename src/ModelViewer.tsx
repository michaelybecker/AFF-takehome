import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Box, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from './Media';

export default function ModelViewer() {
  const host = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, dragged: false });
  const actions = useRef<{ reset: () => void; zoom: (scale: number) => void; background: (white: boolean) => void } | null>(null);
  const [background, setBackground] = useState(false);
  const [status, setStatus] = useState('Loading source asset');
  const [failed, setFailed] = useState(false);
  const [lighting, setLighting] = useState('Studio HDR');
  const expand = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else wrapper.current?.requestFullscreen().catch(() => {}); };
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { setFailed(true); setStatus('3D rendering is unavailable in this browser.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Iron Man Mark III interactive 3D asset');
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080808');
    const camera = new THREE.PerspectiveCamera(35, 1, .01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.maxPolarAngle = Math.PI * .95;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    let environment = pmrem.fromScene(room);
    room.dispose();
    scene.environment = environment.texture;
    let alive = true;
    let model: THREE.Group | undefined;
    let visible = true;
    let frame = 0;
    let home = new THREE.Vector3(3, 1, 5);
    const focus = new THREE.Vector3();
    new RGBELoader().load('/media/model/studio.hdr', texture => {
      if (!alive) { texture.dispose(); return; }
      environment.dispose(); environment = pmrem.fromEquirectangular(texture); texture.dispose(); scene.environment = environment.texture;
    }, undefined, () => { if (alive) setLighting('Neutral studio'); });
    new GLTFLoader().load('/media/model/iron-man.glb', gltf => {
      if (!alive) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      scene.add(model);
      const height = size.y;
      const aspect = container.clientWidth / container.clientHeight;
      const distance = Math.max(height, size.x / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.4;
      home = new THREE.Vector3(distance * .23, height * .05, distance);
      camera.position.copy(home); camera.near = height / 1000; camera.far = height * 100; camera.updateProjectionMatrix();
      controls.minDistance = height * .5; controls.maxDistance = height * 8;
      controls.target.copy(focus); controls.update();
      setStatus(''); renderer.domElement.dataset.loaded = 'true';
    }, undefined, () => { if (alive) { setFailed(true); setStatus('The source asset could not be loaded.'); } });
    const resize = () => { const w = container.clientWidth; const h = container.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    const ro = new ResizeObserver(resize); ro.observe(container); resize();
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); io.observe(container);
    actions.current = {
      reset: () => { camera.position.copy(home); controls.target.copy(focus); controls.update(); },
      zoom: scale => { const offset = camera.position.clone().sub(controls.target).multiplyScalar(scale); const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(offset.setLength(distance)); controls.update(); },
      background: white => { scene.background = new THREE.Color(white ? '#f8f8f8' : '#080808'); },
    };
    const key = (event: KeyboardEvent) => { if (!['ArrowLeft', 'ArrowRight', '+', '-', 'Home'].includes(event.key)) return; event.preventDefault(); if (event.key === 'Home') actions.current?.reset(); else if (event.key === '+' || event.key === '-') actions.current?.zoom(event.key === '+' ? .85 : 1.15); else { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -.12 : .12); camera.position.copy(controls.target).add(offset); controls.update(); } };
    renderer.domElement.addEventListener('keydown', key);
    const animate = () => { frame = requestAnimationFrame(animate); if (visible && !document.hidden) { controls.update(); renderer.render(scene, camera); } }; animate();
    return () => { alive = false; cancelAnimationFrame(frame); ro.disconnect(); io.disconnect(); controls.dispose(); if (model) disposeModel(model); environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); actions.current = null; };
  }, []);
  return <div className={`model-viewer ${background ? 'light-model' : ''}`} ref={wrapper}>
    <div className="model-topline"><span><Box size={15} /> SOURCE ASSET</span><span>{lighting}</span></div>
    <div className="model-canvas" ref={host} onPointerDown={e => { gesture.current = { x: e.clientX, y: e.clientY, dragged: e.button !== 0 || !e.isPrimary }; }} onPointerMove={e => { if (e.buttons && Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 5) gesture.current.dragged = true; }} onPointerCancel={() => { gesture.current.dragged = true; }} onClick={e => { if (e.detail === 0 || (!gesture.current.dragged && e.detail === 1)) expand(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expand(); } }} />
    {status && <div className={`model-status ${failed ? 'error' : ''}`}>{!failed && <span className="spinner" />}{status}</div>}
    <div className="model-bottomline"><span className="model-filename">iron_man.glb<span>Production asset analogue</span></span><div className="viewer-toolbar"><button className={`swatch black ${!background ? 'chosen' : ''}`} aria-label="Black background" title="Black background" onClick={() => { setBackground(false); actions.current?.background(false); }} /><button className={`swatch white ${background ? 'chosen' : ''}`} aria-label="White background" title="White background" onClick={() => { setBackground(true); actions.current?.background(true); }} /><span className="tool-divider" /><IconButton label="Zoom out 3D" onClick={() => actions.current?.zoom(1.15)}><ZoomOut /></IconButton><IconButton label="Zoom in 3D" onClick={() => actions.current?.zoom(.85)}><ZoomIn /></IconButton><IconButton label="Reset 3D view" onClick={() => actions.current?.reset()}><RotateCcw /></IconButton><IconButton label="Fullscreen 3D" onClick={expand}><Maximize2 /></IconButton></div></div>
  </div>;
}

function disposeModel(object: THREE.Object3D) {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

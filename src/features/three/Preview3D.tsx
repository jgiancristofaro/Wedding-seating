// Read-only 3D preview. Lazy-loaded so three.js (~150 KB gz) never touches the initial bundle.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Eye, Rotate3d, X } from 'lucide-react';
import { NEUTRAL_SEAT } from '../../lib/colors';
import { isSegment } from '../../model/factory';
import { seatPositions } from '../../model/seats';
import { planIndex } from '../../model/selectors';
import type { PlanDoc } from '../../model/types';
import { usePlan } from '../../store/planStore';
import { contentBounds } from '../canvas/bounds';

const ELEMENT_HEIGHT: Record<string, number> = {
  stage: 60,
  danceFloor: 2,
  bar: 110,
  buffet: 90,
  dj: 100,
  photoBooth: 220,
  entrance: 1,
  cake: 90,
  gifts: 75,
  label: 0,
};
const ELEMENT_COLOR: Record<string, number> = {
  stage: 0x8c7b6b,
  danceFloor: 0xd8d2c8,
  bar: 0x8a5a44,
  buffet: 0xb08a72,
  dj: 0x4a4a4a,
  photoBooth: 0xc9b6d9,
  entrance: 0x9fbfa6,
  cake: 0xf3e6dc,
  gifts: 0xe8c9a6,
};

function label(text: string, opts: { size?: number; bg?: string; color?: string } = {}) {
  const c = document.createElement('canvas');
  const fs = 44;
  const ctx = c.getContext('2d')!;
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w;
  c.height = fs + 22;
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = opts.bg ?? 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 14);
  ctx.fill();
  ctx.fillStyle = opts.color ?? '#24211d';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 14, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  const size = opts.size ?? 22;
  s.scale.set((size * c.width) / c.height, size, 1);
  return s;
}

function buildScene(doc: PlanDoc, showNames: boolean) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4efe8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc4, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(800, 2000, 600);
  scene.add(sun);

  const b = contentBounds(doc, false) ?? { x: -500, y: -500, w: 1000, h: 1000 };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w + 600, b.h + 600),
    new THREE.MeshStandardMaterial({ color: 0xefe7dc, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(b.x + b.w / 2, 0, b.y + b.h / 2);
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f3, roughness: 0.9 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a6a55 });
  const winMat = new THREE.MeshStandardMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0.55 });
  for (const e of Object.values(doc.elements)) {
    if (isSegment(e.kind)) {
      const x2 = e.x2 ?? e.x;
      const y2 = e.y2 ?? e.y;
      const len = Math.hypot(x2 - e.x, y2 - e.y);
      if (len < 1) continue;
      const ang = Math.atan2(y2 - e.y, x2 - e.x);
      const mk = (h: number, y0: number, mat: THREE.Material, thick: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, thick), mat);
        m.position.set((e.x + x2) / 2, y0 + h / 2, (e.y + y2) / 2);
        m.rotation.y = -ang;
        scene.add(m);
      };
      if (e.kind === 'wall') mk(280, 0, wallMat, Math.max(8, e.w));
      else if (e.kind === 'door') mk(210, 0, doorMat, 6);
      else mk(110, 90, winMat, Math.max(6, e.w));
      continue;
    }
    if (e.kind === 'label') continue;
    const h = ELEMENT_HEIGHT[e.kind] ?? 75;
    const geo =
      e.kind === 'cake'
        ? new THREE.CylinderGeometry(e.w / 2, e.w / 2, h, 32)
        : new THREE.BoxGeometry(e.w, Math.max(1, h), e.h);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: ELEMENT_COLOR[e.kind] ?? 0xcccccc }),
    );
    m.position.set(e.x, Math.max(1, h) / 2, e.y);
    m.rotation.y = (-e.rotation * Math.PI) / 180;
    scene.add(m);
    const l = label(e.label ?? e.kind.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), {
      size: 30,
      bg: 'rgba(36,33,29,0.75)',
      color: '#fff',
    });
    l.position.set(e.x, h + 40, e.y);
    scene.add(l);
  }

  const index = planIndex(doc);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd9d1c5 });
  const chairGeo = new THREE.BoxGeometry(42, 45, 42);
  const backGeo = new THREE.BoxGeometry(42, 45, 6);
  const colorMats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (c: string) => {
    let m = colorMats.get(c);
    if (!m)
      colorMats.set(c, (m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.8 })));
    return m;
  };
  const emptyMat = new THREE.MeshStandardMaterial({ color: 0xe9e3da, transparent: true, opacity: 0.6 });
  for (const t of Object.values(doc.tables)) {
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.y);
    g.rotation.y = (-t.rotation * Math.PI) / 180;
    scene.add(g);
    const top =
      t.shape === 'round' || t.shape === 'oval'
        ? new THREE.Mesh(new THREE.CylinderGeometry(t.w / 2, t.w / 2, 4, 48), tableMat)
        : new THREE.Mesh(new THREE.BoxGeometry(t.w, 4, t.h), tableMat);
    if (t.shape === 'oval') top.scale.z = t.h / t.w;
    top.position.y = 75;
    g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(6, 10, 73, 12), legMat);
    leg.position.y = 36;
    g.add(leg);
    const seats = index.seating.get(t.id);
    seatPositions(t, t.capacity).forEach((s, i) => {
      const guest = seats?.get(i);
      const color = guest
        ? guest.groupId && doc.groups[guest.groupId]
          ? doc.groups[guest.groupId].color
          : NEUTRAL_SEAT
        : null;
      const chair = new THREE.Group();
      chair.position.set(s.x, 0, s.y);
      chair.rotation.y = (-(s.angle + 90) * Math.PI) / 180;
      const seatMesh = new THREE.Mesh(chairGeo, color ? mat(color) : emptyMat);
      seatMesh.position.y = 22;
      const back = new THREE.Mesh(backGeo, color ? mat(color) : emptyMat);
      back.position.set(0, 67, 21);
      chair.add(seatMesh, back);
      g.add(chair);
      if (guest && showNames) {
        const l = label(guest.firstName || '?', { size: 16 });
        const wp = new THREE.Vector3(s.x, 0, s.y).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          (-t.rotation * Math.PI) / 180,
        );
        l.position.set(t.x + wp.x, 120, t.y + wp.z);
        scene.add(l);
      }
    });
    const tl = label(t.name, { size: 30, bg: 'rgba(138,90,68,0.92)', color: '#fff' });
    tl.position.set(t.x, 150, t.y);
    scene.add(tl);
  }
  return { scene, bounds: b };
}

export default function Preview3D({ onClose }: { onClose: () => void }) {
  const doc = usePlan((s) => s.doc!);
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{ topDown: () => void; orbit: () => void } | null>(null);
  const [names, setNames] = useState(Object.keys(doc.guests).length <= 400);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setErr('3D isn’t available on this device (WebGL is turned off).');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const { scene, bounds } = buildScene(doc, names);
    const cx = bounds.x + bounds.w / 2;
    const cz = bounds.y + bounds.h / 2;
    const span = Math.max(bounds.w, bounds.h, 600);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 10, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    const orbit = () => {
      camera.position.set(cx + span * 0.35, span * 0.75, cz + span * 0.95);
      controls.update();
    };
    const topDown = () => {
      camera.position.set(cx, span * 1.25, cz + 1);
      controls.update();
    };
    orbit();
    api.current = { orbit, topDown };
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => {
          (x as THREE.SpriteMaterial).map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [doc, names]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="3D preview"
      data-testid="preview-3d"
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <h2 className="mr-auto font-display text-xl font-semibold">3D preview</h2>
        <button className="btn-secondary h-9 min-h-0" onClick={() => api.current?.orbit()}>
          <Rotate3d size={16} /> Orbit
        </button>
        <button className="btn-secondary h-9 min-h-0" onClick={() => api.current?.topDown()}>
          <Eye size={16} /> Top-down
        </button>
        <button
          className="btn-secondary h-9 min-h-0"
          aria-pressed={names}
          onClick={() => setNames((n) => !n)}
        >
          Names
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close 3D preview">
          <X size={18} />
        </button>
      </header>
      <div ref={mount} className="relative min-h-0 flex-1 touch-none">
        {err && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
            {err}
          </p>
        )}
      </div>
      <p className="border-t border-line bg-surface px-3 py-1.5 text-center text-xs text-muted">
        Drag to orbit · pinch or scroll to zoom · two-finger drag to pan. Read-only.
      </p>
    </div>
  );
}

import {
  AmbientLight,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  OrthographicCamera,
  PCFSoftShadowMap,
  Scene as ThreeScene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { WorldPalette } from './palette';

/**
 * Renderer, camera and lighting. Two things are deliberate here:
 *
 * 1. The camera angle is a constant. Zoom and pan move the view, the direction
 *    never changes, so a compass direction in a script always points the same
 *    way on screen.
 * 2. There is no post-processing. Depth comes from real shadows and a shallow
 *    fog in the background colour, which keeps the frame budget for the factory.
 */

/** Normalised camera offset: roughly 35° above the ground, turned 45°. */
const VIEW_DIRECTION = new Vector3(1, 1.35, 1).normalize();
const CAMERA_DISTANCE = 40;

export const MIN_VIEW_SIZE = 4;
export const MAX_VIEW_SIZE = 26;

export interface SceneOptions {
  container: HTMLElement;
  palette: WorldPalette;
}

export class Scene {
  readonly renderer: WebGLRenderer;
  readonly scene = new ThreeScene();
  readonly camera: OrthographicCamera;
  /** Everything the world consists of. Cleared and rebuilt on a grid change. */
  readonly world = new Group();

  private readonly container: HTMLElement;
  private readonly hemisphere: HemisphereLight;
  private readonly ambient: AmbientLight;
  private readonly key: DirectionalLight;
  private readonly fill: DirectionalLight;
  private readonly lightRig = new Group();
  private readonly resizeObserver: ResizeObserver;

  private readonly target = new Vector3();
  private viewSize = 11;
  private frame = 0;
  private disposed = false;

  constructor(options: SceneOptions) {
    this.container = options.container;

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    this.hemisphere = new HemisphereLight(0xffffff, 0xffffff, 0.55);
    this.ambient = new AmbientLight(0xffffff, 0.15);

    this.key = new DirectionalLight(0xffffff, 1.1);
    this.key.position.set(6, 11, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 4;
    this.key.shadow.bias = -0.0012;
    this.key.shadow.normalBias = 0.02;

    this.fill = new DirectionalLight(0xffffff, 0.22);
    this.fill.position.set(-7, 5, -6);

    this.lightRig.add(this.key, this.key.target, this.fill, this.fill.target);
    this.scene.add(this.lightRig, this.hemisphere, this.ambient, this.world);

    this.applyPalette(options.palette);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  // Theme -------------------------------------------------------------------

  /**
   * Recolours the lighting for the current theme. The dark preset drops ambient
   * light hard so the emissive furnaces and the accent stripe carry the image.
   */
  applyPalette(palette: WorldPalette): void {
    const dark = palette.shadow > 0.33;

    this.scene.background = palette.sky;
    this.scene.fog = new Fog(palette.sky, CAMERA_DISTANCE * 0.9, CAMERA_DISTANCE * 2.1);

    this.hemisphere.color.copy(palette.sky);
    this.hemisphere.groundColor.copy(palette.floor);
    this.hemisphere.intensity = dark ? 0.25 : 0.55;

    this.ambient.intensity = dark ? 0.08 : 0.15;
    this.key.intensity = dark ? 0.5 : 1.1;
    this.fill.intensity = dark ? 0.12 : 0.22;
  }

  // Camera ------------------------------------------------------------------

  getTarget(): Vector3 {
    return this.target;
  }

  setTarget(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.updateCamera();
  }

  getViewSize(): number {
    return this.viewSize;
  }

  setViewSize(size: number): void {
    this.viewSize = Math.min(MAX_VIEW_SIZE, Math.max(MIN_VIEW_SIZE, size));
    this.resize();
  }

  /** Frames the whole grid with a little air around it. */
  frameGrid(width: number, height: number): void {
    this.setTarget((width - 1) / 2, (height - 1) / 2);
    this.setViewSize(Math.max(width, height) * 0.72 + 2);
  }

  private updateCamera(): void {
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIRECTION, CAMERA_DISTANCE);
    this.camera.lookAt(this.target);

    // Shadows only need to cover what the camera can see.
    this.lightRig.position.copy(this.target);
    const reach = this.viewSize * 1.3;
    const shadow = this.key.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.near = 0.5;
    shadow.far = CAMERA_DISTANCE * 1.5;
    shadow.updateProjectionMatrix();
  }

  // Frame -------------------------------------------------------------------

  resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const aspect = width / height;

    this.camera.left = -this.viewSize * aspect;
    this.camera.right = this.viewSize * aspect;
    this.camera.top = this.viewSize;
    this.camera.bottom = -this.viewSize;
    this.camera.updateProjectionMatrix();
    this.updateCamera();

    this.renderer.setSize(width, height, false);
  }

  /** Starts the render loop. `onFrame` receives seconds since the last frame. */
  start(onFrame: (delta: number) => void): void {
    let last = performance.now();

    const loop = (now: number) => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(loop);
      // Clamp: a backgrounded tab returns with a huge delta otherwise.
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      onFrame(delta);
      this.renderer.render(this.scene, this.camera);
    };

    this.frame = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

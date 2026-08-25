import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  type Object3D,
  OrthographicCamera,
  Scene as ThreeScene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';

/**
 * A one-shot offscreen renderer that turns a single 3D asset into a small PNG.
 *
 * It mirrors the main scene's iso camera direction and flat, bright key light so
 * a thumbnail reads the same as the object does in the viewport — just framed
 * tight and rendered onto transparency, so the asset rail can drop it straight
 * onto a card. Deliberately simple: no shadows, no fog, one render per call.
 */

/** The same 35°-above, 45°-turned view the live scene uses. */
const VIEW_DIRECTION = new Vector3(1, 1.35, 1).normalize();

export class Thumbnailer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new ThreeScene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private readonly holder = new Group();

  private readonly box = new Box3();
  private readonly sphere = new Sphere();

  constructor(size = 160) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);

    const hemisphere = new HemisphereLight(0xffffff, 0x8a8f9c, 0.6);
    const ambient = new AmbientLight(0xffffff, 0.22);
    const key = new DirectionalLight(0xffffff, 1.15);
    key.position.set(6, 11, 4);
    const fill = new DirectionalLight(0xffffff, 0.28);
    fill.position.set(-7, 5, -6);

    this.scene.add(hemisphere, ambient, key, fill, this.holder);
  }

  /** Renders `object`, returns a PNG data URL, and disposes the object's GPU data. */
  render(object: Object3D): string {
    this.holder.add(object);

    // A bounding sphere frames the object the same from any view angle, so tall
    // trees and flat tiles both sit centred with an even margin.
    this.box.setFromObject(object);
    this.box.getBoundingSphere(this.sphere);
    const half = Math.max(this.sphere.radius * 1.12, 0.1);

    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.position.copy(this.sphere.center).addScaledVector(VIEW_DIRECTION, 20);
    this.camera.lookAt(this.sphere.center);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');

    this.holder.remove(object);
    disposeObject(object);
    return url;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

/** Frees the geometries and materials of a throwaway thumbnail object. */
function disposeObject(object: Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const material = node.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}

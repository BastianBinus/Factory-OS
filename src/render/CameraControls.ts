import { Vector3 } from 'three';
import type { Scene } from './Scene';

/**
 * Drag to pan, wheel to zoom. The view angle is never touched — that is the
 * whole point of this file existing instead of OrbitControls.
 *
 * Screen axes on the ground plane, for the fixed 45° camera:
 *   right on screen → (1, 0, -1)   up on screen → (-1, 0, -1)
 * Vertical screen movement is foreshortened by the camera tilt, so pixels are
 * divided by sin(elevation) before they become world units.
 */

const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
const SCREEN_UP = new Vector3(-1, 0, -1).normalize();
const SIN_ELEVATION = new Vector3(1, 1.35, 1).normalize().y;

const ZOOM_PER_NOTCH = 0.0012;
/** How far past the last tile the camera may wander. */
const PAN_MARGIN = 3;

export class CameraControls {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: Scene;
  private readonly cleanups: (() => void)[] = [];

  private bounds = { width: 8, height: 8 };
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private dragged = false;

  constructor(scene: Scene) {
    this.scene = scene;
    this.canvas = scene.renderer.domElement;
    this.canvas.style.cursor = 'grab';
    this.canvas.style.touchAction = 'none';

    this.listen('pointerdown', this.onPointerDown);
    this.listen('pointermove', this.onPointerMove);
    this.listen('pointerup', this.onPointerUp);
    this.listen('pointercancel', this.onPointerUp);
    this.listen('wheel', this.onWheel, { passive: false });
  }

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    const bound = handler.bind(this) as EventListener;
    this.canvas.addEventListener(type, bound, options);
    this.cleanups.push(() => this.canvas.removeEventListener(type, bound, options));
  }

  setBounds(width: number, height: number): void {
    this.bounds = { width, height };
    this.clampTarget();
  }

  /** True while a drag is in progress — click handlers use it to ignore drags. */
  isDragging(): boolean {
    return this.dragPointer !== null && this.dragged;
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    this.dragPointer = event.pointerId;
    this.dragged = false;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;

    const worldPerPixel = (this.scene.getViewSize() * 2) / (this.canvas.clientHeight || 1);
    const target = this.scene.getTarget();

    // The world follows the cursor, so the camera moves the opposite way.
    const x =
      target.x - SCREEN_RIGHT.x * dx * worldPerPixel + SCREEN_UP.x * ((dy * worldPerPixel) / SIN_ELEVATION);
    const z =
      target.z - SCREEN_RIGHT.z * dx * worldPerPixel + SCREEN_UP.z * ((dy * worldPerPixel) / SIN_ELEVATION);

    this.scene.setTarget(x, z);
    this.clampTarget();
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.style.cursor = 'grab';
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    // Exponential so every notch feels the same however far you are zoomed in.
    const factor = Math.exp(event.deltaY * ZOOM_PER_NOTCH);
    this.scene.setViewSize(this.scene.getViewSize() * factor);
    this.clampTarget();
  }

  private clampTarget(): void {
    const target = this.scene.getTarget();
    const maxX = this.bounds.width - 1 + PAN_MARGIN;
    const maxZ = this.bounds.height - 1 + PAN_MARGIN;
    const x = Math.min(maxX, Math.max(-PAN_MARGIN, target.x));
    const z = Math.min(maxZ, Math.max(-PAN_MARGIN, target.z));
    if (x !== target.x || z !== target.z) this.scene.setTarget(x, z);
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }
}

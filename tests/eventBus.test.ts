import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/utils/EventBus';

type Events = {
  tick: { count: number };
  log: string;
};

describe('EventBus', () => {
  it('delivers payloads to every subscriber', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();

    bus.on('tick', a);
    bus.on('tick', b);
    bus.emit('tick', { count: 1 });

    expect(a).toHaveBeenCalledWith({ count: 1 });
    expect(b).toHaveBeenCalledWith({ count: 1 });
  });

  it('does not leak across event types', () => {
    const bus = new EventBus<Events>();
    const onLog = vi.fn();

    bus.on('log', onLog);
    bus.emit('tick', { count: 1 });

    expect(onLog).not.toHaveBeenCalled();
  });

  it('stops delivering after the returned unsubscribe runs', () => {
    const bus = new EventBus<Events>();
    const listener = vi.fn();

    const off = bus.on('log', listener);
    bus.emit('log', 'first');
    off();
    bus.emit('log', 'second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('log')).toBe(0);
  });

  it('fires a once-listener exactly one time', () => {
    const bus = new EventBus<Events>();
    const listener = vi.fn();

    bus.once('log', listener);
    bus.emit('log', 'a');
    bus.emit('log', 'b');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('a');
  });

  // The engine unsubscribes from inside handlers (e.g. a script stopping mid-tick),
  // so emit must iterate over a snapshot rather than the live set.
  it('survives a listener that unsubscribes during emit', () => {
    const bus = new EventBus<Events>();
    const second = vi.fn();

    const offFirst = bus.on('log', () => offFirst());
    bus.on('log', second);

    expect(() => bus.emit('log', 'x')).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('log')).toBe(1);
  });
});

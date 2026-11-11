// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TimerSound, vibrateAlert } from '../apps/web/src/timer-alerts';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Dialog } from '../apps/web/src/components/ui/dialog';
import { Button } from '../apps/web/src/components/ui/button';
import {
  NumberInput,
  RestMinutesInput,
  AutosaveTextarea,
} from '../apps/web/src/components/autosave-input';
afterEach(cleanup);

describe('timer alert playback', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reuses unlocked media and does not let a pending unlock silence the alarm', async () => {
    let finishUnlock!: () => void;
    const media = {
      play: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              finishUnlock = resolve;
            }),
        )
        .mockResolvedValue(undefined),
      pause: vi.fn(),
      currentTime: 0,
      setAttribute: vi.fn(),
      preload: '',
    };
    const AudioStub = vi.fn(function () {
      return media;
    });
    vi.stubGlobal('Audio', AudioStub);
    const sound = new TimerSound();
    const unlocking = sound.unlock();
    await sound.play();
    await sound.unlock();
    const pauses = media.pause.mock.calls.length;
    finishUnlock();
    await unlocking;
    expect(media.pause).toHaveBeenCalledTimes(pauses);
    expect(AudioStub).toHaveBeenCalledTimes(1);
    await sound.play();
    expect(AudioStub).toHaveBeenCalledTimes(1);
    expect(media.play).toHaveBeenCalledTimes(3);
  });
  it('reports blocked playback and allows an explicit retry', async () => {
    const media = {
      play: vi
        .fn()
        .mockRejectedValueOnce(new Error('NotAllowedError'))
        .mockResolvedValue(undefined),
      pause: vi.fn(),
      load: vi.fn(),
      currentTime: 0,
      setAttribute: vi.fn(),
    };
    vi.stubGlobal('Audio', function () {
      return media;
    });
    const sound = new TimerSound();
    await expect(sound.play()).rejects.toThrow('NotAllowedError');
    await expect(sound.play()).resolves.toBeUndefined();
    expect(media.load).toHaveBeenCalledTimes(1);
  });
  it('does not prime and pause a test sound that is still starting', async () => {
    let started!: () => void;
    const media = {
      play: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            started = resolve;
          }),
      ),
      pause: vi.fn(),
      currentTime: 0,
      setAttribute: vi.fn(),
    };
    vi.stubGlobal('Audio', function () {
      return media;
    });
    const sound = new TimerSound();
    const playing = sound.play();
    const unlocking = sound.unlock();
    started();
    await expect(unlocking).resolves.toBe(false);
    await playing;
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
  });
  it('handles missing or rejected vibration without throwing', () => {
    vi.stubGlobal('navigator', {});
    expect(vibrateAlert()).toBe(false);
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('Blocked');
      },
    });
    expect(vibrateAlert()).toBe(false);
  });
  it('stops a repeating alarm without reporting intentional cancellation as blocked audio', async () => {
    let rejectPlay!: (error: Error) => void;
    const media = {
      play: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            rejectPlay = reject;
          }),
      ),
      pause: vi.fn(),
      currentTime: 0,
      loop: false,
      volume: 0,
      setAttribute: vi.fn(),
    };
    vi.stubGlobal('Audio', function () {
      return media;
    });
    const sound = new TimerSound();
    const playing = sound.play(true);
    expect(media.loop).toBe(true);
    expect(media.volume).toBe(1);
    sound.stop();
    rejectPlay(new Error('AbortError'));
    await expect(playing).resolves.toBeUndefined();
    expect(media.loop).toBe(false);
  });
});
describe('accessible UI primitives', () => {
  it('edits minute durations while preserving seconds and focused decimal drafts', () => {
    const saved: number[] = [];
    const { rerender } = render(
      <RestMinutesInput
        aria-label="Rest minutes"
        seconds={90}
        onSecondsChange={(s) => saved.push(s)}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Rest minutes' });
    expect(input).toHaveValue(1.5);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.25' } });
    rerender(
      <RestMinutesInput
        aria-label="Rest minutes"
        seconds={60}
        onSecondsChange={(s) => saved.push(s)}
      />,
    );
    expect(input).toHaveValue(1.25);
    expect(saved).toEqual([75]);
  });
  it('keeps the latest numeric keystrokes when an older autosave arrives', () => {
    const saved: number[] = [];
    const { rerender } = render(
      <NumberInput aria-label="Weight" value={0} onValueChange={(v) => saved.push(v)} />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Weight' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '20' } });
    rerender(<NumberInput aria-label="Weight" value={2} onValueChange={(v) => saved.push(v)} />);
    expect(input).toHaveValue(20);
    expect(saved).toEqual([2, 20]);
  });
  it('keeps new note text while an older saved value is acknowledged', () => {
    const { rerender } = render(
      <AutosaveTextarea aria-label="Notes" value="" onValueChange={() => {}} />,
    );
    const input = screen.getByRole('textbox', { name: 'Notes' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Felt strong' } });
    rerender(<AutosaveTextarea aria-label="Notes" value="Felt" onValueChange={() => {}} />);
    expect(input).toHaveValue('Felt strong');
  });
  it('preserves disabled touch-target button behavior', () => {
    render(<Button disabled>Finish workout</Button>);
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeDisabled();
  });
  it('does not submit a form unless explicitly requested', () => {
    let submitted = 0;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted++;
        }}
      >
        <Button>Archive exercise</Button>
        <Button type="submit">Save exercise</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive exercise' }));
    expect(submitted).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save exercise' }));
    expect(submitted).toBe(1);
  });
  it('gives dialogs a name, description, close control and focus trap', () => {
    render(
      <Dialog
        open
        onOpenChange={() => {}}
        title="Finish your workout?"
        description="Your results will be saved."
      >
        <Button>Confirm</Button>
      </Dialog>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Finish your workout?' }),
    ).toHaveAccessibleDescription('Your results will be saved.');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });
});

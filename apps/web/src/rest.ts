// Keep persisted durations in whole seconds; expose minutes in editing controls.
export const restMinutes = (seconds: number) => Number((seconds / 60).toFixed(4));

/** Shared UI colours and font stacks (system fonts only: the game works offline). */
export const COLORS = {
    ink: '#151515',
    paper: '#f1ecd8',
    paperLine: '#c9c2a8',
    navy: '#0b1440',
    navyLight: '#1f3a8a',
    white: '#ffffff',
    chrome: '#dfe7f2',
    accent: '#e8b21f',
    danger: '#d8261c',
    lcd: '#9dff7a',
    lcdDim: '#1d3a1a',
    led: '#ff2a1a',
    graph: '#1b33c7',
    shadow: 'rgba(0, 0, 0, 0.55)',
    veil: 'rgba(6, 10, 24, 0.72)',
};

export const FONTS = {
    mono: '"Courier New", Courier, "Liberation Mono", monospace',
    display: 'Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif',
    ui: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    gauge: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
};

/** CSS font shorthand from a weight, size (logical px) and family token. */
export const font = (size, family = 'ui', weight = 'normal') => {
    return `${weight} ${size}px ${FONTS[family]}`;
};

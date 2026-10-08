/** Formatting of times and distances shown to the player. */

/** 83.45 -> "1:23.4" */
export function formatClock(seconds) {
    const whole = Math.max(0, seconds);
    const minutes = Math.floor(whole / 60);
    const rest = whole - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** Metres -> miles with one decimal. */
export function formatMiles(metres) {
    return (Math.max(0, metres) / 1609.34).toFixed(1);
}

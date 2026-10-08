/** Plain {x, y, z} vector maths for the simulation (three.js stays in the renderer). */

export const vec = (x = 0, y = 0, z = 0) => {
    return { x, y, z };
};

export const add = (a, b) => {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
};

export const sub = (a, b) => {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
};

export const scale = (a, k) => {
    return { x: a.x * k, y: a.y * k, z: a.z * k };
};

export const dot = (a, b) => {
    return a.x * b.x + a.y * b.y + a.z * b.z;
};

export const cross = (a, b) => {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
};

export const length = (a) => {
    return Math.hypot(a.x, a.y, a.z);
};

export const normalize = (a) => {
    const n = length(a) || 1;
    return scale(a, 1 / n);
};

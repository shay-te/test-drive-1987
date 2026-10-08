import { EN } from './en.js';

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Looks up a dotted key in the English strings and fills `{{placeholders}}` from `params`. */
export function t(key, params = {}) {
    const text = key.split('.').reduce((node, part) => {
        return node?.[part];
    }, EN);
    if (typeof text !== 'string') throw new Error(`Missing translation "${key}"`);
    return text.replace(PLACEHOLDER, (_, name) => {
        return String(params[name] ?? '');
    });
}

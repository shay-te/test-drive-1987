import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HighScores } from '../src/core/HighScores.js';
import { carById } from '../src/data/cars.js';
import { EN } from '../src/i18n/en.js';
import { inputKey, t } from '../src/i18n/i18n.js';
import { Session } from '../src/sim/Session.js';
import { ResultsScreen } from '../src/ui/screens/ResultsScreen.js';
import { keyboardInput } from './helpers/keyboard.js';

/** Dotted keys of every string under `node`. */
function keys(node, prefix = '') {
    return Object.entries(node).flatMap(([name, value]) => {
        return typeof value === 'string' ? [`${prefix}${name}`] : keys(value, `${prefix}${name}.`);
    });
}

test('every touch wording stands in for a real prompt, which names keys the touch screen does not have', () => {
    const touch = keys(EN.touch);
    assert.ok(touch.length > 0);
    for (const key of touch) {
        assert.equal(inputKey(key, true), `touch.${key}`);
        assert.equal(inputKey(key, false), key);
        assert.doesNotThrow(() => { t(key); }, `${key} has a keyboard wording`);
        assert.notEqual(t(inputKey(key, true)), t(key));
        assert.doesNotMatch(t(inputKey(key, true)), /ENTER|ESC|Press [A-Z]\b|Arrows/, key);
    }
});

/** A finished session with a score worth a place in an empty table, and the results screen for it. */
function results(touch, answers = []) {
    const { input, key } = keyboardInput();
    input.touch = touch;
    const asked = [];
    input.askText = (question) => {
        asked.push(question);
        return answers.shift() ?? '';
    };
    // localStorage is a browser boundary: the table keeps its rows in a plain map here.
    const stored = new Map();
    const scores = new HighScores({ getItem: (k) => { return stored.get(k) ?? null; }, setItem: (k, v) => { stored.set(k, v); } });
    const session = new Session(carById('porsche'));
    session.tick(300);
    session.finishStage(8000);
    const screen = new ResultsScreen({ game: { go() {} }, input, world: { clear() {} }, scores });
    screen.enter({ session });
    const tap = (code) => {
        key('keydown', code);
        input.poll();
        screen.update(1 / 60);
        input.endFrame();
        key('keyup', code);
    };
    return { screen, tap, asked, scores };
}

test('a high score on a keyboard: type the name, ENTER keeps it', () => {
    const { screen, tap, asked, scores } = results(false);
    assert.equal(screen.entering, true);
    tap('Enter');
    assert.equal(screen.entering, true, 'no name yet');
    // The synthetic keyboard types each event's code as its key.
    for (const letter of ['a', 'c', 'e']) tap(letter);
    tap('Enter');
    assert.equal(screen.entering, false);
    assert.equal(scores.entries[0].name, 'ACE');
    assert.deepEqual(asked, [], 'no text box on a keyboard');
});

test('a high score on a touch screen: a tap asks for the name in the device\'s text box; declining asks again', () => {
    const { screen, tap, asked, scores } = results(true, ['', 'shay t']);
    tap('Enter');
    assert.equal(screen.entering, true, 'declined: still waiting for a name');
    tap('Enter');
    assert.equal(screen.entering, false);
    assert.equal(scores.entries[0].name, 'SHAYT');
    assert.deepEqual(asked, [t('results.yourName'), t('results.yourName')]);
});

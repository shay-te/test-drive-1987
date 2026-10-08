const STORAGE_KEY = 'testdrive1987.highscores';
const TABLE_SIZE = 10;

/** The high-score table, kept in this browser's localStorage. */
export class HighScores {
    constructor(storage = window.localStorage) {
        this.storage = storage;
        this.entries = this._read();
    }

    _read() {
        try {
            return JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '[]');
        } catch (error) {
            console.warn('[scores] high-score table unavailable, starting empty', error);
            return [];
        }
    }

    qualifies(score) {
        return score > 0 && (this.entries.length < TABLE_SIZE || score > this.entries.at(-1).score);
    }

    add(entry) {
        this.entries = [...this.entries, entry]
            .sort((a, b) => {
                return b.score - a.score;
            })
            .slice(0, TABLE_SIZE);
        try {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
        } catch (error) {
            console.warn('[scores] could not save the high-score table', error);
        }
        return this.entries.indexOf(entry);
    }
}

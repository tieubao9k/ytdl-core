"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressBar = void 0;
const charm = require("charm");
class ProgressBar {
    console = new UpdatableConsole();
    name;
    width;
    updateMinTime;
    /** Most recent flavor text. */
    flavor = "";
    lastUpdateMillis = 0;
    constructor(options) {
        this.name = options.name;
        this.width = options.width === undefined ? 20 : options.width;
        this.updateMinTime = options.updateMinTime === undefined ? 250 : options.updateMinTime;
    }
    update(current, flavor) {
        if (flavor !== undefined) {
            this.flavor = flavor;
        }
        const now = +new Date();
        const diff = now - this.lastUpdateMillis;
        if (diff > this.updateMinTime) {
            this.lastUpdateMillis = now;
            this.doUpdate(current);
        }
    }
    doUpdate(current) {
        const nCellsFilled = Math.ceil(this.width * Math.min(1, Math.max(0, current)));
        this.console.update((c) => {
            c.write(this.name);
            c.write(" [");
            c.write("█".repeat(nCellsFilled));
            if (nCellsFilled < this.width) {
                c.right(this.width - nCellsFilled);
            }
            c.write("]");
            if (this.flavor.length) {
                c.write(` ${this.flavor}`);
            }
        });
    }
    done() {
        this.flavor = "Done!";
        this.doUpdate(1);
        this.console.end();
    }
}
exports.ProgressBar = ProgressBar;
/** A mutable line of text on the console. */
class UpdatableConsole {
    charm = charm(process.stdout);
    update(action) {
        this.charm.push();
        this.charm.erase("line");
        action(this.charm);
        this.charm.pop();
    }
    end() {
        this.charm.write("\n");
        this.charm.end();
    }
}
//# sourceMappingURL=progress.js.map
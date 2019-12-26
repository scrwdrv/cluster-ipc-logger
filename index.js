"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ipc = require("fast-ipc");
const recurdir = require("recurdir");
const fs_1 = require("fs");
const path_1 = require("path");
const fast_safe_stringify_1 = require("fast-safe-stringify");
class loggerServer {
    constructor(options) {
        this.pending = {};
        this.timezoneOffset = new Date().getTimezoneOffset() * 60000;
        this.listeners = {};
        for (let part in options)
            this[part] = options[part];
        const ipcServer = new ipc.server('logger'), color = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            black: '\x1b[30m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m'
        }, colorMap = {
            info: color.green,
            warn: color.yellow,
            error: color.red,
            debug: color.blue,
            fatal: color.cyan
        };
        function alignText(str, length, fillChar) {
            const l = str.length;
            if (l <= length)
                return fillChar.repeat(length - l) + str;
            else
                return str.slice(0, length - 1) + '-';
        }
        for (let severity in colorMap) {
            const formatLog = (arr) => {
                const isoString = new Date(Date.now() - this.timezoneOffset).toISOString(), date = `${isoString.slice(0, 10)} ${isoString.slice(11, 19)}`, alignedSeverity = alignText(severity.toUpperCase(), 5, ' '), alignedSystem = alignText(arr[0].toUpperCase(), 7, '-');
                return {
                    raw: `${date} ¦ [${arr[1]}] ${alignedSystem} ¦ ${alignedSeverity} ¦ ${arr[2]}`,
                    color: `${color.black + color.bright}${date} \x1b[30m\x1b[1m¦ ${arr[1] === 'M' ? color.bright : color.dim}${color.cyan}[${arr[1]}] ${alignedSystem} \x1b[30m\x1b[1m¦ ${colorMap[severity]}${alignedSeverity} \x1b[30m\x1b[1m¦ ${color.white}${arr[2]}`
                };
            };
            const pendingType = severity === 'error' ? 'error' : (severity === 'fatal' ? 'fatal' : 'data');
            ipcServer.on(severity, (req) => {
                const log = formatLog(req);
                if (!this.pending[req[0]])
                    this.pending[req[0]] = { data: '', error: '', fatal: '' };
                this.pending[req[0]][pendingType] += log.raw + '\n';
                if (!this.debug && severity === 'debug')
                    return;
                console.log(log.color);
                if (this.listeners[severity])
                    for (let i = this.listeners[severity].length; i--;)
                        this.listeners[severity][i](log.raw);
            });
        }
        recurdir.mk(this.directory).then(() => setInterval(() => this.save(), this.saveInterval)).catch(err => { throw err; });
    }
    on(severity, handler) {
        if (!this.listeners[severity])
            this.listeners[severity] = [];
        this.listeners[severity].push(handler);
    }
    save() {
        return new Promise((resolve, reject) => {
            let promises = [];
            for (let system in this.pending)
                for (let severity in this.pending[system])
                    if (this.pending[system][severity]) {
                        const msg = this.pending[system][severity];
                        this.pending[system][severity] = '';
                        switch (severity) {
                            case 'error':
                            case 'fatal':
                                promises.push(new Promise((resolve, reject) => fs_1.appendFile(path_1.join(this.directory, `[error]${new Date(Date.now() - this.timezoneOffset).toISOString().slice(0, 10)}.log`), msg, err => {
                                    if (err)
                                        return reject(err);
                                    resolve();
                                })));
                                break;
                        }
                        promises.push(new Promise((resolve, reject) => fs_1.appendFile(path_1.join(this.directory, `[${system}]${new Date(Date.now() - this.timezoneOffset).toISOString().slice(0, 10)}.log`), msg, err => {
                            if (err)
                                return reject(err);
                            resolve();
                        })));
                    }
            Promise.all(promises).then(resolve).catch(reject);
        });
    }
}
exports.loggerServer = loggerServer;
class loggerClient {
    constructor(options) {
        for (let part in options)
            this[part] = options[part];
        if (this.cluster === 0)
            this.cluster = 'M';
        this.ipcClient = new ipc.client('logger');
        for (let severity of ['info', 'warn', 'error', 'debug']) {
            this[severity] = (msg) => {
                switch (typeof msg) {
                    case 'object':
                        if (severity === 'error' && msg && msg.stack)
                            switch (typeof msg.stack) {
                                case 'object':
                                    msg = '\n\n' + fast_safe_stringify_1.default(msg.stack, null, 1) + '\n';
                                    break;
                                case 'string':
                                    msg = msg.stack;
                                    break;
                            }
                        else
                            msg = '\n\n' + fast_safe_stringify_1.default(msg, null, 1) + '\n';
                        break;
                    case 'number':
                    case 'bigint':
                        msg = msg.toString();
                        break;
                }
                this.ipcClient.send(severity, [this.system, this.cluster, msg]);
            };
        }
        for (let fatal of ['unhandledRejection', 'uncaughtException'])
            process.on(fatal, (err) => {
                this.ipcClient.send('fatal', [this.system, this.cluster, '\n' + (err.stack || err)]);
                process.exit();
            });
    }
}
exports.loggerClient = loggerClient;

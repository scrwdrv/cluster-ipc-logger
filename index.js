"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ipc = require("fast-ipc");
const recurdir = require("recurdir");
const fs_1 = require("fs");
const path_1 = require("path");
class loggerServer {
    constructor(options) {
        this.pending = {};
        this.timezoneOffset = new Date().getTimezoneOffset() * 60000;
        this.listeners = {};
        this.directory = options.directory;
        this.saveInterval = options.saveInterval;
        const ipcServer = new ipc.server('logger');
        for (let severity of ['info', 'warn', 'error', 'debug']) {
            const pendingType = severity === 'error' ? 'error' : (severity === 'fatal' ? 'fatal' : 'data');
            ipcServer.on(severity, (req) => {
                const log = req[2];
                if (!this.pending[req[0]])
                    this.pending[req[0]] = {
                        data: '',
                        error: '',
                        fatal: ''
                    };
                this.pending[req[0]][pendingType] += log + '\n';
                if (this.listeners[severity])
                    for (let i = this.listeners[severity].length; i--;)
                        this.listeners[severity][i](log);
                if (this.listeners.all)
                    for (let i = this.listeners.all.length; i--;)
                        this.listeners.all[i](log);
            });
        }
        recurdir.mk(this.directory).then(() => setInterval(() => this.save(), this.saveInterval)).catch(err => { throw err; });
    }
    on(severity, handler) {
        if (!this.listeners[severity])
            this.listeners[severity] = [];
        this.listeners[severity].push(handler);
        return this;
    }
    save() {
        return new Promise((resolve, reject) => {
            let promises = [];
            for (let system in this.pending)
                for (let severity in this.pending[system])
                    if (this.pending[system][severity]) {
                        const log = this.pending[system][severity], date = new Date(Date.now() - this.timezoneOffset).toISOString().slice(0, 10);
                        this.pending[system][severity] = '';
                        if (severity === 'error' || severity === 'fatal')
                            promises.push(new Promise((resolve, reject) => fs_1.appendFile(path_1.join(this.directory, `[error]${date}.log`), log, err => {
                                if (err)
                                    return reject(err);
                                resolve();
                            })));
                        promises.push(new Promise((resolve, reject) => fs_1.appendFile(path_1.join(this.directory, `[${system}]${date}.log`), log, err => {
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
        this.timezoneOffset = new Date().getTimezoneOffset() * 60000;
        this.debugMode = true;
        this.system = options.system;
        this.cluster = options.cluster.toString();
        this.ipcClient = new ipc.client('logger');
        if (options.debug === false)
            this.debugMode = false;
        for (let severity of ['info', 'warn', 'error', 'debug']) {
            this[severity] = (msg) => {
                switch (typeof msg) {
                    case 'object':
                        if (msg instanceof Error)
                            msg = msg.stack || msg.message || msg.toString();
                        else
                            msg = '\n\n' + JSON.stringify(msg, null, 1) + '\n';
                        break;
                    case 'number':
                    case 'bigint':
                        msg = msg.toString();
                        break;
                }
                const log = this.formatLog(severity, msg);
                this.ipcClient.send(severity, [this.system, this.cluster, log.raw]);
                if (!this.debugMode && severity === 'debug')
                    return;
                console.log(log.color);
            };
        }
        process.on('uncaughtException', (err) => {
            const msg = '\n' + (err.stack || err.message), log = this.formatLog('fatal', msg);
            this.ipcClient.send('fatal', [this.system, this.cluster, log.raw]);
            console.log(log.color);
            process.exit();
        }).on('unhandledRejection', (err) => {
            const msg = '\n' + err ? (err['stack'] || err['message'] || err.toString()) : 'UNKNOWN', log = this.formatLog('fatal', msg);
            this.ipcClient.send('fatal', [this.system, this.cluster, log.raw]);
            console.log(log.color);
            process.exit();
        });
    }
    formatLog(severity, msg) {
        const color = {
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
        }, isoString = new Date(Date.now() - this.timezoneOffset).toISOString(), date = `${isoString.slice(0, 10)} ${isoString.slice(11, 19)}`, alignedSeverity = alignText(severity.toUpperCase(), 5, ' '), alignedSystem = alignText(this.system.toUpperCase(), 7, '-'), alignedCluster = alignText(this.cluster, 2, '0');
        return {
            raw: `${date} ¦ [${alignedCluster}] ${alignedSystem} ¦ ${alignedSeverity} ¦ ${msg}`,
            color: `${color.black + color.bright}${date} ¦ ${this.cluster === '0' ? color.bright : color.dim}${color.cyan}[${alignedCluster}] ${alignedSystem} ${color.black + color.bright}¦ ${colorMap[severity]}${alignedSeverity} ${color.black + color.bright}¦ ${color.white}${msg}${color.reset}`
        };
        function alignText(str, length, fillChar) {
            const l = str.length;
            if (l <= length)
                return fillChar.repeat(length - l) + str;
            else
                return str.slice(0, length - 1) + '-';
        }
    }
}
exports.loggerClient = loggerClient;

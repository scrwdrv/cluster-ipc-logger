import * as ipc from 'fast-ipc';
import * as recurdir from 'recurdir';
import { appendFile as appendFile } from 'fs';
import { join as PATH } from 'path';
import safeStringify from 'fast-safe-stringify';

type log = (msg: any) => void;

export class loggerServer {
    private directory: string;
    private saveInterval: number;
    private pending: {
        [key: string]: {
            data: string;
            error: string;
            fatal: string;
        }
    } = {};
    private timezoneOffset = new Date().getTimezoneOffset() * 60000;
    private listeners: { [severity: string]: ((msg: string) => void)[] } = {};

    public debug: boolean;

    constructor(options: {
        debug: boolean;
        directory: string;
        saveInterval: number;
    }) {

        for (let part in options)
            this[part] = options[part];

        const ipcServer = new ipc.server('logger'),
            color = {
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
            },
            colorMap = {
                info: color.green,
                warn: color.yellow,
                error: color.red,
                debug: color.blue,
                fatal: color.cyan
            };

        function alignText(str: string, length: number, fillChar: string) {
            const l = str.length;
            if (l <= length)
                return fillChar.repeat(length - l) + str;
            else return str.slice(0, length - 1) + '-'
        }

        for (let severity in colorMap) {

            const formatLog = (arr: string[]) => {
                const isoString = new Date(Date.now() - this.timezoneOffset).toISOString(),
                    date = `${isoString.slice(0, 10)} ${isoString.slice(11, 19)}`,
                    alignedSeverity = alignText(severity.toUpperCase(), 5, ' '),
                    alignedSystem = alignText((arr[0] as string).toUpperCase(), 7, '-');
                return {
                    raw: `${date} ¦ [${arr[1]}] ${alignedSystem} ¦ ${alignedSeverity} ¦ ${arr[2]}`,
                    color: `${color.black + color.bright}${date} \x1b[30m\x1b[1m¦ ${arr[1] === '0' ? color.bright : color.dim}${color.cyan}[${arr[1].length > 1 ? '' : '0'}${arr[1]}] ${alignedSystem} \x1b[30m\x1b[1m¦ ${colorMap[severity]}${alignedSeverity} \x1b[30m\x1b[1m¦ ${color.white}${arr[2]}`
                }
            }

            const pendingType = severity === 'error' ? 'error' : (severity === 'fatal' ? 'fatal' : 'data');
            ipcServer.on(severity, (req) => {
                const log = formatLog(req);
                if (!this.pending[req[0]]) this.pending[req[0]] = { data: '', error: '', fatal: '' };
                this.pending[req[0]][pendingType] += log.raw + '\n';
                if (!this.debug && severity === 'debug') return;
                console.log(log.color);
                if (this.listeners[severity])
                    for (let i = this.listeners[severity].length; i--;)
                        this.listeners[severity][i](log.raw);
                if (this.listeners.all)
                    for (let i = this.listeners.all.length; i--;)
                        this.listeners.all[i](log.raw);
            });
        }

        recurdir.mk(this.directory).then(() =>
            setInterval(() => this.save(), this.saveInterval)
        ).catch(err => { throw err });
    }

    on(severity: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'all', handler: (msg: string) => void) {
        if (!this.listeners[severity]) this.listeners[severity] = [];
        this.listeners[severity].push(handler);
        return this;
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
                                promises.push(new Promise((resolve, reject) => appendFile(PATH(this.directory,
                                    `[error]${new Date(Date.now() - this.timezoneOffset).toISOString().slice(0, 10)}.log`),
                                    msg, err => {
                                        if (err) return reject(err);
                                        resolve();
                                    })
                                ));
                                break;
                        }
                        promises.push(new Promise((resolve, reject) => appendFile(PATH(this.directory,
                            `[${system}]${new Date(Date.now() - this.timezoneOffset).toISOString().slice(0, 10)}.log`),
                            msg, err => {
                                if (err) return reject(err);
                                resolve();
                            })
                        ));
                    }
            Promise.all(promises).then(resolve).catch(reject);
        });
    }
}

export class loggerClient {

    private system: string;
    private cluster: number | string;
    private ipcClient: ipc.client;

    public info: log;
    public warn: log;
    public error: log;
    public debug: log;

    constructor(options: {
        system: string;
        cluster: number | string;
    }) {
        for (let part in options)
            this[part] = options[part];

        //if (this.cluster === 0) this.cluster = 'M';

        this.ipcClient = new ipc.client('logger');
        for (let severity of ['info', 'warn', 'error', 'debug']) {
            this[severity] = (msg: any) => {
                switch (typeof msg) {
                    case 'object':
                        if (severity === 'error' && msg && msg.stack)
                            switch (typeof msg.stack) {
                                case 'object':
                                    msg = '\n\n' + safeStringify(msg.stack, null, 1) + '\n';
                                    break;
                                case 'string':
                                    msg = msg.stack;
                                    break;
                            }
                        else msg = '\n\n' + safeStringify(msg, null, 1) + '\n';
                        break;
                    case 'number':
                    case 'bigint':
                        msg = msg.toString();
                        break;
                }
                this.ipcClient.send(severity, [this.system, this.cluster, msg])
            }
        }
        for (let fatal of ['unhandledRejection', 'uncaughtException'])
            process.on(fatal as any, (err: Error) => {
                this.ipcClient.send('fatal', [this.system, this.cluster, '\n' + (err.stack || err)]);
                process.exit();
            });
    }
}
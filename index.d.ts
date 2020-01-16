declare type log = (msg: any) => void;
export declare class loggerServer {
    private directory;
    private saveInterval;
    private pending;
    private timezoneOffset;
    private listeners;
    constructor(options: {
        directory: string;
        saveInterval: number;
    });
    on(severity: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'all', handler: (msg: string) => void): this;
    save(): Promise<unknown>;
}
export declare class loggerClient {
    private system;
    private cluster;
    private ipcClient;
    private timezoneOffset;
    info: log;
    warn: log;
    error: log;
    debug: log;
    constructor(options: {
        system: string;
        cluster: number | string;
        debug?: boolean;
    });
    private formatLog;
}
export {};

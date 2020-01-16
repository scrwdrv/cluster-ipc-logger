import * as logger from './index';

const logServer = new logger.loggerServer({
    directory: './logs',
    saveInterval: 60000
}), log = new logger.loggerClient({ system: 'test', cluster: 0 });


log.error(new Error('error test'));
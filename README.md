# cluster-ipc-logger
 This logger is designed to collect logs from cluster workers, child processes even independent node.js processes through IPC (Inter-Process Communication).


## Installation
```sh
npm i cluster-ipc-logger
```

## Usage
```js
import { loggerServer, loggerClient } from 'cluster-ipc-logger';
import * as cluster from 'cluster';


if (cluster.isMaster) /* master */ {

    // logger master
    const logger = new loggerServer({
        debug: true,
        directory: './logs',
        saveInterval: 60000 // 1 minute
    });

    // logger for master
    const log = new loggerClient({
        system: 'master',
        cluster: 0
    })

    // log listeners
    logger
        .on('fatal', (msg) => {
            // on fatal logs
        })
        .on('error', (msg) => {
            // on error logs
        })
        .on('all', (msg) => {
            // on all logs
        });

    // detect ^c and save logs before exiting
    process.on('SIGINT', () => {
        logger.save().then(() => {
            process.exit();
        }).catch((err) => {
            throw err;
        });
    });

    // fork workers
    for (let i = 6; i--;) {
        cluster.fork({ workerId: i });
        log.info(`forking worker ${i}`);
    }

    log.debug('debug logs only show up when debug option is set to true');
    log.info('every severity of logs will be save to local storage');
    log.warn('when an error or fatal log occured,');
    log.error('the log content is also saved to another file with prefix [error],');
    log.error('so it is easier to examine the major flaws');


} else /* worker */ {

    // logger for worker
    const log = new loggerClient({
        system: 'worker',
        cluster: process.env.workerId
    });

    log.debug(`worker ${process.env.workerId} standing by`);

}
```
### JSON
```js
//log json
log.info({
    eBooks: [
        {
            language: 'Pascal',
            edition: 'third'
        },
        {
            language: 'Python',
            edition: 'four'
        },
        {
            language: 'SQL',
            edition: 'second'
        }
    ]
});
```
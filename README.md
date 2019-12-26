# cluster-ipc-logger
 This logger is designed to collect logs from cluster workers, child processes even independent node.js processes through IPC (Inter-Process Communication).


## Installation
```sh
npm i cluster-ipc-logger
```

## Usage
### Master
```js
import { loggerServer, loggerClient } from 'cluster-ipc-logger';
import * as cluster from 'cluster';

if (cluster.isMaster) {

    // logger master
    const logger = new loggerServer({
        debug: true,
        directory: './logs',
        saveInterval: 60000
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

    // detect ctrl+c and save logs before exiting
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

} else {

    // logger for worker
    const log = new loggerClient({
        system: 'worker',
        cluster: process.env.workerId
    });


    log.info(`worker ${process.env.workerId} standing by`);

    log.debug('debug logs only show up when debug option is set to true');
    log.info('every severity of logs will be save to local storage');
    log.error('when an error or fatal log occured, the log content is also saved to another file with prefix [error], so it is easier to examine the major flaws');
}


```
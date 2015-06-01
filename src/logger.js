var bunyan = require('bunyan');

function FormattedConsoleLog() {}
FormattedConsoleLog.prototype.write = function (rec) {
    console.log('[%s] %s: %s',
        rec.time.toISOString(),
        bunyan.nameFromLevel[rec.level],
        rec.msg);
};
module.exports = bunyan.createLogger({
    name: 'play',
    streams: [{
        level: 'debug',
        stream: new FormattedConsoleLog(),
        type: 'raw'
    }]
});


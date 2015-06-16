#!/usr/bin/env node

var program = require('commander');
var lib = require('./lib.js');

program
    .option('-v, --verbose', 'Increase verbosity', lib.bumpVerbosity, 40)
    .parse(process.argv);

lib.initializeClient();
var client = lib.getClient();

return lib.getClient().wipeDevice()
    .then(lib.waitForMessage("Success", {message: "Device wiped"}))
    .then(function() {
        process.exit();
    })
    .catch(function (failure) {
        console.error(failure);
        process.exit();
    });

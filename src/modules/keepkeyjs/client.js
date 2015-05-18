/** START KEEPKEY LICENSE
 *
 * This file is part of the KeepKeyJS project.
 *
 * Copyright (C) 2015 KeepKey, LLC.
 *
 * This library is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this library.  If not, see <http://www.gnu.org/licenses/>.
 *
 * END KEEPKEY LICENSE
 */
(function () {

    'use strict';

    var ByteBuffer = require('bytebuffer');
    var extend = require('extend-object');
    var assert = require('assert');
    var uint32 = require('uint32');
    // bip39 = require('bip39'),
    var sprintf = require("sprintf-js").sprintf;
    var EventEmitter2 = require('eventemitter2').EventEmitter2;
    var hydrate = require('./hydrate.js');
    var crypto = window.crypto;
    var featuresService = require('./simpleGlobalStore.js');

    var KEEPKEY = 'KEEPKEY';
    var TREZOR = 'TREZOR';
    var DEVICES = require('./transport.js').DEVICES;
    var PRIME_DERIVATION_FLAG = 0x80000000;

    module.exports.KEEPKEY = KEEPKEY;
    module.exports.TREZOR = TREZOR;

    function getLocalEntropy() {
        var randArr = new Uint8Array(32);
        crypto.getRandomValues(randArr);
        return ByteBuffer.wrap(randArr);
    }


    var clients = {},    // client pool
        clientTypes = {};  // client types used for client creation by type

    clientTypes[KEEPKEY] = require('./keepkey/client.js');
    clientTypes[TREZOR] = require('./trezor/client.js');

    function convertPrime(n) {
        var i = 0, max = n.length;

        for (; i < max; i += 1) {
            if (n[i] < 0) {
                n[i] = uint32.or(Math.abs(n[i]), PRIME_DERIVATION_FLAG);
            }
        }

        return n;
    }

    function clientMaker(transport, protoBuf) {

        var client = {};
        var deviceInUse = false;

        client.eventEmitter = new EventEmitter2();
        client.addListener = client.eventEmitter.addListener.bind(client.eventEmitter);
        client.writeToDevice = transport.write.bind(transport);
        client.protoBuf = protoBuf;

        client.initialize = function () {
            return client.writeToDevice(new client.protoBuf.Initialize());
        };

        client.wipeDevice = require('./clientActions/wipeDevice.js').bind(client);
        client.resetDevice = require('./clientActions/resetDevice.js').bind(client);
        client.recoveryDevice = require('./clientActions/recoveryDevice.js').bind(client);
        client.pinMatrixAck = require('./clientActions/pinMatrixAck.js').bind(client);
        client.wordAck = require('./clientActions/wordAck.js').bind(client);
        client.characterAck = require('./clientActions/characterAck.js').bind(client);
        client.firmwareErase = require('./clientActions/firmwareErase.js').bind(client);
        client.firmwareUpload = require('./clientActions/firmwareUpload.js').bind(client);

        client.onButtonRequest = function () {
            client.writeToDevice(new client.protoBuf.ButtonAck());
        };

        client.onEntropyRequest = function (message) {
            client.writeToDevice(new client.protoBuf.EntropyAck(getLocalEntropy()));
        };

        client.onFeatures = function (message) {
            featuresService.setValue(message);
        };

        client.onSuccess = function (message) {
            client.initialize();
        };

        // Poll for incoming messages
        client.devicePollingInterval = setInterval(function () {
            if (!deviceInUse) {
                transport.read()
                    .then(function dispatchIncomingMessage(message) {
                        console.log('msg:', message);
                        if (message) {

                            client.eventEmitter.emit('DeviceMessage', message.$type.name, hydrate(message));

                            var handler = 'on' + message.$type.name;
                            if (client.hasOwnProperty(handler)) {
                                return client[handler](message);
                            } else {
                                return message;
                            }
                        }
                    }, function () {
                    });
            }
        }, 1000);

        client.stopPolling = function () {
            clearInterval(client.devicePollingInterval);
        };

        client.initialize()
            .catch(function () {
                console.error('failure while initializing', arguments);
            });

        return client;
    }

    module.exports.create = function (transport, messagesProtoBuf) {
        var transportDeviceId = transport.getDeviceId();

        if (!clients.hasOwnProperty(transportDeviceId)) {
            clients[transportDeviceId] = clientMaker(transport, messagesProtoBuf);
        }

        return clients[transportDeviceId];
    };

    module.exports.factory = function (transport) {
        var deviceInfo = transport.getDeviceInfo(),
            deviceType = null;

        for (deviceType in DEVICES) {
            if (DEVICES[deviceType].vendorId === deviceInfo.vendorId &&
                DEVICES[deviceType].productId === deviceInfo.productId) {

                transport.setMessageMap(deviceType, clientTypes[deviceType].getProtoBuf());

                return clientTypes[deviceType].create(transport);
            }
        }
    };

    module.exports.find = function (transport) {
        var transportDeviceId = transport.getDeviceId();

        return clients[transportDeviceId];
    };

    module.exports.findByDeviceId = function (deviceId) {
        return clients[deviceId];
    };

    module.exports.remove = function (transport) {
        var transportDeviceId = transport.getDeviceId();

        clients[transportDeviceId].stopPolling();
        delete clients[transportDeviceId];
    };

    module.exports.getAllClients = function () {
        return Object.keys(clients).map(function (deviceId) {
            return clients[deviceId];
        });
    };

})();
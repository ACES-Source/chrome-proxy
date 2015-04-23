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

    var SEGMENT_SIZE = 63,
        REPORT_ID = 63;

    var ByteBuffer = require('bytebuffer'),
        transport = require('./transport.js'),
        pollingEnabled = false,     // whether device polling is enabled or not
        events = {                  // events that device polling fires
            deviceConnected: null,
            deviceDisconnected: null
        };

    var devicePolling = function () {

        // only enumerate devices if there is a registered connect
        // event.  the purpose of this polling to to facilitate
        // device connect/disconnect events

        if (pollingEnabled) {
            if (typeof events.deviceConnected === 'function') {
                /* global chrome */
                chrome.hid.getDevices({}, function (devices) {
                    var i = 0,
                        max = devices.length,
                        deviceAlive = {},
                        currentDevice = null,
                        currentDeviceId = 0,
                        connectedDevices = transport.getDeviceIds();

                    // detect device connects
                    for (; i < max; i += 1) {
                        currentDevice = devices[i];
                        currentDeviceId = currentDevice.deviceId;
                        deviceAlive[currentDeviceId] = true;

                        if (!transport.hasDeviceId(currentDeviceId)) {
                            module.exports.create(devices[i]);
                        }
                    }

                    // detect device disconnects
                    for (i = 0, max = connectedDevices.length; i < max; i += 1) {
                        currentDeviceId = connectedDevices[i];

                        if (!deviceAlive[currentDeviceId]) {
                            if (typeof events.deviceDisconnected === 'function') {
                                events.deviceDisconnected(transport.find(currentDeviceId));
                            }

                            transport.remove(currentDeviceId);
                        }
                    }
                });
            }

            setTimeout(devicePolling, 1000);
        }
    };

    module.exports.create = function (hidDevice) {

        var hidDeviceId = hidDevice.deviceId,     // HID device id
            that = transport.create(hidDeviceId),   // create parent transport
            connection = 0;                         // connection id used for writing and reading from device

        var open = function () {
            /* global chrome */
            chrome.hid.connect(hidDeviceId, function (connectInfo) {
                if (!connectInfo) {
                    throw {
                        name: 'Error',
                        message: 'Unable to connect to device.'
                    };
                }
                connection = connectInfo.connectionId;

                // fire deviceConnected event
                events.deviceConnected(that);
            });
        };

        var writeToHid = function (txSegmentBB) {
            return new Promise(function (resolve, reject) {
                try {
                    /* global chrome */
                    chrome.hid.send(
                        connection,
                        SEGMENT_SIZE,
                        txSegmentBB.toArrayBuffer(),
                        resolve);
                } catch (error) {
                    reject(error);
                }
            });
        };

        var readFromHid = function (rxMsg) {
            return new Promise(function (resolve, reject) {
                /* global chrome */
                chrome.hid.receive(connection, function (reportId, rxMsgAB) {
                    if (reportId === REPORT_ID) {
                        if (typeof rxMsg === 'undefined') {
                            rxMsg = rxMsg || {
                                    header: null,
                                    bufferBB: ByteBuffer.wrap(rxMsgAB)
                                };
                        } else {
                            rxMsg.bufferBB = ByteBuffer.concat([rxMsg.bufferBB, ByteBuffer.wrap(rxMsgAB)]);
                        }

                        resolve(rxMsg);
                    } else {
                        reject({
                            name: 'Error',
                            message: 'Unexpected report ID.'
                        });
                    }
                });
            });
        };

        that._write = function (txMsgBB) {
            var i = 0,
                max = txMsgBB.limit,
                txSegmentAB = null,
                txSegmentBB = null,
                writePromise = Promise.resolve();

            // break frame into segments
            for (; i < max; i += SEGMENT_SIZE) {
                txSegmentAB = txMsgBB.toArrayBuffer().slice(i, i + SEGMENT_SIZE);
                txSegmentBB = ByteBuffer.concat([txSegmentAB, ByteBuffer.wrap(new Array(SEGMENT_SIZE - txSegmentAB.byteLength + 1).join('\0'))]);

                writePromise = writePromise
                    .then(Promise.resolve(writeToHid(txSegmentBB)));
            }

            return writePromise;
        };

        that._read = function () {
            return readFromHid()
                .then(function (rxMsg) {  // first segment
                    var i = 0, max = 0;

                    // parse header and then remove it from buffer
                    rxMsg.header = transport.parseMsgHeader(rxMsg.bufferBB);
                    rxMsg.bufferBB =
                        ByteBuffer.wrap(rxMsg.bufferBB.toArrayBuffer().slice(transport.MSG_HEADER_START.length + transport.MSG_HEADER_LENGTH));

                    // if message length is longer than what we have buffered, create promises
                    // for each remaining segment
                    if (rxMsg.header.msgLength > rxMsg.bufferBB.limit) {
                        var remainingCount = Math.floor((rxMsg.header.msgLength - rxMsg.bufferBB.limit) / SEGMENT_SIZE),
                            readSegments = readFromHid(rxMsg);

                        for (max = remainingCount; i < max; i += 1) {
                            readSegments = readSegments.then(readFromHid);
                        }

                        return readSegments;  // return promises for remaining segments
                    } else {
                        return rxMsg;      // no more segments so just return this one segment
                    }
                });
        };

        that.getDeviceInfo = function () {
            return {
                vendorId: hidDevice.vendorId,
                productId: hidDevice.productId
            };
        };

        open();

        return that;
    };

    module.exports.startListener = function () {
        pollingEnabled = true;
        devicePolling();
    };

    module.exports.stopListener = function () {
        pollingEnabled = false;
    };

    module.exports.onDeviceConnected = function (callback) {
        events.deviceConnected = callback;
    };

    module.exports.onDeviceDisconnected = function (callback) {
        events.deviceDisconnected = callback;
    };

})();
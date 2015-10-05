var _ = require('lodash');
var EventEmitter2 = require('eventemitter2').EventEmitter2;
var walletNodeService = require('./walletNodeService.js');

var blockcypher = require('../blockchainApis/blockcypher-wallet.js');

var selectedTransactions = [];

var transactionsLoadedPromise = walletNodeService.loadUnspentTransactionSummaries();

function getByTransactionHash(hash) {
  //TODO Is this needed?
  return transactionsLoadedPromise
    .then(function () {
      return loadTransactionDetails(hash);
    });
}

function getHighConfidenceTransactions(node) {
  var combinedTxRefs = [].concat(
    node.txrefs, node.unconfirmed_txrefs
  );

  return _.filter(combinedTxRefs, function (input) {
    return input && (_.isUndefined(input.confidence) || input.confidence >= walletNodeService.HIGH_CONFIDENCE_LEVEL);
  });
}

function sendTransaction(rawtransaction) {
  console.log('raw tx:', rawtransaction.toHex());
  return blockcypher.sendRawTransaction(rawtransaction);
}

function reloadTransactions() {
  transactionsLoadedPromise = walletNodeService.loadUnspentTransactionSummaries();
  return transactionsLoadedPromise;
}

function getOldestUnspentAfter(node, previousTransaction) {
  function compareTransactions(a, b) {
    if (b === undefined) {
      return 1;
    }
    if (a.confirmations !== b.confirmations) {
      return b.confirmations - a.confirmations;
    } else if (a.tx_hash > b.tx_hash) {
      return -1;
    } else if (a.tx_hash < b.tx_hash) {
      return 1;
    } else if (b.tx_output_n !== a.tx_output_n) {
      return b.tx_output_n - a.tx_output_n;
    } else {
      return 0;
    }
  }

  function inputSelector(candidateTransaction) {
    return candidateTransaction.value > 0 && !candidateTransaction.spent &&
      compareTransactions(candidateTransaction, previousTransaction) > 0;
  }

  var transactionsCopy = getHighConfidenceTransactions(walletNodeService.nodes[0]);
  transactionsCopy.sort(compareTransactions);

  return _.find(transactionsCopy, inputSelector);
}

function clearSelectedTransactions() {
  selectedTransactions.length = 0;
}

function select(txref) {
  selectedTransactions.push(txref);
}

function getSelectedTransactions() {
  var promise = Promise.resolve();
  var transactions = _.extend([], selectedTransactions);
  _.each(transactions, function (transaction) {
    promise = promise
      .then(function () {
        return loadTransactionDetails(transaction.tx_hash);
      })
      .then(function (tx) {
        //transaction.tx = tx;
        transaction.inputs = tx.inputs;
        transaction.outputs = tx.outputs;
      });
  });
  return promise
    .then(function () {
      return transactions;
    });
}

var loadTransactionDetails = blockcypher.getTransaction;

module.exports = {
  selectedTransactions: selectedTransactions,
  select: select,
  clearSelectedTransactions: clearSelectedTransactions,
  getOldestUnspentAfter: getOldestUnspentAfter,
  reloadTransactions: reloadTransactions,
  sendTransaction: sendTransaction,
  getByTransactionHash: getByTransactionHash,
  getSelectedTransactions: getSelectedTransactions,
  getHighConfidenceTransactions: getHighConfidenceTransactions
};